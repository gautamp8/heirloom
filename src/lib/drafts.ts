"use client";

import Dexie, { type Table } from "dexie";

/**
 * Client-side draft persistence — keeps in-flight captures safe across
 * network drops, tab closes, and page refreshes. Stored in IndexedDB
 * under the database `heirloom-drafts`.
 *
 * Lifecycle:
 *   1. As soon as a recording stops, the blob is written to IndexedDB
 *      via `saveDraft()`. Survives page close.
 *   2. The capture-sheet kicks off the network upload.
 *   3. On successful commit (server returned `capture_id` AND the
 *      pipeline reached 'ready'), `clearDraft()` removes the local row.
 *   4. On page load, `listDrafts()` returns any orphans — surfaced in
 *      the creator home as "You have an unfinished recording" with a
 *      "Send now" affordance.
 *
 * No PII goes here beyond the raw blob — the same data the user just
 * recorded. Lives only in their browser.
 */

export type DraftKind = "audio" | "photo" | "note";

export type CaptureDraft = {
  id?: number;
  kind: DraftKind;
  blob: Blob | null;
  body: string | null;
  title: string | null;
  prompt: string | null;
  duration_ms: number | null;
  faces: unknown[] | null;
  created_at: number; // epoch ms
};

class HeirloomDraftsDB extends Dexie {
  drafts!: Table<CaptureDraft, number>;
  constructor() {
    super("heirloom-drafts");
    this.version(1).stores({
      drafts: "++id, kind, created_at",
    });
  }
}

let db: HeirloomDraftsDB | null = null;
function getDb(): HeirloomDraftsDB | null {
  if (typeof window === "undefined") return null;
  if (!db) db = new HeirloomDraftsDB();
  return db;
}

export async function saveDraft(d: Omit<CaptureDraft, "id" | "created_at">): Promise<number> {
  const conn = getDb();
  if (!conn) return -1;
  const id = await conn.drafts.add({
    ...d,
    created_at: Date.now(),
  });
  return id as number;
}

export async function clearDraft(id: number | undefined): Promise<void> {
  if (id == null || id < 0) return;
  const conn = getDb();
  if (!conn) return;
  await conn.drafts.delete(id);
}

export async function listDrafts(): Promise<CaptureDraft[]> {
  const conn = getDb();
  if (!conn) return [];
  return conn.drafts.orderBy("created_at").reverse().toArray();
}

export async function countDrafts(): Promise<number> {
  const conn = getDb();
  if (!conn) return 0;
  return conn.drafts.count();
}

export async function getDraft(id: number): Promise<CaptureDraft | undefined> {
  const conn = getDb();
  if (!conn) return undefined;
  return conn.drafts.get(id);
}
