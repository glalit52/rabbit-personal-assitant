import type { ModelTaskType } from "@agent/core";
import { ModelRouter } from "./router.js";
import { ClaudeProvider } from "./providers/claude.js";
import { XaiProvider } from "./providers/xai.js";
import { MockProvider } from "./providers/mock.js";
import { InMemoryDailyBudgetTracker } from "./budget.js";

/**
 * Builds a router wired per the PRD §6 routing table: Claude as the primary agent
 * brain across tiers, Grok for live search and cheap high-volume passes, and a
 * no-network mock as the last-resort fallback so the rest of the stack (policy
 * engine, control center, evals) runs without API keys during local development.
 */
export function createDefaultRouter(env: NodeJS.ProcessEnv = process.env): ModelRouter {
  const router = new ModelRouter({
    routingTable: buildRoutingTable(env),
    budgetTracker: env.MODEL_DAILY_TOKEN_CAP
      ? new InMemoryDailyBudgetTracker(Number(env.MODEL_DAILY_TOKEN_CAP))
      : undefined,
    onProviderError: (taskType, providerName, err) => {
      // eslint-disable-next-line no-console
      console.warn(`[model-router] ${providerName} failed for ${taskType}:`, err);
    },
  });

  if (env.ANTHROPIC_API_KEY) {
    router.registerProvider(
      new ClaudeProvider({ apiKey: env.ANTHROPIC_API_KEY, model: "claude-opus-5-5", name: "claude-top" }),
      "standard",
    );
    router.registerProvider(
      new ClaudeProvider({ apiKey: env.ANTHROPIC_API_KEY, model: "claude-sonnet-5", name: "claude-mid" }),
      "standard",
    );
    router.registerProvider(
      new ClaudeProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        model: "claude-haiku-4-5-20251001",
        name: "claude-fast",
      }),
      "cheap",
    );
  }

  if (env.XAI_API_KEY) {
    router.registerProvider(
      new XaiProvider({ apiKey: env.XAI_API_KEY, model: "grok-4", name: "grok", liveSearch: true }),
      "standard",
    );
    router.registerProvider(
      new XaiProvider({ apiKey: env.XAI_API_KEY, model: "grok-4-fast", name: "grok-fast" }),
      "cheap",
    );
  }

  if (env.ALLOW_MOCK_MODEL_FALLBACK !== "false") {
    router.registerProvider(new MockProvider(), "cheap");
  }

  return router;
}

function buildRoutingTable(env: NodeJS.ProcessEnv): Partial<Record<ModelTaskType, string[]>> {
  const mockFallback = env.ALLOW_MOCK_MODEL_FALLBACK !== "false" ? ["mock"] : [];
  return {
    agent_loop: ["claude-top", "claude-mid", "grok", ...mockFallback],
    draft_reply: ["claude-mid", "grok", ...mockFallback],
    triage_classify: ["claude-fast", "grok-fast", ...mockFallback],
    extract_commitment: ["claude-fast", "grok-fast", ...mockFallback],
    voice_turn: ["claude-fast", "grok-fast", ...mockFallback],
    live_search: ["grok", "claude-mid", ...mockFallback],
    long_document_analysis: ["claude-top", "grok", ...mockFallback],
    risk_review: ["grok", "claude-mid", ...mockFallback],
  };
}
