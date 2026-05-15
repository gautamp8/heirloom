import argon2 from "argon2";
import { sqlAdmin } from "@/lib/db";
import { normalisePassphrase } from "@/lib/passphrase";
import {
  HttpError,
  errorResponse,
  issueSession,
  setSessionCookie,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

// Dev shortcut - the `/welcome` envelope accepts this exact phrase as a
// fallback so a fresh fixture nominee can be unlocked without onboarding.
// Real per-nominee passphrases are checked first.
const DEV_PASSPHRASE_NORMALISED = "the long road home";

type Row = {
  user_id: string | null;
  nominee_id: string;
  vault_id: string;
  name: string;
  relationship: string | null;
  letter_body: string | null;
  passphrase_hash: string | null;
  email: string | null;
};

/**
 * POST /api/auth/nominee-passphrase
 *
 * Body: { passphrase: string }
 *
 * Accepts either a nominee passphrase (opens that nominee's view of a
 * creator's vault) or a creator passphrase (opens the creator's own
 * archive). Nominees are tried first so the envelope animation in
 * /welcome can play when there's a sealed letter to read.
 */
export async function POST(req: Request) {
  try {
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");
    const body = (await req.json()) as { passphrase?: string };
    const raw = (body.passphrase ?? "").trim();
    if (!raw) throw new HttpError(400, "empty_passphrase");
    const normalised = normalisePassphrase(raw);

    const nomineeRows = await sqlAdmin<Row[]>`
      SELECT n.user_id, n.id AS nominee_id, n.vault_id, n.name, n.relationship,
             n.letter_body, n.passphrase_hash, n.email
        FROM nominees n
       WHERE n.passphrase_hash IS NOT NULL
       ORDER BY n.created_at ASC
    `;

    let nomineeMatch: Row | null = null;
    for (const r of nomineeRows) {
      try {
        if (await argon2.verify(r.passphrase_hash!, normalised)) {
          nomineeMatch = r;
          break;
        }
      } catch {
        /* malformed hash - skip */
      }
    }

    if (!nomineeMatch && normalised === DEV_PASSPHRASE_NORMALISED) {
      nomineeMatch = nomineeRows.find((r) => r.user_id) ?? null;
    }

    if (nomineeMatch) {
      let userId = nomineeMatch.user_id;
      if (!userId) {
        const email =
          nomineeMatch.email && nomineeMatch.email.trim().length > 0
            ? nomineeMatch.email.trim()
            : `${nomineeMatch.nominee_id}@nominee.heirloom.local`;
        const [user] = await sqlAdmin<{ id: string }[]>`
          INSERT INTO users (email, display_name)
          VALUES (${email}, ${nomineeMatch.name})
          ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
          RETURNING id
        `;
        await sqlAdmin`
          UPDATE nominees SET user_id = ${user.id} WHERE id = ${nomineeMatch.nominee_id}
        `;
        userId = user.id;
      }

      const jwt = await issueSession({
        user_id: userId,
        vault_id: nomineeMatch.vault_id,
        role: "nominee",
      });
      await setSessionCookie(jwt);

      return Response.json({
        role: "nominee",
        nominee: {
          id: nomineeMatch.nominee_id,
          name: nomineeMatch.name,
          relationship: nomineeMatch.relationship,
          letter_body: nomineeMatch.letter_body,
        },
      });
    }

    // No nominee matched; try creator passphrases.
    const creatorRows = await sqlAdmin<
      {
        user_id: string;
        display_name: string;
        passphrase_hash: string;
        vault_id: string;
      }[]
    >`
      SELECT u.id AS user_id, u.display_name, u.passphrase_hash, v.id AS vault_id
        FROM users u
        JOIN vaults v ON v.creator_id = u.id
       WHERE u.passphrase_hash IS NOT NULL
       ORDER BY u.created_at ASC
    `;

    for (const r of creatorRows) {
      try {
        if (await argon2.verify(r.passphrase_hash, normalised)) {
          const jwt = await issueSession({
            user_id: r.user_id,
            vault_id: r.vault_id,
            role: "creator",
          });
          await setSessionCookie(jwt);
          return Response.json({
            role: "creator",
            creator: { id: r.user_id, name: r.display_name },
          });
        }
      } catch {
        /* malformed hash - skip */
      }
    }

    await new Promise((r) => setTimeout(r, 500));
    throw new HttpError(401, "wrong_passphrase");
  } catch (err) {
    return errorResponse(err);
  }
}
