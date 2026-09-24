import type { ModelRequest, ModelResponse } from "@agent/core";

/**
 * One provider adapter (PRD §6, "provider adapter"): maps our internal request/response
 * shape to a specific model API. Tool-calling policy, safety checks and routing all live
 * in the router and the policy engine, never here — an adapter's only job is the API call.
 */
export interface ModelProvider {
  readonly name: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export class ModelProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ModelProviderError";
  }
}
