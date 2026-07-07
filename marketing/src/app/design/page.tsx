import type { Metadata } from "next";
import { Seal } from "@/components/seal";
import { links } from "@/components/links";
import { IconExternal, IconArrow } from "@/components/icons";
import { MockupLetter } from "@/mockups/letter";

export const metadata: Metadata = {
  title: "Design and ethics",
  description:
    "Why we refused to build a chatbot, what the consent ceremony for voice cloning looks like, and why notifications never carry content.",
};

export default function DesignPage() {
  return (
    <article className="stage relative">
      <div className="mx-auto max-w-[860px] px-5 pt-20 md:pt-28 pb-16 relative z-10">
        <Seal size={48} />
        <p className="p-meta mt-7">Design and ethics</p>
        <h1 className="h-cover mt-3" style={{ maxWidth: "16ch" }}>
          The product decisions that <em>took the longest</em>.
        </h1>
        <p className="p-lead mt-7">
          Heirloom is a held space. The job is to keep what was put in,
          exactly as it was put in, and to hand it back when the moment makes
          sense. Each design choice here is a place we said{" "}
          <em className="italic">no</em> to something easier, and the reason we
          said no.
        </p>

      </div>

      {/* ── What we refused to build ── */}
      <Section eyebrow="What we refused to build" title="Four shapes the product is not.">
        <RefusalGrid />
      </Section>

      {/* ── Voice register ── */}
      <Section eyebrow="Voice register" title="What we say. What we don't.">
        <div className="grid md:grid-cols-2 gap-4">
          <Register
            tone="moss"
            title="We say"
            items={[
              [`released`, `the moment a sealed letter surfaces`],
              [`held`, `a memory the creator has set aside`],
              [`opened`, `a nominee reading what was meant for them`],
              [`their voice`, `the original audio, or text read in their cadence`],
              [`a place to begin`, `the daily prompt`],
            ]}
          />
          <Register
            tone="wax"
            title="We don't say"
            items={[
              [`unlocked`, `treats the archive as a videogame`],
              [`queued`, `treats a letter as a job`],
              [`viewed`, `treats a memory as content`],
              [`AI`, `the model is a means, not a feature`],
              [`engage`, `we are not building engagement`],
            ]}
          />
        </div>
      </Section>

      {/* ── The Warm Paper palette ── */}
      <Section eyebrow="The palette" title="Warm Paper. One ceremonial accent.">
        <p className="p-lead mb-10">
          Cream paper backgrounds replace flat white. Ink replaces black. Wax
          red appears at most once per screen, reserved for ceremonial actions
          — <em className="italic">save</em>,{" "}
          <em className="italic">designate</em>,{" "}
          <em className="italic">release</em>.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Swatch token="paper" hex="#FAF7F0" name="Paper · canvas" />
          <Swatch token="paper-2" hex="#F2EBDB" name="Paper · raised card" />
          <Swatch token="paper-3" hex="#E8DFC8" name="Paper · sunken input" />
          <Swatch token="vellum" hex="#D8CBA8" name="Vellum · image bg" />

          <Swatch token="ink" hex="#1F1B14" name="Ink · body" dark />
          <Swatch token="ink-soft" hex="#4A4338" name="Ink · soft" dark />
          <Swatch token="sepia" hex="#5C3A21" name="Sepia · voice" dark />
          <Swatch token="ink-muted" hex="#8C8472" name="Ink · meta" />

          <Swatch token="wax" hex="#7D2A1A" name="Wax · ceremonial" dark />
          <Swatch token="wax-soft" hex="#A23F2A" name="Wax · soft" dark />
          <Swatch token="candle" hex="#C9892A" name="Candle · timestamps" dark />
          <Swatch token="moss" hex="#5F6B43" name="Moss · status" dark />
        </div>

        <p className="p-meta mt-6" style={{ color: "var(--color-ink-fade)" }}>
          No pure black. No neon. No purple. No sparkles or orbs. The product
          should look like an heirloom, not like a productivity app.
        </p>
      </Section>

      {/* ── Typography ── */}
      <Section eyebrow="Typography" title="Three families. One register each.">
        <div className="grid md:grid-cols-3 gap-5">
          <TypeSpecimen
            family="Source Serif 4"
            role="Display, prompts, the voice"
            sample="Look again at that dot."
            css={{ fontFamily: "var(--font-serif)", fontSize: 28, fontStyle: "italic" }}
          />
          <TypeSpecimen
            family="Geist"
            role="UI · buttons · fields · body"
            sample="A place to begin"
            css={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 400 }}
          />
          <TypeSpecimen
            family="JetBrains Mono"
            role="Meta · provenance · timestamps"
            sample="LOCAL ONLY · 14 FEB 1990"
            css={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          />
        </div>

        <p className="p-lead mt-10">
          Italic Source Serif on accent words —{" "}
          <em className="italic">Heirloom</em>,{" "}
          <em className="italic">their voice</em>,{" "}
          <em className="italic">preserve presence across generations</em> — is
          the only typographic flourish. Everything else is plain.
        </p>
      </Section>

      {/* ── The wax seal ── */}
      <Section eyebrow="The brand mark" title="A wax seal, not a sparkle.">
        <div className="grid md:grid-cols-[1.1fr_1fr] gap-12 items-center">
          <div>
            <p className="p-lead">
              The candidates we explored — a sparkle, an envelope, an open
              book, a single line drawing of a tree — all read either as AI or
              as something specific that didn't quite cover the whole product.
              A wax seal carries the ceremony of sealed letters without
              committing to a single metaphor.
            </p>
            <p className="p-body mt-5">
              It is also the simplest concept to render across a 16×16 favicon
              and a 2000×2000 app icon, which matters when the same mark needs
              to live on a phone home screen, a .dmg window, and a video title
              card.
            </p>
          </div>
          <div className="flex items-center justify-center gap-10 py-8">
            <Seal size={36} />
            <Seal size={64} />
            <Seal size={104} />
          </div>
        </div>
      </Section>

      {/* ── Motion ── */}
      <Section eyebrow="Motion" title="Restrained baseline. Three cinematic moments.">
        <div className="grid md:grid-cols-3 gap-5">
          <MotionBar label="Routine" ms={240} bar="quick" />
          <MotionBar label="Calm transition" ms={520} bar="calm" />
          <MotionBar label="Cinematic moment" ms={1100} bar="cinema" />
        </div>
        <p className="p-lead mt-8">
          Motion is allowed to be theatrical exactly three times: the wax seal
          breaking on a sealed-letter open, the passphrase reveal at first
          launch, and the citation drawer sliding up.
        </p>
      </Section>

      {/* ── Imagery ── */}
      <Section eyebrow="Imagery" title="Atmospheric, not stock-people.">
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-10 items-center">
          <div>
            <p className="p-lead">
              A window. A hand. A kitchen at the end of the day. Never collaged
              faces. Never the <em className="italic">diverse-group-laughing</em>{" "}
              trope of consumer software. The creator's own photographs are the
              primary imagery in the product itself.
            </p>
            <p className="p-body mt-5">
              Casting guidance: show the full age range — a thirty-year-old
              recording at a kitchen table, a parent in their forties on a
              porch, a grandparent at a sewing machine. Never default to{" "}
              <em className="italic">an elder</em>. Heirloom is not an
              aging-services product, and the imagery cannot suggest it is.
            </p>
          </div>
          <div
            style={{
              padding: 36,
              borderRadius: 16,
              background: "var(--color-paper-2)",
              border: "1px solid var(--color-rule-soft)",
            }}
          >
            <MockupLetter width={340} />
          </div>
        </div>
      </Section>

      {/* ── Footer link out ── */}
      <div className="mx-auto max-w-[860px] px-5 pb-24 flex flex-wrap gap-3">
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
          href="/transparency"
          className="btn btn-secondary"
          style={{ fontSize: 13.5 }}
        >
          The grounding contract
          <IconArrow size={14} />
        </a>
      </div>
    </article>
  );
}

