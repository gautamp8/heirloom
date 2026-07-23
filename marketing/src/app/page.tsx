import { Reel } from "@/components/reel";
import { Seal } from "@/components/seal";
import { DownloadButton } from "@/components/download-button";
import { TryButton } from "@/components/try-button";
import { DeviceiPhone } from "@/components/device-iphone";
import { DeviceMac } from "@/components/device-mac";
import { MockupCapture } from "@/mockups/capture";
import { MockupNominee } from "@/mockups/nominee";
import { MockupEmptyState } from "@/mockups/empty-state";
import { MockupSealedLetterPhone } from "@/mockups/sealed-letter-phone";
import { links } from "@/components/links";
import { IconArrow, IconExternal } from "@/components/icons";

export default function Home() {
  return (
    <>
      {/* ───── Hero ───── */}
      <section className="stage relative">
        <div className="mx-auto max-w-[1180px] px-5 pt-16 pb-20 md:pt-24 md:pb-28 relative z-10">
          <div className="flex flex-col items-center text-center fade-up">
            {/* Plain seal for now — the opening-envelope ceremony is parked
                until it earns its place in the hero. */}
            <div className="mb-8">
              <Seal size={96} />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="pill">Local-first</span>
              <span className="pill pill-beta">Beta</span>
              <span className="pill pill-moss">Open source</span>
            </div>

            <h1 className="h-cover mt-7 max-w-[18ch]">
              Preserve <em>presence</em> across generations.
            </h1>

            <p className="p-lead mt-6 mx-auto fade-up-d1">
              A private place for the voice, photographs, and letters someone
              wanted to leave behind. Held on a device the family owns. Spoken
              in the words they actually said.
            </p>

            <div className="mt-9 flex flex-wrap items-start gap-x-4 gap-y-5 justify-center fade-up-d2">
              <TryButton size="large" variant="ink">
                Try the Sagan archive
              </TryButton>
              <DownloadButton size="large" variant="secondary" />
            </div>

            <p className="p-meta mt-7 fade-up-d3">
              No telemetry · No account · Nothing leaves without you
            </p>
          </div>
        </div>
      </section>

      {/* ───── Three-line pitch ───── */}
      <section className="mx-auto max-w-[1180px] px-5 pb-16">
        <div className="grid md:grid-cols-3 gap-4">
          <PitchCard
            label="Voice"
            body="The original recording, kept. A voice clone that only reads what was actually written. Opt-in, recorded once."
          />
          <PitchCard
            label="Photographs"
            body="Faces are matched on the device. Photos are captioned in the archival third person, using the names the creator chose."
          />
          <PitchCard
            label="Letters"
            body="Write something for a date, a moment, a feeling. The letter stays sealed until the right one arrives."
            tone="wax"
          />
        </div>
      </section>

      {/* ───── The reel ───── */}
      <section className="mx-auto max-w-[1180px] px-5 pb-20 md:pb-28">
        <div className="text-center mb-10 max-w-[640px] mx-auto">
          <p className="p-meta">A walk through</p>
          <h2 className="h-display mt-2">
            A few minutes inside the archive.
          </h2>
          <p className="p-body mt-4 mx-auto" style={{ fontSize: 14.5, maxWidth: 520 }}>
            The screens a creator opens to leave something behind, and the
            ones a nominee opens to find it.
          </p>
        </div>

        <div className="flex justify-center">
          <Reel />
        </div>
      </section>

      {/* ───── Capture · Reflect · Hand off ───── */}
      <section className="bg-paper-2/40 py-20 md:py-28" style={{ background: "var(--color-paper-2)" }}>
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="flex items-end justify-between mb-12 gap-4 flex-wrap">
            <div>
              <p className="p-meta">What it does</p>
              <h2 className="h-display mt-2 max-w-[22ch]">
                Hold what was said. Find it later. Pass it on.
              </h2>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-10 lg:gap-14">
            {/* Capture */}
            <Pillar
              eyebrow="Capture"
              title={<>Speak, write, or photograph. Save once.</>}
              body={
                <>
                  A note titled in your own hand. A voice memo transcribed by
                  Whisper, embedded for retrieval, and the original recording
                  preserved for playback. A photo captioned by Gemma 4 in the
                  archival third person — if a face matches someone you've
                  named, the caption uses that name.
                </>
              }
            >
              <DeviceiPhone width={320} height={620}>
                <MockupCapture typed="The nitrogen in our DNA, the calcium in our teeth, the iron in our blood." />
              </DeviceiPhone>
            </Pillar>

            {/* Reflect */}
            <Pillar
              eyebrow="Reflect"
              title={<>Ask the archive. Never get fiction back.</>}
              body={
                <>
                  Every question is embedded and matched against the archive's
                  vector index. The model isn't invoked until retrieval has
                  produced something to point at. When it has, every claim is
                  validated against the cited captures — and every answer
                  carries the original next to it, in the words it actually
                  came from.
                </>
              }
            >
              <DeviceiPhone width={320} height={620}>
                <MockupEmptyState />
              </DeviceiPhone>
            </Pillar>

            {/* Hand off */}
            <Pillar
              eyebrow="Hand off"
              title={<>Sealed letters wait for the right moment.</>}
              body={
                <>
                  Write a letter <em className="italic">&ldquo;for when Sam feels lost&rdquo;</em>{" "}
                  or <em className="italic">&ldquo;the morning after Sam&rsquo;s wedding.&rdquo;</em>{" "}
                  Five triggers: an absolute date, a life event, a mood the
                  nominee taps, a Reflection that matches the letter's intent,
                  or simply a first visit. The body stays sealed until then.
                </>
              }
            >
              <DeviceiPhone width={320} height={620}>
                <MockupSealedLetterPhone />
              </DeviceiPhone>
            </Pillar>
          </div>
        </div>
      </section>

      {/* ───── Quietly capable ───── */}
      <section className="mx-auto max-w-[1180px] px-5 py-20 md:py-24">
        <div className="flex items-end justify-between mb-10 gap-4 flex-wrap">
          <div>
            <p className="p-meta">Quietly capable</p>
            <h2 className="h-display mt-2 max-w-[22ch]">
              The work happens on your device, not somewhere else.
            </h2>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Capability
            title="Their voice, cloned locally."
            body="Fifteen seconds of speech, once. The clone reads notes and letters in their cadence — never inventing words, only voicing what was actually written."
          />
          <Capability
            title="A daily prompt that listens."
            body="Each morning the archive offers a single line drawn from the creator's own register and what they've already captured. Not a streak. Not a nudge. Just a place to begin."
          />
          <Capability
            title="Photos that know their people."
            body="Faces are recognised in the browser and matched to people the creator named. Captions use those names — and revise themselves quietly when a match later changes."
          />
          <Capability
            title="Sealed letters that wait."
            body="Write a letter for a date, a life event, a feeling, or a first visit. The body stays closed until the right moment, then surfaces with the wax-seal ceremony it deserves."
          />
          <Capability
            title="Install to home screen."
            body="Heirloom is a progressive web app. Add to home on a phone for a full-screen, offline-capable companion that lives next to the family photo album."
          />
          <Capability
            title="Letters that whisper."
            body="Notifications arrive only when a real moment does — a date, a release, a letter unsealing. The contents stay inside the archive."
          />
        </div>
      </section>

      {/* ───── Grounding contract preview ───── */}
      <section className="mx-auto max-w-[1180px] px-5 py-20 md:py-28">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-20 items-start">
          <div>
            <p className="p-meta">The contract</p>
            <h2 className="h-display mt-2 max-w-[18ch]">
              The system refuses to invent. By design.
            </h2>
            <p className="p-lead mt-6">
              Five checks run between a question and an answer. When any of
              them fails, the system says so plainly — in the same sentence,
              every time.
            </p>

            <ol className="mt-8 flex flex-col gap-5">
              <ContractStep
                n={1}
                title="Retrieval before model."
                body="The model isn't asked anything until the archive has found something to point at. If the archive is empty on a topic, the model never speaks."
              />
              <ContractStep
                n={2}
                title="A floor, not a hope."
                body="Answers ground on either a strong vector match or a literal overlap with the question. One alone misses too much."
              />
              <ContractStep
                n={3}
                title="Every citation, checked."
                body="Each claim in an answer must point at a capture that retrieval actually returned. A citation outside that set fails the whole answer."
              />
              <ContractStep
                n={4}
                title="No first person."
                body={<>Any answer that says <em className="italic">I</em> or <em className="italic">my</em> outside a quote fails. The system describes what was said. It does not become the person who said it.</>}
              />
              <ContractStep
                n={5}
                title="One refusal sentence."
                body={<>When the contract fails, the answer collapses to one line, the same every time: <em className="italic">&ldquo;I don&rsquo;t have that in the archive. Try asking another way?&rdquo;</em></>}
              />
            </ol>

            <a
              href="/transparency"
              className="btn-ghost mt-8 inline-flex"
              style={{ fontSize: 13.5 }}
            >
              Read the full contract
              <IconArrow size={14} />
            </a>
          </div>

          <div className="lg:sticky lg:top-24">
            <DeviceiPhone width={360} height={720}>
              <MockupEmptyState />
            </DeviceiPhone>
          </div>
        </div>
      </section>

      {/* ───── Privacy posture ───── */}
      <section
        style={{ background: "var(--color-paper-2)" }}
        className="py-20 md:py-24"
      >
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12 items-center">
            <div>
              <p className="p-meta">What stays on your device</p>
              <h2 className="h-display mt-2 max-w-[16ch]">
                Local-first. <em className="italic">Visible</em>, not just true.
              </h2>
              <p className="p-lead mt-6">
                Heirloom installs on your own laptop. By default the model
                runs there and your archive stays put — until you deliberately
                hand it on, as one encrypted file only your passphrase opens.
                No accounts, no analytics, no telemetry — and the few times
                anything is sent to the network at all, the list is short and
                named, right here.
              </p>
            </div>

            <ul
              className="flex flex-col gap-px overflow-hidden"
              style={{
                background: "var(--color-bg-raised)",
                border: "1px solid var(--color-rule)",
                borderRadius: 14,
                boxShadow: "var(--shadow-paper-1)",
              }}
            >
              <PrivacyRow
                host="The model"
                purpose="Downloaded once, then runs on your device"
                tone="moss"
              />
              <PrivacyRow
                host="Your archive"
                purpose="Stays on your device. Never leaves on its own — only the encrypted file you choose to hand on"
                tone="moss"
              />
              <PrivacyRow
                host="A cloud model"
                purpose="Only if you bring your own key. Then your question and the passages it matches go to that provider — the settings screen says so plainly"
                tone="muted"
              />
              <PrivacyRow
                host="Notifications"
                purpose="Opt-in. A title arrives; the content does not"
                tone="muted"
              />
              <PrivacyRow
                host="Anyone else"
                purpose="No analytics. No tracking. No telemetry, ever"
                tone="ink"
              />
            </ul>
          </div>
        </div>
      </section>

      {/* ───── Try as a nominee ───── */}
      <section className="mx-auto max-w-[1180px] px-5 py-20 md:py-28">
        <div
          className="card card-raised relative overflow-hidden"
          style={{ padding: "44px 40px", borderRadius: 22 }}
        >
          <div className="grid md:grid-cols-[1.25fr_1fr] gap-12 items-center">
            <div>
              <p className="p-meta">Try it as a nominee</p>
              <h2 className="h-display mt-2 max-w-[20ch]">
                A real archive, pre-loaded for you.
              </h2>
              <p className="p-lead mt-6">
                Carl Sagan's writing, public photographs, and a single sealed
                letter — <em className="italic">for when you feel
                insignificant</em>. Open it the way someone who loved him
                would. Ask the archive what he said. Read what comes back.
              </p>
              <div className="mt-7 flex gap-4 flex-wrap">
                <TryButton size="large" variant="wax">
                  Open the archive
                </TryButton>
                <a
                  href={links.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ padding: "14px 22px", fontSize: 14 }}
                >
                  Read the source
                  <IconExternal size={14} />
                </a>
              </div>
              <p
                className="p-meta mt-5"
                style={{ color: "var(--color-ink-fade)" }}
              >
                No account, no email. You'll see only what was released to
                you, the same way a real recipient would.
              </p>
            </div>

            <div className="hidden md:block">
              <DeviceMac width={460} height={320}>
                <MockupNominee />
              </DeviceMac>
            </div>
          </div>
        </div>
      </section>

      {/* ───── Where it runs ───── */}
      <section className="mx-auto max-w-[1180px] px-5 py-20 md:py-24">
        <div className="text-center mb-12 max-w-[640px] mx-auto">
          <p className="p-meta">Where it runs</p>
          <h2 className="h-display mt-2">
            Local everywhere. Nothing to sign up for.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PlatformCard
            name="macOS"
            status="Available"
            statusTone="moss"
            body="A signed .app bundle that ships the model, the database, and the voice clone alongside it."
          />
          <PlatformCard
            name="Progressive web app"
            status="Available"
            statusTone="moss"
            body="Open in any modern browser, add to home screen. Works fully offline once the page is cached."
          />
          <PlatformCard
            name="iOS native"
            status="Coming soon"
            statusTone="muted"
            body="On the roadmap. The model will ship in the app itself, so the offline story stays intact."
          />
          <PlatformCard
            name="Android native"
            status="Coming soon"
            statusTone="muted"
            body="Same story as iOS — bundled model, no server in the loop, your archive on your phone."
          />
        </div>
      </section>

      {/* ───── Under the hood (for the curious) ───── */}
      <section
        style={{ background: "var(--color-paper-2)" }}
        className="py-20 md:py-24"
      >
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="grid lg:grid-cols-[1fr_1.15fr] gap-12 items-start">
            <div>
              <p className="p-meta">Under the hood</p>
              <h2 className="h-display mt-2 max-w-[18ch]">
                The parts, for the curious.
              </h2>
              <p className="p-lead mt-6">
                You don't need to know any of this to use Heirloom. The list
                is here for the people who like to know what's underneath.
              </p>
              <p className="p-body mt-5" style={{ fontSize: 14.5 }}>
                Everything below runs on the same device the archive lives
                on. The only model weights downloaded from the internet are
                from <code className="font-mono" style={{ fontSize: 13 }}>ollama.com</code>,
                pulled once on first launch.
              </p>
            </div>

            <ul className="grid sm:grid-cols-2 gap-3">
              <StackChip name="Gemma 4" role="Synthesis · vision · captions" />
              <StackChip name="Ollama" role="Local model runtime" />
              <StackChip name="EmbeddingGemma" role="Retrieval embeddings" />
              <StackChip name="Whisper.cpp" role="Speech to text" />
              <StackChip name="LuxTTS · ZipVoice" role="Opt-in voice cloning" />
              <StackChip name="face-api.js" role="Face match, browser only" />
              <StackChip name="Postgres + pgvector" role="Vector search at home" />
              <StackChip name="SQLite + sqlite-vec" role="Same shape, in the .app" />
            </ul>
          </div>

          {/* .hloom export */}
          <div
            className="mt-14 card"
            style={{
              padding: 28,
              borderColor: "rgba(125, 42, 26, 0.18)",
              background:
                "linear-gradient(180deg, rgba(125,42,26,0.04), rgba(255,253,247,0) 100%), var(--color-bg-raised)",
            }}
          >
            <div className="grid lg:grid-cols-[auto_1fr_auto] gap-6 items-center">
              <span
                aria-hidden
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "var(--color-wax)",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 22,
                  color: "rgba(250,247,240,0.95)",
                  flexShrink: 0,
                }}
              >
                H
              </span>
              <div>
                <p className="p-meta" style={{ color: "var(--color-wax)" }}>
                  The .hloom export format
                </p>
                <p
                  className="h-section mt-1"
                  style={{ fontSize: 18, lineHeight: 1.35 }}
                >
                  One encrypted file holds your whole archive — and only your
                  passphrase opens it.
                </p>
                <p className="p-body mt-3" style={{ fontSize: 14, maxWidth: "60ch" }}>
                  Captures, transcripts, embeddings, photos, voice profile,
                  sealed letters, the release schedule. Compressed, then
                  sealed with{" "}
                  <code className="font-mono" style={{ fontSize: 12 }}>
                    argon2id
                  </code>{" "}
                  +{" "}
                  <code className="font-mono" style={{ fontSize: 12 }}>
                    ChaCha20-Poly1305
                  </code>
                  . Lose the passphrase, lose the archive. The format is open
                  and lives in the source.
                </p>
              </div>
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
            </div>
          </div>
        </div>
      </section>

      {/* ───── Open source ───── */}
      <section className="mx-auto max-w-[1180px] px-5 py-20 md:py-24 pb-24">
        <a
          href={links.github}
          target="_blank"
          rel="noopener noreferrer"
          className="card group hover:shadow-paper-2 transition-shadow"
          style={{
            display: "block",
            padding: 32,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="p-meta">gautamp8/heirloom</span>
            <IconExternal size={14} />
          </div>
          <h3 className="h-section mt-3" style={{ maxWidth: "30ch" }}>
            Open source, on GitHub.
          </h3>
          <p className="p-body mt-3" style={{ fontSize: 14.5, maxWidth: "62ch" }}>
            The whole product, including the format your archive exports to.
            If we are not here tomorrow, what you have is still yours.
          </p>
        </a>
      </section>
    </>
  );
}

