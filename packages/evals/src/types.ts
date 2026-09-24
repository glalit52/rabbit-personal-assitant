import type { ModelTaskType } from "@agent/core";

export interface EvalCase {
  id: string;
  capability: string;
  taskType: ModelTaskType;
  system?: string;
  input: string;
  /** The output must contain this (case-insensitive) for the case to pass. */
  expectedContains: string;
}

export interface EvalResult {
  case: EvalCase;
  passed: boolean;
  provider: string;
  latencyMs: number;
  output: string;
}

export interface EvalSummary {
  results: EvalResult[];
  totalsByCapability: Record<string, { passed: number; total: number }>;
}
