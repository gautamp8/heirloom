import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { getSettings } from "@/lib/onboarding";
import { sqlAdmin } from "@/lib/db";
import { SettingsClient } from "./settings-client";
import { NomineeSettingsClient } from "./nominee-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await readSession();
  if (!session) redirect("/portal");

  if (session.role === "nominee") {
    return <NomineeSettings userId={session.user_id} vaultId={session.vault_id} />;
  }

  const data = await getSettings(session);
  return (
    <main className="stage relative min-h-dvh px-6 pt-8 pb-24">
      <div className="max-w-[680px] mx-auto relative z-10">
        <Link
          href="/"
          className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted hover:text-ink"
        >
          ← Home
        </Link>
        <p className="eyebrow mt-4 mb-1">Settings</p>
        <h1 className="h-title mb-3">
          Care <em>for the archive.</em>
        </h1>
        <p className="p-body mb-8 max-w-[480px]">
          Update what the archive knows about you, who it&rsquo;s for, and the
          dates that anchor it. Generate a fresh passphrase for a nominee
          when you need to re-share access.
        </p>

        <SettingsClient initial={data} />
      </div>
    </main>
  );
}

async function NomineeSettings({
  userId,
  vaultId,
}: {
  userId: string;
  vaultId: string;
}) {
  // Pull the nominee's display name + the creator's name straight from
  // the admin connection so we don't have to layer in a new RLS path
  // for one read.
  let displayName = "";
  let fromName = "the creator";
  if (sqlAdmin) {
    const [u] = await sqlAdmin<{ display_name: string }[]>`
      SELECT display_name FROM users WHERE id = ${userId}
    `;
    if (u) displayName = u.display_name;
    const [creator] = await sqlAdmin<{ display_name: string }[]>`
      SELECT u.display_name
        FROM vaults v JOIN users u ON u.id = v.creator_id
       WHERE v.id = ${vaultId}
    `;
    if (creator?.display_name) fromName = creator.display_name;
  }

  return (
    <main className="stage relative min-h-dvh px-6 pt-8 pb-24">
      <div className="max-w-[680px] mx-auto relative z-10">
        <Link
          href="/"
          className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted hover:text-ink"
        >
          ← Home
        </Link>
        <p className="eyebrow mt-4 mb-1">Settings</p>
        <h1 className="h-title mb-3">
          Care <em>for the archive.</em>
        </h1>
        <p className="p-body mb-8 max-w-[480px]">
          Manage how this device hears from the archive, and sign out when
          you&rsquo;re handing it to someone else.
        </p>

        <NomineeSettingsClient
          initial={{
            user: { display_name: displayName },
            framing: { from_name: fromName },
          }}
        />
      </div>
    </main>
  );
}
