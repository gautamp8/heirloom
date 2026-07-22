import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sqlAdmin } from "./db";

/** Blob storage backend.
 *  - "fs" (default): bytes live on a persistent local disk. Used by the
 *    desktop app (Tauri sets HEIRLOOM_BLOB_DIR) and any VM deploy.
 *  - "postgres": bytes live in the blob_objects table (migration 009).
 *    Used only where there is no persistent disk — the Vercel hosted demo,
 *    whose serverless filesystem is ephemeral and read-only. Requires
 *    DATABASE_ADMIN_URL so sqlAdmin is available. */
const BLOB_BACKEND =
  process.env.HEIRLOOM_BLOB_BACKEND === "postgres" ? "postgres" : "fs";

/** Blob storage root (fs backend).
 *  - On the desktop build the Tauri shell sets HEIRLOOM_BLOB_DIR to a
 *    per-user app-data path so blobs survive uninstall/upgrade.
 *  - Otherwise default to ./storage/blobs under the working directory. */
function storageRoot(): string {
  if (process.env.HEIRLOOM_BLOB_DIR) return process.env.HEIRLOOM_BLOB_DIR;
  return path.join(/* turbopackIgnore: true */ process.cwd(), "storage", "blobs");
}

const STORAGE_ROOT = storageRoot();

async function ensureRoot() {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

/** MIME type for a bare extension (no dot), for the DB blob backend which
 *  stores the type alongside the bytes. */
export function mimeForExtension(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

/** Extension embedded in a blob_url like "db/<uuid>.jpg" or
 *  "storage/blobs/<uuid>.wav". */
export function extensionFromBlobUrl(blob_url: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(blob_url);
  return m ? m[1].toLowerCase() : "bin";
}

/** Write an arbitrary blob and return its blob_url (stored as
 *  captures.blob_url / voice_profiles.blob_url). On the fs backend the
 *  url is a relative path ("storage/blobs/<uuid>.ext"); on the postgres
 *  backend it is a "db/<uuid>.ext" key into blob_objects. */
export async function writeBlob(
  data: ArrayBuffer | Uint8Array,
  extension: string,
): Promise<{ blob_url: string; abs_path?: string }> {
  const id = randomUUID();
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin";
  const fileName = `${id}.${safeExt}`;
  const buf =
    data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);

  if (BLOB_BACKEND === "postgres") {
    if (!sqlAdmin) {
      throw new Error(
        "HEIRLOOM_BLOB_BACKEND=postgres requires DATABASE_ADMIN_URL (sqlAdmin)",
      );
    }
    const blob_url = `db/${fileName}`;
    await sqlAdmin`
      INSERT INTO blob_objects (blob_url, mime, bytes)
      VALUES (${blob_url}, ${mimeForExtension(safeExt)}, ${Buffer.from(buf)})
    `;
    return { blob_url };
  }

  await ensureRoot();
  const abs = path.join(STORAGE_ROOT, fileName);
  await fs.writeFile(abs, buf);
  return { blob_url: `storage/blobs/${fileName}`, abs_path: abs };
}

/** Read blob bytes for a stored blob_url, dispatching on how it was
 *  written: "db/…" urls come from blob_objects, everything else from the
 *  local filesystem. Callers that need the raw bytes (the blob route,
 *  photo captioning, vault export) should use this rather than resolving
 *  a filesystem path, so they work on both backends. */
export async function readBlob(blob_url: string): Promise<Buffer> {
  if (blob_url.startsWith("db/")) {
    if (!sqlAdmin) {
      throw new Error("db-backed blob requires DATABASE_ADMIN_URL (sqlAdmin)");
    }
    const [row] = await sqlAdmin<{ bytes: Buffer }[]>`
      SELECT bytes FROM blob_objects WHERE blob_url = ${blob_url}
    `;
    if (!row) throw new Error("missing_blob");
    return Buffer.from(row.bytes);
  }
  return fs.readFile(resolveBlob(blob_url));
}

/** Resolve a filesystem-backed blob_url to an absolute path. Only valid
 *  for the fs backend; "db/…" urls have no filesystem path (use readBlob). */
export function resolveBlob(blob_url: string): string {
  if (path.isAbsolute(blob_url)) return blob_url;
  if (process.env.HEIRLOOM_BLOB_DIR) {
    return path.join(process.env.HEIRLOOM_BLOB_DIR, path.basename(blob_url));
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), blob_url);
}
