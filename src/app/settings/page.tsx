import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { getSettings } from "@/lib/onboarding";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await readSession();
  if (!session) redirect("/portal");
  if (session.role !== "creator") redirect("/");

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
