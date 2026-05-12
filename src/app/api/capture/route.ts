import { sql, withRls } from "@/lib/db";
import { writeBlob } from "@/lib/storage";
import { runCapturePipeline } from "@/lib/pipeline";
import {
  HttpError,
  errorResponse,
  requireSession,
  type Session,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB hard cap

/**
 * POST /api/capture
 *
 * Two request shapes:
 *  - multipart/form-data with `file` and `metadata` (audio/photo/video)
 *  - application/json `{ kind: 'note', body, title? }`
 *
 * Returns `{ capture_id, status }` and kicks off the ingest pipeline
 * detached. Use `GET /api/capture/[id]/status` to watch progress.
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const ct = req.headers.get("content-type") ?? "";

    const capture_id = ct.startsWith("multipart/form-data")
      ? await commitMedia(req, session)
      : await commitNote(req, session);

    // Detached — fires the pipeline and returns immediately
    void runCapturePipeline(capture_id, session);

    return Response.json({ capture_id, status: "processing" }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}

async function commitMedia(req: Request, session: Session): Promise<string> {
  const form = await req.formData();
  const file = form.get("file");
  const metaRaw = form.get("metadata");
  if (!(file instanceof File)) throw new HttpError(400, "missing_file");
  if (file.size === 0) throw new HttpError(400, "empty_file");
  if (file.size > MAX_AUDIO_BYTES) throw new HttpError(413, "too_large");

  const meta =
    typeof metaRaw === "string" ? (JSON.parse(metaRaw) as Record<string, unknown>) : {};
  const kind = (meta.kind as string) ?? guessKind(file.type);
  if (!["audio", "photo", "video"].includes(kind)) {
    throw new HttpError(400, "bad_kind");
  }

  const ext = extensionFor(file.type, file.name);
  const ab = await file.arrayBuffer();
  const { blob_url } = await writeBlob(ab, ext);

  const duration_ms = typeof meta.duration_ms === "number" ? meta.duration_ms : null;
  const captured_at =
    typeof meta.captured_at === "string" ? new Date(meta.captured_at) : new Date();

  return withRls(session.user_id, session.role, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO captures (vault_id, kind, status, blob_url, duration_ms, captured_at)
      VALUES (${session.vault_id}, ${kind}, 'processing', ${blob_url},
              ${duration_ms}, ${captured_at})
      RETURNING id
    `;
    return row.id;
  });
}

async function commitNote(req: Request, session: Session): Promise<string> {
  const body = (await req.json()) as {
    kind?: string;
    body?: string;
    title?: string | null;
  };
  if (body.kind !== "note") throw new HttpError(400, "bad_kind");
  if (!body.body || !body.body.trim()) throw new HttpError(400, "empty_body");

  return withRls(session.user_id, session.role, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO captures (vault_id, kind, status, body, title)
      VALUES (${session.vault_id}, 'note', 'processing',
              ${body.body!.trim()}, ${body.title ?? null})
      RETURNING id
    `;
    return row.id;
  });
}

function guessKind(mime: string): "audio" | "photo" | "video" | "note" {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  return "note";
}

function extensionFor(mime: string, name: string): string {
  const fromName = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (mime === "audio/webm") return "webm";
  if (mime === "audio/ogg") return "ogg";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/wav" || mime === "audio/x-wav") return "wav";
  if (mime === "audio/mp4" || mime === "audio/m4a") return "m4a";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "video/mp4") return "mp4";
  return "bin";
}

// Suppress unused-import linter; sql is exported for other modules but not
// directly used here once withRls covers everything.
void sql;
