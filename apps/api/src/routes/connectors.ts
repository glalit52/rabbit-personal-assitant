import type { FastifyInstance } from "fastify";
import { signState, verifyState } from "@agent/auth";
import { google, microsoft } from "@agent/connectors";
import type { AppContext } from "../context.js";
import { env } from "../env.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import { connectGoogleAccount, getValidGoogleAccessToken } from "../services/connectors/google.js";
import { connectMicrosoftAccount, getValidMicrosoftAccessToken } from "../services/connectors/microsoft.js";
import { disconnectProvider, findConnectedEmailCalendarProvider } from "../services/connectors/shared.js";
import { configureWhatsAppAccount } from "../services/connectors/whatsapp.js";
import { configureTwilioAccount } from "../services/connectors/twilio.js";
import { syncGmailInbox } from "../services/gmail-sync.js";
import { syncOutlookInbox } from "../services/outlook-sync.js";
import { proposeAndDecideAction } from "../services/actions.js";
import { getTenantPolicy } from "../services/policy.js";

interface OAuthState {
  tenantId: string;
}

const DISCONNECT_PROVIDER_ALIASES: Record<string, string> = {
  whatsapp: "whatsapp_business",
};

export function connectorRoutes(ctx: AppContext) {
  return async function (app: FastifyInstance) {
    app.get("/connectors/status", { preHandler: requireAuth }, async (request) => {
      const tenantId = request.session!.tenantId;
      const identities = await ctx.db.query.identities.findMany({
        where: (rows, { eq: eqOp }) => eqOp(rows.tenantId, tenantId),
      });
      const byProvider = (provider: string) => identities.find((i) => i.provider === provider);
      const summarize = (identity: (typeof identities)[number] | undefined, key: string) =>
        identity ? { connected: true, [key]: identity.externalAccountId, health: identity.health } : { connected: false };

      return {
        google: summarize(byProvider("google"), "email"),
        microsoft: summarize(byProvider("microsoft"), "email"),
        whatsapp: summarize(byProvider("whatsapp_business"), "phoneNumberId"),
        sms: summarize(byProvider("sms"), "fromNumber"),
        googleOAuthConfigured: Boolean(env.google),
        microsoftOAuthConfigured: Boolean(env.microsoft),
      };
    });

    // --- Google ---
    app.get("/connectors/google/connect", { preHandler: requireAuth }, async (request, reply) => {
      if (!env.google) {
        return reply.code(400).send({ error: "Google OAuth is not configured on this server (missing GOOGLE_CLIENT_ID/SECRET)" });
      }
      const state = signState<OAuthState>({ tenantId: request.session!.tenantId }, env.jwtSecret);
      return { url: google.buildGoogleAuthUrl(env.google, state) };
    });

    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
      "/connectors/google/callback",
      async (request, reply) => {
        if (request.query.error || !request.query.code || !request.query.state) {
          return reply.redirect(`${env.appUrl}/connectors?google=error`);
        }
        try {
          const { tenantId } = verifyState<OAuthState>(request.query.state, env.jwtSecret);
          if (!ctx.vault) throw new Error("VAULT_MASTER_KEY is not configured");
          const { email } = await connectGoogleAccount(ctx.db, ctx.vault, tenantId, request.query.code);
          await ctx.auditLogger.record({ tenantId, actor: "human", what: "connector.google.connected", why: email });
          return reply.redirect(`${env.appUrl}/connectors?google=connected`);
        } catch (err) {
          app.log.error(err, "Google OAuth callback failed");
          return reply.redirect(`${env.appUrl}/connectors?google=error`);
        }
      },
    );

    app.post("/connectors/gmail/sync", { preHandler: requireAuth }, async (request, reply) => {
      try {
        return await syncGmailInbox(ctx, request.session!.tenantId);
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    });

    // --- Microsoft ---
    app.get("/connectors/microsoft/connect", { preHandler: requireAuth }, async (request, reply) => {
      if (!env.microsoft) {
        return reply
          .code(400)
          .send({ error: "Microsoft OAuth is not configured on this server (missing MICROSOFT_CLIENT_ID/SECRET)" });
      }
      const state = signState<OAuthState>({ tenantId: request.session!.tenantId }, env.jwtSecret);
      return { url: microsoft.buildMicrosoftAuthUrl(env.microsoft, state) };
    });

    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
      "/connectors/microsoft/callback",
      async (request, reply) => {
        if (request.query.error || !request.query.code || !request.query.state) {
          return reply.redirect(`${env.appUrl}/connectors?microsoft=error`);
        }
        try {
          const { tenantId } = verifyState<OAuthState>(request.query.state, env.jwtSecret);
          if (!ctx.vault) throw new Error("VAULT_MASTER_KEY is not configured");
          const { email } = await connectMicrosoftAccount(ctx.db, ctx.vault, tenantId, request.query.code);
          await ctx.auditLogger.record({ tenantId, actor: "human", what: "connector.microsoft.connected", why: email });
          return reply.redirect(`${env.appUrl}/connectors?microsoft=connected`);
        } catch (err) {
          app.log.error(err, "Microsoft OAuth callback failed");
          return reply.redirect(`${env.appUrl}/connectors?microsoft=error`);
        }
      },
    );

    app.post("/connectors/outlook/sync", { preHandler: requireAuth }, async (request, reply) => {
      try {
        return await syncOutlookInbox(ctx, request.session!.tenantId);
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    });

    // --- Calendar (whichever of Google/Microsoft is connected) ---
    app.get<{ Querystring: { days?: string } }>("/connectors/calendar/events", { preHandler: requireAuth }, async (request, reply) => {
      const tenantId = request.session!.tenantId;
      try {
        if (!ctx.vault) throw new Error("VAULT_MASTER_KEY is not configured");
        const provider = await findConnectedEmailCalendarProvider(ctx.db, tenantId);
        if (!provider) throw new Error("Connect a Google or Microsoft account first");

        const days = Number(request.query.days ?? 7);
        const now = new Date();
        const timeMinIso = now.toISOString();
        const timeMaxIso = new Date(now.getTime() + days * 86_400_000).toISOString();

        if (provider === "google") {
          const accessToken = await getValidGoogleAccessToken(ctx.db, ctx.vault, tenantId);
          return await google.listCalendarEvents(accessToken, { timeMinIso, timeMaxIso });
        }
        const accessToken = await getValidMicrosoftAccessToken(ctx.db, ctx.vault, tenantId);
        return await microsoft.listOutlookEvents(accessToken, { startIso: timeMinIso, endIso: timeMaxIso });
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    });

    app.post<{
      Body: { summary: string; description?: string; startIso: string; endIso: string; timeZone?: string; attendeeEmails?: string[] };
    }>("/connectors/calendar/events", { preHandler: requireAuth }, async (request, reply) => {
      const tenantId = request.session!.tenantId;
      const provider = await findConnectedEmailCalendarProvider(ctx.db, tenantId);
      if (!provider) {
        return reply.code(400).send({ error: "Connect a Google or Microsoft account before proposing calendar events" });
      }
      const policy = await getTenantPolicy(ctx.db, tenantId);
      const action = await proposeAndDecideAction(ctx, policy, {
        tenantId,
        type: "book_calendar_event",
        targetSystem: `${provider}_calendar`,
        payload: { ...request.body },
        rationale: "Requested directly via the control center",
      });
      return reply.code(202).send(action);
    });

    // --- WhatsApp ---
    app.post<{ Body: { phoneNumberId: string; accessToken: string; wabaId: string } }>(
      "/connectors/whatsapp/configure",
      { preHandler: [requireAuth, requireRole("owner", "admin")] },
      async (request, reply) => {
        if (!ctx.vault) {
          return reply.code(400).send({ error: "VAULT_MASTER_KEY is not configured on this server" });
        }
        await configureWhatsAppAccount(ctx.db, ctx.vault, request.session!.tenantId, request.body);
        await ctx.auditLogger.record({
          tenantId: request.session!.tenantId,
          actor: "human",
          actorId: request.session!.sub,
          what: "connector.whatsapp.configured",
          why: request.body.phoneNumberId,
        });
        return reply.code(204).send();
      },
    );

    // --- Twilio (SMS) ---
    app.post<{ Body: { accountSid: string; authToken: string; fromNumber: string } }>(
      "/connectors/twilio/configure",
      { preHandler: [requireAuth, requireRole("owner", "admin")] },
      async (request, reply) => {
        if (!ctx.vault) {
          return reply.code(400).send({ error: "VAULT_MASTER_KEY is not configured on this server" });
        }
        await configureTwilioAccount(ctx.db, ctx.vault, request.session!.tenantId, request.body);
        await ctx.auditLogger.record({
          tenantId: request.session!.tenantId,
          actor: "human",
          actorId: request.session!.sub,
          what: "connector.sms.configured",
          why: request.body.fromNumber,
        });
        return reply.code(204).send();
      },
    );

    app.post<{ Params: { provider: string } }>(
      "/connectors/:provider/disconnect",
      { preHandler: requireAuth },
      async (request, reply) => {
        const provider = DISCONNECT_PROVIDER_ALIASES[request.params.provider] ?? request.params.provider;
        await disconnectProvider(ctx.db, request.session!.tenantId, provider);
        return reply.code(204).send();
      },
    );
  };
}