// ───── small page-local components ─────

function PitchCard({
  label,
  body,
  tone,
}: {
  label: string;
  body: string;
  tone?: "wax";
}) {
  return (
    <div
      className="card"
      style={
        tone === "wax"
          ? {
              borderColor: "rgba(125, 42, 26, 0.20)",
              background:
                "linear-gradient(180deg, rgba(125,42,26,0.04), rgba(255,253,247,0) 100%), var(--color-bg-raised)",
            }
          : undefined
      }
    >
      <p
        className="p-meta"
        style={tone === "wax" ? { color: "var(--color-wax)" } : undefined}
      >
        {label}
      </p>
      <p className="h-section mt-3" style={{ fontSize: 18, lineHeight: 1.4 }}>
        {body}
      </p>
    </div>
  );
}

function Pillar({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="p-meta">{eyebrow}</p>
        <h3 className="h-section mt-2" style={{ fontSize: 22 }}>
          {title}
        </h3>
        <p className="p-body mt-3" style={{ fontSize: 14.5 }}>
          {body}
        </p>
      </div>
      <div className="flex justify-center pt-2">{children}</div>
    </div>
  );
}

function Capability({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <h3 className="h-section" style={{ fontSize: 17, lineHeight: 1.35 }}>
        {title}
      </h3>
      <p className="p-body mt-3" style={{ fontSize: 14, lineHeight: 1.55 }}>
        {body}
      </p>
    </div>
  );
}

