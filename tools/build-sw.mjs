/**
 * Stamps a per-build cache version into the service worker.
 *
 * public/sw.js is generated from public/sw.template.js and is NOT checked
 * in. The template's VERSION is a placeholder; without this step it stayed
 * literally "heirloom-v1" in every deploy, which broke the update
 * lifecycle two ways: the browser only reinstalls a worker whose bytes
 * changed, so a deploy never triggered install/activate at all, and the
 * activate handler evicts caches by `!k.startsWith(VERSION)` — with a
 * constant VERSION that matches everything and evicts nothing. An offline
 * visitor kept a stale app shell indefinitely.
 *
 * The stamp prefers the deployment's commit SHA and falls back to the
 * local git SHA, then to a timestamp, so every build produces different
 * bytes.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const template = join(root, "public", "sw.template.js");
const out = join(root, "public", "sw.js");

function buildId() {
  const fromCi =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "";
  if (fromCi) return fromCi.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return String(Date.now());
  }
}

const id = buildId();
const src = readFileSync(template, "utf8");
const stamped = src.replace(
  /const VERSION = "[^"]*";/,
  `const VERSION = "heirloom-${id}";`,
);
if (stamped === src) {
  throw new Error("build-sw: VERSION placeholder not found in sw.template.js");
}
writeFileSync(out, stamped);
console.log(`  service worker stamped: heirloom-${id}`);
