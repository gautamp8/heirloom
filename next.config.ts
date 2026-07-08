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
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "argon2"],
  // The nightly demo reset re-imports the Sagan seed in-process, so its
  // manifest + media must be traced into that function's bundle (they live
  // outside the app dir and aren't picked up automatically).
  outputFileTracingIncludes: {
    "/api/cron/reset-demo": ["./desktop/seed-archives/sagan/**/*"],
  },
  // Standalone output bundles only the deps Heirloom actually needs
  // into .next/standalone/, so the Tauri .dmg can ship the server
  // without dragging a full node_modules tree.
  output: "standalone",
};

export default nextConfig;
