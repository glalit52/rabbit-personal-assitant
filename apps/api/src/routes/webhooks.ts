import type { FastifyInstance } from "fastify";
import { whatsapp, twilio as twilioApi } from "@agent/connectors";
import type { AppContext } from "../context.js";
import { env } from "../env.js";
import { findTenantIdByWhatsAppPhoneNumberId } from "../services/connectors/whatsapp.js";
import { findTenantIdByTwilioNumber, getTwilioConfig } from "../services/connectors/twilio.js";
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

    // Twilio (SMS): each tenant brings their own Twilio account, so the webhook
    // signature is verified with that tenant's own auth token, not a shared secret —
    // the "To" number (our tenant's Twilio number) is what tells us which one to use.
    app.post<{ Body: Record<string, string> }>("/webhooks/sms", async (request, reply) => {
      const params = request.body ?? {};
      const inbound = twilioApi.parseTwilioInboundSms(params);
      if (!inbound) {
        return reply.code(400).send();
      }

      const tenantId = await findTenantIdByTwilioNumber(ctx.db, inbound.to);
      if (!tenantId) {
        app.log.warn(`SMS webhook for unknown Twilio number ${inbound.to}`);
        return reply.code(404).send();
      }
      if (!ctx.vault) {
        app.log.warn("Rejecting SMS webhook delivery: VAULT_MASTER_KEY is not configured");
        return reply.code(503).send();
      }

      const config = await getTwilioConfig(ctx.db, ctx.vault, tenantId);
      const signature = request.headers["x-twilio-signature"] as string | undefined;
      const webhookUrl = `${env.apiUrl}/webhooks/sms`;
      if (!twilioApi.verifyTwilioSignature(config.authToken, webhookUrl, params, signature)) {
        return reply.code(401).send();
      }

      // Twilio expects a 200 with TwiML (or an empty body); we reply ourselves via the agent loop, not TwiML.
      reply.type("text/xml").send("<Response></Response>");

      await ingestInboundMessage(ctx, {
        tenantId,
        channel: "sms",
        contactHandle: inbound.from,
        content: inbound.body,
        providerMessageId: inbound.messageSid,
      });
    });
  };
}
