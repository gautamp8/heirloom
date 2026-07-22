import type { Metadata } from "next";
import { Seal } from "@/components/seal";
import { links } from "@/components/links";
import { IconExternal, IconArrow } from "@/components/icons";

export const metadata: Metadata = {
  title: "Transparency",
  description:
    "Every decision the system made, and why. The grounding contract, the citation validator, the first-person scrubber, the verbatim empty state.",
};

export default function TransparencyPage() {
  return (
    <article className="stage relative">
      {/* hero */}
      <div className="mx-auto max-w-[860px] px-5 pt-20 md:pt-28 pb-16 relative z-10">
        <Seal size={48} />
        <p className="p-meta mt-7">Transparency</p>
        <h1 className="h-cover mt-3" style={{ maxWidth: "20ch" }}>
          A contract you can <em>verify</em>, not a promise to believe.
        </h1>
        <p className="p-lead mt-7">
          Every question the archive answers, refuses, or scrubs is logged
          with its diagnostics. The five checks below run between a question
          and an answer, and any of them can fail the whole reply.
        </p>
      </div>

      {/* The five steps */}
      <section
        style={{ borderTop: "1px solid var(--color-rule-soft)" }}
        className="py-16 md:py-24"
      >
        <div className="mx-auto max-w-[860px] px-5">
          <p className="p-meta">The contract</p>
          <h2 className="h-display mt-2 mb-12">
            Five checks. Any one of them can stop the answer.
          </h2>

          <ol className="flex flex-col gap-8">
            <Step
              n={1}
              title="Retrieval before model."
              body={
                <>
                  The question is matched against the archive's index first.
                  The language model isn't invoked until retrieval has found
                  something to point at. If the archive is empty on a topic,
                  the model is never asked.
                </>
              }
            />
            <Step
              n={2}
              title="A floor, not a hope."
              body={
                <>
                  An answer grounds on either a strong vector match{" "}
                  <em className="italic">or</em> a literal overlap with the
                  question. Either alone misses too much.
                </>
              }
            />
            <Step
              n={3}
              title="Every citation, checked."
              body={
                <>
                  Each claim in a streamed answer must point at a capture that
                  retrieval actually returned. A citation outside that set
                  fails the entire answer. There is no partial salvage.
                </>
              }
            />
            <Step
              n={4}
              title="No first person."
              body={
                <>
                  Any answer that says <em className="italic">I</em> or{" "}
                  <em className="italic">my</em> outside a quote fails. The
                  system describes what the creator said. It does not become
                  the person who said it.
                </>
              }
            />
            <Step
              n={5}
              title="One refusal sentence."
              body={
                <>
                  When the contract fails, the answer collapses to one line,
                  the same one every time:{" "}
                  <em className="italic">
                    "I don't have that in the archive. Try asking another way?"
                  </em>{" "}
                  No graceful filler. No suggested alternatives the system
                  cannot back up.
                </>
              }
            />
          </ol>
        </div>
      </section>

      {/* Pipeline diagram */}
      <section
        style={{ background: "var(--color-paper-2)" }}
        className="py-16 md:py-24"
      >
        <div className="mx-auto max-w-[860px] px-5">
          <p className="p-meta">How a question becomes an answer</p>
          <h2 className="h-display mt-2 mb-10">From a sentence to a citation.</h2>

          <ol
            className="flex flex-col"
            style={{
              borderRadius: 14,
              background: "var(--color-bg-raised)",
              border: "1px solid var(--color-rule)",
              overflow: "hidden",
            }}
          >
            <Pipe
              eyebrow="01"
              title="A question arrives"
              body="A nominee asks something on the Reflect surface. The session is scoped so everything downstream can only see what the creator already released to them. Row-level security in the database enforces it."
              first
            />
            <Pipe
              eyebrow="02"
              title="Embed locally"
              body="The question is turned into a 768-dim vector by EmbeddingGemma running on the same device through Ollama. Nothing about the question leaves the machine."
            />
            <Pipe
              eyebrow="03"
              title="Retrieve"
              body="A vector index in pgvector (or sqlite-vec inside the .app) returns the closest captures — released ones for a nominee, everything for the creator."
            />
            <Pipe
              eyebrow="04"
              title="Gate"
              body="The result must clear a similarity floor or share a substantive word with the question. If neither holds, the refusal line is served and the model is never called."
            />
            <Pipe
              eyebrow="05"
              title="Synthesise"
              body="A grounded variant of Gemma 4, built from an open Modelfile that strips it of fabrication-friendly defaults, streams an answer that cites the retrieved captures."
            />
            <Pipe
              eyebrow="06"
              title="Validate"
              body="Every citation is checked against the retrieved set. Any first-person token outside quotes fails the whole answer. The diagnostics are logged inside the archive."
              last
            />
          </ol>
        </div>
      </section>

      {/* Architecture diagram */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="text-center mb-10 max-w-[640px] mx-auto">
            <p className="p-meta">The whole system, on one page</p>
            <h2 className="h-display mt-2">
              What runs, where, and why.
            </h2>
          </div>
          <div
            style={{
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid var(--color-rule-soft)",
              boxShadow: "var(--shadow-paper-2)",
              background: "var(--color-paper)",
            }}
          >
            <img
              src="/architecture.png"
              alt="Heirloom system architecture: client surfaces on the left, Next.js route handlers in the middle with the /api/reflect endpoint in wax red, sidecars on the right (Ollama with gemma4:e4b and embeddinggemma, whisper-cpp, opt-in LuxTTS, Postgres with pgvector and a SQLite + sqlite-vec mirror), and the five-step grounding contract along the bottom."
              style={{ width: "100%", display: "block" }}
            />
          </div>
        </div>
      </section>

      {/* What the model does not see */}
      <section
        style={{ borderTop: "1px solid var(--color-rule-soft)" }}
        className="py-16 md:py-24"
      >
        <div className="mx-auto max-w-[860px] px-5">
          <p className="p-meta">What the model never sees</p>
          <h2 className="h-display mt-2 mb-8">The model gets the words. Never the people.</h2>

          <p className="p-lead">
            The retrieval and synthesis prompts include only the capture's
            text and the date it was captured. No names. No nominee list. No
            life events. No anchor dates. No biography. The model has the
            words, never the social graph around them.
          </p>

          <p className="p-body mt-5">
            Face recognition runs entirely in the browser. The descriptors
            never leave the device. When a face match later changes, every
            photo's caption is quietly re-rendered without the wrong name.
          </p>
        </div>
      </section>

      {/* Audit it */}
      <section
        style={{ background: "var(--color-paper-2)" }}
        className="py-16 md:py-24"
      >
        <div className="mx-auto max-w-[860px] px-5">
          <p className="p-meta">Audit it yourself</p>
          <h2 className="h-display mt-2 mb-8">
            The whole thing is open under Apache 2.0.
          </h2>

          <p className="p-lead mb-8">
            You don't have to take our word for any of this. The contract is
            short, the code is public, and the design choices behind it are
            written out plainly.
          </p>

          <div className="flex flex-wrap gap-3">
            <a
              href={links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: 13.5 }}
            >
              Read the source
              <IconExternal size={13} />
            </a>
            <a
              href="/design"
              className="btn btn-secondary"
              style={{ fontSize: 13.5 }}
            >
              The design philosophy
              <IconArrow size={14} />
            </a>
          </div>
        </div>
      </section>
    </article>
  );
}

