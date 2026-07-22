/**
 * Re-embed every vector in a vault (or all vaults) with the currently
 * configured embedding provider, then restamp the vault's embedding
 * metadata. Needed whenever the embedder changes — e.g. importing a seed
 * archive built with Azure embeddings into a local install, or switching
 * BYOK embeddings on/off.
 *
 *   pnpm tsx scripts/reindex-embeddings.ts            # all vaults
 *   pnpm tsx scripts/reindex-embeddings.ts --vault <uuid>
 *
 * Respects the same env as the app: HEIRLOOM_BACKEND / DATABASE_URL /
 * OLLAMA_* / HEIRLOOM_PROVIDER_PROFILE / AZURE_OPENAI_*. Reads BYOK
 * settings from app_settings like the running app does.
 *
 * What gets re-embedded, mirroring the write-time source text exactly:
 *   transcript_chunks.embedding      ← chunk text
 *   life_events.embedding            ← "label. description"      (onboarding.ts)
 *   sealed_letters.intent_embedding  ← "occasion. trigger_hint"  (onboarding.ts)
 *   nominee_states.state_embedding   ← state_label
 *   reflections.question_embedding   → NULLed (historical diagnostics only;
 *                                      not worth paying to re-embed)
 */

async function main() {
  const { sqlAdmin } = await import("../src/lib/db");
  const { embedAll } = await import("../src/lib/embed");
  const { embeddingIdentity } = await import("../src/lib/provider");
  const { vec } = await import("../src/lib/db");

  if (!sqlAdmin) {
    console.error("reindex: needs DATABASE_ADMIN_URL (or sqlite backend)");
    process.exit(1);
  }
  const sql = sqlAdmin;

  const vaultArgIdx = process.argv.indexOf("--vault");
  const onlyVault = vaultArgIdx > -1 ? process.argv[vaultArgIdx + 1] : null;

  const identity = await embeddingIdentity();
  console.log(`reindex: target embedder ${identity}`);

  const vaults = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM vaults
    ${onlyVault ? sql`WHERE id = ${onlyVault}` : sql``}`;
  if (vaults.length === 0) {
    console.error("reindex: no matching vaults");
    process.exit(1);
  }

  const BATCH = 16;

  for (const vault of vaults) {
    console.log(`\nvault ${vault.id} (${vault.name})`);

    // 1. transcript chunks
    const chunks = await sql<{ id: string; text: string }[]>`
      SELECT id, text FROM transcript_chunks WHERE vault_id = ${vault.id}`;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const vectors = await embedAll(batch.map((c) => c.text));
      for (let j = 0; j < batch.length; j++) {
        await sql`UPDATE transcript_chunks
                  SET embedding = ${vec(vectors[j])}
                  WHERE id = ${batch[j].id}`;
      }
      console.log(`  chunks ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
    }

    // 2. life events — same "label. description" text as onboarding
    const events = await sql<
      { id: string; label: string; description: string | null }[]
    >`SELECT id, label, description FROM life_events WHERE vault_id = ${vault.id}`;
    for (const e of events) {
      const text = [e.label, e.description].filter(Boolean).join(". ");
      if (!text) continue;
      const [v] = await embedAll([text]);
      await sql`UPDATE life_events SET embedding = ${vec(v)} WHERE id = ${e.id}`;
    }
    if (events.length) console.log(`  life_events ${events.length}`);

    // 3. sealed letter intents — "occasion. trigger_hint" (hint lives in
    //    conditions[].topic; fall back to occasion alone when absent)
    const letters = await sql<
      { id: string; occasion_prompt: string; conditions: unknown }[]
    >`SELECT id, occasion_prompt, conditions FROM sealed_letters WHERE vault_id = ${vault.id}`;
    for (const l of letters) {
      let hint = "";
      try {
        const conds =
          typeof l.conditions === "string"
            ? JSON.parse(l.conditions)
            : l.conditions;
        const arr = Array.isArray(conds) ? conds : (conds?.any_of ?? []);
        hint =
          arr.find(
            (c: { kind?: string; topic?: string }) =>
              c?.kind === "semantic_match" && c?.topic,
          )?.topic ?? "";
      } catch {
        /* keep hint empty */
      }
      const text = hint ? `${l.occasion_prompt}. ${hint}` : l.occasion_prompt;
      const [v] = await embedAll([text]);
      await sql`UPDATE sealed_letters SET intent_embedding = ${vec(v)} WHERE id = ${l.id}`;
    }
    if (letters.length) console.log(`  sealed_letters ${letters.length}`);

    // 4. nominee states
    const states = await sql<{ id: string; state_label: string }[]>`
      SELECT id, state_label FROM nominee_states WHERE vault_id = ${vault.id}`;
    for (const st of states) {
      const [v] = await embedAll([st.state_label]);
      await sql`UPDATE nominee_states SET state_embedding = ${vec(v)} WHERE id = ${st.id}`;
    }
    if (states.length) console.log(`  nominee_states ${states.length}`);

    // 5. historical reflection questions: drop rather than re-pay
    await sql`UPDATE reflections SET question_embedding = NULL
              WHERE vault_id = ${vault.id}`;

    // 6. restamp
    const meta = { identity, stamped_at: new Date().toISOString() };
    await sql`UPDATE vaults SET embedding_meta = ${JSON.stringify(meta)}
              WHERE id = ${vault.id}`;
    console.log(`  stamped ${identity}`);
  }

  console.log("\nreindex complete");
  process.exit(0);
}

main().catch((e) => {
  console.error("reindex failed:", e);
  process.exit(1);
});
