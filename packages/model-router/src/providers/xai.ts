import type { ModelRequest, ModelResponse } from "@agent/core";
import { ModelProviderError, type ModelProvider } from "../provider.js";

export interface XaiProviderOptions {
  apiKey: string;
  model: string;
  name: string;
  /** Enable xAI's live search tool for real-time web/X context (PRD §6, live_search). */
  liveSearch?: boolean;
  baseUrl?: string;
}

interface XaiChatResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Grok via the xAI API (OpenAI-compatible chat completions surface). Used for live
 * web/X search and cheap high-volume passes (PRD §6) — never for actions that write
 * to a tool without a policy-engine check on the way out.
 */
export class XaiProvider implements ModelProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly liveSearch: boolean;
  private readonly baseUrl: string;

  constructor(options: XaiProviderOptions) {
    this.name = options.name;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.liveSearch = options.liveSearch ?? false;
    this.baseUrl = options.baseUrl ?? "https://api.x.ai/v1";
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: request.maxTokens ?? 1024,
          ...(this.liveSearch ? { search_parameters: { mode: "auto" } } : {}),
        }),
      });

      if (!res.ok) {
        throw new Error(`xAI API returned ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as XaiChatResponse;
      return {
        provider: this.name,
        model: this.model,
        text: data.choices[0]?.message.content ?? "",
        toolCalls: [],
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      throw new ModelProviderError(this.name, "xAI API call failed", err);
    }
  }
}
