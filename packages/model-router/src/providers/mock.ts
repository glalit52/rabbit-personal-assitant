import type { ModelRequest, ModelResponse } from "@agent/core";
import type { ModelProvider } from "../provider.js";

/**
 * Deterministic, no-network provider so the rest of the system (policy engine, control
 * center, evals) is runnable without API keys. Never selected ahead of a real provider —
 * only used as the last fallback, and only when ALLOW_MOCK_MODEL_FALLBACK is set.
 */
export class MockProvider implements ModelProvider {
  readonly name = "mock";

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    return {
      provider: this.name,
      model: "mock-1",
      text: `[mock:${request.taskType}] no model provider configured — echoing input: ${
        lastUser?.content.slice(0, 200) ?? ""
      }`,
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
    };
  }
}
