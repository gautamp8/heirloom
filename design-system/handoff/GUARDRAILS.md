# GUARDRAILS.md

Every DO-NOT in Heirloom v1, mapped to an enforceable code mechanism and a test that fails until the mechanism is in place.

The grounding contract is not a tone-of-voice goal. It is testable infrastructure.

---

## §1  The seven non-negotiables

| # | Rule | Mechanism | Test |
|---|---|---|---|
| 1 | Reflection never speaks as the creator (first person) | System prompt + post-hoc string scan rejecting any answer containing `\bI\b`, `\bmy\b`, `\bme\b` outside quoted material | `test_no_first_person_impersonation` |
| 2 | Reflection never synthesizes ungrounded answers | Hard similarity threshold (0.55) before Gemma is called | `test_empty_state_on_low_similarity` |
| 3 | Every Reflection claim has a citation | JSON schema requires non-empty `citations`; runtime validator rejects responses where `claims[*].citations` is empty | `test_every_claim_cited` |
| 4 | Creator captures are immutable post-`ready` | Postgres trigger on `captures` | `test_capture_immutability_trigger` |
| 5 | Nominees cannot see creator-side controls or unreleased content | RLS policies on every table | `test_rls_nominee_cannot_read_unreleased` |
| 6 | Executor passphrase never stored in plaintext post-generation | Argon2id hash, plaintext only in HTTP response once | `test_passphrase_never_plaintext_at_rest` |
| 7 | No analytics on Reflection queries | Logger filter strips `question`, `transcript`, `body`, `caption` before emit | `test_no_pii_in_logs` |

These tests live in `tests/guardrails/`. They run on every CI build. **The build fails if any one of them fails.**

---

## §2  Reflection-specific guardrails

### 2.1 The grounding gate

```python
# backend/app/services/reflection.py
REFLECTION_SIMILARITY_THRESHOLD = 0.55
EMPTY_STATE_ANSWER = "I don't have that in the archive. Try asking another way?"

async def reflect(question: str, vault_id: UUID, user_id: UUID) -> ReflectionResponse:
    q_emb = await embed(question)
    chunks = await pg.fetch_top_k(q_emb, vault_id, k=8)

    if not chunks or chunks[0].similarity < REFLECTION_SIMILARITY_THRESHOLD:
        return ReflectionResponse(
            grounded=False,
            answer=EMPTY_STATE_ANSWER,
            claims=[],
        )

    # ... continue to Gemma synthesis
```

The gate is a single line. Reviewers must flag any PR that adds a branch around it.

### 2.2 The citation validator

```python
def validate_reflection_response(resp: dict, retrieved: list[Chunk]) -> bool:
    retrieved_ids = {c.capture_id for c in retrieved}
    for claim in resp.get("claims", []):
        if not claim.get("citations"):
            return False
        for c_id in claim["citations"]:
            if c_id not in retrieved_ids:
                return False
    return True
```

Gemma sometimes fabricates a UUID. The validator catches that. On failure, fall back to the empty state response - never serve unvalidated content.

### 2.3 The first-person scrubber

```python
FIRST_PERSON_RE = re.compile(r'\b(I|I\'m|I\'ve|me|my|mine)\b', re.IGNORECASE)

def has_first_person_outside_quotes(text: str) -> bool:
    # Strip text inside straight or curly quotes (cited material is allowed)
    stripped = re.sub(r'["\u201c\u201d].*?["\u201c\u201d]', '', text)
    return bool(FIRST_PERSON_RE.search(stripped))
```

If `True`, route the response to the empty state and log a `first_person_violation` event (no question text in the log).

---

## §3  RLS as the security boundary

The app code can - and does - query tables freely. The database is what enforces who sees what.

```sql
-- Pattern repeated across every table:
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY nominee_captures ON captures FOR SELECT TO heirloom_app
USING (
  current_setting('app.role') = 'nominee'
  AND id IN (
    SELECT capture_id FROM nominee_releases nr
    JOIN nominees n ON nr.nominee_id = n.id
    WHERE n.user_id = current_setting('app.user_id')::uuid
      AND nr.released_at IS NOT NULL
      AND nr.released_at <= now()
  )
);
```

