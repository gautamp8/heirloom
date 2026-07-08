# Ethics and design

The product decisions that took the longest, and why each one
landed where it did. Where this document and the code disagree,
the code is right and this document is stale.

---

## Why this exists

People keep wishing they had recorded their parents while they had
time. Photographs survive. Voices do not, usually. What was said
in passing - over a kitchen counter, walking the dog, on the
landline at New Year - is gone almost the moment it leaves the
room.

Heirloom is for the inverse case: the person who knows there is
something they want to leave behind for someone specific, and
wants to leave it carefully. A grandparent writing to a grandchild
who isn't born yet. A parent recording the answers they would want
their kid to have to questions they'll ask when they are older. A
partner setting aside the sentences they wish they said out loud.

It is a *held space*, in the language of the design system. The
job is to keep what was put in, exactly as it was put in, and to
hand it back when the moment makes sense.

---

## What we refused to build

### A chatbot pretending to be the creator

There is a tempting product near here: feed a language model a
person's writing, give it a name, let people chat with the
simulacrum. We considered it. We turned it down.

The reason is straightforward. A chatbot that speaks *as* someone
generates new sentences they never wrote, in their voice, with
no way for the reader to tell which is real and which is invented.
For a stranger that's lightweight. For a daughter asking her late
mother for advice about her wedding, it is not. The wrong sentence
in that conversation does damage that doesn't undo.

The architectural answer is the **grounding contract**, hard-coded:

1. **Retrieval before model.** No question reaches the language
   model until retrieval has produced chunks above the grounding
   floor.
2. **Citation validator.** Every claim in the model's answer is
   checked against the retrieved set. A claim citing anything else
   rejects the whole answer.
3. **First-person scrubber.** Any answer using *"I"* or *"my"*
   outside quoted material rejects the whole answer. The system
   may *describe* what the creator said. It may not *be* them.
4. **Verbatim empty state.** Failures collapse to a single
   sentence: *"I don't have that in the archive. Try asking
   another way?"* No graceful filler.

These are not heuristics. They are checks at the edge of the
synthesis pipeline that fail closed. The transparency page
(`/transparency`) shows every decision the system made and why.
You can audit the contract instead of trusting it.

### A digital resurrection

Voice cloning exists in this product because reading a typed note
aloud in someone's actual voice - when they wrote that note
themselves - is a different artifact than seeing the same words
on screen. It carries cadence. It carries presence.

The lines we held while building it:

- **Opt-in only.** Voice cloning is never default-on. The creator
  records ~15 seconds of their own voice on their own machine.
  Without that step the feature is invisible.
- **Verbatim contract.** The TTS sidecar only speaks text the
  creator already wrote: a capture body, a transcript line, the
  exact snippet behind a Reflection citation. There is no free
  *"speak this for me"* surface, in product or in API.
- **Original audio wins.** For a voice memo, *Their voice* plays
  the creator's actual recording. The clone is reserved for
  text-only sources where no original exists. If you wrote it,
  you said it in your voice. If you recorded it, that recording
  is what plays.
- **Stable timbre.** The flow-matching seed is fixed per voice,
  not per utterance. The same voice sounds the same across notes,
  citations, and lines of varying length - no detective work for
  the listener trying to tell if "that sounded a bit different
  this time" was the model drifting.

The result: the voice the nominee hears is one of two things - a
real recording, or a sentence the creator typed read aloud in
their cadence. There is no third category.

### An engagement loop

The hardest pull when building anything with notifications is
toward the *come back* pattern. Streaks. Badges. *Sam, you
haven't visited in 14 days.* All of it works. All of it would be
inappropriate here.

The archive is for people who are going through something or who
will go through something. Their relationship with the archive
should be theirs. Not the app's. The disciplines we kept:

- **No streaks.** No visit counts. No completion percentages.
- **Notifications only fire on real events.** Sealed letters
  unlocking at their scheduled moment, or a date-triggered
  release that morning. No engagement nudges. No
  *here's-a-memory-because-you-haven't-been-around* push.
- **Payloads carry only a title.** A push notification never
  carries the content of a memory. The lock screen of a phone in
  a stranger's hand should reveal nothing of what's inside.
- **Notifications are opt-in from Settings.** Default off. The
  test button verifies delivery instead of sending live content.
- **The home is the same every time you arrive.** A daily prompt
  for the creator, a daily memory for the nominee, the rest of
  the surface is the same. No promotional inserts, no *new
  feature available* banners.

### A managed cloud product

The recordings inside a Heirloom archive are some of the most
personal things software has ever been asked to hold. They are
not the kind of data that should pass through a third-party
server, however carefully encrypted, however well-meaning the
operator.

So the local-first posture is non-negotiable:

- The canonical install runs entirely on the creator's own
  machine.
