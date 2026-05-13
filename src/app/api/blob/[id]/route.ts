import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { withRls } from "@/lib/db";
import { resolveBlob } from "@/lib/storage";
import { errorResponse, HttpError, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

/**
 * GET /api/blob/[id]
 *
 * Streams the original media blob for a capture. RLS-gated through
 * the captures SELECT policy — creators see their own; nominees see
 * only captures where their nominee_releases row is released.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;

    const row = await withRls(session.user_id, session.role, async (tx) => {
      const [r] = await tx<{ blob_url: string | null }[]>`
        SELECT blob_url FROM captures WHERE id = ${id}
      `;
      return r;
    });
    if (!row?.blob_url) throw new HttpError(404, "not_found");

    const abs = resolveBlob(row.blob_url);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      throw new HttpError(404, "missing_file");
    }
    const data = readFileSync(abs);
    const ext = extname(abs).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";

    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": mime,
        "content-length": String(stat.size),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
