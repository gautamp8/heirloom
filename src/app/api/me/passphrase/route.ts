import argon2 from "argon2";
import { errorResponse, HttpError, requireSession } from "@/lib/auth";
import { asISO, withRls } from "@/lib/db";
import { generatePassphrase, normalisePassphrase } from "@/lib/passphrase";

export const dynamic = "force-dynamic";

/** POST /api/me/passphrase — regenerate the creator's archive key.
 *  Returns the new plaintext once; the old key stops working. */
export async function POST() {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");

    const passphrase = generatePassphrase();
    const passphrase_hash = await argon2.hash(normalisePassphrase(passphrase), {
      type: argon2.argon2id,
    });

    await withRls(session.user_id, session.role, async (tx) => {
      await tx`
        UPDATE users
           SET passphrase_hash = ${passphrase_hash},
               passphrase_set_at = now()
         WHERE id = ${session.user_id}
      `;
    });

    return Response.json({ passphrase });
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET /api/me/passphrase — has one been set? When? */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");

    const row = await withRls(session.user_id, session.role, async (tx) => {
      const [r] = await tx<
        { has_passphrase: boolean; passphrase_set_at: Date | null }[]
      >`
        SELECT (passphrase_hash IS NOT NULL) AS has_passphrase,
               passphrase_set_at
          FROM users WHERE id = ${session.user_id}
      `;
      return r;
    });

    return Response.json({
      has_passphrase: !!row?.has_passphrase,
      passphrase_set_at: asISO(row?.passphrase_set_at ?? null),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