- All inference is local - Gemma 4 via Ollama, Whisper for
  audio, LuxTTS for voice cloning, face-api.js in the browser
  for face recognition. No fallback to a hosted provider, ever.
- The only outbound HTTPS the running app makes is the first
  Ollama model pull and (if you self-host on a VM) Let's Encrypt
  for cert renewal. No telemetry. No analytics. No update pings.
- The self-hosted Ubuntu VM mode exists for one specific case:
  the recipient can't run Ollama themselves and the creator
  wants the archive to be accessible at a URL. The VM is one
  the creator controls, on any provider; the bootstrap is
  cloud-agnostic. Multiple creators can share one host without
  seeing each other's data, but there is still no admin panel,
  no signup flow, no account recovery. It is not a multi-tenant
  service.
- The most private multi-device path is the encrypted `.hloom`
  export, which goes from one local install to another. Data
  never touches a third party decrypted.

---

## Identity, naming, and never fabricating

The Reflect surface synthesises sentences, and the model is, in
the literal sense, capable of inventing facts. The pipeline is
arranged so it doesn't.

- **Whole-capture indexing.** Title, body, photo caption, audio
  transcript - every textual field on a capture is concatenated,
  sentence chunked, embedded. A note titled *"Wedding planning"*
  is retrievable by that title even when the body doesn't repeat
  the word.
- **Self-healing index.** Reflect calls a one-shot backfill
  before every retrieval. If a capture is `ready` but its chunks
  don't cover its current fields (because the schema added a
  column, or a vision caption was rewritten), the chunks are
  rebuilt before the search runs.
- **Identity-aware captions.** When face recognition matches a
  known person in a photo, the vision prompt is rewritten so the
  caption starts with their name. The match threshold sits at
  cosine `0.90`; look-alikes typically land at 0.5 to 0.7 and
  stay unlabeled. When a threshold tightening retroactively
  drops a face → person link, the affected photo's caption is
  re-rendered to remove the wrong name.
- **Profile note.** A hidden `is_profile=true` capture stores the
  creator's structured biography - name, anchor dates, nominees,
  sealed letters in flight - and is included in retrieval so
  daily prompts and Reflect answers always have continuity.

If the creator never said something, the system can't claim they
did. If the creator said something once, the system can quote
them on it. The space between is the empty state, served verbatim.

---

## Sealed letters: presence with patience

A creator can write a letter for a moment that hasn't arrived yet:

- *"For the morning after Sam's wedding."*
- *"For when Sam feels lost."*
- *"For the first anniversary of my passing."*

The letter's intent is embedded; the body stays sealed until a
trigger fires. Triggers come in five shapes - absolute date, life
event, mood chip, semantic match against a Reflection query, and
first visit. Each fire inserts a release row, and the row-level
security policies on `captures` make the body naturally visible
to the nominee from that moment on.

Two principles shaped the trigger model:

- **Patience is a feature.** A letter that surfaces at the right
  moment is more present than one available at any moment. The
  intent embedding plus the condition DSL is what lets the system
  hold the body back without losing the meaning of the gesture.
- **The recipient drives the moment.** The mood chip lets a
  nominee tap *"I miss you"* on a hard day and have the letter
  written for that day surface, without the system trying to
  detect the mood on its own. Self-disclosure beats sentiment
  analysis here, and is the safer pattern by a wide margin.

---

## Vault export and the right to take it back

The bundle format is open. Anything saved into an archive can be
written out as a single `.hloom` file: captures, transcripts,
embeddings, people, face links, voice profile, nominees, sealed
letters, release schedule, life events.

- **argon2id + ChaCha20-Poly1305.** The passphrase derives a key
  via argon2id (m=64 MiB, t=3, p=4) which AEAD-encrypts a gzipped
  JSON payload.
- **Backend-agnostic embeddings.** Vector columns are normalized
  to `number[]` in the bundle so a Postgres + pgvector export
  imports cleanly into a SQLite + sqlite-vec install and vice
  versa.
- **Symmetric import.** The portal's *Import an existing archive*
  door takes a `.hloom` plus its passphrase, mints a fresh
  creator on the receiving device, and hands back a new local
  key. No server ever sees the data decrypted.

If Heirloom the project disappears tomorrow, the source is
yours under Apache 2.0 and the `.hloom` spec lives at
`src/lib/vault-export.ts` for anyone to implement against.

---

## Design choices

The interface is doing two things at once: holding emotional
weight, and getting out of the way. Each design token was picked
to do both.

### Warm Paper palette

The canonical palette is parchment and ink, with a single
ceremonial wax-red accent and a warm candle-amber secondary. The
hex tokens live in `src/app/globals.css`; the rationale here.

