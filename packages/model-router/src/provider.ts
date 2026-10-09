import type { ModelRequest, ModelResponse } from "@agent/core";

/**
 * One provider adapter (PRD §6, "provider adapter"). It maps our internal
 * request/response shape to one model API. Tool-calling policy, safety checks and
 * routing live in the router and the policy engine. An adapter only makes the API call.
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
