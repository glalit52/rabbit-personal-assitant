import Anthropic from "@anthropic-ai/sdk";
import type { ModelRequest, ModelResponse, ModelToolCall } from "@agent/core";
import { ModelProviderError, type ModelProvider } from "../provider.js";

export interface ClaudeProviderOptions {
  apiKey: string;
  /** e.g. claude-opus-5-5 (top tier), claude-sonnet-5 (mid tier), claude-haiku-4-5-20251001 (fast tier). */
  model: string;
  /** Distinguishes this instance in router config/logs, e.g. "claude-top", "claude-fast". */
  name: string;
}

export class ClaudeProvider implements ModelProvider {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: ClaudeProviderOptions) {
    this.name = options.name;
    this.model = options.model;
    this.client = new Anthropic({ apiKey: options.apiKey });
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const start = Date.now();
    const system = request.messages.find((m) => m.role === "system")?.content;
    const conversation: Anthropic.MessageParam[] = request.messages
      .filter((m): m is typeof m & { role: "user" | "assistant" } => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 1024,
        system,
        messages: conversation,
        tools: request.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
        })),
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const toolCalls: ModelToolCall[] = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
        .map((block) => ({ name: block.name, input: block.input as Record<string, unknown> }));

      return {
        provider: this.name,
        model: this.model,
        text,
        toolCalls,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      throw new ModelProviderError(this.name, "Anthropic API call failed", err);
    }
  }
}
