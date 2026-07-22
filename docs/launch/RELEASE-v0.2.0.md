# Heirloom v0.2.0 — release notes + publish steps

The DMG is **built and verified**. What is left is the credential step:
sign with a Developer ID, notarize, staple, then publish. Commands are at
the bottom; the signing prerequisites live in
[`desktop/README.md`](../../desktop/README.md#signing--notarization-the-10-minute-credential-step).

## Build artifact

| | |
|---|---|
| File | `desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg` |
| Also written as | `Heirloom_0.2.0_aarch64.dmg` |
| Size | 516 MB |
| Arch | aarch64 (Apple silicon) |
| SHA-256 | `d4dc74e3095565cc51e32a11650ea2d1dabfa264d8751a7274e55955f422a948` |

Re-checksum after notarization — stapling rewrites the file:

```bash
shasum -a 256 desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg
```

## What was verified on this build

Launched from the packaged `.app`, not a dev server:

- The embedded Node server comes up on the fixed port (47384) and
  `/api/health` returns `ok`.
- It runs the **local** profile — Ollama on the user's own machine, with
  `gemma4:e4b` and `embeddinggemma` resolved. No cloud provider is
  involved in the shipped app.
- The **SQLite backend applies its migrations**: 22 tables in
  `~/Library/Application Support/app.heirloom.desktop/heirloom.sqlite`,
  written through WAL while the app ran.
- Bundle contents are complete: the Node server (61 MB), `whisper-cli`
  with its dylibs and rpaths rewritten, `ggml-small.en.bin` (465 MB),
  and the opt-in TTS installer.
- `hdiutil verify` passes (CRC32 valid).

## Release notes (paste as the GitHub release body)

> **Heirloom v0.2.0 — macOS**
>
> A private, local-first place to keep the voice, photographs, and letters
> someone wanted to leave behind. Everything runs on your own machine.
>
> **In this release**
>
> - **A provider layer with three profiles.** Local Ollama stays the
>   default and the out-of-box path. You can bring your own key for an
>   OpenAI-compatible endpoint, and the settings screen states exactly
>   what leaves the device when you do. A hosted profile exists solely
>   for the public Sagan demo.
> - **The grounding contract, enforced on every profile.** Five
>   fail-closed checks sit between a question and an answer: retrieval
>   before the model, a similarity floor with a lexical gate, citation
>   validation against what retrieval actually returned, a first-person
>   scrubber, and a single verbatim refusal sentence. Across a 40-fixture
>   evaluation and 22 prompt-injection attacks, zero fabrications.
> - **The .hloom archive format.** One encrypted file — argon2id +
>   ChaCha20-Poly1305 over your whole vault — that only your passphrase
>   opens. The format is documented in `docs/HLOOM-FORMAT.md` so a
>   stranger can decrypt it with standard tools if Heirloom is gone.
> - **Sealed letters** that wait for a date, a life event, a mood, a
>   matching reflection, or a first visit.
> - **A full accessibility pass** over every screen: WCAG AA contrast,
>   visible keyboard focus, labelled controls, proper heading order,
>   dialog semantics, 44px touch targets, and reduced-motion support.
>
> **Known limitations, plainly**
>
> - Apple silicon only. No Intel build yet.
> - Voice cloning is opt-in and needs a one-time installer
>   (`Contents/Resources/tts/install-tts.sh`, or the Settings screen).
> - First launch downloads the two Ollama models with visible progress.
>   It is resumable — quitting mid-download and reopening picks up where
>   it left off.
> - iOS and Android are on the roadmap; the model will ship inside the
>   app so the offline story still holds.

## Publish

After signing + notarizing + stapling per `desktop/README.md`:

```bash
DMG=desktop/src-tauri/target/release/bundle/dmg/Heirloom.dmg
shasum -a 256 "$DMG" > "$DMG.sha256"

gh release create v0.2.0 "$DMG" "$DMG.sha256" \
  --title "Heirloom v0.2.0 — macOS" \
  --notes-file docs/launch/RELEASE-v0.2.0.md \
  --verify-tag
```

(Trim this file to the quoted block above before using it as the body,
or pass `--notes` with that text directly.)

Then point the marketing site at the new tag — three fields in
`marketing/src/components/links.ts`: `releaseTag`, `releasePage`,
`dmgDownload` (and `dmgSha256`). The download modal's "not notarized
yet" instructions can come out once the notarized build is the one
being served.
