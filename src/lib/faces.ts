import type postgres from "postgres";
import { vectorLiteral } from "./embed";

export type FaceInput = {
  bbox: { x: number; y: number; w: number; h: number };
  embedding: number[];
};

const MATCH_THRESHOLD = 0.6;

/**
 * Store detected faces for a capture. For each face, look for the closest
 * person in the vault and link them when cosine similarity >= threshold.
 *
 * face-api.js descriptors are 128-dim. We use pgvector cosine distance:
 * similarity = 1 - cosine_distance.
 */
export async function storeFaceAppearances(
  tx: postgres.TransactionSql,
  opts: {
    capture_id: string;
    vault_id: string;
    faces: FaceInput[];
  },
): Promise<{ stored: number; matched: number }> {
  if (opts.faces.length === 0) return { stored: 0, matched: 0 };

  let matched = 0;
  for (const f of opts.faces) {
    if (f.embedding.length !== 128) continue;
    const vec = vectorLiteral(f.embedding);

    // Find the closest existing person in this vault, if any.
    const [match] = await tx<{ id: string; similarity: number }[]>`
      SELECT id, 1 - (reference_embedding <=> ${vec}::vector) AS similarity
        FROM people
       WHERE vault_id = ${opts.vault_id}
         AND reference_embedding IS NOT NULL
       ORDER BY reference_embedding <=> ${vec}::vector
       LIMIT 1
    `;

    const personId =
      match && match.similarity >= MATCH_THRESHOLD ? match.id : null;
    const similarity = match?.similarity ?? null;

    await tx`
      INSERT INTO face_appearances
        (capture_id, vault_id, person_id, bbox, embedding, similarity)
      VALUES
        (${opts.capture_id}, ${opts.vault_id}, ${personId},
         ${tx.json(f.bbox)}, ${vec}::vector, ${similarity})
    `;

    if (personId) {
      matched += 1;
      await tx`
        UPDATE people SET appearance_count = appearance_count + 1
         WHERE id = ${personId}
      `;
    }
  }

  return { stored: opts.faces.length, matched };
}
