import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  seedVault,
  setupSqlite,
  unitVec,
  vecWithSimilarity,
} from "../helpers/db";

// Backend is frozen at import time, so the sqlite env must be set (via
// setupSqlite) before @/lib/db loads — hence top-level await, no static
// import of the db module.
const db = await setupSqlite();
const { sql, vec, cosineDist, cosineSim, asISO } = db;

async function insertChunk(
  vault_id: string,
  embedding: number[],
  label: string,
) {
  const capture_id = randomUUID();
  await sql`INSERT INTO captures (id, vault_id, kind, status)
            VALUES (${capture_id}, ${vault_id}, ${"note"}, ${"ready"})`;
  const chunk_id = randomUUID();
  await sql`INSERT INTO transcript_chunks
              (id, capture_id, vault_id, chunk_index, text, embedding)
            VALUES (${chunk_id}, ${capture_id}, ${vault_id}, ${0}, ${label}, ${vec(embedding)})`;
  return { capture_id, chunk_id };
}

describe("vec() blob round-trip", () => {
  it("stores a 768-dim vector as Float32LE and decodes back exactly", async () => {
    const { vault_id } = await seedVault(sql);
    // Quarter-steps are exactly representable in float32, so the
    // round-trip can be asserted with strict equality.
    const arr = Array.from({ length: 768 }, (_, i) => i * 0.25 - 96);
    const { chunk_id } = await insertChunk(vault_id, arr, "roundtrip");

    const rows = await sql<{ embedding: Buffer }[]>`
      SELECT embedding FROM transcript_chunks WHERE id = ${chunk_id}`;
    expect(rows).toHaveLength(1);
    const buf = rows[0].embedding;
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(768 * 4);
    const decoded = Array.from({ length: 768 }, (_, i) =>
      buf.readFloatLE(i * 4),
    );
    expect(decoded).toEqual(arr);
  });
});

describe("cosineSim / cosineDist through real SELECTs", () => {
  it("computes similarity and orders by distance", async () => {
    const { vault_id } = await seedVault(sql);
    await insertChunk(vault_id, unitVec(0), "identical");
    await insertChunk(vault_id, unitVec(1), "orthogonal");
    await insertChunk(vault_id, vecWithSimilarity(0, 1, 0.42), "blended");

    const query = unitVec(0);
    const rows = await sql<{ text: string; sim: number }[]>`
      SELECT text, ${cosineSim("embedding", query)} AS sim
      FROM transcript_chunks
      WHERE vault_id = ${vault_id}
      ORDER BY ${cosineDist("embedding", query)} ASC`;

    expect(rows.map((r) => r.text)).toEqual([
      "identical",
      "blended",
      "orthogonal",
    ]);
    expect(rows[0].sim).toBeCloseTo(1.0, 5);
    expect(rows[1].sim).toBeCloseTo(0.42, 5);
    expect(rows[2].sim).toBeCloseTo(0, 5);
  });

  it("distance of a vector to itself is ~0", async () => {
    const { vault_id } = await seedVault(sql);
    const { chunk_id } = await insertChunk(vault_id, unitVec(7), "self");
    const rows = await sql<{ dist: number }[]>`
      SELECT ${cosineDist("embedding", unitVec(7))} AS dist
      FROM transcript_chunks WHERE id = ${chunk_id}`;
    expect(rows[0].dist).toBeCloseTo(0, 5);
  });
});

describe("asISO", () => {
  it("converts Date to an ISO string", () => {
    expect(asISO(new Date("2024-05-04T03:02:01.000Z"))).toBe(
      "2024-05-04T03:02:01.000Z",
    );
  });

  it("passes ISO strings through untouched", () => {
    expect(asISO("2024-05-04T03:02:01.000Z")).toBe(
      "2024-05-04T03:02:01.000Z",
    );
  });

  it("maps null and undefined to null", () => {
    expect(asISO(null)).toBeNull();
    expect(asISO(undefined)).toBeNull();
  });
});

describe("sql.json", () => {
  it("round-trips an object through a JSONB-ish TEXT column", async () => {
    const { vault_id } = await seedVault(sql);
    const meta = { model: "embeddinggemma", dims: 768, nested: { ok: true } };
    await sql`UPDATE vaults SET embedding_meta = ${sql.json(meta)}
              WHERE id = ${vault_id}`;

    const rows = await sql<{ embedding_meta: unknown }[]>`
      SELECT embedding_meta FROM vaults WHERE id = ${vault_id}`;
    const raw = rows[0].embedding_meta;
    const decoded = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(decoded).toEqual(meta);
  });
});

describe("sql.begin", () => {
  it("rolls back the insert when the callback throws", async () => {
    const { vault_id } = await seedVault(sql);
    const capture_id = randomUUID();
    await expect(
      sql.begin(async (tx) => {
        await tx`INSERT INTO captures (id, vault_id, kind, status)
                 VALUES (${capture_id}, ${vault_id}, ${"note"}, ${"ready"})`;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const after = await sql<{ id: string }[]>`
      SELECT id FROM captures WHERE id = ${capture_id}`;
    expect(after).toHaveLength(0);
  });

  it("commits on success and returns the callback's value", async () => {
    const { vault_id } = await seedVault(sql);
    const capture_id = randomUUID();
    const result = await sql.begin(async (tx) => {
      await tx`INSERT INTO captures (id, vault_id, kind, status)
               VALUES (${capture_id}, ${vault_id}, ${"note"}, ${"ready"})`;
      return "committed";
    });
    expect(result).toBe("committed");

    const after = await sql<{ id: string }[]>`
      SELECT id FROM captures WHERE id = ${capture_id}`;
    expect(after).toHaveLength(1);
  });
});
