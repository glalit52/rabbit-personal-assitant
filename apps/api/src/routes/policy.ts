import type { FastifyInstance } from "fastify";
import type { TenantPolicy } from "@agent/core";
import type { AppContext } from "../context.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import { getTenantPolicy, updateTenantPolicy } from "../services/policy.js";

export function policyRoutes(ctx: AppContext) {
  return async function (app: FastifyInstance) {
    app.get("/policy", { preHandler: requireAuth }, async (request) => {
      return getTenantPolicy(ctx.db, request.session!.tenantId);
    });

    app.patch<{
      Body: Partial<Pick<TenantPolicy, "autonomyByActionType" | "guardrails" | "killSwitchEngaged" | "killSwitchChannels">>;
    }>("/policy", { preHandler: [requireAuth, requireRole("owner", "admin")] }, async (request) => {
      return updateTenantPolicy(ctx.db, request.session!.tenantId, request.body);
    });
  };
}
