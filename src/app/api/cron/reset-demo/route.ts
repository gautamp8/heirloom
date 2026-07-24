import { sqlAdmin } from "@/lib/db";
import { describeProvider } from "@/lib/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The seeded demo creator. Everything owned by this account is the pristine
// Sagan archive and is kept; everything else is a public submission and is
// wiped. Derived from the seed manifest name ("Carl Sagan" -> slug), with an
// env override in case the seed identity ever changes.
const SEED_EMAIL =
  process.env.HEIRLOOM_DEMO_SEED_EMAIL ?? "carl-sagan@heirloom.local";

/**
 * POST/GET /api/cron/reset-demo
 *
 * Restores the pristine public demo by removing everything visitors created
 * since the last reset — their "begin a new archive" vaults and their
 * reflections on the Sagan archive — while keeping the seeded Sagan vault
 * itself intact. A selective delete rather than a truncate + re-seed: the
 * seed is imported once (off-Vercel, with its media + Azure embeddings), so
 * the nightly job needs no seed files and no model calls, which makes it
 * fast and reliable on serverless.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "cron_secret_unset" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if ((await describeProvider()).profile !== "hosted-demo") {
    return Response.json({ error: "hosted_demo_only" }, { status: 403 });
  }
  if (!sqlAdmin) {
    return Response.json({ error: "admin_db_unavailable" }, { status: 500 });
  }

  // Guard: if the seed account is somehow missing, do nothing rather than
  // wipe an unseeded database blank.
  const [seed] = await sqlAdmin<{ id: string }[]>`
    SELECT id FROM users WHERE email = ${SEED_EMAIL} LIMIT 1
  `;
  if (!seed) {
    return Response.json({ error: "seed_account_missing" }, { status: 409 });
  }

  // 1. Drop every archive not owned by the seed creator (public "begin a new
  //    archive" vaults). CASCADE clears their captures, nominees, releases,
  //    reflections, etc.
  const vaults = await sqlAdmin`
    DELETE FROM vaults WHERE creator_id <> ${seed.id}
  `;
  // 2. Clear the public Q&A on the demo vault (the transparency-page log).
  const reflections = await sqlAdmin`
    DELETE FROM reflections
     WHERE vault_id IN (SELECT id FROM vaults WHERE creator_id = ${seed.id})
  `;
  // 3. Remove now-orphaned visitor users (creators of the deleted vaults).
  //    Keep the seed creator and the shared nominee "You" user.
  const users = await sqlAdmin`
    DELETE FROM users u
     WHERE u.email <> ${SEED_EMAIL}
       AND NOT EXISTS (SELECT 1 FROM vaults v WHERE v.creator_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM nominees n WHERE n.user_id = u.id)
  `;

  // 4. Sweep spent rate-limit buckets. Each window is its own row, so the
  //    table only grows; drop anything older than a day (windows are
  //    minutes long, so nothing live is ever touched). Tolerate the table
  //    not existing yet on an un-migrated deployment.
  let rateLimits = { count: 0 };
  try {
    rateLimits = await sqlAdmin`
      DELETE FROM rate_limits WHERE created_at < now() - interval '1 day'
    `;
  } catch {
    /* table not present yet — nothing to sweep */
  }

  return Response.json({
    ok: true,
    cleared: {
      public_vaults: vaults.count,
      reflections: reflections.count,
      orphan_users: users.count,
      rate_limits: rateLimits.count,
    },
  });
}

export async function POST(req: Request) {
  return handle(req);
}

// Vercel Cron issues GET.
export async function GET(req: Request) {
  return handle(req);
}
