import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { describeProvider } from "@/lib/provider";
import { transcribeAudio } from "@/lib/whisper";

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB ~= 12 min of compressed audio
const TMP_DIR = process.env.HEIRLOOM_TMP_DIR ?? "/tmp";

/**
 * POST /api/transcribe
 *
 * multipart/form-data:
 *   audio: a WAV (or any ffmpeg-readable) recording, typically 5–60 seconds
 *
 * Returns: { text: string }
 *
 * Used by the mic affordance attached to every long-form text field -
 * record → upload → drop the transcript back into the input for the
 * user to edit before submitting. Auth-gated, no storage: the temp
 * file is deleted after transcription.
 */
export async function POST(req: Request) {
  try {
    await requireSession();

    // Transcription runs a local whisper.cpp binary — on-device only. The
    // hosted demo has no such sidecar, so refuse cleanly (the mic
    // affordance handles this by falling back to typing) instead of
    // spawning a process that does not exist on serverless.
    if ((await describeProvider()).profile === "hosted-demo") {
      throw new HttpError(400, "transcription_is_on_device_only");
    }

    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) throw new HttpError(400, "missing_audio");
    if (file.size === 0) throw new HttpError(400, "empty_audio");
    if (file.size > MAX_BYTES) throw new HttpError(413, "audio_too_large");

    const id = randomUUID();
    const ext = (file.name.split(".").pop() ?? "wav").replace(/[^a-z0-9]/gi, "").slice(0, 6) || "wav";
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
  } catch (err) {
    return errorResponse(err);
  }
}
