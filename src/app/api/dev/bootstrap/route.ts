import { sql } from "@/lib/db";
import {
  HttpError,
  errorResponse,
  issueSession,
  setSessionCookie,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEV_EMAIL = "creator@heirloom.local";
const DEV_NAME = "Elena";

/**
 * Dev-only shortcut: idempotently provisions a creator user + vault and
 * sets a session cookie. Use only when NODE_ENV !== "production".
 *
 * POST  → ensures user + vault exist, sets cookie, returns the session payload.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return errorResponse(new HttpError(404, "not_found"));
  }
  try {
    const [user] = await sql<{ id: string; email: string; display_name: string }[]>`
      INSERT INTO users (email, display_name)
      VALUES (${DEV_EMAIL}, ${DEV_NAME})
      ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id, email, display_name
    `;

    const existing = await sql<{ id: string }[]>`
      SELECT id FROM vaults WHERE creator_id = ${user.id} LIMIT 1
    `;
    const vaultId =
      existing[0]?.id ??
      (
        await sql<{ id: string }[]>`
          INSERT INTO vaults (creator_id, name) VALUES (${user.id}, 'My Archive')
          RETURNING id
        `
      )[0].id;

    const jwt = await issueSession({
      user_id: user.id,
      vault_id: vaultId,
      role: "creator",
    });
    await setSessionCookie(jwt);

    return Response.json({
      user: { id: user.id, email: user.email, display_name: user.display_name },
      vault_id: vaultId,
      role: "creator",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
