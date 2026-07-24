import argon2 from "argon2";
import { sqlAdmin } from "@/lib/db";
import { HttpError, errorResponse } from "@/lib/auth";
import { normalisePassphrase } from "@/lib/passphrase";

export const dynamic = "force-dynamic";

// In-memory rate limit. A distributed deployment would back this with
// Redis or similar; the single-VM topology lets a Map suffice.
const ATTEMPTS = new Map<string, { count: number; firstAt: number }>();
const MAX_PER_HOUR = 5;
const MAX_LIFETIME = 10;
// The per-IP limit above is keyed on a client-controlled X-Forwarded-For,
// so an attacker rotating that header could sidestep it. A process-wide
// ceiling on failed attempts per rolling hour is the backstop that no
// header trick evades (the passphrase is argon2id over 4 words + 2 digits,
// so this caps online guessing regardless of source IP).
const GLOBAL_MAX_FAILS_PER_HOUR = 200;
let globalFails: { count: number; windowAt: number } = {
  count: 0,
  windowAt: 0,
};
function noteGlobalFailure(now: number): void {
  if (now - globalFails.windowAt > 60 * 60 * 1000) {
    globalFails = { count: 0, windowAt: now };
  }
  globalFails.count += 1;
}

/**
 * POST /api/executor/unlock
 *
 * Body: { vault_email_hint: string, passphrase: string }
 *
 * On success: atomically flips every nominee_releases row on the vault
 * from released_at IS NULL to released_at = now(). Returns a count of
 * pieces that were just released and the vault email hint that matched.
 *
 * No session is required (the executor is, by definition, not logged in).
 * The lookup goes through `sqlAdmin` for the same reason.
 */
export async function POST(req: Request) {
  try {
    if (!sqlAdmin) throw new HttpError(500, "admin_db_unavailable");
    const body = (await req.json()) as {
      vault_email_hint?: string;
      passphrase?: string;
    };
    const hint = (body.vault_email_hint ?? "").trim().toLowerCase();
    const phrase = body.passphrase ?? "";
    if (!hint || !phrase) throw new HttpError(400, "missing_fields");

    // Rate limit by IP, with a process-wide backstop that a spoofed
    // X-Forwarded-For can't evade.
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const now = Date.now();
    if (now - globalFails.windowAt <= 60 * 60 * 1000 &&
        globalFails.count >= GLOBAL_MAX_FAILS_PER_HOUR) {
      throw new HttpError(429, "rate_limited");
    }
    const rec = ATTEMPTS.get(ip);
    if (rec && now - rec.firstAt < 60 * 60 * 1000) {
      if (rec.count >= MAX_PER_HOUR) {
        throw new HttpError(429, "rate_limited");
      }
    } else {
      ATTEMPTS.delete(ip);
    }

    const [cred] = await sqlAdmin<
      {
        vault_id: string;
        nominee_id: string;
        passphrase_hash: string;
        used_count: number;
      }[]
    >`
      SELECT ec.vault_id,
             ec.nominee_id,
             ec.passphrase_hash,
             COALESCE((SELECT CAST(COUNT(*) AS INTEGER) FROM nominee_releases nr
                       WHERE nr.vault_id = ec.vault_id
                         AND nr.released_at IS NOT NULL), 0) AS used_count
      FROM executor_credentials ec
      JOIN vaults v ON v.id = ec.vault_id
      JOIN users  u ON u.id = v.creator_id
      WHERE LOWER(u.email) LIKE ${"%" + hint + "%"}
      LIMIT 1
    `;

    if (!cred) {
      // Constant-ish delay so wrong-passphrase and unknown-creator
      // are indistinguishable from the outside.
      await new Promise((r) => setTimeout(r, 600));
      bumpAttempts(ip);
      throw new HttpError(401, "wrong_credentials");
    }

    const ok = await argon2.verify(
      cred.passphrase_hash,
      normalisePassphrase(phrase),
    );
    if (!ok) {
      bumpAttempts(ip);
      throw new HttpError(401, "wrong_credentials");
    }

    if (cred.used_count >= MAX_LIFETIME) {
      throw new HttpError(423, "credential_locked");
    }

    // Flip every unreleased row on this vault to released_at=now(). A
    // top-level UPDATE ... RETURNING is supported by both Postgres and
    // SQLite (3.35+); a data-modifying CTE (WITH x AS (UPDATE ...)) is
    // Postgres-only and threw "near UPDATE: syntax error" on the desktop
    // engine — the reason the executor release flow failed there.
    const flipped = await sqlAdmin<{ id: string }[]>`
      UPDATE nominee_releases
      SET released_at = now()
      WHERE vault_id = ${cred.vault_id}
        AND released_at IS NULL
      RETURNING id
    `;
    const counts = { released: flipped.length };

    await sqlAdmin`
      UPDATE executor_credentials SET used_at = now() WHERE vault_id = ${cred.vault_id}
    `;

    return Response.json({
      released: counts.released,
      vault_email_hint: hint,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function bumpAttempts(ip: string) {
  const now = Date.now();
  noteGlobalFailure(now);
  const rec = ATTEMPTS.get(ip);
  if (!rec) {
    ATTEMPTS.set(ip, { count: 1, firstAt: now });
  } else {
    rec.count++;
  }
}
