# Threat model

What Heirloom protects against, what it doesn't, and where the honest
edges are. Written for a skeptical reader; if a claim here doesn't match
the code, that's a bug — report it (see [SECURITY.md](../SECURITY.md)).

## What Heirloom is, threat-wise

A local-first archive. In its default shape there is no server of ours,
no account, no telemetry; the entire attack surface is the user's own
machine plus whatever they explicitly export. The two supported
multi-device shapes — an encrypted `.hloom` handoff, or a self-hosted
instance on hardware the user controls — each add surface, listed below.

## Protected

**Data at rest in transit between people.** A `.hloom` bundle is
argon2id + ChaCha20-Poly1305 with the whole payload authenticated
([format spec](./HLOOM-FORMAT.md)). Possession of the file without the
passphrase yields nothing; tampering with any byte makes import fail
loudly. This is the property the "outlives the company" promise rests
on.

**Vault isolation on a shared instance.** On postgres, every user-facing
query path runs under row-level security keyed on the session's user id;
a nominee sees only rows explicitly released to them, a creator only
their own vault. Privileged code paths (export, letter firing, pipeline
self-heal) use an admin pool with hand-scoped WHERE clauses — those
clauses are part of the audited surface, and RLS is the net underneath
the user-facing paths, not a substitute for them.

**Role boundaries.** Nominees cannot read unreleased captures or pending
sealed letters; unlock conditions are evaluated server-side. The
executor credential releases an archive but grants no login.

**The dead-person contract.** The reflection pipeline is designed to
fail closed: below-floor retrieval, uncited claims, first-person
impersonation, or corrupted synthesis all collapse to a fixed refusal
string. Prompt injection through archive content or questions is part of
the tested corpus (`tests/prompt-injection/`). This protects something
security models usually don't name: the integrity of a dead person's
voice.

**What leaves the device, when.** Local profile: nothing. BYOK: exactly
the categories stated in the settings UI (questions + retrieved
passages at reflection; photos at caption; note text at tagging), to the
endpoint the user configured, with the key stored only in the local
database. Hosted demo: everything typed into it — it says so on the
banner.

## Explicitly NOT protected

**A compromised device.** Heirloom's data directory is plaintext on the
user's machine (SQLite file + media blobs), readable by any process
running as the user. Full-disk encryption is the OS's job; a keylogger
or malicious root process defeats everything. We consider this the
correct trade for a local-first tool — at-rest encryption with a
passphrase prompt on every open would push grieving families toward
losing their archives.

**A hostile self-host operator.** Whoever roots the box running a
self-hosted instance can read its database. Multi-creator isolation on
one host is against *each other*, not against the machine's admin.

**Passphrase loss.** There is no recovery, no reset, no backdoor. Lose
the vault passphrase and the `.hloom` file is noise. This is a feature
with sharp edges, and the UI says so at export time.

**Weak passphrases on exported bundles.** argon2id at 64 MiB/3
iterations makes guessing expensive, not impossible. A bundle protected
by `password1` will fall. Generated passphrases (~3 words + digits) are
deliberately memorable rather than maximal; they lean on the KDF cost
for their margin. For archives with adversarial exposure, use a long
passphrase.

**Traffic analysis on the demo.** The public demo is a demo. It runs on
cloud inference (the banner says which), keeps submissions until the
nightly reset, and its rate limits are abuse control, not security.

## Known soft spots we track openly

- `JWT_SECRET` has a development fallback; production deploys must set
  it (the self-host bootstrap generates one). An unset secret on an
  internet-facing instance would allow session forgery.
- The `.hloom` import path derives KDF cost from the file. Caps exist so
  a malicious bundle can't demand gigabytes of KDF memory.
- SQLite (desktop) has no RLS; the desktop build is single-user by
  design and the OS user is the boundary.
- Login verifies a submitted passphrase against candidate hashes
  sequentially; with very many nominees on one self-hosted instance
  this is a mild timing/DoS surface. Acceptable at family scale;
  revisit before anything multi-tenant (which we don't run).