- **Cream paper backgrounds (`#FAF7F0` to `#F2ECDD`)** instead of
  flat white. White is the default of productivity software and
  carries that emotional register. Paper carries a different one.
- **Ink instead of black.** `#1F1B14` for body text. Pure black
  is forbidden - it reads as a screen, not a page. The slight
  warmth in the ink keeps the surface coherent with the paper.
- **Wax red (`#7D2A1A`) appears at most once per screen.** It is
  reserved for ceremonial actions - *Save*, *Designate a
  nominee*, *Seal this letter* - and the seal monogram itself.
  Pulling it onto routine actions would deaden the moments where
  it matters.
- **No gradients.** Two exceptions: the seal itself (which has a
  physical wax-blob gradient) and a single Ken Burns-style light
  wash on the daily memory hero photo.
- **No neon, no purple, no AI tropes.** The product should look
  like an heirloom, not like a productivity app. Whatever passes
  for an *AI accent* in current visual culture has no place here.

### Typography

| Family | Use | Why |
|---|---|---|
| **Source Serif 4** | Display, prompts, body, italic accent words | A modern serif with a warm italic. Carries intimacy without theatrics. |
| **Geist** | UI chrome - buttons, fields, labels | Quiet sans, holds the form layer without competing with the prose layer. |
| **JetBrains Mono** | Timestamps, eyebrows, provenance | Mono is for *meta* - when a string is information *about* a memory rather than the memory itself. |

