// Single source for all external destinations the site links out to.

export const links = {
  azure:
    process.env.NEXT_PUBLIC_AZURE_URL ??
    "https://heirloom-1ab066.eastus2.cloudapp.azure.com",
  github:
    process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/gautamp8/heirloom",
  // No notarized release exists yet, so the "Download" affordances route
  // through the build-from-source modal and link out to the repo. Swap in
  // a `releases/tag/<version>` URL once the first signed build ships.
  releases: "https://github.com/gautamp8/heirloom/releases",
} as const;

// Public demo: pre-filled nominee passphrase for the seeded Sagan archive.
// The product app's /welcome page decodes ?p= (dashes back to spaces) and
// auto-submits, so a visitor lands inside the envelope with no friction.
export function tryAsNominee() {
  return `${links.azure}/welcome?p=carl-sagan-archive-1990`;
}
