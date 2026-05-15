import { withRls, cosineDist, cosineSim } from "./db";
import type { Session } from "./auth";

export type RetrievedChunk = {
  capture_id: string;
  chunk_index: number;
  text: string;
  captured_at: Date;
  similarity: number;
};

/** Top-k cosine retrieval over `transcript_chunks` within the session's
 *  vault, RLS-enforced, ordered most-similar first. */
export async function fetchTopK(
  qEmbedding: number[],
  session: Session,
  k = 8,
): Promise<RetrievedChunk[]> {
  return withRls(session.user_id, session.role, async (tx) => {
    return tx<RetrievedChunk[]>`
      SELECT tc.capture_id,
             tc.chunk_index,
             tc.text,
             c.captured_at,
             ${cosineSim("tc.embedding", qEmbedding)} AS similarity
      FROM transcript_chunks tc
      JOIN captures c ON c.id = tc.capture_id
      WHERE tc.vault_id = ${session.vault_id}
        AND c.status = 'ready'
      ORDER BY ${cosineDist("tc.embedding", qEmbedding)}
      LIMIT ${k}
    `;
  });
}
