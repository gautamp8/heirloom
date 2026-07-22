# Security policy

Heirloom holds some of the most sensitive data a person has: their
voice, their photographs, their letters to the people they love. If you
find a way to break that protection, we want to know, and we'll take it
seriously.

## Reporting

Email **gautamprajapati06@gmail.com** with `[heirloom security]` in the
subject, or use GitHub's private vulnerability reporting on this
repository. Please include reproduction steps. You'll get a human reply —
usually within a few days; there is no bug-bounty program, but fixes are
credited in the release notes if you'd like.

Please don't open public issues for security problems before a fix
ships.

## Scope

In scope:

- The `.hloom` export/import format and its cryptography
  ([docs/HLOOM-FORMAT.md](docs/HLOOM-FORMAT.md))
- The web app and its API routes (auth, RLS isolation between vaults and
  between creator/nominee roles, sealed-letter gating)
- The desktop bundle's sidecar and update behavior
- The reflection grounding contract (prompt-injection paths that make it
  fabricate, impersonate, or leak across vaults)
- The self-host deployment scripts under `infra/`

Out of scope (see [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) for why):

- Attacks requiring a compromised device or OS-level access to the
  machine Heirloom runs on
- Denial of service against your own local instance
- The public demo's rate limits (they exist to keep the demo up, not as
  a security boundary — though escaping its vault isolation IS in scope)

## Supported versions

The latest release only. Heirloom is pre-1.0; there are no security
backports.
