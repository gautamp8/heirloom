import argon2 from "argon2";
import { describe, expect, it } from "vitest";
import { generatePassphrase, normalisePassphrase } from "@/lib/passphrase";

const DISPLAY_SHAPE = /^[a-z]+ · [a-z]+ · [a-z]+ · \d{2}$/;

describe("normalisePassphrase", () => {
  it("normalises the canonical display rendering", () => {
    expect(normalisePassphrase("Word · Word · Word · 42")).toBe(
      "word word word 42",
    );
  });

  it("collapses runs of punctuation and whitespace to one space", () => {
    expect(normalisePassphrase("willow,,  --  bread!!river ... 17")).toBe(
      "willow bread river 17",
    );
  });

  it("trims leading and trailing junk", () => {
    expect(normalisePassphrase("  ~willow bread river 17!  ")).toBe(
      "willow bread river 17",
    );
  });

  it("leaves already-normal input unchanged", () => {
    expect(normalisePassphrase("willow bread river 42")).toBe(
      "willow bread river 42",
    );
  });

  it("is idempotent over generated phrases", () => {
    const norm = normalisePassphrase(generatePassphrase());
    expect(normalisePassphrase(norm)).toBe(norm);
  });
});

describe("generatePassphrase", () => {
  it("matches the word · word · word · NN display shape", () => {
    expect(generatePassphrase()).toMatch(DISPLAY_SHAPE);
  });

  it("uses three distinct words", () => {
    const tokens = normalisePassphrase(generatePassphrase()).split(" ");
    const words = tokens.slice(0, 3);
    expect(new Set(words).size).toBe(3);
  });

  it("ends with a two-digit number in 10..99", () => {
    const last = normalisePassphrase(generatePassphrase()).split(" ").at(-1)!;
    const n = Number(last);
    expect(last).toMatch(/^\d{2}$/);
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(99);
  });

  it("normalises to exactly 4 tokens across 50 generations", () => {
    for (let i = 0; i < 50; i++) {
      const phrase = generatePassphrase();
      expect(phrase).toMatch(DISPLAY_SHAPE);
      expect(normalisePassphrase(phrase).split(" ")).toHaveLength(4);
    }
  });
});

describe("argon2 round-trip over normalised phrases", () => {
  it("verifies any rendering of the same phrase and rejects a different one", async () => {
    const generated = generatePassphrase();
    const norm = normalisePassphrase(generated);
    const hash = await argon2.hash(norm, { type: argon2.argon2id });

    // The same phrase as a user might type it back: uppercase, comma
    // separators, stray whitespace.
    const [w1, w2, w3, num] = norm.split(" ");
    const retyped = `  ${w1.toUpperCase()}, ${w2.toUpperCase()},${w3.toUpperCase()} ,  ${num} `;
    expect(normalisePassphrase(retyped)).toBe(norm);
    await expect(argon2.verify(hash, normalisePassphrase(retyped))).resolves.toBe(
      true,
    );

    // Deterministically different phrase: same words, different number.
    const other = `${w1} ${w2} ${w3} ${num === "10" ? "11" : "10"}`;
    await expect(argon2.verify(hash, other)).resolves.toBe(false);
  });

  it("does not verify the raw display rendering against a normalised hash", async () => {
    const generated = generatePassphrase();
    const hash = await argon2.hash(normalisePassphrase(generated), {
      type: argon2.argon2id,
    });
    // The middle-dot rendering only matches after normalisation.
    await expect(argon2.verify(hash, generated)).resolves.toBe(false);
    await expect(
      argon2.verify(hash, normalisePassphrase(generated)),
    ).resolves.toBe(true);
  });
});
