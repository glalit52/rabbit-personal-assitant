import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "../plugins/auth.js";
import { approveAction, listActions, rejectAction } from "../services/actions.js";

export function actionRoutes(ctx: AppContext) {
  return async function (app: FastifyInstance) {
    app.get<{ Querystring: { status?: string } }>("/actions", { preHandler: requireAuth }, async (request) => {
      return listActions(ctx.db, request.session!.tenantId, request.query.status);
    });

    app.post<{ Params: { id: string } }>("/actions/:id/approve", { preHandler: requireAuth }, async (request, reply) => {
      const updated = await approveAction(ctx.db, ctx.auditLogger, request.session!.tenantId, request.params.id, request.session!.sub);
      if (!updated) return reply.code(404).send({ error: "Action not found" });
      return updated;
    });

    app.post<{ Params: { id: string } }>("/actions/:id/reject", { preHandler: requireAuth }, async (request, reply) => {
      const updated = await rejectAction(ctx.db, ctx.auditLogger, request.session!.tenantId, request.params.id, request.session!.sub);
      if (!updated) return reply.code(404).send({ error: "Action not found" });
      return updated;
    });
  };
}
