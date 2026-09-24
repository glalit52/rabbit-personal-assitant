/** Sliding-hour counter per tenant+channel, to avoid spam flags and channel bans (PRD §9). */
export interface RateLimiter {
  recordSend(tenantId: string, channel: string): void;
  isOverLimit(tenantId: string, channel: string, limitPerHour: number): boolean;
}

export class InMemoryRateLimiter implements RateLimiter {
  private sendsByKey = new Map<string, number[]>();

  private key(tenantId: string, channel: string): string {
    return `${tenantId}:${channel}`;
  }

  recordSend(tenantId: string, channel: string): void {
    const key = this.key(tenantId, channel);
    const now = Date.now();
    const timestamps = (this.sendsByKey.get(key) ?? []).filter((t) => now - t < 3_600_000);
    timestamps.push(now);
    this.sendsByKey.set(key, timestamps);
  }

  isOverLimit(tenantId: string, channel: string, limitPerHour: number): boolean {
    const key = this.key(tenantId, channel);
    const now = Date.now();
    const timestamps = (this.sendsByKey.get(key) ?? []).filter((t) => now - t < 3_600_000);
    return timestamps.length >= limitPerHour;
  }
}
