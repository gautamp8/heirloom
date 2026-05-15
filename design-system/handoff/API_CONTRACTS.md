# API_CONTRACTS.md

FastAPI endpoint contracts for Heirloom v1. All endpoints return JSON unless noted. All require `Authorization: Bearer <jwt>` unless tagged `[public]`.

---

## §1  JWT shape

```ts
type HeirloomJWT = {
  sub: string;               // user_id
  role: 'creator' | 'nominee';
  vault_id: string;          // active vault context
  exp: number;
  iat: number;
};
```

The role is **per-request context**, not per-user. The same user can call `/reflect` as nominee for vault A and `/capture` as creator for vault B in two separate requests with two separate JWTs (issued at vault-switch time).

---

## §2  FastAPI request middleware

Every authenticated request:
1. Verifies the JWT.
2. Opens a Postgres transaction.
3. `SET LOCAL app.user_id = '<sub>'; SET LOCAL app.role = '<role>';`
4. Runs the handler.
5. Commits or rolls back.

This makes RLS the **single source of truth** for access control. Handlers query freely; Postgres refuses rows the principal cannot see.

---

## §3  Endpoints - Auth

### `POST /auth/magic-link` [public]
Issue a magic link. Idempotent for known emails; silently no-ops for unknown emails (do not leak account existence).
```ts
Request:  { email: string }
Response: { sent: true }            // always
```

### `POST /auth/verify` [public]
Exchange a magic-link token for a JWT.
```ts
Request:  { token: string, vault_id?: string }
Response: { jwt: string, user: { id, email, display_name }, vaults: Vault[] }
```

### `POST /auth/switch-vault`
Re-issue a JWT scoped to a different vault the user has access to.
```ts
Request:  { vault_id: string }
Response: { jwt: string }
```

---

## §4  Endpoints - Capture (creator only)

### `POST /capture`
Commit a new capture. Multipart for audio/photo/video; JSON for note.
```ts
// audio/photo/video - multipart/form-data
file: Blob
metadata: {
  kind: 'audio' | 'photo' | 'video',
  caption?: string,        // photo + video only
  duration_ms?: number,    // audio + video
  captured_at?: string,    // ISO; defaults to now
}

// note - JSON
{ kind: 'note', body: string, title?: string }

Response: { capture_id: string, status: 'processing' }
```

### `GET /capture/{id}/status` [SSE]
Server-Sent Events stream of capture processing.
```ts
event: status   data: { stage: 'uploaded' | 'transcribed' | 'embedded' | 'tagged' | 'ready' }
event: transcript  data: { text: string, partial: boolean }
event: tags     data: { tags: { emotion: string[], topic: string[] } }
event: ready    data: { capture: Capture }
event: error    data: { message: string, recoverable: boolean }
```

### `GET /capture/{id}`
Read a single capture (with transcript + tags).

### `PATCH /capture/{id}`
Restricted to: `title`, adding to `thread_id`, adding tags. **Body/blob/duration are immutable** (enforced by Postgres trigger).

### `DELETE /capture/{id}`
Soft-delete. Sets `status='deleted'` and detaches from any nominee_releases.

### `GET /captures?vault_id=...&kind=&thread_id=&limit=&before=`
Paginated list. Default 20, max 100.

---

## §5  Endpoints - Threads (creator only)

### `POST /thread` `{ title, color? }` → `{ thread_id }`
### `GET /threads` → `Thread[]`
### `POST /thread/{id}/add` `{ capture_id, position? }`
### `POST /thread/{id}/remove` `{ capture_id }`
### `PATCH /thread/{id}` `{ title?, color? }`

---

## §6  Endpoints - Nominees (creator only)

### `POST /nominee`
```ts
Request: {
  name: string,
  relationship?: string,
  email?: string,
  role: 'recipient' | 'executor',
  letter_body?: string,
}
Response: { nominee_id: string }
```

### `GET /nominees` → `Nominee[]`

