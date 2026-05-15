# PWA.md

Progressive Web App configuration for Heirloom.

The PWA is the canonical web target for the laptop install and the self-hosted VM. The desktop bundle (`.dmg`) wraps the same code in a Tauri shell - the PWA story still applies inside the shell because Tauri loads the embedded Next.js server in a WKWebView; the service worker registers and runs there too.

---

## §1  Manifest

`public/manifest.webmanifest` (shipped exactly as-is):

```json
{
  "name": "Heirloom",
  "short_name": "Heirloom",
  "description": "A private place for the memories you mean to leave behind.",
  "id": "/",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#faf7f0",
  "theme_color": "#faf7f0",
  "categories": ["lifestyle", "personalization", "productivity"],
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Plus `public/apple-touch-icon.png` (180×180) for iOS home-screen installs.

`src/app/layout.tsx` wires the rest of the head:
- `manifest` link
- `theme-color = #faf7f0`
- `apple-mobile-web-app-capable = yes`
- `apple-mobile-web-app-status-bar-style = default`
- `apple-mobile-web-app-title = Heirloom`
- `format-detection = telephone=no`
- `mobile-web-app-capable = yes`

---

## §2  Service worker

`public/sw.js` is a small, hand-rolled service worker (no Workbox, no `next-pwa`). Registered from `src/app/_components/sw-register.tsx`, mounted in `layout.tsx`.

Three runtime strategies:

| Resource | Strategy |
|---|---|
| App shell (`/`, manifest, icons, `/seal.png`) | Pre-cached on install (`SHELL_CACHE`) |
| Fingerprinted Next assets (`/_next/static/`, fonts, `*.png|svg|woff2|ico|webp|jpg`) | Cache-first |
| Pages + JSON | Network-first, stale fallback to runtime cache |
| POST/PUT/PATCH/DELETE | Network only (never cached) |
| SSE streams (`Accept: text/event-stream`) | Network only (bypassed entirely) |

There is **no Background Sync queue** for writes in v1. If the network drops mid-capture, the user keeps the tab open and the request retries via the page's own logic; otherwise the write is lost. Note drafts are committed to IndexedDB via `src/lib/drafts.ts` and surface as a count on the home ("N drafts are safe in your browser"). Audio/photo drafts are NOT queued.

The cache version is bumped by changing the `VERSION` constant in `sw.js`; the activate handler purges any cache key not prefixed with the current version and claims all clients.

---

## §3  Install prompt UX

Heirloom does **not** auto-prompt to install. There is no in-app "Add to Home Screen" nudge in the current build. iOS users install via Safari Share → "Add to Home Screen"; Android Chrome surfaces its own native install affordance when the manifest criteria are met.

This is intentional: the home screen install matters most for the Web Push experience (iOS requires PWA install before allowing push subscriptions), and Settings → Notifications surfaces the install hint when the user tries to enable push from a non-installed Safari context.

---

## §4  Web Push (sealed-letter unlocks + daily memory)

Heirloom can send Web Push notifications for two channels:
- **Sealed-letter unlocks** (`channel: 'letter'`)
- **Daily memory** (`channel: 'daily'`)

### Server-side

- **Library:** `web-push` (configured per-request via `webpush.setVapidDetails(subj, pub, priv)` on first send).
- **Env vars:**
  - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (e.g. `mailto:you@example.com`)
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the same public key, exposed to the client for `pushManager.subscribe`)
  - `CRON_SECRET` (header `X-Cron-Secret` for `/api/cron/daily-memory`)
- **Storage:** `push_subscriptions` table (migration `004_push_subscriptions.sql`). One row per `(user_id, endpoint)`. Columns include `p256dh`, `auth`, `user_agent`, `enabled_daily`, `enabled_letters`.
- **Dispatcher:** `sendToUser(user_id, channel, payload)` in `src/lib/notifications.ts`. Iterates the user's subscriptions filtered by channel, sends, prunes 404/410 endpoints.

### Client-side

- **Subscribe:** Settings → Notifications → "Turn on notifications" calls `Notification.requestPermission()`, then `navigator.serviceWorker.ready.then(reg => reg.pushManager.subscribe({...}))`, then POSTs the `subscription.toJSON()` to `/api/notifications/subscribe`.
- **Unsubscribe:** "Turn off" unsubscribes locally + POSTs to `/api/notifications/unsubscribe`.
- **Test:** "Send a test" → `POST /api/notifications/test`.

### Cron

