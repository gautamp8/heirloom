import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to serve HMR + RSC payloads to non-localhost origins
  // (ngrok tunnels, LAN IP from the iPhone). Without this, Next.js 16 blocks
  // hydration from cross-origin hosts and pages appear inert.
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.ngrok.app",
    "*.trycloudflare.com",
    "192.168.1.16",
    "192.168.1.16:3000",
  ],
};

export default nextConfig;
