import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "../plugins/auth.js";
import { chaseCommitment, chaseOverdueCommitments, listCommitments } from "../services/commitments.js";

export function commitmentRoutes(ctx: AppContext) {
  return async function (app: FastifyInstance) {
    app.get<{ Querystring: { status?: string } }>("/commitments", { preHandler: requireAuth }, async (request) => {
      return listCommitments(ctx, request.session!.tenantId, request.query.status);
    });

    app.post<{ Params: { id: string } }>("/commitments/:id/chase", { preHandler: requireAuth }, async (request, reply) => {
      const didChase = await chaseCommitment(ctx, request.session!.tenantId, request.params.id);
      if (!didChase) return reply.code(404).send({ error: "Commitment not found or has no linked message" });
      return reply.code(202).send();
    });

    // Meant to be hit by a scheduler (cron, Temporal, ...) — see README "Scheduled jobs".
    app.post("/commitments/chase-overdue", { preHandler: requireAuth }, async (request) => {
      return chaseOverdueCommitments(ctx, request.session!.tenantId);
    });
  };
}
