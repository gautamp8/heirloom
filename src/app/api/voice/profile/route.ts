import { errorResponse, requireSession } from "@/lib/auth";
import { withRls, sqlAdmin } from "@/lib/db";
import { ttsHealth } from "@/lib/tts";

export const dynamic = "force-dynamic";

/** GET /api/voice/profile → { profile, tts_available } */
export async function GET() {
  try {
    const session = await requireSession();

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
      tts_available: health.ok,
      tts_device: health.device,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
