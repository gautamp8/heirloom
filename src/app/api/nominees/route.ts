import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { saveNominees } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const body = (await req.json()) as {
      name?: string;
      relation?: string | null;
      email?: string | null;
      birthday?: string | null;
    };
    if (!body.name?.trim()) throw new HttpError(400, "missing_name");
    const r = await saveNominees(session, [
      {
        name: body.name.trim(),
        relation: body.relation ?? null,
        email: body.email ?? null,
        birthday: body.birthday ?? null,
      },
    ]);
    if (r.nominees.length === 0) throw new HttpError(500, "save_failed");
    return Response.json({ nominee: r.nominees[0] });
  } catch (err) {
    return errorResponse(err);
  }
}
