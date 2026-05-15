/** Sentence-aware character chunker (~1800 chars, 250 overlap). Smaller
 *  chunks retrieve better than EmbeddingGemma's full 2048-token context. */

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
      const overlap = buf.slice(Math.max(0, buf.length - OVERLAP_CHARS));
      bufStart = Math.max(0, cursor - overlap.length);
      buf = overlap ? `${overlap} ${s}` : s;
    }
    cursor += s.length + 1;
  }
  push(cursor);

  // Hard-cut any single sentence that exceeds TARGET_CHARS.
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
