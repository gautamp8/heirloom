import { withRls } from "@/lib/db";
import { extensionFromBlobUrl, mimeForExtension, readBlob } from "@/lib/storage";
import { errorResponse, HttpError, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/blob/[id]
 *
 * Streams the original media blob for a capture. RLS-gated through
 * the captures SELECT policy - creators see their own; nominees see
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

    let data: Buffer;
    try {
      data = await readBlob(row.blob_url);
    } catch {
      throw new HttpError(404, "missing_file");
    }
    const mime = mimeForExtension(extensionFromBlobUrl(row.blob_url));

    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": mime,
        "content-length": String(data.length),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
