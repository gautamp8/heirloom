import { sql } from "@/lib/db";
import { errorResponse, issueSession, setSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEV_EMAIL = "creator@heirloom.local";

/**
 * Idempotently provisions the single-creator user + vault and sets a
 * session cookie. Entry point for "Begin a new archive" on `/portal`.
 *
 * The user's display_name starts as "Friend"; onboarding step 1
 * overwrites it with the creator's real name.
 */
export async function POST() {
  try {
    const [user] = await sql<{ id: string; email: string; display_name: string }[]>`
      INSERT INTO users (email, display_name)
      VALUES (${DEV_EMAIL}, 'Friend')
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email, display_name
    `;
    // ON CONFLICT DO NOTHING returns no row when the user already exists,
    // so look them up explicitly. We do NOT overwrite display_name here —
    // if the user has been through onboarding, their real name lives on
    // the row and we want to preserve it.
    const [u] = user
      ? [user]
      : await sql<{ id: string; email: string; display_name: string }[]>`
          SELECT id, email, display_name FROM users WHERE email = ${DEV_EMAIL}
        `;

    const existing = await sql<{ id: string }[]>`
      SELECT id FROM vaults WHERE creator_id = ${u.id} LIMIT 1
    `;
    const vaultId =
      existing[0]?.id ??
      (
        await sql<{ id: string }[]>`
          INSERT INTO vaults (creator_id, name) VALUES (${u.id}, 'My Archive')
          RETURNING id
        `
      )[0].id;

    const jwt = await issueSession({
      user_id: u.id,
      vault_id: vaultId,
      role: "creator",
    });
    await setSessionCookie(jwt);

    return Response.json({
      user: { id: u.id, email: u.email, display_name: u.display_name },
      vault_id: vaultId,
      role: "creator",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
