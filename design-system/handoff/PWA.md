# PWA.md

Progressive Web App configuration for Heirloom v1. The PWA story matters because the product story is on-device — the installable shell is what makes the demo feel local even when the demo's inference is server-side.

---

## §1  Manifest

`frontend/public/manifest.webmanifest`

```json
{
  "name": "Heirloom",
  "short_name": "Heirloom",
  "description": "A private place for the memories you mean to leave behind.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#faf7f0",
  "theme_color": "#1a1612",
  "categories": ["lifestyle", "productivity"],
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "screenshots": [
    { "src": "/screenshots/home.png", "sizes": "1080x1920", "type": "image/png", "form_factor": "narrow" }
  ]
}
```

Icons are derived from `assets/seal.png` (the oxblood monogram). Maskable icon is the monogram on the bone background with safe-area padding.

---

## §2  Service worker

Approach: **Workbox + custom fetch handlers** via `next-pwa`. Three runtime strategies:

| Resource | Strategy |
|---|---|
| App shell (HTML, JS, CSS) | `StaleWhileRevalidate` |
| `GET /me/home`, `GET /me/explore` | `NetworkFirst` with 3s timeout, fallback to cached |
| `GET /capture/{id}` (released only) | `CacheFirst` with 30-day expiry |
| Audio/video blobs | `CacheFirst` with 100MB LRU cap |
| `POST /capture`, `POST /reflect` | Network-only, but **queued via Background Sync** if offline |

The Background Sync queue is named `heirloom-capture-queue`. The frontend shows the queue size in the home ribbon when > 0.

---

## §3  Install prompt UX

Heirloom does **not** auto-prompt to install. The platform `beforeinstallprompt` is captured and held silently. We surface install in two places only:

1. **After the user's third capture** — a small mono nudge appears in the home, dismissible forever after one tap: *"Keep Heirloom on your home screen."*
2. **In Settings → About → Install** — always available.

Never modal. Never blocking. Never on first visit.

---

## §4  Offline behavior (canonical table)

See `FLOWS.md` §15 for the full table. Summary:
- **Reads** of cached content (home, threads, released captures) work offline.
- **Writes** queue locally; sync on reconnect.
- **Reflection** requires network in v1. The on-device LLM v2 will lift this.
- **Sign in** requires network.

---

## §5  IndexedDB schema (client-side)

```ts
// frontend/src/lib/idb.ts
interface HeirloomDB {
  drafts: {                            // unsaved captures in progress
    id: string;
    kind: 'audio'|'photo'|'note'|'video';
    blob?: Blob;
    body?: string;
    caption?: string;
    started_at: number;
  };
  upload_queue: {                      // committed captures awaiting upload
    id: string;
    payload: FormData | object;
    attempts: number;
    last_error?: string;
  };
  home_cache: {
    role: 'creator'|'nominee';
    vault_id: string;
    payload: HomePayload;
    fetched_at: number;
  };
}
```

A single Dexie DB. Schema versioned with the app.

---

## §6  Notifications (v1: opt-in, scoped)

Web Push registered only after the user enters Settings → Notifications and explicitly opts in. Two notification kinds in v1:
- **A new piece has been released to you** (nominees)
- **A scheduled release is approaching** (creators, 24h ahead)

VAPID keys generated per-deployment. Subscriptions stored in a new `push_subscriptions` table (not in v1 SCHEMA.sql — add when implementing).

---

## §7  Install assets to produce

- `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-maskable.png`
- `/icons/apple-touch-icon-180.png`
- `/screenshots/home.png`, `/screenshots/capture.png` (1080×1920)
- `/favicon.ico` (32×32 from seal monogram)
- `/og-image.png` (1200×630, seal centered on paper)

Generate with `scripts/build-icons.ts` (sharp-based, runs from `assets/seal.png`).

---

## §8  Performance budgets

| Metric | Budget |
|---|---|
| First Contentful Paint | < 1.4s on Slow 4G |
| Largest Contentful Paint | < 2.4s on Slow 4G |
| Cumulative Layout Shift | < 0.05 |
| Time to Interactive | < 3.0s |
| JS bundle (initial) | < 180KB gzipped |
| Total transfer (initial) | < 350KB gzipped |

Self-hosted Source Serif + Geist (woff2 only, latin subset). No CDN fonts.

---

## §9  iOS PWA gotchas to handle

- Status bar: `apple-mobile-web-app-status-bar-style = black-translucent`
- 100vh: use `100dvh` or the iOS-safe `--vh` trick
- Audio recording on iOS Safari: only inside a user-gesture handler; first call to `getUserMedia` MUST be synchronous from the tap
- File picker: `accept="image/*"` triggers camera-or-library sheet on iOS; `capture="user"` to force front camera
- Service worker scope: must be `/`; iOS treats deeper scopes inconsistently

---

## §10  Testing the PWA

Lighthouse PWA score target: **≥ 95**. CI runs Lighthouse on every PR to a staging deployment.

Manual tests:
- Install on real iPhone (Safari → Share → Add to Home Screen). Open standalone. Record audio. Kill network. Verify capture queues. Restore network. Verify upload.
- Install on real Android (Chrome → Install prompt). Verify maskable icon.
- Desktop Chrome install. Verify window chrome looks right.
