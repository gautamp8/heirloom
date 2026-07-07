import { errorResponse, requireSession } from "@/lib/auth";
import { withRls, sqlAdmin } from "@/lib/db";
import { ttsHealth } from "@/lib/tts";
import { describeProvider } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** GET /api/voice/profile → { profile, tts_available, hosted } */
export async function GET() {
  try {
    const session = await requireSession();

    // Voice capture + cloning is an on-device feature: recording, whisper
    // transcription, and TTS all run locally so audio never leaves the
    // machine. The hosted demo runs in the cloud with no voice engine, so
    // it declares itself hosted and the client shows a "voice stays on your
    // own device" note instead of a control that can't work.
    const hosted = (await describeProvider()).profile === "hosted-demo";

    type Row = {
      id: string;
      voice_id: string;
      duration_ms: number | null;
      sample_rate: number | null;
      created_at: Date | string;
    };
    let profile: Row | null = null;

    if (session.role === "creator") {
      const row = await withRls(session.user_id, session.role, async (tx) => {
        const [p] = await tx<Row[]>`
          SELECT id, voice_id, duration_ms, sample_rate, created_at
            FROM voice_profiles WHERE vault_id = ${session.vault_id}
        `;
        return p;
      });
      profile = row ?? null;
    } else if (sqlAdmin) {
      const [p] = await sqlAdmin<Row[]>`
        SELECT id, voice_id, duration_ms, sample_rate, created_at
          FROM voice_profiles WHERE vault_id = ${session.vault_id}
      `;
      profile = p ?? null;
    }

    const health = await ttsHealth();
    return Response.json({
      profile,
      tts_available: health.ok && !hosted,
      tts_device: health.device,
      hosted,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
