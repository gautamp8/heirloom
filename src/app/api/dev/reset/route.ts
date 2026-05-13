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
    // Wipe every per-vault table. Users + vaults are KEPT so IDs stay
    // stable, but vaults.onboarded_at is cleared so the next visit walks
    // the creator through onboarding again.
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
      captures
    RESTART IDENTITY CASCADE`;
    await sqlAdmin`UPDATE vaults SET onboarded_at = NULL`;
    // Reset display_name on the dev creator so it doesn't leak into a
    // subsequent run as a pre-filled fixture.
    await sqlAdmin`
      UPDATE users SET display_name = 'Friend'
       WHERE email IN ('creator@heirloom.local', 'maya@heirloom.local')
    `;
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
