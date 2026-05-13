import { importVault } from "@/lib/vault-export";
import { errorResponse, HttpError, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BUNDLE_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * POST /api/vault/import
 *
 * multipart/form-data with fields:
 *   file:       the .hloom bundle
 *   passphrase: same one that was used at export time
 *
 * Restores the bundle into the current creator's vault, replacing
 * existing data. Returns { counts } describing what was imported.
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");

    const form = await req.formData();
    const file = form.get("file");
    const passphrase = String(form.get("passphrase") ?? "");
    if (!(file instanceof File)) throw new HttpError(400, "missing_file");
    if (file.size === 0) throw new HttpError(400, "empty_file");
    if (file.size > MAX_BUNDLE_BYTES) throw new HttpError(413, "too_large");
    if (passphrase.length < 6) throw new HttpError(400, "passphrase_too_short");

    const buf = Buffer.from(await file.arrayBuffer());
    const summary = await importVault(buf, passphrase, session);
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("decryption_failed")) {
      return errorResponse(new HttpError(401, "wrong_passphrase"));
    }
    return errorResponse(err);
  }
}
