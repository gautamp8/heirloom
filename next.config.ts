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
  // Native node addons used only by the bundled desktop build. They
  // load .node binaries at runtime and must not be bundled by Turbopack.
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
  // Standalone output bundles only the deps Heirloom actually needs
  // into .next/standalone/, so the Tauri .dmg can ship the server
  // without dragging a full node_modules tree.
  output: "standalone",
};

export default nextConfig;
