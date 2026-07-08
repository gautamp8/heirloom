import path from "node:path";
import { sqlAdmin } from "@/lib/db";
import { describeProvider } from "@/lib/provider";

export const dynamic = "force-dynamic";
// Re-seeding computes ~50 Azure embeddings + a few vision captions
// sequentially, so give the nightly job generous room.
export const maxDuration = 300;

/**
 * POST/GET /api/cron/reset-demo
 *
 * Restores the pristine Sagan archive on the public hosted demo: wipes
 * every vault/user/submission and re-imports the seed under the running
 * (hosted-demo/Azure) provider so embeddings match query time. The
 * server-side equivalent of infra/reset-demo.sh, driven by Vercel Cron.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Refused
 * unless CRON_SECRET is set and matches, and only on the hosted-demo
 * profile (never wipe a real local/VM archive by accident).
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

  // Wipe submissions. users/vaults CASCADE to captures, reflections,
  // nominees, releases, etc.; app_settings is instance config and survives.
  // blob_objects holds the bytea media and is re-populated by the seed.
  await sqlAdmin`TRUNCATE users CASCADE`;
  await sqlAdmin`TRUNCATE blob_objects`;

  // Re-import the bundled Sagan seed (traced into the function via
  // outputFileTracingIncludes in next.config.ts).
  const { importSeedArchive } = await import(
    "../../../../../desktop/scripts/import-seed-archive"
  );
  const seedDir = path.join(process.cwd(), "desktop/seed-archives/sagan");
  const result = await importSeedArchive(seedDir);

  return Response.json({ ok: true, reseeded: true, ...result });
}

export async function POST(req: Request) {
  return handle(req);
}

// Vercel Cron issues GET by default.
export async function GET(req: Request) {
  return handle(req);
}
