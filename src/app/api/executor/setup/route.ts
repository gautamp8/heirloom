import argon2 from "argon2";
import { withRls, sqlAdmin } from "@/lib/db";
import { HttpError, errorResponse, requireSession } from "@/lib/auth";
import { generatePassphrase, normalisePassphrase } from "@/lib/passphrase";

export const dynamic = "force-dynamic";

/**
 * POST /api/executor/setup
 *
 * Creator only. Generates a four-word + 2-digit passphrase, argon2id-hashes
 * it, persists into `executor_credentials`, and returns the *plaintext*
 * passphrase one time so the creator can copy or print it. After this
 * response the plaintext is unrecoverable.
 *
 * Body: { nominee_id?: string }  — if omitted, picks the first executor
 *                                  nominee on the vault; if none exists,
 *                                  errors and asks the creator to designate
 *                                  one first.
 *
 * Response:
 *   { passphrase: string,         // plaintext, ONE-TIME
 *     letter_body: string,        // suggested printable letter
 *     credential_id: string }
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "creator") throw new HttpError(403, "creator_only");
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");

    const body = (await req.json().catch(() => ({}))) as {
      nominee_id?: string;
    };

    // Find an executor nominee on this vault, or fall back to first nominee.
    const nominee = await withRls(session.user_id, session.role, async (tx) => {
      if (body.nominee_id) {
        const [row] = await tx<{ id: string; name: string }[]>`
          SELECT id, name FROM nominees
          WHERE id = ${body.nominee_id} AND vault_id = ${session.vault_id}
        `;
        return row;
      }
      const [row] = await tx<{ id: string; name: string }[]>`
        SELECT id, name FROM nominees
        WHERE vault_id = ${session.vault_id}
        ORDER BY (role = 'executor') DESC, created_at ASC
        LIMIT 1
      `;
      return row;
    });
    if (!nominee) {
      throw new HttpError(409, "no_nominee_designate_one_first");
    }

    // Generate + hash the passphrase
    const passphrase = generatePassphrase();
    const hash = await argon2.hash(normalisePassphrase(passphrase), {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 4,
    });

    // Persist — replaces any prior credential on this vault (one_per_vault constraint)
    const credential = await sqlAdmin<{ vault_id: string }[]>`
      INSERT INTO executor_credentials (vault_id, nominee_id, passphrase_hash)
      VALUES (${session.vault_id}, ${nominee.id}, ${hash})
      ON CONFLICT (vault_id) DO UPDATE
        SET passphrase_hash = EXCLUDED.passphrase_hash,
            nominee_id      = EXCLUDED.nominee_id,
            used_at         = NULL,
            created_at      = now()
      RETURNING vault_id
    `;

    const letter_body = buildLetterBody(nominee.name, passphrase);

    return Response.json({
      passphrase,
      letter_body,
      credential_id: credential[0].vault_id,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function buildLetterBody(executorName: string, passphrase: string): string {
  return `${executorName},

If you are reading this, the archive needs to be opened. Take your time.

Visit:  heirloom.local/executor/unlock

Enter this passphrase exactly as written below (the dots are just separators):

    ${passphrase}

That will release everything the creator chose to share with their nominees.
You won't see the contents yourself — only the confirmation that release
has happened.

Thank you.`;
}