`POST /api/cron/daily-memory` (gated by `X-Cron-Secret: $CRON_SECRET`) iterates every nominee, picks today's deterministic memory, and sends a daily push. Schedule via cron / systemd timer; the runbook in `docs/DEPLOY-AZURE-VM.md` includes the systemd unit.

### Notification payload

JSON-stringified `{title, body, url?, tag?}`. The service worker `push` handler shows a notification with title/body; the `notificationclick` handler navigates to `data.url` (or `/`) and focuses an existing window if possible.

**Privacy:** payloads carry a title + short body only - never the contents of a memory. Tapping opens the app; the actual memory is fetched after the user is authenticated.

### iOS gotcha

iOS PWA push requires the user to "Add to Home Screen" first **AND** be running iOS 16.4+. Safari needs to launch the PWA from the home-screen icon, not from a tab. The Notifications section in Settings detects unsupported environments and surfaces the install instruction:

> "This browser doesn't support push notifications. On iOS, install Heirloom to your Home Screen first (Share → Add to Home Screen) - Safari needs iOS 16.4 or newer."

---

## §5  Offline behaviour (summary)

Reads of cached content (home, released captures, recent navigation) work offline via the service worker's stale fallback.

Writes (capture, reflection, mood, settings) are **network only**. Reflection in particular requires a live connection to Ollama; there's no client-side fallback.

iOS Safari fires the `online` / `offline` events but the service worker doesn't take any explicit action on network loss; the page-level `fetch()` calls fail and the surface shows its error state.

| Action | Online | Offline |
|---|---|---|
| Record audio / photo / note | + | works locally up to save; the multipart POST fails if no network |
| Save note (with body) | + | + IndexedDB draft, surfaces on home as a count |
| Browse home | + fresh | + stale fallback from runtime cache |
| Browse capture details | + | + cached pages if previously visited |
| Reflection | + | X requires Ollama |
| TTS playback | + (if TTS sidecar reachable) | X requires TTS sidecar |
| Sign in (portal passphrase) | + | X requires server |

---

## §6  IndexedDB (client storage)

`src/lib/drafts.ts` uses IndexedDB via a small wrapper to hold note drafts the user dismissed without saving:

```ts
interface DraftRecord {
  id: string;
  kind: 'note';
  body: string;
  title?: string;
  saved_at: number;
}
```

The home page calls `countDrafts()` on mount and surfaces a one-line ribbon: "N drafts are safe in your browser." Drafts have no UI flow for resuming yet - the count is informational. Resuming is on the post-launch list.

Audio + photo drafts are **not** queued. The drafts table only covers notes for now.

---

## §7  Performance budgets

| Metric | Target |
|---|---|
| First Contentful Paint | < 1.4 s on 4G |
| Largest Contentful Paint | < 2.4 s on 4G |
| Cumulative Layout Shift | < 0.05 |
| Time to Interactive | < 3.0 s |
| JS bundle (initial) | aim < 200 KB gzipped |

Self-hosted fonts (Source Serif 4, Geist, JetBrains Mono) via `next/font` with latin subsets only. The seal PNG is the largest single image asset and is pre-cached by the service worker.

---

## §8  Tauri-shell considerations

When wrapped in the macOS .dmg, the same PWA code runs inside a WKWebView. Two differences worth knowing:

1. The service worker registers and runs as usual. The Tauri shell starts the Next.js server on `127.0.0.1:3000` and navigates the WKWebView there; the SW scope is `/`.
2. Web Push **does not work in the WKWebView** (Apple's macOS push permission is locked to native apps + Safari). Notifications inside the desktop bundle would need a native bridge into Tauri; not built. The .dmg ships without push; the iOS PWA install gets push.

---

## §9  iOS PWA gotchas

- `100vh` is unreliable; use `100dvh` or the `--vh` CSS variable trick.
- Audio recording requires the first `getUserMedia` call to be synchronous within the user-gesture handler.
- File picker: `accept="image/*"` triggers the camera-or-library sheet; `capture="user"` forces the front camera (used in the onboarding selfie step).
- Service worker scope must be `/`; nested scopes behave inconsistently across iOS versions.
- The home-screen icon picks up `apple-touch-icon.png` (180×180), not the maskable manifest icon.

---

## §10  Testing

There is no Lighthouse CI yet. Manual checks:

- Install on real iPhone (Safari Share → Add to Home Screen). Open from home screen. Record a note offline. Check the draft count surfaces. Restore network. Save.
- Install on Android Chrome via the native install prompt. Verify maskable icon renders.
- Desktop Chrome install. Verify window chrome looks right.

When CI lands, the targets are Lighthouse PWA ≥ 95, Accessibility ≥ 95.
