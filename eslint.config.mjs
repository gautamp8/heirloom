import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "desktop/**",
      "design-system/**",
      "marketing/**",
      "remotion/**",
      "infra/**",
      "public/sw.js",
      "next-env.d.ts",
    ],
  },
  nextCoreWebVitals,
  nextTypescript,
]);