Italic Source Serif on accent words (*"Heirloom"*, *"Their
voice"*, *"Preserve presence across generations"*) is the only
typographic flourish. Everything else is plain.

### The wax-seal monogram

The brand mark is a wax-seal *H* pressed into red wax. The other
candidates we explored - a sparkle, an envelope, an open book, a
single line drawing of a tree - all read either as AI / SaaS or
as something specific (correspondence, paper, growth) that didn't
quite cover the whole product. A wax seal carries the ceremony of
sealed letters without committing to any one metaphor for the
rest of the product.

It is also the simplest concept to render across a 16×16 favicon
and a 2000×2000 app icon, which matters when the same mark needs
to live on a phone home screen, a `.dmg` window, and a video
title card.

### Motion

The principle is *restrained baseline, cinematic threshold
moments*. Two regimes:

- **Restrained baseline.** Fades, soft eases, never elastic.
  `cubic-bezier(0.16, 1, 0.3, 1)` is the canonical curve. Page
  transitions are slow but never sluggish.
- **Cinematic threshold moments.** Three sanctioned places where
  motion is allowed to be theatrical: the wax-seal envelope
  opening on a sealed-letter unlock, the *Begin a new archive*
  passphrase reveal, the Reflection citation drawer sliding up.
  Each is once-per-event. None of them runs in the background.

Tailwind animation classes and CSS transitions are *not* used -
both produce frame stutter during exported video renders. All
motion is `useCurrentFrame() + interpolate()` so any moment can
be lifted into a Remotion render and reproduce identically.

### Imagery

- **Atmospheric, not stock-people.** A window, a hand, a kitchen
  table. Never collaged faces. Never the *diverse-group-laughing*
  trope of consumer software.
- **The creator's own photographs** are the primary imagery in
  the product itself. Stock visuals are reserved for the marketing
  surfaces and the design-system document.
- **Daily memory hero** photos use a slow Ken Burns drift to give
  static images a sense of presence without animating the photo
  itself. The pan is ~3% over 4 seconds - perceptible only when
  you look for it.

### Voice register

From the design system's voice section, treated as a hard rule:

- **We speak softly, in first-person plural ("we").** The product
  is not personified; we never give it a name like *"Aura"* or
  *"Echo"*.
- **We never personify the creator.** Synthesis output, prompts,
  and copy refer to the creator in the third person. *"She
  wrote…"* not *"I always told you…"*.
- **Prompts ask, they don't direct.** *"What small sound
  accompanied your morning walk this week?"* not *"Record a
  voice memo now."*
- **Errors apologise without flourish.** A failed retrieval reads
  *"I don't have that in the archive. Try asking another way?"*
  No emoji. No suggestion that this is a flaw the user should
  feel bad about.
- **We say *released*, not *unlocked*. *Held*, not *queued*.
  *Opened*, not *viewed*.** The verbs carry the register.

---

## Engineering choices that follow from the principles

### Why Gemma 4 e4b

- **Local-runnable.** Gemma 4 e4b is the largest model that fits
  on a 48 GB unified-memory Mac without paging. The CPU-only
  fallback on a typical VM is acceptable for the small audience
  the product serves.
- **Apache 2.0 weights.** The licensing is clean for both
  redistribution and personal use, important for a product whose
  whole value proposition is local sovereignty.
- **Strong vision performance.** The vision adapter handles photo
  captioning well enough that identity-aware captions are
  trustworthy without a separate VLM.
- **Single model family across text + vision + grounding.** One
  prompt template style. One Modelfile (`heirloom/gemma4-grounded`)
  bakes the grounding contract into the system prompt at the
  Ollama layer, so even a process bypassing the route handler
  inherits the constraints.

### Why EmbeddingGemma

A 300M-parameter, 768-dim embedding model from the same family.
Calibrating thresholds against an embedding model can be
tedious; calibrating against a *Gemma-family* embedding model
when your synthesis model is also Gemma makes the joint behaviour
more predictable. Cosine similarities for this model run lower
than older open-source baselines (0.24 to 0.34 for clearly
relevant short queries, 0.14 to 0.23 for unrelated topics),
which is why the grounding floor sits at 0.30 instead of the 0.7
that's typical advice elsewhere.

### Why Postgres + pgvector instead of a vector-only DB

Heirloom needs both vector retrieval and a traditional relational
model with row-level-security policies. Postgres + pgvector gives
both in one process. The alternative - a separate vector store
plus a separate relational DB - adds an integration surface and
a synchronisation problem in exchange for a marginal speed gain
that doesn't matter at the data volumes a personal archive
generates. The desktop bundle uses SQLite + sqlite-vec for the
same reason, with the same query shape.

### Why LuxTTS / ZipVoice for voice cloning

- **Flow-matching, not autoregressive.** Generation is fast on
  Apple Silicon - single-utterance synthesis in 1 to 3 seconds
  on MPS for a typical sentence - without needing a server-class
  GPU.
- **Reference-prompted.** A short reference recording sets the
  timbre; no per-voice model training. The creator's voice is
  encoded once and cached; subsequent synthesis is a forward
  pass.
- **Apache-style licensing on the open weights** keeps the
  redistribution story consistent with Gemma.

### Why face-api.js in the browser

128-dim face descriptors are produced client-side; the raw face
crops never leave the device. The server stores only the
descriptor vector (already a one-way projection) and never the
pixel data of the face. If face matching were offloaded to a
server-side model the privacy story would be materially weaker
for no real gain.

### Why the grounding floor sits at 0.30, not 0.40 or 0.20

A pure vector floor at 0.40 missed obvious matches: a question
*"anything about wedding"* against a chunk that literally
contained the word *wedding* scored 0.29 because the chunk was
long and descriptive. Dropping the floor any further started
admitting unrelated topics (an *elephants in the savannah*
question scored 0.23 against this same vault).

The fix is a hybrid gate: grounded if `cosine ≥ 0.30` *or* any
substantive token of the question literally appears in a
retrieved chunk. Stopwords and short words are stripped so common
fillers (*any*, *the*, *anything*) don't make every chunk match.
The downstream citation validator + first-person scrubber catch
anything that slips through; the loosened floor doesn't loosen
truthfulness, only recall.

### Why the face match threshold sits at 0.90

Looser thresholds (0.5 to 0.8) produced too many false positives
within a single demographic. Cosine 0.90 is restrictive but the
cost of a wrong name in a photo caption - *"Sam is positioned
to the left…"* on a photo of someone else entirely - is high
enough to justify it. Faces that don't clear 0.90 stay
unlabeled, which is the safer default.

---

## What's still open

- **Real signup and account recovery.** Multiple creators can
  share one host today through per-creator passphrases and
  per-row RLS, but there is no email-bound signup, no MFA,
  no "I forgot my passphrase" flow. The plan is to push toward
  native iOS and Android apps where the model ships alongside
  the app and the device's own keychain holds the key, rather
  than building a hosted account system.
- **Audio understanding through Gemma directly.** Gemma 4
  has an audio adapter that Ollama hasn't published yet. When
  it lands, the Whisper transcription step can collapse into the
  same model that does synthesis and vision. Until then,
  `whisper-cpp small.en` carries the audio path.
- **Nominee-side authoring.** A nominee receives the archive but
  doesn't currently write back into it. There is a future shape
  where they can record their own response without that response
  being attributable to the creator - explicitly marked,
  separately stored. Designed, not built.
- **Multi-language synthesis prompts.** Heirloom's prompt set is
  English-first. The grounding contract and citation validator
  are language-agnostic, but the prompt templates and the calm
  copy register need a careful pass before this product would
  fit a non-English household well.

---

## A short note on intent

The product exists for situations that are, for many people, the
hardest weeks or months of their lives. The discipline we try to
hold while building is: nothing about the software should add to
the weight. The empty state is verbatim. The notifications don't
chase. The voice never invents. The data never leaves on its own —
only inside the encrypted archive you choose to hand over. The
relationship between a person and what they choose to leave behind
is theirs - Heirloom is just where it stays.

> *We always think we have more time.*
