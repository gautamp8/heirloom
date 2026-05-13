import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { saveSealedLetters } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const body = (await req.json()) as {
      drafts?: {
        to_nominee_name: string;
        occasion_prompt: string;
        body: string;
        trigger_hint: string;
      }[];
    };
    const drafts = Array.isArray(body.drafts) ? body.drafts : [];
    const r = await saveSealedLetters(session, drafts);
    return Response.json(r);
  } catch (err) {
    return errorResponse(err);
  }
}
