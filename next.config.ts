import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow HMR + RSC payloads from non-localhost dev origins (tunnels,
  // LAN IPs, and the loopback IP). Next 16 treats anything other than
  // "localhost" — including 127.0.0.1 — as a cross-origin dev resource
  // and blocks the HMR websocket + hydration payload, leaving pages
  // inert. The E2E suite and most tooling address the server by
  // 127.0.0.1, so it must be allowed explicitly.
  allowedDevOrigins: [
    "127.0.0.1",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.ngrok.app",
    "*.trycloudflare.com",
    "192.168.1.16",
    "192.168.1.16:3000",
  ],
  // Native node addons. better-sqlite3/sqlite-vec are desktop-only; argon2
  // (passphrase hashing) loads on the server path too. Externalized so the
  // bundler leaves their .node binaries for the runtime to load, and NFT
  // traces the correct platform prebuild on Vercel.
  // sharp is here for a second reason: nothing in Heirloom imports it —
  // it is Next's image optimizer dependency — but once it was pinned to
  // >=0.35.3 (to clear a high-severity libvips advisory) the tracer
  // pulled its platform packages into route bundles, which split enough
  // routes into their own lambdas to blow past Vercel's 12-function cap.
  // Externalizing keeps it out of the bundles.
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "argon2", "sharp"],
  // Standalone output bundles only the deps Heirloom actually needs into
  // .next/standalone/, so the Tauri .dmg can ship the server without
  // dragging a full node_modules tree. It is deliberately NOT used on
  // Vercel: standalone opts out of Vercel's native route grouping, so
  // every heavy route became its own lambda and the deployment blew past
  // the 12-function limit. Vercel builds the default output and groups
  // them; local and desktop builds still get standalone.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
