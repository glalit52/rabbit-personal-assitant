import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "../plugins/auth.js";
import { getDailyBrief } from "../services/brief.js";

export function briefRoutes(ctx: AppContext) {
  return async function (app: FastifyInstance) {
    app.get("/brief", { preHandler: requireAuth }, async (request) => {
      return getDailyBrief(ctx, request.session!.tenantId);
    });
  };
}
