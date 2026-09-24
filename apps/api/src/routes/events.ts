import type { FastifyInstance } from "fastify";
import type { Channel } from "@agent/core";
import type { AppContext } from "../context.js";
import { requireAuth } from "../plugins/auth.js";
import { ingestInboundMessage } from "../services/ingestion.js";

/**
 * Demo ingestion endpoint standing in for real channel adapters (Gmail push, WhatsApp
 * webhook, ...). It exists so the whole pipeline — ingest, triage, draft, policy
 * decision, approval queue, audit log — can be exercised end to end before any real
 * connector is built.
 */
export function eventRoutes(ctx: AppContext) {
  return async function (app: FastifyInstance) {
    app.post<{ Body: { channel: Channel; contactHandle: string; contactName?: string; content: string } }>(
      "/events/inbound",
      { preHandler: requireAuth },
      async (request, reply) => {
        const { thread, message, contact } = await ingestInboundMessage(ctx, {
          tenantId: request.session!.tenantId,
          ...request.body,
        });
        return reply.code(202).send({ threadId: thread.id, messageId: message.id, contactId: contact.id });
      },
    );
  };
}
