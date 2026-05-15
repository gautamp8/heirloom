import { exportVault } from "@/lib/vault-export";
import { errorResponse, HttpError, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/vault/export
 *
 * Body: { passphrase: string }
 *
 * Returns an application/octet-stream attachment - the encrypted .hloom
 * bundle. The passphrase is used immediately to derive the encryption key
 * and is never persisted.
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    const body = (await req.json()) as { passphrase?: string };
    const passphrase = (body.passphrase ?? "").trim();
    if (passphrase.length < 6) throw new HttpError(400, "passphrase_too_short");

    const { bytes, filename } = await exportVault(session, passphrase);

    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-length": String(bytes.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
