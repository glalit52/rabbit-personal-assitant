import type { ModelRouter } from "@agent/model-router";
import type { EvalCase, EvalResult, EvalSummary } from "./types.js";

const EVAL_TENANT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * "A regression set of real, anonymized tasks per capability, run on every prompt or
 * model change; track task success" (PRD §6). This runner is the seed of that harness —
 * wire it into CI once real prompts and per-tenant fixtures exist.
 */
export async function runEvals(router: ModelRouter, cases: EvalCase[]): Promise<EvalSummary> {
  const results: EvalResult[] = [];

  for (const evalCase of cases) {
    const response = await router.route({
      taskType: evalCase.taskType,
      tenantId: EVAL_TENANT_ID,
      messages: [
        ...(evalCase.system ? [{ role: "system" as const, content: evalCase.system }] : []),
        { role: "user" as const, content: evalCase.input },
      ],
    });

    const passed = response.text.toLowerCase().includes(evalCase.expectedContains.toLowerCase());
    results.push({
      case: evalCase,
      passed,
      provider: response.provider,
      latencyMs: response.latencyMs,
      output: response.text,
    });
  }

  const totalsByCapability: EvalSummary["totalsByCapability"] = {};
  for (const result of results) {
    const bucket = (totalsByCapability[result.case.capability] ??= { passed: 0, total: 0 });
    bucket.total += 1;
    if (result.passed) bucket.passed += 1;
  }

  return { results, totalsByCapability };
}
