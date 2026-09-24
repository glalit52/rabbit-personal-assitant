/**
 * Per-tenant daily token budget (PRD §6, "cost guardrails"). When a tenant is over
 * budget the router restricts routing to providers registered as "cheap" tier instead
 * of failing outright — a downgrade, not an outage.
 */
export interface TenantBudgetTracker {
  recordUsage(tenantId: string, totalTokens: number): void;
  isOverBudget(tenantId: string): boolean;
}

export class InMemoryDailyBudgetTracker implements TenantBudgetTracker {
  private usageByTenantAndDay = new Map<string, number>();

  constructor(private readonly dailyTokenCap: number) {}

  private key(tenantId: string): string {
    return `${tenantId}:${new Date().toISOString().slice(0, 10)}`;
  }

  recordUsage(tenantId: string, totalTokens: number): void {
    const key = this.key(tenantId);
    this.usageByTenantAndDay.set(key, (this.usageByTenantAndDay.get(key) ?? 0) + totalTokens);
  }

  isOverBudget(tenantId: string): boolean {
    return (this.usageByTenantAndDay.get(this.key(tenantId)) ?? 0) >= this.dailyTokenCap;
  }
}
