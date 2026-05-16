import { withRls, vec, sqlAdmin } from "./db";
import { resolveBlob } from "./storage";
import { transcribeAudio } from "./whisper";
import { captionPhoto } from "./vision";
import { chunkText } from "./chunking";
import { embedAll } from "./embed";
import { tagCapture, type CaptureTags } from "./tagging";
import { generateNoteTitle } from "./prompts";
import type { Session } from "./auth";

type Kind = "audio" | "photo" | "note" | "video";

/** Re-embed captures that are either missing chunks entirely (the
 *  detached pipeline dropped before writing) or whose chunks don't
 *  cover the title (older rows that were indexed before titles were
 *  part of the embedded text). Idempotent; runs via admin because
 *  transcript_chunks INSERT is restricted to creators under RLS. */
export async function backfillMissingChunks(session: Session): Promise<number> {
  if (!sqlAdmin) return 0;

  const candidates = await sqlAdmin<{
    id: string;
    vault_id: string;
    title: string | null;
    body: string | null;
    caption: string | null;
    chunk_count: number;
    title_indexed: boolean;
  }[]>`
    SELECT c.id, c.vault_id, c.title, c.body, c.caption,
           (SELECT COUNT(*) FROM transcript_chunks tc WHERE tc.capture_id = c.id)::int AS chunk_count,
           EXISTS (
             SELECT 1 FROM transcript_chunks tc
              WHERE tc.capture_id = c.id
                AND (c.title IS NULL OR position(lower(c.title) IN lower(tc.text)) > 0)
           ) AS title_indexed
      FROM captures c
     WHERE c.vault_id = ${session.vault_id}
       AND c.status = 'ready'
       AND (coalesce(c.body, '') <> '' OR coalesce(c.caption, '') <> '')
     ORDER BY c.created_at DESC
     LIMIT 50
  `;

  const orphans = candidates.filter(
    (c) => c.chunk_count === 0 || !c.title_indexed,
  );
  if (orphans.length === 0) return 0;

  let healed = 0;
  for (const cap of orphans) {
    const base = (cap.body ?? cap.caption ?? "").trim();
    if (!base) continue;
    const indexedText = cap.title?.trim()
      ? `${cap.title.trim()}. ${base}`
      : base;
    try {
      const chunks = chunkText(indexedText);
      if (chunks.length === 0) continue;
      const vectors = await embedAll(chunks.map((c) => c.text));
      await sqlAdmin`
        DELETE FROM transcript_chunks WHERE capture_id = ${cap.id}
      `;
      for (let i = 0; i < chunks.length; i++) {
        await sqlAdmin`
          INSERT INTO transcript_chunks
            (capture_id, vault_id, chunk_index, text, embedding)
          VALUES
            (${cap.id}, ${cap.vault_id}, ${chunks[i].index},
             ${chunks[i].text}, ${vec(vectors[i])})
        `;
      }
      healed++;
    } catch (err) {
      console.warn("[backfillMissingChunks] failed for", cap.id, err);
    }
  }
  return healed;
}

/** Runs ingest for a capture: transcribe/caption, chunk + embed, auto-release
 *  to nominees, then tag and title. Failures mark the row 'failed'. */
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

      const recognized = await withRls(
        session.user_id,
        session.role,
        (tx) => tx<{ display_name: string }[]>`
          SELECT p.display_name
            FROM face_appearances fa
            JOIN people p ON p.id = fa.person_id
           WHERE fa.capture_id = ${cap.id}
             AND fa.person_id IS NOT NULL
             AND p.display_name IS NOT NULL
        `,
      );

      const caption = await captionPhoto(abs, { people: recognized });
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

    // Prepend the title (if any) so a user-typed title like "Wedding
    // planning" is retrievable even when the body doesn't repeat it.
    const indexedText = cap.title?.trim()
      ? `${cap.title.trim()}. ${text}`
      : text;
    const chunks = chunkText(indexedText);
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

    // Sealed letters release via the condition engine, not this auto-path.
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

    // Mark ready before tag/title synthesis so the UI shows the capture
    // immediately; tags fill in on the next home load.
    await withRls(session.user_id, session.role, async (tx) => {
      await tx`UPDATE captures SET status = 'ready' WHERE id = ${cap.id}`;
    });

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

