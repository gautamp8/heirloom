import { withRls } from "./db";
import { vectorLiteral } from "./embed";
import type { Session } from "./auth";

export type RetrievedChunk = {
  capture_id: string;
  chunk_index: number;
  text: string;
  captured_at: Date;
  similarity: number;
};

/** Top-k cosine retrieval over `transcript_chunks` within a vault, RLS-
 *  enforced via the session GUCs. Returns the chunks ordered most-similar
 *  first; the caller compares `chunks[0].similarity` against the grounding
 *  threshold. */
export async function fetchTopK(
  qEmbedding: number[],
  session: Session,
  k = 8,
): Promise<RetrievedChunk[]> {
  const lit = vectorLiteral(qEmbedding);

  return withRls(session.user_id, session.role, async (tx) => {
    return tx<RetrievedChunk[]>`
      SELECT tc.capture_id,
             tc.chunk_index,
             tc.text,
             c.captured_at,
             1 - (tc.embedding <=> ${lit}::vector) AS similarity
      FROM transcript_chunks tc
      JOIN captures c ON c.id = tc.capture_id
      WHERE tc.vault_id = ${session.vault_id}
        AND c.status = 'ready'
      ORDER BY tc.embedding <=> ${lit}::vector
      LIMIT ${k}
    `;
  });
}
