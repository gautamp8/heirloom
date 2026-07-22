"use client";

import { NotificationsSection, SignOutSection } from "./sections";

export type NomineeSettingsInitial = {
  user: { display_name: string };
  framing: { from_name: string };
};

export function NomineeSettingsClient({
  initial,
}: {
  initial: NomineeSettingsInitial;
}) {
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">You</h2>
        <p className="p-body max-w-[480px]">
          You&rsquo;re signed in as{" "}
          <span className="font-serif italic text-ink">
            {initial.user.display_name || "a guest"}
          </span>
          , reading{" "}
          <span className="font-serif italic text-ink">
            {initial.framing.from_name}
          </span>
          &rsquo;s archive. Everything you see here was prepared for you,
          one memory at a time.
        </p>
      </section>

      <NotificationsSection />

      <SignOutSection
        copy="Sign out to hand this device to someone else. The archive itself stays where the creator set it up — you can come back anytime with the passphrase they shared."
      />
    </div>
  );
}
