import { sqlAdmin } from "@/lib/db";
import {
  HttpError,
  errorResponse,
  devFixturesAllowed,
  issueSession,
  setSessionCookie,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const NOMINEE_EMAIL = "maya@heirloom.local";
const NOMINEE_NAME = "Maya";
const NOMINEE_RELATIONSHIP = "Daughter";
const LETTER_BODY = `Maya - there is something here for you.

Take your time with this. There is no rush, and nothing in here is going
anywhere. Read what you want to read, listen to what you want to listen to.
Skip what doesn't feel right. Come back to it later.

I love you.

- Elena`;

/**
 * Dev-only nominee bootstrap. Provisions a nominee user, attaches them to
 * Elena's vault, marks every existing capture in that vault as released to
 * them, and issues a nominee session cookie.
 *
 * Idempotent - safe to POST repeatedly.
 *
 * Uses `sqlAdmin` because the cross-table set-up touches RLS-policied
 * tables before any user session exists.
 */
export async function POST() {
  if (!devFixturesAllowed()) {
    return errorResponse(new HttpError(404, "not_found"));
  }
  try {
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");
    // Pick the most recently created creator vault. The dev nominee
    // surface targets whichever archive was bootstrapped last.
    const [vault] = await sqlAdmin<{ id: string }[]>`
      SELECT id FROM vaults ORDER BY created_at DESC LIMIT 1
    `;
    if (!vault) {
      throw new HttpError(
        409,
        "creator_not_bootstrapped - POST /api/dev/bootstrap first",
      );
    }

    const [nomineeUser] = await sqlAdmin<
      { id: string; email: string; display_name: string }[]
    >`
      INSERT INTO users (email, display_name)
      VALUES (${NOMINEE_EMAIL}, ${NOMINEE_NAME})
      ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id, email, display_name
    `;

    const existing = await sqlAdmin<{ id: string }[]>`
      SELECT id FROM nominees
      WHERE vault_id = ${vault.id} AND user_id = ${nomineeUser.id} LIMIT 1
    `;
    const nomineeId =
      existing[0]?.id ??
      (
        await sqlAdmin<{ id: string }[]>`
          INSERT INTO nominees
            (vault_id, user_id, name, relationship, email, role, letter_body)
          VALUES (${vault.id}, ${nomineeUser.id}, ${NOMINEE_NAME},
                  ${NOMINEE_RELATIONSHIP}, ${NOMINEE_EMAIL}, 'recipient',
                  ${LETTER_BODY})
          RETURNING id
        `
      )[0].id;

    const captures = await sqlAdmin<{ id: string }[]>`
      SELECT id FROM captures WHERE vault_id = ${vault.id} AND status = 'ready'
    `;
    let newlyReleased = 0;
    for (const cap of captures) {
      const existsRelease = await sqlAdmin<{ id: string }[]>`
        SELECT id FROM nominee_releases
        WHERE nominee_id = ${nomineeId} AND capture_id = ${cap.id} LIMIT 1
      `;
      if (existsRelease[0]) continue;
      await sqlAdmin`
        INSERT INTO nominee_releases
          (nominee_id, vault_id, capture_id, trigger, released_at, label)
        VALUES (${nomineeId}, ${vault.id}, ${cap.id}, 'scheduled', now(),
                'released for development')
      `;
      newlyReleased++;
    }

    const jwt = await issueSession({
      user_id: nomineeUser.id,
      vault_id: vault.id,
      role: "nominee",
    });
    await setSessionCookie(jwt);

    return Response.json({
      nominee: {
        id: nomineeId,
        user_id: nomineeUser.id,
        name: NOMINEE_NAME,
        relationship: NOMINEE_RELATIONSHIP,
      },
      releases: { total: captures.length, newly_released: newlyReleased },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
