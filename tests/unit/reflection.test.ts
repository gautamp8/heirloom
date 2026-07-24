import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE_ANSWER,
  REFLECTION_SIMILARITY_THRESHOLD,
  ReflectionSchema,
  hasFirstPersonOutsideQuotes,
  hasLexicalOverlap,
  looksLikeArchiveRefusal,
  validateCitations,
} from "@/lib/reflection";

describe("grounding gate pieces", () => {
  it("keeps the embeddinggemma floor at its calibrated value", () => {
    // If this moves, the transparency copy and the provider floor map
    // must move with it — see src/lib/provider/config.ts.
    expect(REFLECTION_SIMILARITY_THRESHOLD).toBe(0.3);
  });

  it("empty state is the exact verbatim string", () => {
    expect(EMPTY_STATE_ANSWER).toBe(
      "I don't have that in the archive. Try asking another way?",
    );
  });
});

describe("hasLexicalOverlap", () => {
  const chunks = [
    { text: "We got married under the oak tree at the farm in 1987." },
  ];

  it("matches a substantive token present in a chunk", () => {
    expect(hasLexicalOverlap("anything about the wedding farm?", chunks)).toBe(
      true,
    );
  });

  it("ignores stopwords entirely", () => {
    expect(hasLexicalOverlap("tell me about anything", chunks)).toBe(false);
  });

  it("does not match when no token overlaps", () => {
    expect(hasLexicalOverlap("thoughts on cryptocurrency?", chunks)).toBe(
      false,
    );
  });

  it("requires tokens of length >= 3", () => {
    expect(hasLexicalOverlap("at in we", chunks)).toBe(false);
  });

  it("is case-insensitive and punctuation-tolerant", () => {
    expect(hasLexicalOverlap("MARRIED?!", chunks)).toBe(true);
  });

  it("returns false for an empty question", () => {
    expect(hasLexicalOverlap("", chunks)).toBe(false);
  });

  it("returns false when there are no chunks", () => {
    expect(hasLexicalOverlap("wedding", [])).toBe(false);
  });
});

describe("validateCitations", () => {
  const retrieved = [
    {
      capture_id: "5f3989f4-2dd5-4a74-8fd3-c9811f301384",
      text: "x",
      captured_at: new Date(),
      similarity: 0.5,
    },
  ];

  it("accepts claims citing retrieved captures", () => {
    const resp = {
      answer: "She wrote about the farm.",
      claims: [
        {
          text: "She wrote about the farm.",
          citations: ["5f3989f4-2dd5-4a74-8fd3-c9811f301384"],
        },
      ],
    };
    expect(validateCitations(resp, retrieved)).toEqual({ ok: true });
  });

  it("rejects a citation outside the retrieved set (fabricated UUID)", () => {
    const resp = {
      answer: "x",
      claims: [
        {
          text: "x",
          citations: ["00000000-0000-4000-8000-000000000000"],
        },
      ],
    };
    const out = validateCitations(resp, retrieved);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("citation_not_in_retrieved");
  });

  it("rejects a claim with zero citations", () => {
    const resp = { answer: "x", claims: [{ text: "x", citations: [] }] };
    const out = validateCitations(resp, retrieved);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("claim_missing_citations");
  });

  it("accepts an empty-state style response with no claims", () => {
    expect(validateCitations({ answer: "x", claims: [] }, retrieved)).toEqual({
      ok: true,
    });
  });
});

describe("hasFirstPersonOutsideQuotes", () => {
  it("flags bare first person", () => {
    expect(hasFirstPersonOutsideQuotes("I always loved the farm.")).toBe(true);
  });

  it("allows first person inside straight quotes", () => {
    expect(
      hasFirstPersonOutsideQuotes('She wrote, "I always loved the farm."'),
    ).toBe(false);
  });

  it("allows first person inside curly quotes", () => {
    expect(
      hasFirstPersonOutsideQuotes("She wrote, “I always loved the farm.”"),
    ).toBe(false);
  });

  it("flags first person that leaks outside quoted spans", () => {
    expect(
      hasFirstPersonOutsideQuotes('My favorite: "the farm at dusk."'),
    ).toBe(true);
  });

  it("does not flag plain third person", () => {
    expect(
      hasFirstPersonOutsideQuotes("She said the farm was her whole world."),
    ).toBe(false);
  });

  it("catches possessives like 'mine'", () => {
    expect(hasFirstPersonOutsideQuotes("That memory is mine now.")).toBe(true);
  });
});

describe("ReflectionSchema", () => {
  it("accepts a well-formed answer", () => {
    const parsed = ReflectionSchema.safeParse({
      answer: "She wrote about the farm.",
      claims: [
        {
          text: "She wrote about the farm.",
          citations: ["5f3989f4-2dd5-4a74-8fd3-c9811f301384"],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-uuid citations", () => {
    const parsed = ReflectionSchema.safeParse({
      answer: "x",
      claims: [{ text: "x", citations: ["not-a-uuid"] }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects claims without citations at the schema level", () => {
    const parsed = ReflectionSchema.safeParse({
      answer: "x",
      claims: [{ text: "x", citations: [] }],
    });
    expect(parsed.success).toBe(false);
  });
});


describe("looksLikeArchiveRefusal", () => {
  it("flags a soft refusal that disclaims the archive", () => {
    expect(
      looksLikeArchiveRefusal(
        "The archive does not give Carl Sagan\u2019s birth date. It only shows that he was already speaking.",
      ),
    ).toBe(true);
    expect(
      looksLikeArchiveRefusal("The archive doesn\u2019t contain his favorite poem."),
    ).toBe(true);
    expect(
      looksLikeArchiveRefusal("There is nothing in the archive about Antarctica."),
    ).toBe(true);
    expect(
      looksLikeArchiveRefusal("That is not present in the archive."),
    ).toBe(true);
  });

  it("does not flag grounded content that merely contains a negation", () => {
    expect(
      looksLikeArchiveRefusal(
        "He wrote that we should not take Earth for granted.",
      ),
    ).toBe(false);
    expect(
      looksLikeArchiveRefusal(
        "Science is a way of thinking, not just a body of knowledge.",
      ),
    ).toBe(false);
    expect(
      looksLikeArchiveRefusal(
        "Carl Sagan described the pale blue dot as a mote of dust.",
      ),
    ).toBe(false);
  });
});
