import { sqlAdmin } from "@/lib/db";
import {
  HttpError,
  errorResponse,
  devFixturesAllowed,
  clearSessionCookie,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Dev-only: wipes ALL captures, transcripts, chunks, tags, reflections,
 * nominees, releases, executor credentials. Also drops every user and
 * vault so a fresh "Begin a new archive" starts from zero. Clears the
 * session cookie.
 */
export async function POST() {
  if (!devFixturesAllowed()) {
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
      sealed_letters,
      nominee_states,
      face_appearances,
      nominee_releases,
      executor_credentials,
      nominees,
      life_events,
      people,
      captures,
      voice_profiles,
      vaults,
      users
    RESTART IDENTITY CASCADE`;
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
