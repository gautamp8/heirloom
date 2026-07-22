# The `.hloom` format

A `.hloom` file is a complete, portable, encrypted snapshot of one
Heirloom vault: every row, every photo and recording, the sealed letters,
the nominee records. It exists so an archive can outlive any particular
install — and any particular company. This document specifies the format
precisely enough that a stranger with standard tools can decrypt their
own archive without Heirloom.

Format version: **2** (current). Produced by `src/lib/vault-export.ts`.

## 1. Envelope

A `.hloom` file is UTF-8 JSON:

```json
{
  "magic": "HLOOM",
  "version": 2,
  "kdf": {
    "type": "argon2id",
    "salt": "<base64, 16 bytes>",
    "memory_kib": 65536,
    "time": 3,
    "parallelism": 4,
    "hash_length": 32
  },
  "cipher": {
    "type": "chacha20-poly1305",
    "nonce": "<base64, 12 bytes>",
    "aad": "<base64 of 'heirloom/v2/<source vault uuid>'>"
  },
  "ciphertext": "<base64>",
  "tag": "<base64, 16 bytes>",
  "meta": { "...": "unauthenticated convenience copy — see §4" }
}
```

## 2. Cryptography

- **Key derivation:** argon2id over the passphrase (Unicode, trimmed of
  leading/trailing whitespace), with the envelope's salt and cost
  parameters. Defaults: 64 MiB memory, 3 iterations, 4 lanes, 32-byte
  raw output. These match the OWASP Password Storage Cheat Sheet's
  first-choice argon2id configuration (m=64 MiB level, t≥2, p=4 class)
  with the iteration count raised to 3.
- **Encryption:** ChaCha20-Poly1305 (IETF, 12-byte nonce, 16-byte tag)
  over the compressed payload, with the AAD string
  `heirloom/v2/<vault_id>` bound into the tag.
- **Salt and nonce** are freshly random (CSPRNG) for every export. A
  fresh salt means a fresh key per export, so (key, nonce) pairs are
  never reused across files.
- **What is authenticated:** the entire payload (every row, every blob,
  the inner manifest) plus the AAD. Flipping any single byte of
  `ciphertext`, `tag`, `kdf.*`, or the AAD makes decryption fail loudly.
  There is no partial import from a tampered file.
- **What is NOT authenticated:** the outer `meta` block (§4) and the
  `magic`/`version` strings. They are conveniences for listing a file's
  contents without the passphrase; import logic re-derives everything
  from the authenticated plaintext.

## 3. Plaintext payload

`ciphertext` decrypts to a **gzip** stream containing one JSON document:

```json
{
  "manifest": {
    "exported_at": "<ISO-8601>",
    "creator_user_id": "<uuid>",
    "vault_id": "<uuid>",
    "schema_version": 2,
    "counts": { "captures": 7, "blobs": 3, "...": 0 }
  },
  "rows": {
    "users": [ { "...the creator row" } ],
    "vault": { "..." },
    "captures": [ ... ],
    "transcripts": [ ... ],
    "transcript_chunks": [ { "embedding": [768 floats], "..." } ],
    "capture_tags": [ ... ],
    "nominees": [ ... ],
    "nominee_releases": [ ... ],
    "executor_credentials": [ ... ],
    "people": [ ... ],
    "face_appearances": [ ... ],
    "life_events": [ ... ],
    "sealed_letters": [ ... ],
    "voice_profiles": [ ... ]
  },
  "blobs": { "<blob_url>": "<base64 file bytes>", "...": "..." }
}
```

Notes:

- Vector embeddings are stored as plain JSON float arrays (768 for text,
  128 for faces), independent of the source database's storage form
  (pgvector or sqlite-vec) — a bundle exported from one backend imports
  into the other.
- Passphrase **hashes** (argon2id) for nominees and the executor travel
  in the bundle; plaintext passphrases never do.
- Reflections (Q&A history) and push subscriptions are deliberately
  excluded: the former is device-local history, the latter is
  device-specific.

## 4. The outer `meta` block

A copy of the inner manifest placed outside the ciphertext so tooling
can show "what's in this file" before asking for a passphrase. It is
**not covered by the authentication tag** — treat it as a label, not as
truth. Import ignores it entirely.

## 5. Decrypting without Heirloom

With Python 3 (`pip install argon2-cffi cryptography`):

```python
import base64, gzip, json, sys
from argon2.low_level import hash_secret_raw, Type
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305

env = json.load(open(sys.argv[1]))
passphrase = input("passphrase: ").strip().encode()

key = hash_secret_raw(
    secret=passphrase,
    salt=base64.b64decode(env["kdf"]["salt"]),
    time_cost=env["kdf"]["time"],
    memory_cost=env["kdf"]["memory_kib"],
    parallelism=env["kdf"]["parallelism"],
    hash_len=env["kdf"]["hash_length"],
    type=Type.ID,
)

data = ChaCha20Poly1305(key).decrypt(
    base64.b64decode(env["cipher"]["nonce"]),
    base64.b64decode(env["ciphertext"]) + base64.b64decode(env["tag"]),
    base64.b64decode(env["cipher"]["aad"]),
)

vault = json.loads(gzip.decompress(data))
print(json.dumps(vault["manifest"], indent=2))

# Write the media files back out:
import os
os.makedirs("blobs", exist_ok=True)
for name, b64 in vault["blobs"].items():
    with open(os.path.join("blobs", os.path.basename(name)), "wb") as f:
        f.write(base64.b64decode(b64))
```

A wrong passphrase or a tampered file raises `InvalidTag` — the same
all-or-nothing behavior Heirloom's importer has.

## 6. Versioning

- `version` (envelope) and `manifest.schema_version` move together.
- Readers MUST refuse versions they don't understand rather than
  best-effort parse.
- Any change to the row shapes, crypto primitives, or parameters bumps
  the version. Version 1 (pre-release, no AAD binding) is no longer
  produced or accepted.

## 7. Reporting problems

Security issues with the format or the implementation: see
[SECURITY.md](../SECURITY.md).
