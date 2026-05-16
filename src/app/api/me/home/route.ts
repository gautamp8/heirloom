import { errorResponse, requireSession } from "@/lib/auth";
import { getHomePayload } from "@/lib/home-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    return Response.json(await getHomePayload(session));
  } catch (err) {
    return errorResponse(err);
  }
}