function PlatformCard({
  name,
  status,
  statusTone,
  body,
}: {
  name: string;
  status: string;
  statusTone: "moss" | "muted";
  body: string;
}) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <div
        className="flex items-center justify-between"
        style={{ minHeight: 24 }}
      >
        <h3
          className="font-serif"
          style={{ fontSize: 18, color: "var(--color-ink)", fontWeight: 400 }}
        >
          {name}
        </h3>
        <span
          className={statusTone === "moss" ? "pill pill-moss" : "pill"}
          style={
            statusTone === "muted"
              ? { color: "var(--color-ink-fade)" }
              : undefined
          }
        >
          {status}
        </span>
      </div>
      <p
        className="p-body mt-3"
        style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--color-ink-soft)" }}
      >
        {body}
      </p>
    </div>
  );
}

function StackChip({ name, role }: { name: string; role: string }) {
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 14,
        padding: "14px 16px",
        background: "var(--color-bg-raised)",
        border: "1px solid var(--color-rule-soft)",
        borderRadius: 12,
        alignItems: "center",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "var(--color-moss)",
        }}
      />
      <div>
        <p
          className="font-mono"
          style={{
            fontSize: 12.5,
            letterSpacing: 0.02,
            color: "var(--color-ink)",
            fontWeight: 500,
          }}
        >
          {name}
        </p>
        <p
          className="p-body"
          style={{
            fontSize: 12.5,
            color: "var(--color-ink-soft)",
            marginTop: 2,
          }}
        >
          {role}
        </p>
      </div>
    </li>
  );
}

function ContractStep({
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
        gap: 16,
        alignItems: "start",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          background: "var(--color-paper-3)",
          border: "1px solid var(--color-rule)",
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--color-ink)",
          fontWeight: 500,
        }}
      >
        {n}
      </div>
      <div>
        <h3 className="h-section" style={{ fontSize: 16 }}>
          {title}
        </h3>
        <p className="p-body mt-1.5" style={{ fontSize: 14 }}>
          {body}
        </p>
      </div>
    </li>
  );
}

function PrivacyRow({
  host,
  purpose,
  tone,
}: {
  host: string;
  purpose: string;
  tone: "moss" | "muted" | "ink";
}) {
  const dot =
    tone === "moss"
      ? "var(--color-moss)"
      : tone === "ink"
      ? "var(--color-ink)"
      : "var(--color-ink-muted)";
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 14,
        padding: "16px 18px",
        borderBottom: "1px solid var(--color-rule-soft)",
        alignItems: "center",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: dot,
        }}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            color: "var(--color-ink)",
            fontWeight: 500,
          }}
        >
          {host}
        </span>
        <span
          className="p-body"
          style={{ fontSize: 13, color: "var(--color-ink-soft)" }}
        >
          {purpose}
        </span>
      </div>
    </li>
  );
}