// ───────── components ─────────

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderTop: "1px solid var(--color-rule-soft)",
      }}
    >
      <div className="mx-auto max-w-[860px] px-5 py-16 md:py-24">
        <p className="p-meta">{eyebrow}</p>
        <h2 className="h-display mt-2 mb-10" style={{ maxWidth: "20ch" }}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

function RefusalGrid() {
  const items = [
    {
      h: "A chatbot pretending to be the creator.",
      b: "Feeding a model someone's writing and letting people chat with the simulacrum generates new sentences they never wrote, in their voice, with no way for the reader to tell what is real and what is invented. The system answers only by pointing at what was actually said — and refuses, plainly, when there's nothing to point at.",
    },
    {
      h: "A digital resurrection.",
      b: "Voice cloning is opt-in, recorded by a living creator, and only ever reads text the creator already wrote. There is no free-form “speak this for me” surface. The cloned voice's timbre stays consistent across notes, so the voice you hear today is the same one you'll hear tomorrow.",
    },
    {
      h: "An engagement loop.",
      b: "No streaks. No visit counts. No “you haven't visited in 14 days.” Notifications fire only on real events — a sealed letter unlocking, a date-triggered release. The lock-screen of a phone in a stranger's hand reveals nothing of what's inside.",
    },
    {
      h: "A managed cloud product.",
      b: "Heirloom installs on the creator's own laptop and runs local by default — the language model, the transcription, the voice cloning, the face matching, all on the device. If you'd rather use a cloud model, you can bring your own API key; the settings screen states in plain words exactly what leaves the device and when. The download never falls back to our servers on its own.",
    },
  ];
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {items.map((i) => (
        <div key={i.h} className="card">
          <h3 className="h-section" style={{ fontSize: 19 }}>
            {i.h}
          </h3>
          <p className="p-body mt-3" style={{ fontSize: 14 }}>
            {i.b}
          </p>
        </div>
      ))}
    </div>
  );
}

