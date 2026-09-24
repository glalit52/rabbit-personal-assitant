import {
  autonomyRank,
  type Action,
  type AutonomyLevel,
  type PolicyDecision,
  type TenantPolicy,
} from "@agent/core";
import type { RateLimiter } from "./rate-limiter.js";

export interface PolicyEvaluation {
  decision: PolicyDecision;
  reason: string;
  autonomyLevelApplied: AutonomyLevel;
}

/**
 * Conventions this evaluator reads off `Action.payload`, kept loose (Record<string, unknown>
 * on the Action type) because connectors differ, but stable enough for the policy engine
 * to reason about spend and recipients without knowing every connector's schema.
 */
interface ActionPayloadConventions {
  contactId?: string;
  amountMinor?: number;
  isFirstContactWithRecipient?: boolean;
}

function payloadOf(action: Action): ActionPayloadConventions {
  return action.payload as ActionPayloadConventions;
}

const ACTION_TYPE_CHANNEL: Record<string, string> = {
  send_email: "email",
  send_whatsapp: "whatsapp",
  send_sms: "sms",
  place_call: "voice",
};

/**
 * Evaluates one proposed action against tenant policy (PRD §9). Hard guardrails are
 * checked first and can only ever tighten the outcome — never the autonomy ladder
 * loosening past them. Deny-by-default: an action type with no configured autonomy
 * level is treated as L0 (observe only).
 */
export function evaluateAction(
  action: Action,
  policy: TenantPolicy,
  rateLimiter?: RateLimiter,
): PolicyEvaluation {
  const payload = payloadOf(action);
  const channel = ACTION_TYPE_CHANNEL[action.type];

  if (policy.killSwitchEngaged) {
    return deny("Tenant-wide kill switch is engaged");
  }
  if (channel && policy.killSwitchChannels?.includes(channel)) {
    return deny(`Kill switch is engaged for channel "${channel}"`);
  }

  if (payload.contactId && policy.guardrails.blockedContactIds.includes(payload.contactId)) {
    return deny("Recipient is on the blocklist");
  }

  if (payload.contactId && policy.guardrails.vipContactIds.includes(payload.contactId)) {
    if (payload.isFirstContactWithRecipient !== false) {
      return needsApproval("First contact with a VIP contact always requires approval");
    }
  }

  if (policy.guardrails.alwaysRequireApproval.includes(action.type)) {
    return needsApproval(`Action type "${action.type}" always requires approval by policy`);
  }

  if (typeof payload.amountMinor === "number") {
    if (payload.amountMinor > policy.guardrails.maxSpendPerActionMinor) {
      return needsApproval(
        `Amount ${payload.amountMinor} exceeds the per-action spend limit of ${policy.guardrails.maxSpendPerActionMinor}`,
      );
    }
  }

  if (channel && rateLimiter) {
    const limit = policy.guardrails.rateLimitPerChannelPerHour[channel];
    if (limit !== undefined && rateLimiter.isOverLimit(action.tenantId, channel, limit)) {
      return deny(`Rate limit of ${limit}/hour exceeded for channel "${channel}"`);
    }
  }

  if (action.riskLevel === "high") {
    return needsApproval("High-risk actions always require approval");
  }

  const autonomyLevel = policy.autonomyByActionType[action.type] ?? "L0_OBSERVE";
  return fromAutonomyLevel(autonomyLevel);
}

function fromAutonomyLevel(level: AutonomyLevel): PolicyEvaluation {
  if (autonomyRank(level) >= autonomyRank("L3_ACT_AND_NOTIFY")) {
    return { decision: "ALLOW", reason: `Autonomy level ${level} permits acting without approval`, autonomyLevelApplied: level };
  }
  if (level === "L0_OBSERVE") {
    return { decision: "DENY", reason: "Autonomy level is Observe-only for this action type", autonomyLevelApplied: level };
  }
  return { decision: "NEEDS_APPROVAL", reason: `Autonomy level ${level} requires human approval`, autonomyLevelApplied: level };
}

function deny(reason: string): PolicyEvaluation {
  return { decision: "DENY", reason, autonomyLevelApplied: "L0_OBSERVE" };
}

function needsApproval(reason: string): PolicyEvaluation {
  return { decision: "NEEDS_APPROVAL", reason, autonomyLevelApplied: "L2_APPROVE_TO_ACT" };
}
