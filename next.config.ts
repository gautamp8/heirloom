import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow HMR + RSC payloads from non-localhost dev origins (tunnels,
  // LAN IPs). Without this, Next.js blocks hydration cross-origin and
  // pages appear inert when opened from a phone.
  allowedDevOrigins: [
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
