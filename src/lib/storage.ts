import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Blob storage root.
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

/** Write an arbitrary blob to local storage and return its blob_url
 *  (a relative path used as captures.blob_url). */
export async function writeBlob(
  data: ArrayBuffer | Uint8Array,
  extension: string,
): Promise<{ blob_url: string; abs_path: string }> {
  await ensureRoot();
  const id = randomUUID();
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin";
  const fileName = `${id}.${safeExt}`;
  const abs = path.join(STORAGE_ROOT, fileName);
  const buf =
    data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  await fs.writeFile(abs, buf);
  return { blob_url: `storage/blobs/${fileName}`, abs_path: abs };
}

/** Resolve a stored blob_url back to an absolute filesystem path. */
export function resolveBlob(blob_url: string): string {
  if (path.isAbsolute(blob_url)) return blob_url;
  if (process.env.HEIRLOOM_BLOB_DIR) {
    return path.join(process.env.HEIRLOOM_BLOB_DIR, path.basename(blob_url));
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), blob_url);
}
