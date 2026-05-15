import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import {
  errorResponse,
  issueSession,
  readSession,
  setSessionCookie,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/bootstrap — entry point for "Begin a new archive".
 *
 * If the caller already has a valid creator session, return it
 * unchanged. Otherwise provision a fresh user + vault and issue
 * a session cookie. Multiple creators can coexist in one database;
 * each onboarding flow overwrites the placeholder display_name with
 * the creator's real name.
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
        });
      }
    }

    const email = `${randomUUID()}@creator.heirloom.local`;
    const [u] = await sql<{ id: string; email: string; display_name: string }[]>`
      INSERT INTO users (email, display_name)
      VALUES (${email}, 'Friend')
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
    });
  } catch (err) {
    return errorResponse(err);
  }
}
