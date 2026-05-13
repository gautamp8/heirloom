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

// Dev shortcut — kept for the existing demo flow (the `/welcome` envelope
// still expects this exact phrase). Real per-nominee passphrases generated
// during onboarding are checked first.
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
 * Auth flow:
 *   1. Iterate all nominees with a passphrase_hash and argon2id-verify.
 *      First match wins.
 *   2. If no real hash matches, fall back to the dev passphrase
 *      "the long road home" which unlocks the bootstrap-seeded Maya.
 *   3. Issue a session JWT scoped to that nominee's vault.
 *
 * Verification is constant-time-ish: we always sleep for a moment after a
 * failure so timing can't distinguish wrong-from-unbootstrapped.
 */
export async function POST(req: Request) {
  try {
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");
    const body = (await req.json()) as { passphrase?: string };
    const raw = (body.passphrase ?? "").trim();
    if (!raw) throw new HttpError(400, "empty_passphrase");
    const normalised = normalisePassphrase(raw);

    const rows = await sqlAdmin<Row[]>`
      SELECT n.user_id, n.id AS nominee_id, n.vault_id, n.name, n.relationship,
             n.letter_body, n.passphrase_hash, n.email
        FROM nominees n
       ORDER BY n.created_at ASC
    `;

    // 1) Try the real per-nominee hashes first.
    let match: Row | null = null;
    for (const r of rows) {
      if (!r.passphrase_hash) continue;
      try {
        const ok = await argon2.verify(r.passphrase_hash, normalised);
        if (ok) {
          match = r;
          break;
        }
      } catch {
        /* malformed hash — skip */
      }
    }

    // 2) Dev fallback — first nominee with an existing user_id (legacy
    //    bootstrap path) accepts "the long road home".
    if (!match && normalised === DEV_PASSPHRASE_NORMALISED) {
      match = rows.find((r) => r.user_id) ?? null;
    }

    if (!match) {
      await new Promise((r) => setTimeout(r, 500));
      throw new HttpError(401, "wrong_passphrase");
    }

    // 3) Ensure the nominee has a backing user row. The onboarding flow
    //    creates the nominee BEFORE there's a real user account; on first
    //    unlock we lazily mint one tied to the nominee.
    let userId = match.user_id;
    if (!userId) {
      const email =
        match.email && match.email.trim().length > 0
          ? match.email.trim()
          : `${match.nominee_id}@nominee.heirloom.local`;
      const [user] = await sqlAdmin<{ id: string }[]>`
        INSERT INTO users (email, display_name)
        VALUES (${email}, ${match.name})
        ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
        RETURNING id
      `;
      await sqlAdmin`
        UPDATE nominees SET user_id = ${user.id} WHERE id = ${match.nominee_id}
      `;
      userId = user.id;
    }

    const jwt = await issueSession({
      user_id: userId,
      vault_id: match.vault_id,
      role: "nominee",
    });
    await setSessionCookie(jwt);

    return Response.json({
      nominee: {
        id: match.nominee_id,
        name: match.name,
        relationship: match.relationship,
        letter_body: match.letter_body,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