function Register({
  tone,
  title,
  items,
}: {
  tone: "wax" | "moss";
  title: string;
  items: [string, string][];
}) {
  return (
    <div className="card">
      <p
        className="p-meta"
        style={{ color: tone === "wax" ? "var(--color-wax)" : "var(--color-moss)" }}
      >
        {title}
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map(([word, note]) => (
          <li
            key={word}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 14,
              alignItems: "baseline",
              borderBottom: "1px solid var(--color-rule-soft)",
              paddingBottom: 8,
            }}
          >
            <span
              className="voice"
              style={{
                fontSize: 17,
                color: tone === "wax" ? "var(--color-ink-fade)" : "var(--color-sepia)",
                textDecoration: tone === "wax" ? "line-through" : "none",
                textDecorationThickness: tone === "wax" ? "1px" : undefined,
                minWidth: 80,
              }}
            >
              {word}
            </span>
            <span className="p-body" style={{ fontSize: 13.5 }}>
              {note}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Swatch({
  token,
  hex,
  name,
  dark,
}: {
  token: string;
  hex: string;
  name: string;
  dark?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          height: 90,
          borderRadius: 10,
          background: hex,
          border: "1px solid rgba(31,27,20,0.08)",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 10,
            top: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: dark ? "rgba(250,247,240,0.8)" : "var(--color-ink-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          --color-{token}
        </span>
        <span
          style={{
            position: "absolute",
            right: 10,
            bottom: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: dark ? "rgba(250,247,240,0.85)" : "var(--color-ink)",
          }}
        >
          {hex}
        </span>
      </div>
      <p
        className="p-body mt-2"
        style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}
      >
        {name}
      </p>
    </div>
  );
}

function TypeSpecimen({
  family,
  role,
  sample,
  css,
}: {
  family: string;
  role: string;
  sample: string;
  css: React.CSSProperties;
}) {
  return (
    <div
      className="card"
      style={{
        minHeight: 140,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <p style={{ ...css, color: "var(--color-ink)" }}>{sample}</p>
      <div style={{ marginTop: 24 }}>
        <p className="p-meta">{family}</p>
        <p
          className="p-body"
          style={{ fontSize: 13, marginTop: 4 }}
        >
          {role}
        </p>
      </div>
    </div>
  );
}

function MotionBar({
  label,
  ms,
  bar,
}: {
  label: string;
  ms: number;
  bar: "quick" | "calm" | "cinema";
}) {
  const width = bar === "quick" ? "22%" : bar === "calm" ? "47%" : "100%";
  return (
    <div className="card">
      <p className="p-meta">{label}</p>
      <div
        style={{
          marginTop: 16,
          height: 5,
          background: "var(--color-paper-3)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width,
            background: bar === "cinema" ? "var(--color-wax)" : "var(--color-ink-soft)",
            borderRadius: 999,
          }}
        />
      </div>
      <p
        className="p-meta mt-3"
        style={{
          color: "var(--color-ink-fade)",
        }}
      >
        {ms}ms · {bar === "cinema" ? "--duration-cinema" : bar === "calm" ? "--duration-calm" : "--duration-quick"}
      </p>
    </div>
  );
}
