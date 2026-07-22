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
  // Keep sharp out of the traced function bundles on Vercel. Nothing in
  // Heirloom imports it - it is Next's image-optimizer dependency, and
  // Vercel optimizes images on its own infrastructure, so it is dead
  // weight in a lambda there. It is not harmless dead weight: pinning
  // sharp to >=0.35.3 (for GHSA-f88m-g3jw-g9cj) dragged its platform
  // packages into every route bundle, which pushed each past the size at
  // which Vercel groups routes into shared lambdas. The deployment went
  // from 4 functions to over 12 and was rejected by the Hobby cap.
  // Scoped to Vercel so local and desktop builds, where next/image does
  // use sharp, are untouched.
  ...(process.env.VERCEL
    ? {
        outputFileTracingExcludes: {
          "*": ["node_modules/sharp/**", "node_modules/@img/**"],
        },
      }
    : {}),
  // Standalone output bundles only the deps Heirloom actually needs
  // into .next/standalone/, so the Tauri .dmg can ship the server
  // without dragging a full node_modules tree.
  output: "standalone",
};

export default nextConfig;
