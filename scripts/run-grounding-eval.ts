/**
 * Grounding eval runner + retrieval-floor calibration.
 *
 *   pnpm tsx scripts/run-grounding-eval.ts               # run + verdicts
 *   pnpm tsx scripts/run-grounding-eval.ts --calibrate   # + floor band
 *   TEST_BASE_URL=https://demo... pnpm tsx scripts/...   # remote target
 *
 * Targets a live instance seeded with the Sagan archive. Sequential on
 * purpose — local inference machines and the small demo VM both prefer it.
 *
 * Verdicts:
 *   answer  → PASS if grounded with >=1 cited claim
 *   refuse  → PASS if the verbatim empty state was served
 *   safe    → PASS unless a hard check fails (first person outside
 *             quotes, or a grounded claim without citations)
 *
 * The calibration section reports, per outcome group, the distribution of
 * top cosine similarities and the implied floor band: every must-refuse
 * fixture's top similarity should sit BELOW the floor (unless the lexical
 * gate legitimately grounded it), every must-answer's above. Recorded
 * values feed RETRIEVAL_FLOORS in src/lib/provider/config.ts.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

type Fixture = {
  id: string;
  question: string;
  expect: "answer" | "refuse" | "safe";
  notes?: string;
};

async function main() {
  const calibrate = process.argv.includes("--calibrate");
  const { fixtures } = parse(
    readFileSync(path.join(__dirname, "../tests/grounding/sagan-eval.yaml"), "utf8"),
  ) as { fixtures: Fixture[] };

  const { reflect, nomineeCookie, BASE_URL } = await import(
    "../tests/helpers/reflect-client"
  );
  const { EMPTY_STATE_ANSWER, hasFirstPersonOutsideQuotes } = await import(
    "../src/lib/reflection"
  );

  console.log(`grounding eval → ${BASE_URL} (${fixtures.length} fixtures)\n`);
  const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json());
  console.log(
    `profile: ${health.profile ?? "unknown"} · db ${health.postgres}\n`,
  );

  const cookie = await nomineeCookie();
  const rows: {
    id: string;
    expect: string;
    grounded: boolean;
    topSim: number;
    claims: number;
    verdict: "PASS" | "FAIL";
    why: string;
    ms: number;
  }[] = [];

  for (const f of fixtures) {
    const t0 = Date.now();
    let verdict: "PASS" | "FAIL" = "PASS";
    let why = "";
    let out;
    try {
      out = await reflect(f.question, cookie);
    } catch (e) {
      rows.push({
        id: f.id, expect: f.expect, grounded: false, topSim: 0, claims: 0,
        verdict: "FAIL", why: `request failed: ${e}`, ms: Date.now() - t0,
      });
      continue;
    }

    const refused = out.answer === EMPTY_STATE_ANSWER;
    // The verbatim empty state ("I don't have that…") is the system's own
    // voice and is exempt from the first-person impersonation check.
    const firstPerson =
      !refused && hasFirstPersonOutsideQuotes(out.answer);
    const uncited =
      out.grounded &&
      (out.claims.length === 0 ||
        out.claims.some((c) => !c.citations || c.citations.length === 0));

    if (firstPerson) {
      verdict = "FAIL";
      why = `first person outside quotes: ${out.answer.slice(0, 80)}`;
    } else if (uncited) {
      verdict = "FAIL";
      why = "grounded answer with uncited claim";
    } else if (f.expect === "answer" && (!out.grounded || refused)) {
      verdict = "FAIL";
      why = `expected grounded answer, got ${refused ? "refusal" : "ungrounded"}`;
    } else if (f.expect === "refuse" && !refused) {
      verdict = "FAIL";
      why = `expected refusal, got: ${out.answer.slice(0, 80)}`;
    }

    rows.push({
      id: f.id,
      expect: f.expect,
      grounded: out.grounded,
      topSim: out.topSimilarity,
      claims: out.claims.length,
      verdict,
      why,
      ms: Date.now() - t0,
    });
    const mark = verdict === "PASS" ? "✓" : "✗";
    console.log(
      `${mark} ${f.id.padEnd(24)} expect=${f.expect.padEnd(6)} ` +
        `grounded=${String(out.grounded).padEnd(5)} sim=${out.topSimilarity.toFixed(3)} ` +
        `claims=${out.claims.length} ${why}`,
    );
  }

  const byExpect = (e: string) => rows.filter((r) => r.expect === e);
  const failures = rows.filter((r) => r.verdict === "FAIL");
  const fabrications = failures.filter(
    (r) => r.expect === "refuse" && r.why.startsWith("expected refusal"),
  );

  console.log("\n=== summary ===");
  for (const e of ["answer", "refuse", "safe"] as const) {
    const g = byExpect(e);
    const pass = g.filter((r) => r.verdict === "PASS").length;
    console.log(`${e.padEnd(6)} ${pass}/${g.length} pass`);
  }
  console.log(`fabrications: ${fabrications.length}`);
  console.log(`total failures: ${failures.length}`);

  if (calibrate) {
    console.log("\n=== calibration (top cosine similarity per group) ===");
    const sims = (e: string) =>
      byExpect(e).map((r) => r.topSim).sort((a, b) => a - b);
    const refuseSims = sims("refuse");
    const answerSims = sims("answer");
    console.log(`refuse sims: ${refuseSims.map((s) => s.toFixed(3)).join(" ")}`);
    console.log(`answer sims: ${answerSims.map((s) => s.toFixed(3)).join(" ")}`);
    const hi = refuseSims.at(-1) ?? 0;
    const lo = answerSims[0] ?? 1;
    if (hi < lo) {
      console.log(
        `clean floor band: (${hi.toFixed(3)}, ${lo.toFixed(3)}] — midpoint ${((hi + lo) / 2).toFixed(3)}`,
      );
    } else {
      console.log(
        `no clean band (max refuse ${hi.toFixed(3)} >= min answer ${lo.toFixed(3)}); ` +
          "the lexical gate and post-checks carry the overlap — set the floor " +
          "above the refuse mass and verify zero fabrications.",
      );
    }
  }

  const outDir = path.join(__dirname, "../docs/eval");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = path.join(
    outDir,
    `grounding-${health.profile ?? "unknown"}-${stamp}.json`,
  );
  writeFileSync(
    file,
    JSON.stringify({ base_url: BASE_URL, profile: health.profile, rows }, null, 2),
  );
  console.log(`\nreport: ${path.relative(process.cwd(), file)}`);

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
