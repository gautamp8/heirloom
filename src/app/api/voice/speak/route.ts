import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { withRls, sqlAdmin } from "@/lib/db";
import { speak } from "@/lib/tts";

export const dynamic = "force-dynamic";

const MAX_TEXT_CHARS = 1200;

/**
 * POST /api/voice/speak
 *
 * Body: { text: string, capture_id?: string }
 *
 * Synthesizes `text` in the creator's cloned voice and streams audio/wav
 * back.
 *
 * Verbatim-only contract: callers must pass exact text that exists in the
 * archive - a capture body, a transcript line, the verbatim source of a
 * Reflection citation. Server-side we don't enforce verbatim per-character
 * (would be too brittle); we rely on the client only sending text drawn
 * from the displayed capture material. The contract is documented and the
 * UI never exposes a free-text "speak this" affordance.
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = (await req.json()) as {
      text?: string;
      capture_id?: string;
    };
    const text = (body.text ?? "").trim();
    if (!text) throw new HttpError(400, "missing_text");
    if (text.length > MAX_TEXT_CHARS) throw new HttpError(413, "text_too_long");

    // Resolve the creator's voice profile for this vault. Both creator
    // (their own vault) and nominee (their assigned vault) can read it.
    let voiceId: string | null = null;
    if (session.role === "creator") {
      const row = await withRls(session.user_id, session.role, async (tx) => {
        const [p] = await tx<{ voice_id: string }[]>`
          SELECT voice_id FROM voice_profiles WHERE vault_id = ${session.vault_id}
        `;
        return p;
      });
      voiceId = row?.voice_id ?? null;
    } else if (session.role === "nominee") {
      // Nominee surface needs to read across the creator's vault - admin
      // connection narrows the lookup to the nominee's vault_id.
      if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");
      const [p] = await sqlAdmin<{ voice_id: string }[]>`
        SELECT voice_id FROM voice_profiles WHERE vault_id = ${session.vault_id}
      `;
      voiceId = p?.voice_id ?? null;
    }

    if (!voiceId) throw new HttpError(404, "no_voice_profile");

    const stream = await speak(voiceId, text, req.signal);
    return new Response(stream, {
      headers: {
        "content-type": "audio/wav",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
