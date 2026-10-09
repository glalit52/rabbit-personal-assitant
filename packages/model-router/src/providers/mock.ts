import type { ModelRequest, ModelResponse } from "@agent/core";
import type { ModelProvider } from "../provider.js";

/**
 * Deterministic provider that makes no network calls, so the rest of the system
 * (policy engine, control center, evals) runs without API keys. It never jumps ahead
 * of a real provider. It only serves as the last fallback when ALLOW_MOCK_MODEL_FALLBACK is set.
 */
export class MockProvider implements ModelProvider {
  readonly name = "mock";

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    return {
      provider: this.name,
      model: "mock-1",
      text: `[mock:${request.taskType}] no model provider configured, echoing input: ${
        lastUser?.content.slice(0, 200) ?? ""
      }`,
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      latencyMs: 0,
    };
  }
}
