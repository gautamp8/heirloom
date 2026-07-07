import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { withRls } from "@/lib/db";
import { REFLECTION_SIMILARITY_THRESHOLD } from "@/lib/reflection";
import { describeProvider, retrievalFloor } from "@/lib/provider";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  question: string;
  grounded: boolean;
  answer_json: {
    answer?: string;
    claims?: unknown[];
    diagnostics?: {
      retrieved_count?: number;
      top_similarity?: number;
      threshold?: number;
      grounded?: boolean;
      rejected_for?: string | null;
      retrieved_chunks?: {
        capture_id: string;
        similarity: number;
        snippet: string;
      }[];
    };
  } | null;
  created_at: Date;
};

export default async function TransparencyPage() {
  const session = await readSession();
  if (!session) redirect("/portal");

  const provider = await describeProvider().catch(() => null);
  const activeFloor = await retrievalFloor().catch(
    () => REFLECTION_SIMILARITY_THRESHOLD,
  );

  const rows = await withRls(session.user_id, session.role, async (tx) => {
    return tx<Row[]>`
      SELECT id, question, grounded, answer_json, created_at
        FROM reflections
       WHERE vault_id = ${session.vault_id}
       ORDER BY created_at DESC
       LIMIT 30
    `;
  });

  return (
    <main className="stage relative min-h-dvh px-6 pt-8 pb-16">
      <div className="max-w-[720px] mx-auto relative z-10">
        <Link
          href="/"
          className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted hover:text-ink"
        >
          ← Home
        </Link>
        <p className="eyebrow mt-4 mb-2">Transparency</p>
        <h1 className="h-title mb-3">
          What Heirloom <em>decided.</em>
        </h1>
        <p className="p-body max-w-[560px] mb-10">
          Every Reflection query Heirloom answered - or refused - and why. The
          grounding gate, the citation check, the first-person scrubber: all
          visible. Nothing leaves the model unsupervised.
        </p>

        {/* Static legend explaining the contract */}
        <article
          className="mb-10 rounded-[14px] border border-rule p-5 bg-bg-raised"
          style={{ boxShadow: "0 0 0 1px rgba(31,27,20,0.02)" }}
        >
          <p className="eyebrow mb-3">Grounding contract</p>
          <ul className="flex flex-col gap-2 font-serif text-[15px] leading-[1.5] text-ink-soft">
            <li>
              <strong className="font-medium text-ink">1. Retrieval first.</strong> Every
              question is embedded with{" "}
              <code className="font-mono text-[13px]">
                {provider?.embedding ?? "the local embedding model"}
              </code>{" "}
              and matched against the archive&rsquo;s 768-dim vector index
              before the language model is touched.
            </li>
            <li>
              <strong className="font-medium text-ink">2. Similarity threshold.</strong>{" "}
              If the top chunk falls below cosine{" "}
              <code className="font-mono text-[13px]">{activeFloor}</code>, the
              empty state is served verbatim. The model is never called. The
              floor is calibrated per embedding model.
            </li>
            <li>
              <strong className="font-medium text-ink">3. Citation validator.</strong> Every
              streamed claim&rsquo;s citations are checked against the retrieved
              set. Anything outside it is rejected.
            </li>
            <li>
              <strong className="font-medium text-ink">4. First-person scrubber.</strong>{" "}
              Any answer that speaks AS the creator (outside quotes) is rejected.
            </li>
            <li>
              <strong className="font-medium text-ink">5. Verbatim empty state.</strong>{" "}
              When any check fails, the response is coerced to the exact empty
              state &mdash; never a hedged synthesis.
            </li>
          </ul>
        </article>

        {rows.length === 0 ? (
          <p className="p-body text-ink-muted">No Reflection queries yet.</p>
        ) : (
          <ul className="flex flex-col gap-6">
            {rows.map((r) => (
              <ReflectionAudit key={r.id} row={r} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function ReflectionAudit({ row }: { row: Row }) {
  const d = row.answer_json?.diagnostics ?? {};
  const top = typeof d.top_similarity === "number" ? d.top_similarity : null;
  const threshold = d.threshold ?? REFLECTION_SIMILARITY_THRESHOLD;
  const chunks = d.retrieved_chunks ?? [];
  const passedGate = top !== null && top >= (threshold as number);
  const finalGrounded = row.grounded;
  const rejected = d.rejected_for ?? null;

  return (
    <li className="rounded-[14px] border border-rule p-5 bg-bg-raised">
      {/* Header: question + timestamp */}
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
          {new Date(row.created_at).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
        <span
          className="font-mono text-[10px] tracking-[0.16em] uppercase px-2 py-0.5 rounded-full"
          style={{
            background: finalGrounded
              ? "rgba(75,123,68,0.12)"
              : "rgba(125,42,26,0.12)",
            color: finalGrounded ? "var(--color-moss)" : "var(--color-wax)",
          }}
        >
          {finalGrounded ? "Grounded" : "Refused"}
        </span>
      </div>
      <p className="font-serif italic text-[18px] leading-[1.35] text-ink mb-4">
        {row.question}
      </p>

      {/* Decision pipeline */}
      <ol className="flex flex-col gap-2.5 mb-4">
        <Step label="Embedded" ok detail="Query → 768-dim vector" />
        <Step
          label={`Retrieved ${d.retrieved_count ?? 0} chunks`}
          ok={(d.retrieved_count ?? 0) > 0}
          detail={
            top !== null
              ? `Top similarity ${top.toFixed(3)} · threshold ${(threshold as number).toFixed(2)}`
              : "No chunks indexed yet"
          }
        />
        <Step
          label={passedGate ? "Grounding gate passed" : "Grounding gate refused"}
          ok={passedGate}
          detail={
            passedGate
              ? "Top similarity ≥ threshold - proceed to synthesis"
              : `Top similarity ${top?.toFixed(3) ?? "0"} < ${(threshold as number).toFixed(2)} → empty state, model NOT called`
          }
        />
        {passedGate && (
          <>
            <Step
              label="Citation validator"
              ok={rejected !== "invalid_citation"}
              detail={
                rejected === "invalid_citation"
                  ? "Model cited a chunk outside the retrieved set"
                  : "Every cited capture is in the retrieved set"
              }
            />
            <Step
              label="First-person scrubber"
              ok={rejected !== "first_person"}
              detail={
                rejected === "first_person"
                  ? 'Answer used "I" or "my" outside quotes - refused'
                  : "Answer stays in third person about the archive"
              }
            />
            <Step
              label={finalGrounded ? "Answered" : "Refused at final check"}
              ok={finalGrounded}
              detail={
                finalGrounded
                  ? "Streamed claims back to the client with citation chips"
                  : `Coerced to empty state (${rejected ?? "unknown"})`
              }
            />
          </>
        )}
      </ol>

      {/* Retrieved chunks panel */}
      {chunks.length > 0 && (
        <details className="mt-3">
          <summary className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted cursor-pointer hover:text-ink">
            Top {Math.min(chunks.length, 8)} retrieved chunks
          </summary>
          <ul className="mt-3 flex flex-col gap-2.5">
            {chunks.map((c, i) => (
              <li
                key={i}
                className="rounded-[10px] border border-rule-soft p-3 bg-paper-2"
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-fade">
                    #{i + 1} · {c.capture_id.slice(0, 8)}
                  </span>
                  <span className="font-mono text-[10px] text-ink">
                    {c.similarity.toFixed(3)}
                  </span>
                </div>
                <p className="font-serif italic text-[13px] text-ink-soft leading-[1.4]">
                  {c.snippet}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Final answer */}
      {row.answer_json?.answer && (
        <div className="mt-4 pt-3 border-t border-rule-soft">
          <p className="eyebrow mb-1">
            {finalGrounded ? "Answered" : "Empty state"}
          </p>
          <p className="font-serif text-[15px] leading-[1.55] text-ink-soft">
            {row.answer_json.answer}
          </p>
        </div>
      )}
    </li>
  );
}

function Step({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-1 w-4 h-4 rounded-full flex-shrink-0 grid place-items-center text-[10px] font-mono"
        style={{
          background: ok
            ? "rgba(75,123,68,0.18)"
            : "rgba(125,42,26,0.16)",
          color: ok ? "var(--color-moss)" : "var(--color-wax)",
        }}
      >
        {ok ? "✓" : "×"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-sans text-[14px] text-ink">{label}</p>
        <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-ink-fade mt-0.5">
          {detail}
        </p>
      </div>
    </li>
  );
}
