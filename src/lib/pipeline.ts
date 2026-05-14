import { withRls, vec } from "./db";
import { resolveBlob } from "./storage";
import { transcribeAudio } from "./whisper";
import { captionPhoto } from "./vision";
import { chunkText } from "./chunking";
import { embedAll } from "./embed";
import { tagCapture, type CaptureTags } from "./tagging";
import { generateNoteTitle } from "./prompts";
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
          title: string | null;
          caption: string | null;
        }[]
      >`
        SELECT id, vault_id, kind, body, blob_url, title, caption
          FROM captures WHERE id = ${captureId}
      `;
      return c;
    });
    if (!cap) return;

    // 1) Materialise the text we will embed + tag.
    //    audio → Whisper transcript. photo → Gemma 4 vision caption
    //    (also persisted to captures.caption). note → cap.body.
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
    } else if (cap.kind === "photo" && cap.blob_url) {
      const abs = resolveBlob(cap.blob_url);

      // Names + bounding boxes for any faces the browser detected and
      // the server has clustered against people. The vision model uses
      // them so the caption reads "Elena holding Maya" rather than "a
      // woman holding a child".
      const recognized = await withRls(
        session.user_id,
        session.role,
        (tx) => tx<
          {
            display_name: string;
            bbox: unknown;
            similarity: number | null;
          }[]
        >`
          SELECT p.display_name, fa.bbox, fa.similarity
            FROM face_appearances fa
            JOIN people p ON p.id = fa.person_id
           WHERE fa.capture_id = ${cap.id}
             AND fa.person_id IS NOT NULL
             AND p.display_name IS NOT NULL
        `,
      );

      const caption = await captionPhoto(abs, {
        people: recognized.map((r) => ({
          display_name: r.display_name,
          bbox: parseBbox(r.bbox),
          similarity: r.similarity ?? undefined,
        })),
      });
      text = caption;
      await withRls(session.user_id, session.role, async (tx) => {
        await tx`UPDATE captures SET caption = ${caption} WHERE id = ${cap.id}`;
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
               ${chunks[i].text}, ${vec(vectors[i])})
          `;
        }
      });
    }

    // 3) Auto-release to every nominee in the vault, unless the
    //    capture is the body of a sealed letter (those release via the
    //    condition engine when their moment arrives).
    await withRls(session.user_id, session.role, async (tx) => {
      const [sealed] = await tx<{ has_letter: number }[]>`
        SELECT EXISTS (
          SELECT 1 FROM sealed_letters WHERE capture_id = ${cap.id}
        ) AS has_letter
      `;
      if (!sealed?.has_letter) {
        const nominees = await tx<{ id: string }[]>`
          SELECT id FROM nominees WHERE vault_id = ${cap.vault_id}
        `;
        for (const n of nominees) {
          await tx`
            INSERT INTO nominee_releases
              (vault_id, capture_id, nominee_id, trigger, released_at, label)
            VALUES (${cap.vault_id}, ${cap.id}, ${n.id}, 'scheduled', now(),
                    'auto-released on capture')
            ON CONFLICT DO NOTHING
          `;
        }
      }
    });

    // 4) Mark the capture ready before the slow Gemma calls so the
    //    user sees "Saved" immediately; tags and auto-title fill in
    //    on the next home load.
    await withRls(session.user_id, session.role, async (tx) => {
      await tx`UPDATE captures SET status = 'ready' WHERE id = ${cap.id}`;
    });

    // 5) Tag + auto-title via Gemma 4, in parallel. Independent calls
    //    overlap when OLLAMA_NUM_PARALLEL >= 2.
    const wantTitle = !cap.title && text.trim().length >= 12;
    const [tags, generatedTitle] = await Promise.all([
      tagCapture(text, cap.kind).catch((e) => {
        console.warn("[pipeline] tagging failed", e);
        return { emotion: [], topic: [], person: [], place: [] } as CaptureTags;
      }),
      wantTitle
        ? generateNoteTitle(text).catch((e) => {
            console.warn("[pipeline] title generation failed", e);
            return null;
          })
        : Promise.resolve(null),
    ]);

    const rows: { kind: string; value: string }[] = [];
    for (const v of tags.emotion) rows.push({ kind: "emotion", value: v });
    for (const v of tags.topic) rows.push({ kind: "topic", value: v });
    for (const v of tags.person) rows.push({ kind: "person", value: v });
    for (const v of tags.place) rows.push({ kind: "place", value: v });

    await withRls(session.user_id, session.role, async (tx) => {
      if (rows.length > 0) {
        for (const r of rows) {
          await tx`
            INSERT INTO capture_tags (capture_id, kind, value, confidence)
            VALUES (${cap.id}, ${r.kind}, ${r.value}, 0.8)
            ON CONFLICT DO NOTHING
          `;
        }
      }
      if (generatedTitle) {
        await tx`UPDATE captures SET title = ${generatedTitle} WHERE id = ${cap.id} AND title IS NULL`;
      }
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

/** bbox can arrive from JSONB as either an object or a JSON-encoded string. */
function parseBbox(raw: unknown): { x: number; y: number; w: number; h: number } {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
  }
  const o = (v ?? {}) as { x?: number; y?: number; w?: number; h?: number };
  return {
    x: typeof o.x === "number" ? o.x : 0,
    y: typeof o.y === "number" ? o.y : 0,
    w: typeof o.w === "number" ? o.w : 0,
    h: typeof o.h === "number" ? o.h : 0,
  };
}
