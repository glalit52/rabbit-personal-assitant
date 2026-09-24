import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "../plugins/auth.js";

export function auditRoutes(ctx: AppContext) {
  return async function (app: FastifyInstance) {
    app.get("/audit", { preHandler: requireAuth }, async (request) => {
      return ctx.auditLogger.list(request.session!.tenantId, { limit: 100 });
    });
  };
}
