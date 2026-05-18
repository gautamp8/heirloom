import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // The product app and the marketing app share a repo root. Pin the
  // workspace root so turbopack stops warning about the ambiguity.
  turbopack: { root: path.join(__dirname) },
};

export default config;
