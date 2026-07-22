import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { getOnboardingStatus } from "@/lib/onboarding";
import { getHomePayload } from "@/lib/home-data";
import { BrandMark } from "./_components/brand-mark";
import { Home } from "./_components/home";
import { NomineeHome } from "./_components/nominee-home";

export type { HomeCapture, ReleasedCapture } from "@/lib/home-data";

export default async function Root() {
  const session = await readSession();
  if (!session) redirect("/portal");

  // Fresh creators (no onboarded_at) go through the 4-step welcome first.
  if (session.role === "creator") {
    const status = await getOnboardingStatus(session);
    if (!status.onboarded) redirect("/onboarding");
  }

  const data = await getHomePayload(session);

  if (data.role === "nominee") {
    const moodChips = pickMoodChips(data.framing.from_name);
    return (
      <main className="stage relative min-h-dvh flex flex-col">
        <div className="px-6 pt-6 pb-2 flex items-center justify-between relative z-10">
          <BrandMark href={null} />
          <a
            href="/settings"
            className="eyebrow hover:text-ink transition-colors"
          >
            Settings
          </a>
        </div>

        <NomineeHome
          framing={data.framing}
          released={data.released_captures}
          newlyFired={data.newly_fired_letters ?? []}
          dailyMemory={data.daily_memory ?? null}
          albums={data.themed_albums ?? []}
          stats={data.stats}
          moodChips={moodChips}
        />
      </main>
    );
  }

  return (
    <main className="stage relative min-h-dvh flex flex-col">
      <div className="px-6 pt-6 pb-2 flex items-center justify-between relative z-10">
        <BrandMark href={null} />
        <a
          href="/settings"
          className="eyebrow hover:text-ink transition-colors"
        >
          Settings
        </a>
      </div>

      <Home
        greeting={data.greeting}
        prompt={data.prompt_of_day}
        recent={data.recent_captures}
        stats={data.stats}
      />
    </main>
  );
}

/** Mood-card chips: matched to sealed-letter triggers for the seed
 *  archives, generic for everyone else. */
function pickMoodChips(fromName: string): string[] {
  const key = fromName.toLowerCase().trim();
  if (key.includes("carl sagan")) {
    return [
      "We are stardust",
      "What is our place in the cosmos?",
      "Look at Earth from space",
      "What is science?",
    ];
  }
  return ["I miss you", "I need advice", "On hard days", "A big moment"];
}
