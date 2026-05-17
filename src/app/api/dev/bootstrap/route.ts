import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { sql } from "@/lib/db";
import {
  errorResponse,
  issueSession,
  readSession,
  setSessionCookie,
} from "@/lib/auth";
import { generatePassphrase, normalisePassphrase } from "@/lib/passphrase";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/bootstrap - entry point for "Begin a new archive".
 *
 * If the caller already has a creator session, return it unchanged.
 * Otherwise mint a fresh user + vault, generate a creator passphrase
 * (shown once - the creator writes it down to come back to this
 * archive after signing out), and issue a session cookie.
 */
export async function POST() {
  try {
    const existing = await readSession();
    if (existing?.role === "creator") {
      const [u] = await sql<{ id: string; email: string; display_name: string }[]>`
        SELECT id, email, display_name FROM users WHERE id = ${existing.user_id}
      `;
      if (u) {
        return Response.json({
          user: { id: u.id, email: u.email, display_name: u.display_name },
          vault_id: existing.vault_id,
          role: "creator",
          passphrase: null,
        });
      }
    }

    const passphrase = generatePassphrase();
    const passphrase_hash = await argon2.hash(normalisePassphrase(passphrase), {
      type: argon2.argon2id,
    });
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

    const jwt = await issueSession({
      user_id: u.id,
      vault_id: vault.id,
      role: "creator",
    });
    await setSessionCookie(jwt);

    return Response.json({
      user: { id: u.id, email: u.email, display_name: u.display_name },
      vault_id: vault.id,
      role: "creator",
      passphrase,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
