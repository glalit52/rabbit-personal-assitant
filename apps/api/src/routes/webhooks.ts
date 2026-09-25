import type { FastifyInstance } from "fastify";
import { whatsapp } from "@agent/connectors";
import type { AppContext } from "../context.js";
import { env } from "../env.js";
import { findTenantIdByWhatsAppPhoneNumberId } from "../services/connectors/whatsapp.js";
import { ingestInboundMessage } from "../services/ingestion.js";

/**
 * Public, unauthenticated by design — Meta calls these directly. Trust is established
 * per-request instead: the GET handshake checks a shared verify token, the POST
 * handler checks Meta's HMAC signature over the raw body (PRD §10, sender verification).
 */
export function webhookRoutes(ctx: AppContext) {
  return async function (app: FastifyInstance) {
    app.get<{
      Querystring: { "hub.mode"?: string; "hub.verify_token"?: string; "hub.challenge"?: string };
    }>("/webhooks/whatsapp", async (request, reply) => {
      if (!env.whatsappWebhookVerifyToken) {
        return reply.code(503).send("WhatsApp webhook is not configured");
      }
      const challenge = whatsapp.verifyWhatsAppSubscription(request.query, env.whatsappWebhookVerifyToken);
      if (challenge === null) {
        return reply.code(403).send("Verification failed");
      }
      return reply.type("text/plain").send(challenge);
    });

    app.post("/webhooks/whatsapp", async (request, reply) => {
      if (!env.whatsappAppSecret) {
        app.log.warn("Rejecting WhatsApp webhook delivery: WHATSAPP_APP_SECRET is not configured");
        return reply.code(503).send();
      }
      const signature = request.headers["x-hub-signature-256"] as string | undefined;
      if (!whatsapp.verifyWhatsAppSignature(env.whatsappAppSecret, request.rawBody ?? Buffer.alloc(0), signature)) {
        return reply.code(401).send();
      }

      // Ack immediately — Meta expects a fast 200 and will retry deliveries that don't get one.
      reply.code(200).send();

      const messages = whatsapp.parseWhatsAppWebhookPayload(request.body);
      for (const message of messages) {
        const tenantId = await findTenantIdByWhatsAppPhoneNumberId(ctx.db, message.phoneNumberId);
        if (!tenantId) {
          app.log.warn(`WhatsApp webhook for unknown phone_number_id ${message.phoneNumberId}`);
          continue;
        }
        await ingestInboundMessage(ctx, {
          tenantId,
          channel: "whatsapp",
          contactHandle: message.from,
          contactName: message.contactName,
          content: message.text,
          providerMessageId: message.messageId,
        });
      }
    });
  };
}
