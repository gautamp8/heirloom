import { errorResponse, requireSession } from "@/lib/auth";
import { withRls, sqlAdmin } from "@/lib/db";
import { warmVoice } from "@/lib/tts";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice/warm - best-effort signal to the TTS sidecar to load
 * the model and encode this vault's voice prompt without synthesizing
 * anything. Fired in the background on home-page load so the first
 * tap on "THEIR VOICE" doesn't have to wait for cold-start.
 *
 * Always returns 200 (with ok: false on internal trouble) so the
 * client can fire-and-forget without surfacing transient errors.
 */
export async function POST() {
  try {
    const session = await requireSession();
    let voiceId: string | null = null;
    if (session.role === "creator") {
      const row = await withRls(session.user_id, session.role, async (tx) => {
        const [p] = await tx<{ voice_id: string }[]>`
          SELECT voice_id FROM voice_profiles WHERE vault_id = ${session.vault_id}
        `;
        return p;
      });
      voiceId = row?.voice_id ?? null;
    } else if (sqlAdmin) {
      const [p] = await sqlAdmin<{ voice_id: string }[]>`
        SELECT voice_id FROM voice_profiles WHERE vault_id = ${session.vault_id}
      `;
      voiceId = p?.voice_id ?? null;
    }
    const ok = await warmVoice(voiceId);
    return Response.json({ ok, voice_id_known: !!voiceId });
  } catch (err) {
    return errorResponse(err);
  }
}
