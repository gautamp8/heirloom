import { exportVault, importVault } from "@/lib/vault-export";
import { errorResponse, HttpError, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BUNDLE_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * The two halves of the .hloom round-trip:
 *
 *   POST /api/vault/export
 *     Body: { passphrase }
 *     Returns an application/octet-stream attachment - the encrypted
 *     .hloom bundle. The passphrase derives the key and is never stored.
 *
 *   POST /api/vault/import
 *     multipart/form-data: file (.hloom bundle), passphrase
 *     Restores the bundle into the current creator's vault, replacing
 *     existing data. Returns { counts } describing what was imported.
 *
 * They share one route module - and therefore one serverless function -
 * because they pull in an identical dependency graph (argon2 +
 * vault-export) and Vercel's Hobby tier caps a deployment at 12
 * functions. The public URLs are unchanged by the merge.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ op: string }> },
) {
  const { op } = await ctx.params;
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");

    if (op === "export") {
      const body = (await req.json()) as { passphrase?: string };
      const passphrase = (body.passphrase ?? "").trim();
      if (passphrase.length < 6) {
        throw new HttpError(400, "passphrase_too_short");
      }

      const { bytes, filename } = await exportVault(session, passphrase);

      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${filename}"`,
          "content-length": String(bytes.byteLength),
          "cache-control": "no-store",
        },
      });
    }

    if (op === "import") {
      const form = await req.formData();
      const file = form.get("file");
      const passphrase = String(form.get("passphrase") ?? "");
      if (!(file instanceof File)) throw new HttpError(400, "missing_file");
      if (file.size === 0) throw new HttpError(400, "empty_file");
      if (file.size > MAX_BUNDLE_BYTES) throw new HttpError(413, "too_large");
      if (passphrase.length < 6) {
        throw new HttpError(400, "passphrase_too_short");
      }

      const buf = Buffer.from(await file.arrayBuffer());
      const summary = await importVault(buf, passphrase, session);
      return Response.json({ ok: true, ...summary });
    }

    throw new HttpError(404, "not_found");
  } catch (err) {
    if (
      op === "import" &&
      err instanceof Error &&
      err.message.startsWith("decryption_failed")
    ) {
      return errorResponse(new HttpError(401, "wrong_passphrase"));
    }
    return errorResponse(err);
  }
}
