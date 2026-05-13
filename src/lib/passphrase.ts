const WORDLIST = [
  "willow", "bread", "river", "garden", "harbor", "ember", "linen", "thistle",
  "marrow", "candle", "hearth", "compass", "season", "ledger", "ribbon", "ivory",
  "cedar", "stream", "violet", "lantern", "pebble", "swallow", "lichen", "wren",
  "fennel", "clover", "summer", "winter", "saffron", "twilight", "pasture", "almond",
  "cobalt", "fable", "harvest", "meadow", "kindling", "orchard", "porch", "thread",
  "vellum", "wicker", "rosemary", "sparrow", "tangerine", "valley", "willow", "yarrow",
];

const crypto = globalThis.crypto;

function randomWord(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return WORDLIST[buf[0] % WORDLIST.length];
}

function randomTwoDigit(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(10 + (buf[0] % 90));
}

/** Generates e.g. `willow · bread · river · 14`. */
export function generatePassphrase(): string {
  const words = new Set<string>();
  while (words.size < 3) words.add(randomWord());
  const arr = Array.from(words);
  return `${arr[0]} · ${arr[1]} · ${arr[2]} · ${randomTwoDigit()}`;
}

/** Lowercase, collapse non-word runs to one space, trim. */
export function normalisePassphrase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
