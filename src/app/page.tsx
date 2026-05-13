import { redirect } from "next/navigation";
import Image from "next/image";
import { cookies } from "next/headers";
import { readSession } from "@/lib/auth";
import { getOnboardingStatus } from "@/lib/onboarding";
import { Home } from "./_components/home";
import { NomineeHome } from "./_components/nominee-home";

type CreatorHome = {
  role: "creator";
  greeting: {
    time_of_day: "morning" | "afternoon" | "evening";
    display_name: string;
  };
  prompt_of_day: { id: string; text: string };
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
    return (
      <main className="stage relative min-h-dvh flex flex-col">
        <div className="px-6 pt-6 pb-2 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2.5">
            <Image
              src="/seal.png"
              alt=""
              aria-hidden
              width={22}
              height={22}
              className="w-[22px] h-[22px] object-contain"
            />
            <span className="font-serif italic text-[18px] text-ink">
              Heirloom
            </span>
          </div>
          <span className="eyebrow">Archive</span>
        </div>

        <NomineeHome
          framing={data.framing}
          released={data.released_captures}
          newlyFired={data.newly_fired_letters ?? []}
          dailyMemory={data.daily_memory ?? null}
          albums={data.themed_albums ?? []}
          stats={data.stats}
        />
      </main>
    );
  }

  return (
    <main className="stage relative min-h-dvh flex flex-col">
      <div className="px-6 pt-6 pb-2 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <Image
            src="/seal.png"
            alt=""
            aria-hidden
            width={22}
            height={22}
            className="w-[22px] h-[22px] object-contain"
          />
          <span className="font-serif italic text-[18px] text-ink">
            Heirloom
          </span>
        </div>
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
