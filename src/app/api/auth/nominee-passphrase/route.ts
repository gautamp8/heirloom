import { sqlAdmin } from "@/lib/db";
import {
  HttpError,
  errorResponse,
  issueSession,
  setSessionCookie,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

// Dev-only known passphrase. In production this will be a per-nominee
// argon2id hash stored on the nominee row (tracked in Deferred items).
const DEV_PASSPHRASE = "the long road home";
const NOMINEE_EMAIL = "maya@heirloom.local";

/**
 * POST /api/auth/nominee-passphrase
 *
 * Body: { passphrase: string }
 *
 * On success: issues a nominee session JWT scoped to the creator's vault.
 *
 * Behavior:
 *   - Wrong passphrase → 401 (UI shakes the input, no counter shown)
 *   - Right passphrase + bootstrapped nominee → 200 with session cookie
 *
 * Uses `sqlAdmin` for the cross-RLS lookup of (user, nominee, vault) since
 * the caller does not yet have a session. Once the session is issued,
 * subsequent requests go through `sql` + `withRls()`.
 */
export async function POST(req: Request) {
  try {
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");
    const body = (await req.json()) as { passphrase?: string };
    const phrase = (body.passphrase ?? "").trim().toLowerCase();
    if (!phrase) throw new HttpError(400, "empty_passphrase");

    if (phrase !== DEV_PASSPHRASE) {
      // Constant-ish delay so timing can't distinguish wrong vs. unbootstrapped.
      await new Promise((r) => setTimeout(r, 500));
      throw new HttpError(401, "wrong_passphrase");
    }

    const rows = await sqlAdmin<
      {
        user_id: string;
        nominee_id: string;
        vault_id: string;
        name: string;
        relationship: string | null;
        letter_body: string | null;
      }[]
    >`
      SELECT u.id        AS user_id,
             n.id        AS nominee_id,
             n.vault_id  AS vault_id,
             n.name      AS name,
             n.relationship,
             n.letter_body
      FROM users u
      JOIN nominees n ON n.user_id = u.id
      WHERE u.email = ${NOMINEE_EMAIL}
      ORDER BY n.created_at ASC
      LIMIT 1
    `;
    const n = rows[0];
    if (!n) {
      throw new HttpError(
        409,
        "nominee_not_bootstrapped — POST /api/dev/nominee first",
      );
    }

    const jwt = await issueSession({
      user_id: n.user_id,
      vault_id: n.vault_id,
      role: "nominee",
    });
    await setSessionCookie(jwt);

    return Response.json({
      nominee: {
        id: n.nominee_id,
        name: n.name,
        relationship: n.relationship,
        letter_body: n.letter_body,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
