import type { ModelRequest, ModelResponse, ModelTaskType } from "@agent/core";
import type { ModelProvider } from "./provider.js";
import type { TenantBudgetTracker } from "./budget.js";

export type CostTier = "cheap" | "standard";

interface RegisteredProvider {
  provider: ModelProvider;
  costTier: CostTier;
}

export interface ModelRouterOptions {
  /** Ordered fallback chain of provider names per task type — first is primary. */
  routingTable: Partial<Record<ModelTaskType, string[]>>;
  budgetTracker?: TenantBudgetTracker;
  /** Providers registered but not yet cost-verified may be silently skipped instead of failing. */
  onProviderError?: (taskType: ModelTaskType, providerName: string, error: unknown) => void;
}

/**
 * Single entry point every caller uses instead of talking to a model API directly
 * (PRD §6). Owns: which provider handles a task type, fallback on failure, and
 * downgrading to cheaper providers once a tenant is over its daily token budget.
 */
export class ModelRouter {
  private readonly providers = new Map<string, RegisteredProvider>();

  constructor(private readonly options: ModelRouterOptions) {}

  registerProvider(provider: ModelProvider, costTier: CostTier = "standard"): void {
    this.providers.set(provider.name, { provider, costTier });
  }

  async route(request: ModelRequest): Promise<ModelResponse> {
    let chain = this.options.routingTable[request.taskType] ?? [];
    if (chain.length === 0) {
      throw new Error(`No providers configured for task type "${request.taskType}"`);
    }

    if (this.options.budgetTracker?.isOverBudget(request.tenantId)) {
      const cheapOnly = chain.filter((name) => this.providers.get(name)?.costTier === "cheap");
      if (cheapOnly.length > 0) {
        chain = cheapOnly;
      }
    }

    const errors: unknown[] = [];
    for (const providerName of chain) {
      const registered = this.providers.get(providerName);
      if (!registered) {
        continue;
      }
      try {
        const response = await registered.provider.complete(request);
        this.options.budgetTracker?.recordUsage(
          request.tenantId,
          response.usage.inputTokens + response.usage.outputTokens,
        );
        return response;
      } catch (err) {
        errors.push(err);
        this.options.onProviderError?.(request.taskType, providerName, err);
      }
    }

    throw new AggregateError(errors, `All providers failed for task type "${request.taskType}"`);
  }
}
