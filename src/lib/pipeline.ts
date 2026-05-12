import { sql, withRls } from "./db";
import { resolveBlob } from "./storage";
import { transcribeAudio } from "./whisper";
import { chunkText } from "./chunking";
import { embedAll, vectorLiteral } from "./embed";
import { tagCapture, type CaptureTags } from "./tagging";
import type { Session } from "./auth";

type Kind = "audio" | "photo" | "note" | "video";

/**
 * Run the full ingest pipeline for a capture row. Fire-and-forget after
 * `POST /api/capture` inserts the row. Errors mark the capture as 'failed'
 * but do not throw to the caller (we're detached).
 *
 * The session is captured at call time so the pipeline can `SET LOCAL`
 * the same RLS GUCs as the originating request.
 */
export async function runCapturePipeline(
  captureId: string,
  session: Session,
): Promise<void> {
  try {
    const cap = await withRls(session.user_id, session.role, async (tx) => {
      const [c] = await tx<
        {
          id: string;
          vault_id: string;
          kind: Kind;
          body: string | null;
          blob_url: string | null;
        }[]
      >`
        SELECT id, vault_id, kind, body, blob_url FROM captures WHERE id = ${captureId}
      `;
      return c;
    });
    if (!cap) return;

    // 1) Materialise the text we will embed + tag
    let text = cap.body ?? "";
    if (cap.kind === "audio" && cap.blob_url) {
      const abs = resolveBlob(cap.blob_url);
      const w = await transcribeAudio(abs);
      text = w.text;
      await withRls(session.user_id, session.role, async (tx) => {
        await tx`
          INSERT INTO transcripts (capture_id, text, language)
          VALUES (${cap.id}, ${text}, ${w.language})
          ON CONFLICT (capture_id) DO UPDATE SET text = EXCLUDED.text
        `;
      });
    }
    if (!text.trim()) {
      await withRls(session.user_id, session.role, async (tx) => {
        await tx`UPDATE captures SET status = 'ready' WHERE id = ${cap.id}`;
      });
      return;
    }

    // 2) Chunk + embed
    const chunks = chunkText(text);
    if (chunks.length > 0) {
      const vectors = await embedAll(chunks.map((c) => c.text));
      await withRls(session.user_id, session.role, async (tx) => {
        for (let i = 0; i < chunks.length; i++) {
          await tx`
            INSERT INTO transcript_chunks
              (capture_id, vault_id, chunk_index, text, embedding)
            VALUES
              (${cap.id}, ${cap.vault_id}, ${chunks[i].index},
               ${chunks[i].text}, ${vectorLiteral(vectors[i])}::vector)
          `;
        }
      });
    }

    // 3) Tag via Gemma 4 → capture_tags
    const tags: CaptureTags = await tagCapture(text, cap.kind);
    const rows: { kind: string; value: string }[] = [];
    for (const v of tags.emotion) rows.push({ kind: "emotion", value: v });
    for (const v of tags.topic) rows.push({ kind: "topic", value: v });
    for (const v of tags.person) rows.push({ kind: "person", value: v });
    for (const v of tags.place) rows.push({ kind: "place", value: v });
    if (rows.length > 0) {
      await withRls(session.user_id, session.role, async (tx) => {
        for (const r of rows) {
          await tx`
            INSERT INTO capture_tags (capture_id, kind, value, confidence)
            VALUES (${cap.id}, ${r.kind}, ${r.value}, 0.8)
            ON CONFLICT DO NOTHING
          `;
        }
      });
    }

    // 4) Status -> ready
    await withRls(session.user_id, session.role, async (tx) => {
      await tx`UPDATE captures SET status = 'ready' WHERE id = ${cap.id}`;
    });
  } catch (err) {
    console.error("[pipeline] failed for", captureId, err);
    try {
      await withRls(session.user_id, session.role, async (tx) => {
        await tx`UPDATE captures SET status = 'failed' WHERE id = ${captureId}`;
      });
    } catch {
      /* best effort */
    }
  }
}

void sql;
