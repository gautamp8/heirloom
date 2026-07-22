import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { withRls } from "@/lib/db";
import { writeBlob } from "@/lib/storage";
import { encodeReference } from "@/lib/tts";
import { describeProvider } from "@/lib/provider";
import { transcribeAudio } from "@/lib/whisper";

export const dynamic = "force-dynamic";

const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024; // 25 MB ~= 12 min compressed
const TMP_DIR = process.env.HEIRLOOM_TMP_DIR ?? "/tmp";

const MAX_REFERENCE_BYTES = 12 * 1024 * 1024; // 12 MB ≈ 4 min of 16-bit mono 24 kHz
// The TTS model encodes at most 15s of prompt audio; the on-screen
// script (~20s) ensures the recording comfortably exceeds that. Require
// at least 8s so timbre is captured cleanly.
const MIN_REFERENCE_SECONDS = 8;

/**
 * The two on-device audio endpoints, sharing one route module - and so
 * one serverless function, which Vercel's Hobby tier caps at 12 per
 * deployment. They belong together: both are creator-side, both take an
 * audio upload, both pull in the heavy local-only audio toolchain
 * (whisper.cpp and the TTS sidecar), and both refuse outright on the
 * hosted demo, where neither sidecar exists.
 *
 *   POST /api/voice/transcribe
 *     multipart/form-data: audio (WAV or any ffmpeg-readable recording)
 *     Returns { text }. Backs the mic affordance on long-form text
 *     fields - record, transcribe, drop the text back in the input for
 *     the user to edit. No storage: the temp file is deleted after.
 *
 *   POST /api/voice/clone
 *     multipart/form-data: audio (the reference reading), reference_text
 *     Stores the wav, registers it with the TTS sidecar, and persists
 *     the voice_id on voice_profiles. One profile per vault - calling
 *     again replaces it.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ op: string }> },
) {
  const { op } = await ctx.params;
  try {
    const session = await requireSession();
    const hosted = (await describeProvider()).profile === "hosted-demo";

    if (op === "transcribe") {
      // Transcription runs a local whisper.cpp binary — on-device only.
      // The hosted demo has no such sidecar, so refuse cleanly (the mic
      // affordance falls back to typing) instead of spawning a process
      // that does not exist on serverless.
      if (hosted) {
        throw new HttpError(400, "transcription_is_on_device_only");
      }

      const form = await req.formData();
      const file = form.get("audio");
      if (!(file instanceof File)) throw new HttpError(400, "missing_audio");
      if (file.size === 0) throw new HttpError(400, "empty_audio");
      if (file.size > MAX_TRANSCRIBE_BYTES) {
        throw new HttpError(413, "audio_too_large");
      }

      const id = randomUUID();
      const ext =
        (file.name.split(".").pop() ?? "wav")
          .replace(/[^a-z0-9]/gi, "")
          .slice(0, 6) || "wav";
      const tmpPath = path.join(TMP_DIR, `heirloom-${id}.${ext}`);
      await fs.writeFile(tmpPath, Buffer.from(await file.arrayBuffer()));

      try {
        const result = await transcribeAudio(tmpPath);
        return Response.json({ text: result.text });
      } finally {
        // Clean up everything whisper wrote alongside (.wav, .txt)
        const base = tmpPath.replace(/\.[^.]+$/, "");
        for (const suffix of [`.${ext}`, ".wav", ".txt"]) {
          try {
            await fs.unlink(base + suffix);
          } catch {
            /* best effort */
          }
        }
      }
    }

    if (op === "clone") {
      if (session.role !== "creator") throw new HttpError(403, "creator_only");

      // Privacy guard: the hosted demo must never receive reference
      // audio. Voice capture is on-device only, so refuse the upload
      // before it is read rather than relaying a recording to a cloud
      // server.
      if (hosted) {
        throw new HttpError(403, "voice_capture_is_on_device_only");
      }

      const form = await req.formData();
      const file = form.get("audio");
      const referenceText = String(form.get("reference_text") ?? "").trim();
      if (!(file instanceof File)) throw new HttpError(400, "missing_audio");
      if (file.size === 0) throw new HttpError(400, "empty_audio");
      if (file.size > MAX_REFERENCE_BYTES) {
        throw new HttpError(413, "audio_too_large");
      }
      if (referenceText.length < 20) {
        throw new HttpError(400, "missing_reference_text");
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const { blob_url } = await writeBlob(bytes, "wav");
      const encoded = await encodeReference(bytes, "reference.wav");

      if (encoded.duration_seconds < MIN_REFERENCE_SECONDS) {
        throw new HttpError(400, "recording_too_short");
      }

      const profile = await withRls(
        session.user_id,
        session.role,
        async (tx) => {
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
        },
      );

      return Response.json({
        ok: true,
        profile_id: profile.id,
        voice_id: profile.voice_id,
        duration_seconds: encoded.duration_seconds,
      });
    }

    throw new HttpError(404, "not_found");
  } catch (err) {
    return errorResponse(err);
  }
}
