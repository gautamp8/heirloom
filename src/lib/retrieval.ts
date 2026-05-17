import { withRls, cosineDist, cosineSim } from "./db";
import type { Session } from "./auth";

export type RetrievedChunk = {
  capture_id: string;
  chunk_index: number;
  text: string;
  captured_at: Date;
  similarity: number;
  kind: "audio" | "photo" | "note" | "video";
  blob_url: string | null;
  body: string | null;
  caption: string | null;
  transcript_text: string | null;
};

/** Top-k cosine retrieval over `transcript_chunks` within the session's
 *  vault. Carries enough of the parent capture (body, caption,
 *  transcript) for the route to build a citation that points at the
 *  canonical source text, not the indexed-chunk text. */
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
             c.kind,
             c.blob_url,
             c.body,
             c.caption,
             (SELECT t.text FROM transcripts t WHERE t.capture_id = c.id LIMIT 1) AS transcript_text,
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

/** Source text for verbatim playback / display — the user's body for
 *  notes, the whisper transcript for audio, the vision caption for
 *  photos. Never the chunk text (which has the title prepended for
 *  retrieval purposes). */
export function canonicalSourceText(chunk: RetrievedChunk): string {
  if (chunk.kind === "audio") return chunk.transcript_text ?? chunk.body ?? "";
  if (chunk.kind === "note") return chunk.body ?? "";
  if (chunk.kind === "photo") return chunk.caption ?? "";
  return chunk.body ?? "";
}
