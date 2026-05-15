# GUARDRAILS.md

Every DO-NOT in Heirloom, mapped to an enforceable code mechanism.

The grounding contract is not a tone-of-voice goal. It is testable infrastructure.

---

## §1  Non-negotiables

| # | Rule | Mechanism | Where |
|---|---|---|---|
| 1 | Reflection never speaks as the creator (first person) | System prompt + `hasFirstPersonOutsideQuotes()` runs on the final answer; mismatch routes to the empty state | `src/lib/reflection.ts`, `src/app/api/reflect/route.ts` |
| 2 | Reflection never synthesizes ungrounded answers | Hard similarity threshold (`REFLECTION_SIMILARITY_THRESHOLD = 0.40`) gated before Gemma is called | `src/lib/reflection.ts`, `src/app/api/reflect/route.ts` |
| 3 | Every Reflection claim cites at least one retrieved capture | `validateCitations()` after streaming; per-claim filter during streaming silently drops claims whose citations don't match the retrieved set | `src/lib/reflection.ts`, `src/app/api/reflect/route.ts` |
| 4 | Creator captures are immutable post-`ready` | Postgres trigger `captures_immutable_after_ready()` raises on UPDATE that changes body/caption/blob/duration after `status='ready'` | `migrations/SCHEMA.sql` §4 |
| 5 | Nominees cannot read unreleased captures or creator-only rows | RLS policies on every table; identity-index profile rows are the only nominee read path outside `nominee_releases` | `migrations/001_complete_rls_policies.sql`, `migrations/006_identity_index.sql` |
| 6 | Executor passphrase never stored in plaintext post-generation | argon2id hashed; plaintext appears only in the one-time HTTP response | `src/lib/passphrase.ts`, `src/app/api/executor/setup/route.ts` |
| 7 | No analytics on Reflection queries | Diagnostics persist only to `reflections.answer_json` in the user's own DB; surfaced only at `/transparency`. No outbound logging | `src/app/api/reflect/route.ts`, `src/app/transparency/page.tsx` |
| 8 | TTS speaks only verbatim source material | UI never mounts `SpeakButton` over Gemma-synthesized prose; the button is only attached to capture bodies, transcript snippets, sealed-letter bodies, and Reflection citation snippets | `src/app/_components/speak-button.tsx`, every call site |

---

## §2  Reflection-specific guardrails

### 2.1  The grounding gate

In `src/app/api/reflect/route.ts`:

```ts
const chunks = await fetchTopK(qEmb, session, 5);
const topSim = chunks[0]?.similarity ?? 0;

if (chunks.length === 0 || topSim < REFLECTION_SIMILARITY_THRESHOLD) {
  send("grounded", { grounded: false });
  send("answer", { text: EMPTY_STATE_ANSWER });
  // ... persist + done
  return;   // Gemma is never called
}
```

The gate is a single branch. Reviewers should flag any PR that adds a bypass.

### 2.2  The citation validator (in `src/lib/reflection.ts`)

```ts
export function validateCitations(
  resp: ReflectionAnswer,
  retrieved: RetrievedChunk[],
): { ok: true } | { ok: false; reason: string } {
  const allowed = new Set(retrieved.map((c) => c.capture_id));
  for (const claim of resp.claims) {
    if (claim.citations.length === 0) return { ok: false, reason: "claim_missing_citations" };
    for (const id of claim.citations) {
      if (!allowed.has(id)) return { ok: false, reason: `citation_not_in_retrieved:${id}` };
    }
  }
  return { ok: true };
}
```

Runs twice:
- **During** streaming: each emitted `claim` event filters `c.citations` against `chunks` before dispatching. Claims with no valid citation never reach the client.
- **After** streaming: the final assembled `ReflectionAnswer` is validated as a whole. Any failure collapses the response to the empty state.

### 2.3  The first-person scrubber

```ts
const FIRST_PERSON_RE = /\b(I|I'm|I've|I'll|I'd|me|my|mine)\b/i;

export function hasFirstPersonOutsideQuotes(text: string): boolean {
  const stripped = text.replace(/["“”][^"“”]*["“”]/g, "");
  return FIRST_PERSON_RE.test(stripped);
}
```

Quoted material (between straight or curly double-quotes) is exempt - the creator's own words may be first person. Anywhere else, "I" or "my" outside quotes routes the answer to the empty state.

