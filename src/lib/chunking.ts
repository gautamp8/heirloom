/**
 * Heuristic character-based chunker. EmbeddingGemma's context is generous
 * (2048 tokens), but smaller chunks retrieve better — ~512 tokens at
 * ~3.5 chars/token ≈ ~1800 chars per chunk, with ~250 char overlap.
 *
 * We split on sentence boundaries when possible, falling back to hard
 * cut at the chunk size. Each chunk is returned with an approximate
 * character offset for downstream timestamp mapping (post-MVP).
 */

export type Chunk = {
  index: number;
  text: string;
  char_start: number;
  char_end: number;
};

const TARGET_CHARS = 1800;
const OVERLAP_CHARS = 250;
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z])/g;

export function chunkText(text: string): Chunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Sentence split, then accumulate up to TARGET_CHARS per chunk
  const sentences = trimmed.split(SENTENCE_BREAK);
  const chunks: Chunk[] = [];
  let buf = "";
  let bufStart = 0;
  let cursor = 0;

  const push = (end: number) => {
    if (!buf.trim()) return;
    chunks.push({
      index: chunks.length,
      text: buf.trim(),
      char_start: bufStart,
      char_end: end,
    });
  };

  for (const s of sentences) {
    if (buf.length + s.length + 1 <= TARGET_CHARS) {
      buf = buf ? `${buf} ${s}` : s;
    } else {
      push(cursor);
      // Overlap: keep the tail of the previous chunk so context bridges
      const overlap = buf.slice(Math.max(0, buf.length - OVERLAP_CHARS));
      bufStart = Math.max(0, cursor - overlap.length);
      buf = overlap ? `${overlap} ${s}` : s;
    }
    cursor += s.length + 1; // +1 for the boundary whitespace we split on
  }
  push(cursor);

  // Defensive: if any single sentence exceeds TARGET_CHARS, hard-cut it
  const out: Chunk[] = [];
  for (const c of chunks) {
    if (c.text.length <= TARGET_CHARS) {
      out.push({ ...c, index: out.length });
      continue;
    }
    let start = 0;
    while (start < c.text.length) {
      const slice = c.text.slice(start, start + TARGET_CHARS);
      out.push({
        index: out.length,
        text: slice,
        char_start: c.char_start + start,
        char_end: c.char_start + start + slice.length,
      });
      start += TARGET_CHARS - OVERLAP_CHARS;
    }
  }

  return out;
}
