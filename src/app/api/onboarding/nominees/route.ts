import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { saveNominees } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const body = (await req.json()) as {
      nominees?: {
        name: string;
        relation?: string | null;
        email?: string | null;
        birthday?: string | null;
      }[];
    };
    const nominees = Array.isArray(body.nominees) ? body.nominees : [];
    const r = await saveNominees(session, nominees);
    return Response.json(r);
  } catch (err) {
    return errorResponse(err);
  }
}
