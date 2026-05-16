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

/** Concatenate every distinct, non-empty textual field on a capture so
 *  the embedding covers title, body, photo caption, and audio
 *  transcript. Reflect retrieves over chunks of this combined text. */
function composeIndexedText(fields: {
  title?: string | null;
  body?: string | null;
  caption?: string | null;
  transcript?: string | null;
}): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of [
    fields.title,
    fields.body,
    fields.caption,
    fields.transcript,
  ]) {
    const v = raw?.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    parts.push(v);
  }
  return parts.join(". ");
}

/** Re-embed captures whose chunks don't cover every textual field
 *  (title + body + caption + transcript). Catches both detached
 *  pipelines that never wrote chunks and older rows indexed before
 *  the title/caption fields were folded into the embedding. Runs via
 *  admin because transcript_chunks INSERT is creator-only under RLS. */
export async function backfillMissingChunks(session: Session): Promise<number> {
  if (!sqlAdmin) return 0;

  const candidates = await sqlAdmin<{
    id: string;
    vault_id: string;
    title: string | null;
    body: string | null;
    caption: string | null;
    transcript: string | null;
    joined_chunks: string | null;
  }[]>`
    SELECT c.id, c.vault_id, c.title, c.body, c.caption,
           (SELECT t.text FROM transcripts t WHERE t.capture_id = c.id LIMIT 1) AS transcript,
           (SELECT string_agg(tc.text, ' ' ORDER BY tc.chunk_index)
              FROM transcript_chunks tc WHERE tc.capture_id = c.id) AS joined_chunks
      FROM captures c
     WHERE c.vault_id = ${session.vault_id}
       AND c.status = 'ready'
       AND (coalesce(c.body, '') <> '' OR coalesce(c.caption, '') <> '')
     ORDER BY c.created_at DESC
     LIMIT 50
  `;

  const orphans = candidates.filter((c) =>
    needsReindex(
      { title: c.title, body: c.body, caption: c.caption, transcript: c.transcript },
      c.joined_chunks,
    ),
  );
  if (orphans.length === 0) return 0;

  let healed = 0;
  for (const cap of orphans) {
    const indexedText = composeIndexedText({
      title: cap.title,
      body: cap.body,
      caption: cap.caption,
      transcript: cap.transcript,
    });
    if (!indexedText) continue;
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

/** True when any non-empty textual field on the capture isn't already
 *  represented in the concatenated chunk text. Substring checks are
 *  lowercase; long fields are sampled by their first ~80 chars so a
 *  natural sentence break inside the body doesn't trigger a false
 *  positive. */
function needsReindex(
  fields: {
    title: string | null;
    body: string | null;
    caption: string | null;
    transcript: string | null;
  },
  joinedChunks: string | null,
): boolean {
  const hay = (joinedChunks ?? "").toLowerCase();
  if (!hay) return true;
  for (const raw of [fields.title, fields.body, fields.caption, fields.transcript]) {
    const v = raw?.trim().toLowerCase();
    if (!v) continue;
    const probe = v.slice(0, 80);
    if (!hay.includes(probe)) return true;
  }
  return false;
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
    const indexedText = composeIndexedText({
      title: cap.title,
      body: cap.body,
      caption: cap.kind === "photo" ? text : cap.caption,
      transcript: cap.kind === "audio" ? text : null,
    });
    if (!indexedText) {
      await withRls(session.user_id, session.role, async (tx) => {
        await tx`UPDATE captures SET status = 'ready' WHERE id = ${cap.id}`;
      });
      return;
    }
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