// ───────── components ─────────

function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 22,
        alignItems: "start",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          background: "var(--color-paper-3)",
          border: "1px solid var(--color-rule)",
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--color-ink)",
          fontWeight: 500,
        }}
      >
        {n}
      </div>
      <div>
        <h3 className="h-section" style={{ fontSize: 21 }}>
          {title}
        </h3>
        <p className="p-body mt-3" style={{ fontSize: 15 }}>
          {body}
        </p>
      </div>
    </li>
  );
}

function Pipe({
  eyebrow,
  title,
  body,
  first,
  last,
}: {
  eyebrow: string;
  title: string;
  body: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 18,
        padding: "20px 22px",
        borderTop: first ? "none" : "1px solid var(--color-rule-soft)",
        alignItems: "start",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.18em",
          color: "var(--color-ink-fade)",
          textTransform: "uppercase",
          paddingTop: 4,
        }}
      >
        {eyebrow}
      </span>
      <div>
        {/* h3, not h4: these sit directly under a section h2, and skipping
            a level breaks heading-order navigation. Size is unchanged. */}
        <h3 className="h-section" style={{ fontSize: 16 }}>
          {title}
        </h3>
        <p className="p-body mt-1.5" style={{ fontSize: 14 }}>
          {body}
        </p>
      </div>
      {last ? null : null}
    </li>
  );
}
