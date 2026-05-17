import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { sql, sqlAdmin } from "@/lib/db";
import {
  errorResponse,
  HttpError,
  issueSession,
  setSessionCookie,
} from "@/lib/auth";
import { generatePassphrase, normalisePassphrase } from "@/lib/passphrase";
import { importVault } from "@/lib/vault-export";

export const dynamic = "force-dynamic";

const MAX_BUNDLE_BYTES = 200 * 1024 * 1024;

/**
 * POST /api/portal/import - mint a fresh creator + vault, replay the
 * uploaded .hloom into it, sign the caller in, return the new local
 * creator passphrase. On decryption failure, the just-created
 * user + vault are removed.
 */
export async function POST(req: Request) {
  try {
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
      // Clean up the half-built archive so the portal isn't littered
      // with empty vaults from failed imports.
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
  } catch (err) {
    return errorResponse(err);
  }
}