The same function is the single source of truth for "is this text first-person impersonation," reused for the TTS verbatim contract.

---

## §3  RLS as the security boundary

The app code queries tables freely. The database enforces who sees what.

```sql
-- Pattern repeated across every table (see migrations/001_complete_rls_policies.sql):
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_captures ON captures
    FOR ALL TO heirloom_app
    USING (
        current_setting('app.role') = 'creator'
        AND vault_id IN (
            SELECT id FROM vaults
            WHERE creator_id = current_setting('app.user_id')::uuid
        )
    );

CREATE POLICY nominee_captures ON captures
    FOR SELECT TO heirloom_app
    USING (
        current_setting('app.role') = 'nominee'
        AND (
            id IN (SELECT capture_id FROM nominee_releases nr
                     JOIN nominees n ON nr.nominee_id = n.id
                    WHERE n.user_id = current_setting('app.user_id')::uuid
                      AND nr.released_at IS NOT NULL
                      AND nr.released_at <= now())
            OR (
                is_profile = true
                AND vault_id IN (SELECT vault_id FROM nominees
                                 WHERE user_id = current_setting('app.user_id')::uuid)
            )
        )
    );
```

The second branch of the nominee policy is the identity-index escape hatch (migration `006`): profile captures (`is_profile = true`) are readable by any nominee of the vault, without a `nominee_releases` row. This is how Reflection can answer "who is X?" without the creator having to write those facts as a real note.

`withRls(user_id, role, fn)` is the wrapper:

```ts
export async function withRls<T>(
  user_id: string,
  role: 'creator' | 'nominee',
  fn: (tx: TxHandle) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.user_id', ${user_id}, true)`;
    await tx`SELECT set_config('app.role',    ${role},    true)`;
    return fn(tx);
  });
}
```

Every authenticated route handler runs inside it. The SQLite desktop backend (`src/lib/db/sqlite.ts`) is single-user so it drops RLS - the function signature is identical so handler code is unchanged.

---

## §4  Executor credential handling

```ts
// src/app/api/executor/setup/route.ts (effective shape)
const passphrase = generatePassphrase();      // 4 words + 2 digits
const passphrase_hash = await argon2.hash(passphrase, { type: argon2.argon2id });
await tx`
  INSERT INTO executor_credentials (vault_id, nominee_id, passphrase_hash)
  VALUES (...)
  ON CONFLICT (vault_id) DO UPDATE SET passphrase_hash = EXCLUDED.passphrase_hash
`;
return Response.json({ passphrase, letter_body });   // ONLY place plaintext appears
```

The HTTP response body containing the passphrase is **not** cached server-side and **not** logged. The UI renders it once and instructs the creator to record it physically.

Failed unlocks (in-memory token bucket on `/api/executor/unlock`):
- 5 / IP / hour
- 10 lifetime failed attempts → `executor_credentials.used_at` set to a sentinel and the credential is locked.

---

## §5  Capture immutability

Postgres trigger (`SCHEMA.sql` §4) blocks UPDATEs to `body`, `caption`, `blob_url`, `duration_ms` once `status='ready'`. `title` and tag set remain editable.

For v1 there are no revisions - edits to capture content are simply forbidden after the pipeline finishes. The UI never offers a "re-record" affordance over an existing capture; it always creates a new row.

---

## §6  Logging discipline

There is no structured logger in the codebase yet; the app logs to `console.warn` and `console.error` directly. The patterns that are followed:

- **No PII in `console.error`.** Errors log `capture_id`, `vault_id`, the error message, never the question text / transcript / body / caption.
- **No `console.log` of user content** anywhere in `src/lib/` or `src/app/api/`.
- **Reflection diagnostics persist to the DB**, not to logs. The full retrieved-chunks snapshot lives in `reflections.answer_json.diagnostics` and is surfaced only at `/transparency` to the same user.

When a structured logger lands, the redactor pattern is:

```ts
const PII_FIELDS = new Set([
  'question', 'answer', 'transcript', 'body', 'caption',
  'letter_body', 'passphrase', 'email', 'display_name',
  'claims', 'citations', 'snippet',
]);
```

---

## §7  Networking

- **HTTPS everywhere** in production. The self-hosted runbook uses Caddy with automatic Let's Encrypt; the laptop install runs over loopback only.
- **No third-party scripts**, no analytics, no CDN-loaded fonts (Source Serif 4, Geist, and JetBrains Mono are self-hosted via `next/font`).
- **No outbound telemetry.** The only HTTPS the app makes is to Caddy → Let's Encrypt and to ollama.com on the first model pull.
- **CSP / HSTS:** v1 relies on Next.js defaults + the reverse proxy. Hardening is on the post-launch list.

---

## §8  Content moderation

We do **not** moderate creator captures. The vault is theirs.

We **do** silently soft-moderate Reflection answers for the safety-preamble categories (politics/religion/medical/legal/financial). If Gemma's answer triggers a category the prompt explicitly forbids, the citation validator + first-person scrubber typically fail anyway (it's hard to give medical advice in the third person citing the creator). When they don't, the answer ships - we're not trying to be a content filter, we're trying to prevent fabricated impersonation.

The empty state is uniform and unannounced. There is no "your question was flagged" message.

---

## §9  Account deletion safety

Account deletion is **not yet built**. The self-hosted instance is single-creator; uninstalling Heirloom is account deletion. The vault export (`.hloom`) and import flow give the creator a way to take their archive elsewhere before tearing down the install.

When in-app deletion lands, the design is **7-day soft delete** with a confirmation phrase. During the 7 days the account hides from sign-in, releases pause, nominees see "this archive is currently unavailable." After 7 days: blobs deleted, rows cascade-deleted.

---

## §10  What we do NOT guard against

Be explicit about scope:

- **Court-ordered access.** Heirloom is private but not legally privileged. Self-hosted servers can be subpoenaed.
- **Compromised creator device.** If someone has the creator's unlocked laptop, they can read everything.
- **Subpoenaed blob storage** on a self-hosted VM. Disk-at-rest is provider-managed-key encrypted; users uncomfortable with that should use the `.hloom` bundle path instead.
- **Social-engineering the executor.** Out of scope; the human in the loop is by design.
- **Memory-resident keys during runtime.** Argon2-derived keys for `.hloom` decryption are transient (per-request) but exist in process memory while in use.

---

## §11  Voice cloning - verbatim contract

The TTS sidecar (LuxTTS/ZipVoice at `127.0.0.1:11435`) is capable of speaking arbitrary text in the cloned voice. This is the most ethically loaded surface in the product - if it ever spoke Gemma-synthesized prose in the creator's voice, the product would become the thing it explicitly says it isn't ("a digital resurrection system").

**The contract is: the cloned voice speaks only text the creator actually wrote or recorded.**

This is enforced at the **call sites**, not at the server:

- `POST /api/voice/speak` accepts arbitrary `text` ≤ 1200 chars and synthesizes it. It does not parse the text or compare it against the archive (would be brittle - punctuation, whitespace, transcription drift).
- The UI never exposes a free-text "speak this" affordance. `<SpeakButton>` (in `src/app/_components/speak-button.tsx`) is only mounted at four kinds of call site:
  1. **Capture rows** (`Home`, `NomineeHome`) - passes `cap.transcript_snippet` (the verbatim Whisper transcript or note body).
  2. **Daily memory hero** (nominee home) - passes `capture.transcript_snippet`.
  3. **Unlocked sealed-letter cards** (nominee home) - passes `smartSnippet(capture.body, 600)` (a truncated but verbatim view of the letter body).
  4. **Reflection citation drawer** (`reflect/room.tsx`) - passes `drawer.snippet` (the retrieved chunk text, 220 chars).
- The Reflection room's main answer area **does not** carry a SpeakButton. The answer is Gemma prose; only the source citations are eligible for voice playback.
- The `SpeakButton` self-hides when `/api/voice/profile` reports no profile or TTS unreachable, so the affordance never appears at all when voice features aren't installed.

`hasFirstPersonOutsideQuotes` from `src/lib/reflection.ts` is the assertion that catches anything slipping past - the Reflection answer text is scanned for first-person prose before the final `answer` event ships. Any answer containing first-person impersonation never reaches the room, so even if a future call site accidentally mounted a SpeakButton over an answer, it would never see one to play.

**Design rule for any new voice surface:** the `text` passed to `<SpeakButton>` must trace back to a `captures.body` / `transcripts.text` / `sealed_letters.body` / `transcript_chunks.text` value. If it can't, route it through a different affordance (or don't speak it).