### `POST /nominee/{id}/release`
Create or update a release assignment.
```ts
Request: {
  capture_id?: string,
  thread_id?: string,        // one of capture_id|thread_id required
  trigger: 'scheduled' | 'by_request' | 'executor_unlock',
  release_at?: string,       // ISO, required if trigger='scheduled'
  label?: string,
}
Response: { release_id: string }
```

### `POST /nominee/{id}/release-now`
Manually flip a release to `released_at = now()`. Creator override.
```ts
Request: { release_id: string }
Response: { released_at: string }
```

### `POST /nominee/{id}/preview` `[creator]`
Get the nominee-view payload as it would appear to the named nominee right now. Used by "Preview as Maya".
```ts
Response: { home: NomineeHome }   // same shape as /me/home for nominees
```

---

## §7  Endpoints - Executor (creator + executor)

### `POST /executor/setup` [creator]
Generate or rotate the executor passphrase. Returns the passphrase **once** - never re-readable.
```ts
Request: { nominee_id: string }
Response: { passphrase: string, letter_body: string }
```
The server stores only `argon2id(passphrase)` in `executor_credentials.passphrase_hash`.

### `POST /executor/unlock` [public, rate-limited]
Executor enters their passphrase. On success, atomically releases all assigned captures/threads to all nominees.
```ts
Request: { vault_email_hint: string, passphrase: string }
Response: { jwt: string, vault_id: string }
```
Rate-limited to 5 attempts per IP per hour. After 10 lifetime failed attempts, the credential is locked and an alert is sent to the creator's email.

---

## §8  Endpoints - Reflection (nominee + creator self-test)

### `POST /reflect` [SSE]
```ts
Request: {
  question: string,
  mode?: 'server' | 'device',   // default 'server'; 'device' returns 501 in v1
}

// Stream:
event: retrieved   data: { hit_count: number, top_similarity: number }
event: grounded    data: { grounded: boolean }       // false → empty state
event: claim       data: { text: string, citations: [{ capture_id, snippet }] }
event: done        data: { reflection_id: string }
event: error       data: { message: string }
```

### `GET /reflect/{id}`
Read a past reflection.

### `GET /reflections?limit=` → `Reflection[]` (nominee's own, or creator's vault)

---

## §9  Endpoints - Home / View

### `GET /me/home` (role-aware)
Single endpoint that returns the home payload for whichever role the JWT carries.
```ts
// creator
Response: {
  greeting: { time_of_day, display_name },
  prompt_of_day: { id, text },
  threads_in_progress: Thread[],
  recent_captures: Capture[],     // last 6 across all kinds
  nominees: NomineeCard[],        // includes executor card
  stats: { captures: number, duration_total_ms: number, nominees: number },
}

// nominee
Response: {
  framing: { from_name: string, body: string },     // "from Elena" strip
  latest_unlocked: Capture | null,
  threads: ThreadCard[],
  sealed: SealedPiece[],
  saved: SavedPassage[],
}
```

### `GET /me/explore` (role-aware)
Browse by tag / time / thread.

---

## §10  Endpoints - Saved passages (nominee)

### `POST /saved` `{ capture_id, excerpt, note? }`
### `GET /saved` → `SavedPassage[]`
### `DELETE /saved/{id}`

---

## §11  Error envelope

All non-2xx responses use:
```ts
{
  error: {
    code: string,             // 'unauthorized' | 'rate_limited' | 'rls_denied' | ...
    message: string,          // user-safe; renderer displays directly
    detail?: object,          // debug-only; stripped in production
  }
}
```

---

## §12  TypeScript types (shared)

Generated from FastAPI/Pydantic models via `openapi-typescript`. Lives in `frontend/src/lib/api/types.ts`. Single source: the Pydantic models in `backend/app/schemas/`.

---

## §13  Rate limits

| Endpoint | Limit |
|---|---|
| `POST /auth/magic-link` | 5 / email / hour |
| `POST /auth/verify` | 10 / IP / hour |
| `POST /executor/unlock` | 5 / IP / hour, 10 lifetime per credential |
| `POST /reflect` | 60 / user / hour |
| `POST /capture` | 100 / user / day |

Enforced via Redis token bucket (Redis runs as a sidecar on the VM).
