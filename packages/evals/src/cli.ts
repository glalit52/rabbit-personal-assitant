import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultRouter } from "@agent/model-router";
import { runEvals } from "./runner.js";
import type { EvalCase } from "./types.js";

const casesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cases");

async function loadCases(): Promise<EvalCase[]> {
  const files = await readdir(casesDir);
  const cases: EvalCase[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const raw = await readFile(path.join(casesDir, file), "utf8");
    cases.push(...(JSON.parse(raw) as EvalCase[]));
  }
  return cases;
}

async function main() {
  const cases = await loadCases();
  const router = createDefaultRouter();
  const summary = await runEvals(router, cases);

  for (const result of summary.results) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`[${status}] ${result.case.id} (${result.provider}, ${result.latencyMs}ms)`);
    if (!result.passed) {
      console.log(`  expected to contain: "${result.case.expectedContains}"`);
      console.log(`  got: "${result.output.slice(0, 200)}"`);
    }
  }

  console.log("\nBy capability:");
  for (const [capability, totals] of Object.entries(summary.totalsByCapability)) {
    const rate = ((totals.passed / totals.total) * 100).toFixed(0);
    console.log(`  ${capability}: ${totals.passed}/${totals.total} (${rate}%)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
