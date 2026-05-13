import { Suspense } from "react";
import { WelcomeFlow } from "./welcome-flow";

// /welcome reads ?stage=opening from useSearchParams to support the dev
// console's frozen-stage links. That call needs a Suspense boundary
// during static prerender; we wrap it here and force-dynamic so the
// page is rendered per-request anyway.
export const dynamic = "force-dynamic";

export default function Welcome() {
  return (
    <Suspense fallback={null}>
      <WelcomeFlow />
    </Suspense>
  );
}
