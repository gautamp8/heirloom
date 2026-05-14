import postgres from "postgres";
import { syncIdentityIndexAdmin } from "../../src/lib/identity-index";

async function main() {
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_ADMIN_URL not set");
    process.exit(1);
  }
  const sql = postgres(url, { max: 4, transform: { undefined: null } });
  const vaultId = process.argv[2];
  if (!vaultId) {
    console.error("usage: tsx backfill-identity.ts <vault_id>");
    process.exit(1);
  }
  const r = await syncIdentityIndexAdmin(sql, vaultId);
  console.log(JSON.stringify(r));
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
