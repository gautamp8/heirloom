import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { readSession } from "@/lib/auth";
import { getOnboardingStatus } from "@/lib/onboarding";
import { BrandMark } from "./_components/brand-mark";
import { Home } from "./_components/home";
import { NomineeHome } from "./_components/nominee-home";

type CreatorHome = {
  role: "creator";
  greeting: {
    time_of_day: "morning" | "afternoon" | "evening";
    display_name: string;
  };
  prompt_of_day: { id: string; text: string | null };
  recent_captures: HomeCapture[];
  stats: { captures: number; nominees: number };
};

type NomineeHomePayload = {
  role: "nominee";
  framing: {
    from_name: string;
    to_name: string;
    letter_body: string | null;
  };
  released_captures: ReleasedCapture[];
  newly_fired_letters: {
    letter_id: string;
    capture_id: string;
    occasion_prompt: string;
    trigger: string;
  }[];
  daily_memory: ReleasedCapture | null;
  themed_albums: { theme: string; count: number; cover_id: string }[];
  stats: { captures: number };
};

export type HomeCapture = {
  id: string;
  kind: "audio" | "photo" | "note" | "video";
  status: "processing" | "ready" | "failed";
  title: string | null;
  body: string | null;
  duration_ms: number | null;
  captured_at: string;
  transcript_snippet: string | null;
};

export type ReleasedCapture = {
  id: string;
  kind: "audio" | "photo" | "note" | "video";
  title: string | null;
  body: string | null;
  duration_ms: number | null;
  captured_at: string;
  released_at: string;
  transcript_snippet: string | null;
};

export default async function Root() {
  const session = await readSession();
  if (!session) redirect("/portal");

  // Fresh creators (no onboarded_at) go through the 4-step welcome first.
  if (session.role === "creator") {
    const status = await getOnboardingStatus(session);
    if (!status.onboarded) redirect("/onboarding");
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/me/home`,
    {
      headers: { cookie: `heirloom_session=${await sessionCookieValue()}` },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    return (
      <main className="stage min-h-dvh p-8">
        <p className="p-body">Home failed to load: HTTP {res.status}</p>
      </main>
    );
  }
  const data = (await res.json()) as CreatorHome | NomineeHomePayload;

  if (data.role === "nominee") {
    const moodChips = pickMoodChips(data.framing.from_name);
    return (
      <main className="stage relative min-h-dvh flex flex-col">
        <div className="px-6 pt-6 pb-2 flex items-center justify-between relative z-10">
          <BrandMark href={null} />
          <span className="eyebrow">Archive</span>
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

async function sessionCookieValue(): Promise<string> {
  return (await cookies()).get("heirloom_session")?.value ?? "";
}

/** Mood-card chips per known seed archive. Each chip should either match
 *  a sealed letter trigger (so tapping fires it) or be a phrasing the
 *  Reflection retrieval will land on confidently. The fallback set are
 *  generic prompts kept for family archives where we have no special
 *  hand-tuning. */
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
  if (key.includes("fred rogers")) {
    return [
      "I feel afraid",
      "I miss you",
      "What did you believe about children?",
      "Tell me about love",
    ];
  }
  if (key.includes("gandhi")) {
    return [
      "I feel powerless",
      "Tell me about truth",
      "What is non-violence?",
      "On hard days",
    ];
  }
  return ["I miss you", "I need advice", "On hard days", "A big moment"];
}