The FastAPI request middleware **must** set the GUCs at the start of every transaction. The connection pool uses `SET LOCAL` so the values are scoped to the transaction. Test `test_middleware_sets_rls_guc` verifies every authenticated endpoint sets them.

---

## §4  Executor credential handling

```python
# backend/app/services/executor.py
import argon2

ph = argon2.PasswordHasher(time_cost=3, memory_cost=64_000, parallelism=4)

def setup_executor(vault_id: UUID, nominee_id: UUID) -> ExecutorCredential:
    passphrase = generate_words(n=4) + "·" + str(random_2_digit())
    # e.g. "willow · bread · river · 14"
    hashed = ph.hash(passphrase)
    pg.insert_executor_credential(vault_id, nominee_id, hashed)
    return ExecutorCredential(passphrase=passphrase, letter_body=...)
    # ^ passphrase returned to client ONCE; never persisted in plaintext
```

The HTTP response body containing the passphrase is **not** cached server-side and is **not** logged. The frontend renders it once and instructs the creator to record it physically.

Failed unlocks:
- 5 / IP / hour rate limit (Redis token bucket)
- 10 lifetime failed attempts → credential is locked, `executor_credentials.used_at` set to a sentinel, creator email notified

---

## §5  Capture immutability

Postgres trigger (see `SCHEMA.sql` §4) blocks updates to `body`, `caption`, `blob_url`, `duration_ms` once `status='ready'`. The `title` field and tag set remain editable.

Edits create a new revision (new row in `captures` with a `revision_of` column pointing to the original - v2). For v1: edits are limited to title and tags only. Document this in the UI: *"Your words are kept as you said them. Titles and tags can be tended."*

---

## §6  Logging discipline

```python
# backend/app/logging.py
PII_FIELDS = {'question', 'transcript', 'body', 'caption', 'letter_body',
              'passphrase', 'answer', 'claims', 'email', 'display_name'}

def sanitize_log_record(record: dict) -> dict:
    return {k: ('[redacted]' if k in PII_FIELDS else v) for k, v in record.items()}
```

Wired into the structlog processor chain. The CI test `test_no_pii_in_logs` runs a known capture commit and Reflection query, captures stdout, asserts none of the sensitive fields' values appear in the log stream.

---

## §7  Networking

- All endpoints behind HTTPS (Let's Encrypt cert on nginx)
- HSTS header with `max-age=31536000; includeSubDomains; preload`
- CSP: `default-src 'self'; script-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss://api.heirloom.example;`
- CORS: Vercel origin allowed; everything else denied
- No third-party scripts. No analytics. No CDN-loaded fonts (self-hosted Source Serif + Geist).

---

## §8  Content moderation

We do **not** moderate creator captures. The vault is theirs.

We **do** soft-moderate Reflection answers for the safety preamble's content categories (politics/religion/medical/legal/financial). If Gemma's answer triggers a category, we return the empty state instead of serving the answer. No "your question was flagged" message - just the same gentle empty state. The behavior is uniform and unannounced.

---

## §9  Account-deletion safety

Delete-account is **soft for 7 days**, **hard after**. During the 7-day window:
- Account is hidden from sign-in
- All releases are paused (no new auto-releases fire)
- Nominees see *"This archive is currently unavailable."*
- Signing back in via magic link restores the account

After 7 days:
- All blobs are deleted from Azure Blob Storage
- All Postgres rows are deleted via cascade
- The user's email is replaced by a one-way hash in any audit logs

This is irreversible. The UI requires the user to type the phrase **"I understand my archive will be permanently lost"** before the soft-delete is initiated.

---

## §10  What we do NOT guard against in v1

Be explicit about scope:

- **Court-ordered access.** Heirloom is private but not legally privileged. Document this in the About page.
- **Compromised creator device.** If someone has the creator's phone unlocked, they can read everything. Mitigation: passphrase requirement on every session > 24h old.
- **Subpoenaed blob storage.** Azure Blob is encrypted at rest with Microsoft-managed keys. v2 will move to customer-managed keys.
- **Social-engineering the executor.** Out of scope; the human in the loop is by design.

These are documented in `OPERATIONS.md` (post-MVP) and acknowledged in the About page so users are not surprised.
