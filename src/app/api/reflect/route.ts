import { generateObject, streamObject } from "ai";
import { withRls, vec } from "@/lib/db";
import { embedOne } from "@/lib/embed";
import { fetchTopK, canonicalSourceText } from "@/lib/retrieval";
import { backfillMissingChunks, cleanupMislabeledFaces } from "@/lib/pipeline";
import {
  describeProvider,
  retrievalFloor,
  synthesisModel,
} from "@/lib/provider";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { EMBEDDING_MISMATCH, ensureVaultEmbedder } from "@/lib/embedding-guard";
import { fireLetterConditions } from "@/lib/letter-conditions";
import {
  EMPTY_STATE_ANSWER,
  ReflectionSchema,
  buildReflectionPrompt,
  hasFirstPersonOutsideQuotes,
  looksLikeArchiveRefusal,
  hasLexicalOverlap,
  validateCitations,
  type ReflectionAnswer,
} from "@/lib/reflection";
import { HttpError, errorResponse, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
// Grounded synthesis waits on retrieval + a streamed model completion (and
// one non-streaming retry on stream corruption). On Vercel the default
// function budget can be too short for a cloud round-trip, so lift it.
export const maxDuration = 60;

/**
 * POST /api/reflect → Server-Sent Events
 *
 * Body: { question: string }
 *
 * Events:
 *   retrieved { hit_count, top_similarity }
 *   grounded  { grounded }
 *   claim     { text, citations: [{ capture_id, snippet }] }
 *   answer    { text }                  // final assembled answer
 *   done      { reflection_id }
 *   error     { message }
 *
 * Guardrails (lib/reflection.ts): below-threshold similarity, any citation
 * outside the retrieved set, or first-person impersonation collapse to
 * the empty state.
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();

    // Cost guard for the public demo: every Reflect calls a paid Azure
    // model, and the demo URL is anonymous and linked publicly, so cap
    // requests per IP. Only on the hosted profile — the local/desktop
    // app is single-user and has no reason to throttle itself. Fails
    // open (see rateLimit): a demo guard must never take the app down.
    //
    // Authorized tooling (the grounding eval and injection harness fire
    // ~40 requests in a burst, which would trip the public cap) carries
    // HEIRLOOM_EVAL_TOKEN in a header to bypass. The token is a demo-only
    // secret; if it is unset the bypass is impossible.
    const evalToken = process.env.HEIRLOOM_EVAL_TOKEN;
    const isTooling =
      !!evalToken && req.headers.get("x-heirloom-eval") === evalToken;
    if (!isTooling && (await describeProvider()).profile === "hosted-demo") {
      const { ok, retryAfter } = await rateLimit(
        "reflect",
        clientIp(req),
        20, // 20 questions / 5 min / IP — generous for trying it, useless for scripted abuse
        5 * 60,
      );
      if (!ok) {
        return new Response(
          JSON.stringify({ error: "rate_limited", retry_after: retryAfter }),
          {
            status: 429,
            headers: { "content-type": "application/json", "retry-after": String(retryAfter) },
          },
        );
      }
    }

    const body = (await req.json()) as { question?: string };

    const question = body.question?.trim() ?? "";
    if (!question) throw new HttpError(400, "empty_question");
    if (question.length > 2000) throw new HttpError(400, "question_too_long");

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          const meta = await withRls(
            session.user_id,
            session.role,
            async (tx) => {
              const [user] = await tx<{ display_name: string }[]>`
                SELECT display_name FROM users
                WHERE id = (SELECT creator_id FROM vaults WHERE id = ${session.vault_id})
              `;
              // Names belonging to the archive itself. They recur all
              // through it, so they must not be what a question grounds
              // on — see hasLexicalOverlap.
              const named = await tx<{ name: string }[]>`
                SELECT display_name AS name FROM people
                WHERE vault_id = ${session.vault_id}
                UNION
                SELECT name FROM nominees WHERE vault_id = ${session.vault_id}
              `;
              return { ...user, archive_names: named.map((n) => n.name) };
            },
          );

          // Self-heal: catch any ready captures whose detached pipeline
          // dropped before writing chunks, and drop any face → person
          // links whose similarity now falls below the matching gate.
          try {
            await backfillMissingChunks(session);
          } catch (e) {
            console.warn("[/api/reflect] backfill failed", e);
          }
          try {
            await cleanupMislabeledFaces(session);
          } catch (e) {
            console.warn("[/api/reflect] face cleanup failed", e);
          }

          // Refuse to search an index built by a different embedding
          // model — cosine scores across models are meaningless.
          await ensureVaultEmbedder(session.vault_id);

          const floor = await retrievalFloor();
          const qEmb = await embedOne(question);

          // Fire matching sealed letters BEFORE the grounding gate so they
          // surface even when no grounded answer exists.
          if (session.role === "nominee") {
            try {
              const fired = await fireLetterConditions(session, {
                trigger_kind: "semantic",
                query: question,
                embedding: qEmb,
              });
              for (const l of fired) {
                send("sealed_letter", {
                  letter_id: l.letter_id,
                  capture_id: l.capture_id,
                  occasion_prompt: l.occasion_prompt,
                  trigger: l.trigger,
                });
              }
            } catch (e) {
              console.warn("[/api/reflect] letter conditions failed", e);
            }
          }

          // Top-5 keeps the prompt small enough for CPU while still
          // grounding most queries.
          const chunks = await fetchTopK(qEmb, session, 5);
          const topSim = chunks[0]?.similarity ?? 0;
          send("retrieved", { hit_count: chunks.length, top_similarity: topSim });

          // Hybrid grounding gate: vector similarity OR substantive
          // keyword overlap. Either one means the chunk is plausibly
          // about the question; downstream LLM + citation guards still
          // collapse to empty state if no real claim can be made.
          const archiveNames = [
            meta?.display_name,
            ...(meta?.archive_names ?? []),
          ].filter((n): n is string => Boolean(n));
          const lexicalHit = hasLexicalOverlap(question, chunks, archiveNames);
          const grounded =
            chunks.length > 0 &&
            (topSim >= floor || lexicalHit);

          if (!grounded) {
            send("grounded", { grounded: false });
            send("answer", { text: EMPTY_STATE_ANSWER });
            const reflection_id = await saveReflection(
              session,
              question,
              qEmb,
              {
                answer: EMPTY_STATE_ANSWER,
                claims: [],
                diagnostics: {
                  retrieved_count: chunks.length,
                  top_similarity: topSim,
                  threshold: floor,
                  rejected_for: chunks.length === 0
                    ? "no_chunks"
                    : "similarity_below_threshold",
                  grounded: false,
                  retrieved_chunks: chunks.slice(0, 8).map((c) => ({
                    capture_id: c.capture_id,
                    similarity: c.similarity,
                    snippet: c.text.slice(0, 160),
                  })),
                },
              },
              false,
            );
            send("done", { reflection_id });
            controller.close();
            return;
          }

          send("grounded", { grounded: true });

          const prompt = buildReflectionPrompt(
            question,
            meta?.display_name ?? "the creator",
            chunks,
          );

          const { partialObjectStream, object } = streamObject({
            model: await synthesisModel(),
            schema: ReflectionSchema,
            prompt,
            temperature: 0.3,
          });

          // `answer_partial` carries prose as Gemma extends it; `claim`
          // fires once a claim has both text and a validated citation.
          let lastAnswer = "";
          const sentClaims = new Set<number>();
          for await (const partial of partialObjectStream) {
            const partialAnswer = typeof partial.answer === "string"
              ? partial.answer
              : "";
            if (partialAnswer.length > lastAnswer.length) {
              lastAnswer = partialAnswer;
              send("answer_partial", { text: partialAnswer });
            }

            if (!partial.claims) continue;
            partial.claims.forEach((c, i) => {
              if (
                sentClaims.has(i) ||
                !c ||
                !c.text ||
                !Array.isArray(c.citations) ||
                c.citations.length === 0
              )
                return;
              const validCitations = c.citations.filter((id): id is string =>
                typeof id === "string" && chunks.some((ch) => ch.capture_id === id),
              );
              if (validCitations.length === 0) return;
              sentClaims.add(i);
              send("claim", {
                index: i,
                text: c.text,
                citations: validCitations.map((cid) => {
                  const ch = chunks.find((x) => x.capture_id === cid)!;
                  const source = canonicalSourceText(ch);
                  return {
                    capture_id: cid,
                    // Display snippet: short, derived from the chunk so it
                    // reflects what actually matched the query. Source
                    // text: the user's own body / transcript / caption,
                    // used for SpeakButton TTS so it never reads the
                    // title prefix that lives in the index.
                    snippet: trimToSentence(source || ch.text, 800),
                    source_text: source,
                    kind: ch.kind,
                    blob_url: ch.blob_url,
                  };
                }),
              });
            });
          }

          // Synthesis failure is a grounding failure. Cloud models can
          // corrupt the stream mid-object (e.g. a content-policy refusal
          // spliced into the JSON while quoting a famous passage). One
          // silent non-streaming retry absorbs the flaky case; if that
          // fails too, the contract collapses to the verbatim empty state
          // rather than surfacing half-validated prose.
          let final: ReflectionAnswer | null = null;
          try {
            final = await object;
          } catch (synthErr) {
            console.warn("[/api/reflect] synthesis failed, retrying once", synthErr);
            try {
              const retry = await generateObject({
                model: await synthesisModel(),
                schema: ReflectionSchema,
                prompt,
                temperature: 0.3,
              });
              final = retry.object;
              // The stream's partials are stale now; hand the client the
              // retried claims so citation chips still appear.
              final.claims.forEach((c, i) => {
                const validCitations = c.citations.filter((id) =>
                  chunks.some((ch) => ch.capture_id === id),
                );
                if (validCitations.length === 0) return;
                send("claim", {
                  index: 1000 + i,
                  text: c.text,
                  citations: validCitations.map((cid) => {
                    const ch = chunks.find((x) => x.capture_id === cid)!;
                    const source = canonicalSourceText(ch);
                    return {
                      capture_id: cid,
                      snippet: trimToSentence(source || ch.text, 800),
                      source_text: source,
                      kind: ch.kind,
                      blob_url: ch.blob_url,
                    };
                  }),
                });
              });
            } catch (retryErr) {
              console.warn("[/api/reflect] retry failed", retryErr);
            }
          }
          const cite = final
            ? validateCitations(final, chunks)
            : ({ ok: false, reason: "synthesis_failed" } as const);
          const noClaims = !final || final.claims.length === 0;
          const firstPerson = final
            ? hasFirstPersonOutsideQuotes(final.answer)
            : false;
          // Soft refusal: the prose itself disclaims the archive, then
          // adds cited-but-tangential context that slips past the citation
          // and no-claims checks. Collapse to the clean designed refusal.
          const softRefusal = final
            ? looksLikeArchiveRefusal(final.answer)
            : false;
          if (!final || !cite.ok || firstPerson || noClaims || softRefusal) {
            send("grounded", { grounded: false });
            send("answer", { text: EMPTY_STATE_ANSWER });
            const reflection_id = await saveReflection(
              session,
              question,
              qEmb,
              {
                answer: EMPTY_STATE_ANSWER,
                claims: [],
                diagnostics: {
                  retrieved_count: chunks.length,
                  top_similarity: topSim,
                  threshold: floor,
                  rejected_for: !final
                    ? "synthesis_failed"
                    : firstPerson
                      ? "first_person"
                      : !cite.ok
                        ? "invalid_citation"
                        : softRefusal
                          ? "soft_refusal"
                          : "no_claims",
                  grounded: false,
                  retrieved_chunks: chunks.slice(0, 8).map((c) => ({
                    capture_id: c.capture_id,
                    similarity: c.similarity,
                    snippet: c.text.slice(0, 160),
                  })),
                },
              },
              false,
            );
            send("done", { reflection_id });
            controller.close();
            return;
          }

          send("answer", { text: final.answer });
          const reflection_id = await saveReflection(
            session,
            question,
            qEmb,
            {
              ...final,
              diagnostics: {
                retrieved_count: chunks.length,
                top_similarity: topSim,
                threshold: floor,
                rejected_for: null,
                grounded: true,
                retrieved_chunks: chunks.slice(0, 8).map((c) => ({
                  capture_id: c.capture_id,
                  similarity: c.similarity,
                  snippet: c.text.slice(0, 160),
                })),
              },
            },
            true,
          );
          send("done", { reflection_id });
          controller.close();
        } catch (err) {
          console.error("[/api/reflect]", err);
          const message =
            err instanceof Error && err.message.startsWith(EMBEDDING_MISMATCH)
              ? "This archive needs reindexing — the embedding model changed. See Settings."
              : "Reflection failed. Try again in a moment.";
          send("error", { message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Cap at `max` chars but never mid-sentence. Falls back to the raw
 *  hard cap when no sentence boundary fits in the window. */
function trimToSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  const lastTerminator = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf(".\n"),
  );
  if (lastTerminator > max * 0.6) {
    return text.slice(0, lastTerminator + 1).trim();
  }
  return window.trim() + "…";
}

async function saveReflection(
  session: { user_id: string; vault_id: string; role: "creator" | "nominee" },
  question: string,
  qEmb: number[],
  resp: ReflectionAnswer & {
    diagnostics?: Record<string, unknown>;
  },
  grounded: boolean,
): Promise<string> {
  return withRls(session.user_id, session.role, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO reflections (vault_id, user_id, question, question_embedding,
                               answer_json, grounded)
      VALUES (${session.vault_id}, ${session.user_id}, ${question},
              ${vec(qEmb)},
              ${tx.json(resp as Parameters<typeof tx.json>[0])}, ${grounded})
      RETURNING id
    `;
    return row.id;
  });
}
