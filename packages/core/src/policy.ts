import type { AutonomyLevel } from "./autonomy.js";
import type { ActionType } from "./action.js";

/** Hard guardrails, enforced in code by the policy engine — never left to a prompt (PRD §9). */
export interface Guardrails {
  /** Max amount (in the tenant's currency's smallest unit) a single action may move/commit. */
  maxSpendPerActionMinor: number;
  /** Max total spend per calendar day across all actions. */
  maxSpendPerDayMinor: number;
  /** Contact ids that must never be messaged. */
  blockedContactIds: string[];
  /** Contact ids requiring approval for first contact regardless of autonomy level (VIPs, press, legal, regulators, investors). */
  vipContactIds: string[];
  /** Max outbound messages per channel per hour, to avoid spam flags / account bans. */
  rateLimitPerChannelPerHour: Record<string, number>;
  /** Action types that always require approval, no matter the configured autonomy level. */
  alwaysRequireApproval: ActionType[];
}

/**
 * Per-tenant policy: an autonomy level per action type, plus the hard guardrails.
 * Deny-by-default — an action type with no explicit entry is treated as L0 (observe only).
 */
export interface TenantPolicy {
  tenantId: string;
  autonomyByActionType: Partial<Record<ActionType, AutonomyLevel>>;
  guardrails: Guardrails;
  /** True while a tenant-wide (or single-channel) kill switch is engaged. */
  killSwitchEngaged: boolean;
  killSwitchChannels?: string[];
  updatedAt: string;
}

export const DEFAULT_GUARDRAILS: Guardrails = {
  maxSpendPerActionMinor: 0,
  maxSpendPerDayMinor: 0,
  blockedContactIds: [],
  vipContactIds: [],
  rateLimitPerChannelPerHour: {},
  alwaysRequireApproval: ["initiate_payment", "update_bank_details", "bulk_send"],
};

export function defaultTenantPolicy(tenantId: string): TenantPolicy {
  return {
    tenantId,
    autonomyByActionType: {},
    guardrails: DEFAULT_GUARDRAILS,
    killSwitchEngaged: false,
    updatedAt: new Date().toISOString(),
  };
}
