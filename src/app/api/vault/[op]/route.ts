import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { exportVault, importVault } from "@/lib/vault-export";
import { sql, sqlAdmin } from "@/lib/db";
import {
  errorResponse,
  HttpError,
  issueSession,
  requireSession,
  setSessionCookie,
} from "@/lib/auth";
import { generatePassphrase, normalisePassphrase } from "@/lib/passphrase";

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
 *   POST /api/vault/adopt
 *     multipart/form-data: file (.hloom bundle), passphrase
 *     The portal's "import an existing archive" path: mints a fresh
 *     creator + vault, replays the bundle into it, signs the caller in,
 *     and returns the new local creator passphrase. Unlike the other
 *     two this one is UNAUTHENTICATED by design - it is how someone
 *     with a bundle and its passphrase gets a session in the first
 *     place - so it is handled before the session check below.
 *
 * The three share one route module - and therefore one serverless
 * function - because they pull in an identical dependency graph
 * (argon2 + vault-export) and Vercel's Hobby tier caps a deployment at
 * 12 functions.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ op: string }> },
) {
  const { op } = await ctx.params;
  try {
    // Unauthenticated on purpose - see "adopt" in the doc comment. Kept
    // ahead of requireSession so the session check below can stay
    // unconditional for every other operation.
    if (op === "adopt") return await adoptBundle(req);

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

/**
 * Mint a fresh creator + vault, replay the uploaded .hloom into it,
 * sign the caller in, and return the new local creator passphrase. On
 * decryption failure the just-created user + vault are removed so the
 * portal isn't littered with empty vaults from failed imports.
 */
async function adoptBundle(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const bundlePassphrase = String(form.get("passphrase") ?? "");
  if (!(file instanceof File)) throw new HttpError(400, "missing_file");
  if (file.size === 0) throw new HttpError(400, "empty_file");
  if (file.size > MAX_BUNDLE_BYTES) throw new HttpError(413, "too_large");
  if (bundlePassphrase.length < 6) {
    throw new HttpError(400, "passphrase_too_short");
  }
  const buf = Buffer.from(await file.arrayBuffer());

  const creatorPassphrase = generatePassphrase();
  const passphrase_hash = await argon2.hash(
    normalisePassphrase(creatorPassphrase),
    { type: argon2.argon2id },
  );
  const email = `${randomUUID()}@creator.heirloom.local`;
  const [u] = await sql<{ id: string; email: string; display_name: string }[]>`
    INSERT INTO users (email, display_name, passphrase_hash, passphrase_set_at)
    VALUES (${email}, 'Friend', ${passphrase_hash}, now())
    RETURNING id, email, display_name
  `;
  const [vault] = await sql<{ id: string }[]>`
    INSERT INTO vaults (creator_id, name) VALUES (${u.id}, 'My Archive')
    RETURNING id
  `;

  const session = {
    user_id: u.id,
    vault_id: vault.id,
    role: "creator" as const,
  };

  try {
    await importVault(buf, bundlePassphrase, session);
  } catch (e) {
    if (sqlAdmin) {
      await sqlAdmin`DELETE FROM vaults WHERE id = ${vault.id}`;
      await sqlAdmin`DELETE FROM users WHERE id = ${u.id}`;
    }
    if (e instanceof Error && e.message.startsWith("decryption_failed")) {
      throw new HttpError(401, "wrong_passphrase");
    }
    throw e;
  }

  const jwt = await issueSession(session);
  await setSessionCookie(jwt);

  return Response.json({
    user: { id: u.id, email: u.email, display_name: u.display_name },
    vault_id: vault.id,
    role: "creator",
    passphrase: creatorPassphrase,
  });
}
