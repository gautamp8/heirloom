import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { withRls } from "@/lib/db";
import { writeBlob } from "@/lib/storage";
import { encodeReference } from "@/lib/tts";

export const dynamic = "force-dynamic";

const MAX_REFERENCE_BYTES = 12 * 1024 * 1024; // 12 MB ≈ 4 min of 16-bit mono 24 kHz
// LuxTTS clones from up to 15s of prompt audio. Anything below ~10s drifts
// to a generic voice on longer synthesised lines, so we require enough
// reference material to capture timbre properly.
const MIN_REFERENCE_SECONDS = 10;

/**
 * POST /api/voice/clone
 *
 * multipart/form-data:
 *   audio:           wav blob (the creator reading the reference script)
 *   reference_text:  the script they were asked to read (stored for record)
 *
 * Stores the wav as a blob, registers it with the TTS sidecar, persists
 * the resulting voice_id on `voice_profiles`. One profile per vault -
 * re-calling this replaces the existing profile.
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");

    const form = await req.formData();
    const file = form.get("audio");
    const referenceText = String(form.get("reference_text") ?? "").trim();
    if (!(file instanceof File)) throw new HttpError(400, "missing_audio");
    if (file.size === 0) throw new HttpError(400, "empty_audio");
    if (file.size > MAX_REFERENCE_BYTES) throw new HttpError(413, "audio_too_large");
    if (referenceText.length < 20) throw new HttpError(400, "missing_reference_text");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { blob_url } = await writeBlob(bytes, "wav");
    const encoded = await encodeReference(bytes, "reference.wav");

    if (encoded.duration_seconds < MIN_REFERENCE_SECONDS) {
      throw new HttpError(400, "recording_too_short");
    }

    const profile = await withRls(session.user_id, session.role, async (tx) => {
      const [row] = await tx<{ id: string; voice_id: string }[]>`
        INSERT INTO voice_profiles
          (vault_id, voice_id, blob_url, reference_text,
           duration_ms, sample_rate)
        VALUES (${session.vault_id}, ${encoded.voice_id}, ${blob_url},
                ${referenceText}, ${Math.round(encoded.duration_seconds * 1000)},
                ${encoded.sample_rate})
        ON CONFLICT (vault_id) DO UPDATE
          SET voice_id = EXCLUDED.voice_id,
              blob_url = EXCLUDED.blob_url,
              reference_text = EXCLUDED.reference_text,
              duration_ms = EXCLUDED.duration_ms,
              sample_rate = EXCLUDED.sample_rate
        RETURNING id, voice_id
      `;
      return row;
    });

    return Response.json({
      ok: true,
      profile_id: profile.id,
      voice_id: profile.voice_id,
      duration_seconds: encoded.duration_seconds,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
