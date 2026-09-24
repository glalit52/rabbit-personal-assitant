import { eq } from "drizzle-orm";
import { schema, type Database } from "@agent/db";
import { defaultTenantPolicy, type TenantPolicy } from "@agent/core";

export async function getTenantPolicy(db: Database, tenantId: string): Promise<TenantPolicy> {
  const row = await db.query.tenantPolicies.findFirst({ where: eq(schema.tenantPolicies.tenantId, tenantId) });
  if (!row) {
    return defaultTenantPolicy(tenantId);
  }
  return {
    tenantId: row.tenantId,
    autonomyByActionType: row.autonomyByActionType as TenantPolicy["autonomyByActionType"],
    guardrails: row.guardrails as TenantPolicy["guardrails"],
    killSwitchEngaged: row.killSwitchEngaged,
    killSwitchChannels: row.killSwitchChannels,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateTenantPolicy(
  db: Database,
  tenantId: string,
  patch: Partial<Pick<TenantPolicy, "autonomyByActionType" | "guardrails" | "killSwitchEngaged" | "killSwitchChannels">>,
): Promise<TenantPolicy> {
  const current = await getTenantPolicy(db, tenantId);
  const next: TenantPolicy = {
    ...current,
    ...patch,
    guardrails: { ...current.guardrails, ...patch.guardrails },
    autonomyByActionType: { ...current.autonomyByActionType, ...patch.autonomyByActionType },
    updatedAt: new Date().toISOString(),
  };

  await db
    .insert(schema.tenantPolicies)
    .values({
      tenantId,
      autonomyByActionType: next.autonomyByActionType,
      guardrails: next.guardrails,
      killSwitchEngaged: next.killSwitchEngaged,
      killSwitchChannels: next.killSwitchChannels ?? [],
    })
    .onConflictDoUpdate({
      target: schema.tenantPolicies.tenantId,
      set: {
        autonomyByActionType: next.autonomyByActionType,
        guardrails: next.guardrails,
        killSwitchEngaged: next.killSwitchEngaged,
        killSwitchChannels: next.killSwitchChannels ?? [],
        updatedAt: new Date(),
      },
    });

  return next;
}
