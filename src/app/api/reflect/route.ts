import { streamObject } from "ai";
import { withRls } from "@/lib/db";
import { embedOne } from "@/lib/embed";
import { fetchTopK } from "@/lib/retrieval";
import { ollama, SYNTHESIS_MODEL } from "@/lib/ollama";
import { fireLetterConditions } from "@/lib/letter-conditions";
import {
  EMPTY_STATE_ANSWER,
  REFLECTION_SIMILARITY_THRESHOLD,
  ReflectionSchema,
  buildReflectionPrompt,
  hasFirstPersonOutsideQuotes,
  validateCitations,
  type ReflectionAnswer,
} from "@/lib/reflection";
import { HttpError, errorResponse, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/reflect
 *
 * Body: { question: string, mode?: 'server'|'device' }
 *
 * Returns Server-Sent Events:
 *   event: retrieved   { hit_count, top_similarity }
 *   event: grounded    { grounded: boolean }
 *   event: claim       { text, citations: [{ capture_id, snippet }] }
 *   event: answer      { text }            // assembled final answer
 *   event: done        { reflection_id }
 *   event: error       { message }
 *
 * Hard contracts (see lib/reflection.ts):
 *   - top similarity < THRESHOLD → empty state, no Gemma call
 *   - any citation outside retrieved set → empty state
 *   - first-person impersonation in answer → empty state
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = (await req.json()) as { question?: string; mode?: string };

    const question = body.question?.trim() ?? "";
    if (!question) throw new HttpError(400, "empty_question");
    if (question.length > 2000) throw new HttpError(400, "question_too_long");
    if (body.mode === "device") throw new HttpError(501, "device_mode_v2");

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          // 1) Look up the creator name (for prompt) + ensure session matches a real vault
          const meta = await withRls(
            session.user_id,
            session.role,
            async (tx) => {
              const [user] = await tx<{ display_name: string }[]>`
                SELECT display_name FROM users
                WHERE id = (SELECT creator_id FROM vaults WHERE id = ${session.vault_id})
              `;
              return user;
            },
          );

          // 2) Embed the question
          const qEmb = await embedOne(question);

          // 2b) Check if any sealed letters were sealed for a moment like this.
          //     Fires BEFORE the grounding gate so the letter surfaces even
          //     when there's no other grounded answer.
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

          // 3) Retrieve top-k
          const chunks = await fetchTopK(qEmb, session, 8);
          const topSim = chunks[0]?.similarity ?? 0;
          send("retrieved", { hit_count: chunks.length, top_similarity: topSim });

          // 4) Grounding gate — never bypass this
          if (chunks.length === 0 || topSim < REFLECTION_SIMILARITY_THRESHOLD) {
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
                  threshold: REFLECTION_SIMILARITY_THRESHOLD,
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

          // 5) Synthesis via Gemma 4 (structured JSON output)
          const prompt = buildReflectionPrompt(
            question,
            meta?.display_name ?? "the creator",
            chunks,
          );

          const { partialObjectStream, object } = streamObject({
            model: ollama(SYNTHESIS_MODEL),
            schema: ReflectionSchema,
            prompt,
            temperature: 0.3,
          });

          // 6) Stream claims as they arrive
          const sentClaims = new Set<number>();
          for await (const partial of partialObjectStream) {
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
              // Defensive: only forward claims whose citations are present
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
                  return {
                    capture_id: cid,
                    snippet: ch.text.slice(0, 220),
                  };
                }),
              });
            });
          }

          // 7) Final validation — citation set + first-person scrubber + non-empty claims
          const final: ReflectionAnswer = await object;
          const cite = validateCitations(final, chunks);
          const noClaims = final.claims.length === 0;
          const firstPerson = hasFirstPersonOutsideQuotes(final.answer);
          if (!cite.ok || firstPerson || noClaims) {
            // Note: the model sometimes paraphrases a "no" answer rather than
            // emitting the empty state verbatim. We coerce it back here.
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
                  threshold: REFLECTION_SIMILARITY_THRESHOLD,
                  rejected_for: firstPerson
                    ? "first_person"
                    : !cite.ok
                      ? "invalid_citation"
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
                threshold: REFLECTION_SIMILARITY_THRESHOLD,
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
          send("error", { message: "Reflection failed. Try again in a moment." });
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

async function saveReflection(
  session: { user_id: string; vault_id: string; role: "creator" | "nominee" },
  question: string,
  qEmb: number[],
  resp: ReflectionAnswer & {
    diagnostics?: Record<string, unknown>;
  },
  grounded: boolean,
): Promise<string> {
  const lit = `[${qEmb.join(",")}]`;
  return withRls(session.user_id, session.role, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO reflections (vault_id, user_id, question, question_embedding,
                               answer_json, grounded)
      VALUES (${session.vault_id}, ${session.user_id}, ${question},
              ${lit}::vector,
              ${JSON.stringify(resp)}::jsonb, ${grounded})
      RETURNING id
    `;
    return row.id;
  });
}
