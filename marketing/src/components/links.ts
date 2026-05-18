// Single source for all external destinations the site links out to.

export const links = {
  azure:
    process.env.NEXT_PUBLIC_AZURE_URL ??
    "https://heirloom-1ab066.eastus2.cloudapp.azure.com",
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
  return `${links.azure}/welcome?p=carl-sagan-archive-1990`;
}
