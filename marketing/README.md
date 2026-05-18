# Heirloom marketing

The `withheirloom.app` landing site. Standalone Next.js app, deployed to
Vercel from this subdirectory so the product app's runtime dependencies
(Postgres, Ollama, whisper-cpp, face-api.js) stay out of the bundle.

## Run locally

```bash
cd marketing
pnpm install
pnpm dev   # → http://localhost:3001
```

## Build

```bash
pnpm build
pnpm start
```

## Deploy to Vercel

Point a new Vercel project at this repository. In project settings:

- **Root Directory**: `marketing`
- **Framework**: Next.js (auto-detected)
- **Build Command**: `pnpm install --frozen-lockfile && pnpm build`
- **Output Directory**: `.next`

Environment variables (all optional — sensible defaults exist):

| Var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_AZURE_URL` | `https://heirloom-1ab066.eastus2.cloudapp.azure.com` | Where the *Try the archive* button points |
| `NEXT_PUBLIC_GITHUB_URL` | `https://github.com/gautamp8/heirloom` | The source-code link |
| `NEXT_PUBLIC_SITE_URL` | `https://withheirloom.app` | Canonical + OG metadata |

## Routes

| Path | Purpose |
|---|---|
| `/` | Hero, walk-through reel, capabilities, contract preview, privacy, Sagan try-it, source |
| `/design` | The ethics-and-design manifesto with palette, type, motion, voice register |
| `/transparency` | The grounding contract in full, with code citations and a pipeline diagram |
| `/opengraph-image` | Dynamic OG card (edge runtime) |
| `/sitemap.xml` and `/robots.txt` | Standard discovery |

## Design tokens

The `@theme static` block in `src/app/globals.css` is a verbatim copy of the
product app's token block at `../src/app/globals.css`. If the product moves a
token, this file follows. Drift is a bug.

## Mockups

Every screenshot on the site is a real React component rendered with the
actual design tokens, inside a device frame (`DeviceMac`, `DeviceiPhone`).
There are no PNG screenshots of the running product; that approach scales
poorly across displays and rots when the UI changes. See `src/mockups/` for
the full set.
