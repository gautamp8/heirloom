// Single source for all external destinations the site links out to.

export const links = {
  // The public Sagan demo. Runs on a small cloud server with Azure OpenAI
  // inference — the opposite of the shipped product, so anyone can try it
  // without installing. A custom domain, never a cloud auto-hostname
  // (those can't survive a provider move).
  demo: process.env.NEXT_PUBLIC_DEMO_URL ?? "https://demo.withheirloom.app",
  github:
    process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/gautamp8/heirloom",
  releases: "https://github.com/gautamp8/heirloom/releases",
  // Currently shipping pre-release. When v0.1.0 (final) lands, point
  // `releaseTag` at the new tag and update `dmgDownload` + `dmgSha256`.
  releaseTag: "v0.1.0-rc.1",
  releasePage:
    "https://github.com/gautamp8/heirloom/releases/tag/v0.1.0-rc.1",
  dmgDownload:
    "https://github.com/gautamp8/heirloom/releases/download/v0.1.0-rc.1/Heirloom.dmg",
  dmgSha256:
    "https://github.com/gautamp8/heirloom/releases/download/v0.1.0-rc.1/Heirloom.dmg.sha256",
} as const;

// Public demo: pre-filled nominee passphrase for the seeded Sagan archive.
// The product app's /welcome page decodes ?p= (dashes back to spaces) and
// auto-submits, so a visitor lands inside the envelope with no friction.
export function tryAsNominee() {
  return `${links.demo}/welcome?p=carl-sagan-archive-1990`;
}
