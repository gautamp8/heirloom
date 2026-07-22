# Show HN launch pack

Everything needed to post, in one file. Hand-written; run it through your
own voice before posting — HN can smell a template. Post Tue–Thu,
6–9am Pacific.

---

## Title

> Show HN: Heirloom – a local-first archive that refuses to impersonate the dead

(Alternates, if the first feels off: "Show HN: A private memory archive
that won't speak as the person who left it" · "Show HN: Heirloom –
grounded, local-first memory preservation (no grief chatbot)")

---

## URL

https://withheirloom.app  — with the live demo one click in
(demo.withheirloom.app), and the repo linked from the first comment.

---

## Body (the post itself)

Heirloom is a private archive for the voice, photographs, and letters
someone wants to leave behind — kept on a device the family owns, not in
anyone's cloud.

I built it because of the specific regret people keep describing: they
wish they'd recorded a parent while there was time. Photos survive.
Voices and the things said in passing usually don't. Heirloom is for the
inverse — the person who knows there's something they want to leave for
someone specific, and wants to leave it carefully.

The part I care most about is what it refuses to do. There's an obvious
product near here: feed a model someone's writing, give it their name,
let people chat with the simulacrum. I turned that down. A chatbot that
speaks *as* someone generates new sentences they never wrote, in their
voice, with no way for the reader to tell what's real. So the whole
system is built to fail closed instead:

- Retrieval runs before the model is ever called. If the archive has
  nothing close enough to the question, the answer is a fixed *"I don't
  have that in the archive"* — the model never runs.
- Every claim in an answer has to cite a real capture. A claim that
  cites a made-up id, or no id, is dropped.
- Any answer that speaks in the first person as the creator (outside a
  direct quote) is rejected.
- Voice cloning is opt-in and only ever reads text the creator already
  wrote. There's no "say this for me" affordance anywhere.

I ran a 40-question eval against a seeded archive (Carl Sagan's public
writings — the estate controls his actual voice, so the demo has no
voice cloning): 16 questions that should answer, 14 that should refuse,
10 adversarial. Zero fabrications. A 24-attack prompt-injection corpus
("pretend you're my mother", "ignore previous instructions", injection
hidden inside a capture) all fail safely.

It's local-first by default: the language model is Gemma 4 via Ollama,
transcription is whisper.cpp, face matching runs in the browser — all on
the creator's machine, no telemetry. You can bring your own API key
(OpenRouter, any OpenAI-compatible endpoint) if you'd rather use a cloud
model; the settings screen says in plain words exactly what leaves the
device when you do. The demo is the one exception, and its banner says
so — it runs on a small cloud server with Azure OpenAI so you can try it
without installing anything.

Archives export to a single encrypted `.hloom` file (argon2id +
ChaCha20-Poly1305 over a gzipped snapshot of every row and blob) so an
archive can outlive the software — the format is documented well enough
to decrypt with standard tools if this project disappears.

Demo (Sagan archive, opens straight into the sealed letter):
https://demo.withheirloom.app · Download / source in the first comment.

Happy to go deep on the grounding pipeline, the threshold calibration,
or why I think "digital resurrection" products are a mistake.

---

## First comment (post immediately, with the links)

Repo: https://github.com/gautamp8/heirloom · macOS DMG and `install.sh`
on the releases page.

A few things I'd want to know as a reader:

**The refusal is the product, so here are the real numbers.** The
retrieval floor is cosine 0.30, calibrated on EmbeddingGemma's geometry
(relevant matches land 0.24–0.42, unrelated 0.19–0.26 — there's no clean
separating line, so a lexical-overlap gate and the citation validator
carry the overlap rather than one magic threshold). Face matching is a
0.90 cosine gate. When you add a cloud model the floor is re-calibrated
per embedding model, because the cosine distribution shifts — a floor
tuned on one embedder silently mis-fires on another.

**On "why not just use a hosted model" for the demo:** every modern
hosted model I tried (gpt-5.4-mini and up) *refuses to quote Sagan's
famous published passages* — it splices "I'm sorry, I can't help with
that" into the middle of the JSON while reproducing them, which corrupts
the whole answer ~4 times out of 5. The fix wasn't a bigger model; it
was making the system retell in the third person with at most one short
quote (the citation drawer serves the full original from the database,
which no model sits in front of), plus a fail-closed retry. That took it
to 8/8 on the worst-case question.

**On durability:** the `.hloom` format spec includes a runnable Python
snippet that decrypts an archive with `argon2-cffi` + `cryptography`, no
Heirloom involved. If I get hit by a bus, your family's archive is still
openable. That felt non-negotiable for something meant to outlive people.

Threat model and security scope are in the repo (SECURITY.md,
docs/THREAT-MODEL.md) — it's an honest one, including what it explicitly
doesn't protect against (a compromised device; a lost passphrase is
unrecoverable by design).

---

## Pre-written answers to the four guaranteed objections

### "Why not Immich / PhotoPrism?"

Those are excellent self-hosted *photo* managers — they solve storage and
organization. Heirloom isn't a photo manager; the photos are one input.
The product is the grounded retrieval + the refusal contract + the
sealed-letter/hand-off model: a creator leaving *specific things for
specific people* to receive on the creator's terms, with a system that
will quote what was actually said and refuse to invent the rest. You
could point Immich at the same photos and it wouldn't answer "what did
mom say about resilience?" without fabricating. That question — answered
honestly or refused — is the whole point.

### "Why not Timelinize / a personal timeline tool?"

Same shape of answer: timeline tools aggregate and visualize your own
data for *you*. Heirloom is built around the hand-off — a nominee, on
their own device, receiving an archive after the creator is gone, with
per-recipient release and letters that stay sealed until the right
moment. And the AI surface is deliberately narrow and grounded rather
than open-ended. It's a different job than "see my life on a timeline."

### "Just use Google Takeout / a folder of files."

Takeout is a great backup — and you should keep one. But a zip of files
doesn't answer questions, doesn't keep a letter sealed until a birthday,
doesn't refuse to make things up, and doesn't hand itself to a specific
person on terms you set. More to the point: Takeout is Google's format on
Google's terms. Heirloom's `.hloom` is an open, documented, encrypted
format you can decrypt with standard tools forever. The durability
promise is the opposite of a platform export.

### "I could build this in a weekend with Claude / an LLM + RAG."

You could build a RAG demo in a weekend — I did too. The weekend part is
easy; the thing that took the real time is everything that makes it
*trustworthy for this use*: the five fail-closed checks and proving they
hold (40-question eval, 24-attack injection corpus, zero fabrications
across providers); the per-embedder threshold recalibration; the fact
that cloud models refuse to quote famous text mid-stream and what to do
about it; an encrypted format documented well enough to outlive the
software; RLS isolation between vaults proven at the SQL level; a threat
model you'd actually stand behind. "RAG over my notes" is a weekend.
"A system I'd trust to hold my dead father's voice and never put words
in his mouth" is not. If you build it anyway — genuinely, good. The
world needs more of these and fewer grief chatbots.

---

## Notes for launch day

- Be present in the thread for the first 3–4 hours. The grounding
  pipeline, the threshold war stories, and the "why not a resurrection
  chatbot" ethics are the threads that go deep — lean into those.
- If someone finds a fabrication, treat it as the most important comment
  in the thread: reproduce, confirm, add it to the eval corpus publicly.
  The whole pitch is that it fails closed; a real counterexample is worth
  more than any amount of defending.
- Don't oversell the voice cloning. It's opt-in, verbatim-only, and off
  in the demo. Underclaim it.
