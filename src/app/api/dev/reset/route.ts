import { sqlAdmin } from "@/lib/db";
import { HttpError, errorResponse, clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Dev-only: wipes ALL captures, transcripts, chunks, tags, reflections,
 * nominees, releases, executor credentials. Keeps users + vaults so the
 * IDs stay stable across resets. Clears the session cookie.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return errorResponse(new HttpError(404, "not_found"));
  }
  try {
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");
    await sqlAdmin`TRUNCATE TABLE
      reflections,
      saved_passages,
      capture_tags,
      transcript_chunks,
      transcripts,
      thread_captures,
      threads,
      nominee_releases,
      executor_credentials,
      nominees,
      captures
    RESTART IDENTITY CASCADE`;
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
