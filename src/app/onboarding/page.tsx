import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { getOnboardingStatus } from "@/lib/onboarding";
import { OnboardingFlow } from "./onboarding-flow";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await readSession();
  if (!session) redirect("/portal");
  if (session.role !== "creator") redirect("/");
  const status = await getOnboardingStatus(session);
  if (status.onboarded) redirect("/");

  return (
    <main className="stage relative min-h-dvh px-6 pt-10 pb-16">
      <div className="max-w-[680px] mx-auto relative z-10">
        <OnboardingFlow />
      </div>
    </main>
  );
}
