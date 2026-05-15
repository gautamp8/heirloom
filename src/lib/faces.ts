import type postgres from "postgres";
import { vec as toVec, cosineSim, cosineDist } from "./db";

export type FaceInput = {
  bbox: { x: number; y: number; w: number; h: number };
  embedding: number[];
};

// face-api.js descriptors drift with lighting, expression, and pose.
// 0.45 cosine similarity matches a known person without colliding
// across distinct people in a single-vault archive.
const MATCH_THRESHOLD = 0.45;

/** Store detected faces for a capture. For each face, look for the
 *  closest person in the vault and link them when cosine similarity
 *  meets the threshold. face-api.js descriptors are 128-dim. */
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
    const faceVec = toVec(f.embedding);

    const [match] = await tx<{ id: string; similarity: number }[]>`
      SELECT id, ${cosineSim("reference_embedding", f.embedding)} AS similarity
        FROM people
       WHERE vault_id = ${opts.vault_id}
         AND reference_embedding IS NOT NULL
       ORDER BY ${cosineDist("reference_embedding", f.embedding)}
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
         ${tx.json(f.bbox)}, ${faceVec}, ${similarity})
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
