import type { FastifyInstance } from "fastify";
import { signState, verifyState } from "@agent/auth";
import { google } from "@agent/connectors";
import type { AppContext } from "../context.js";
import { env } from "../env.js";
import { requireAuth, requireRole } from "../plugins/auth.js";
import {
  connectGoogleAccount,
  disconnectProvider,
  getGoogleIdentity,
  getValidGoogleAccessToken,
} from "../services/connectors/google.js";
import { configureWhatsAppAccount } from "../services/connectors/whatsapp.js";
import { syncGmailInbox } from "../services/gmail-sync.js";
import { proposeAndDecideAction } from "../services/actions.js";
import { getTenantPolicy } from "../services/policy.js";

interface GoogleOAuthState {
  tenantId: string;
}

export function connectorRoutes(ctx: AppContext) {
  return async function (app: FastifyInstance) {
    app.get("/connectors/status", { preHandler: requireAuth }, async (request) => {
      const tenantId = request.session!.tenantId;
      const [googleIdentity, whatsappIdentity] = await Promise.all([
        ctx.db.query.identities.findFirst({
          where: (identities, { and, eq: eqOp }) => and(eqOp(identities.tenantId, tenantId), eqOp(identities.provider, "google")),
        }),
        ctx.db.query.identities.findFirst({
          where: (identities, { and, eq: eqOp }) =>
            and(eqOp(identities.tenantId, tenantId), eqOp(identities.provider, "whatsapp_business")),
        }),
      ]);
      return {
        google: googleIdentity
          ? { connected: true, email: googleIdentity.externalAccountId, health: googleIdentity.health }
          : { connected: false },
        whatsapp: whatsappIdentity
          ? { connected: true, phoneNumberId: whatsappIdentity.externalAccountId, health: whatsappIdentity.health }
          : { connected: false },
        googleOAuthConfigured: Boolean(env.google),
      };
    });

    app.get("/connectors/google/connect", { preHandler: requireAuth }, async (request, reply) => {
      if (!env.google) {
        return reply.code(400).send({ error: "Google OAuth is not configured on this server (missing GOOGLE_CLIENT_ID/SECRET)" });
      }
      const state = signState<GoogleOAuthState>({ tenantId: request.session!.tenantId }, env.jwtSecret);
      return { url: google.buildGoogleAuthUrl(env.google, state) };
    });

    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
      "/connectors/google/callback",
      async (request, reply) => {
        if (request.query.error || !request.query.code || !request.query.state) {
          return reply.redirect(`${env.appUrl}/connectors?google=error`);
        }
        try {
          const { tenantId } = verifyState<GoogleOAuthState>(request.query.state, env.jwtSecret);
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
        const result = await syncGmailInbox(ctx, request.session!.tenantId);
        return result;
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    });

    app.get<{ Querystring: { days?: string } }>("/connectors/calendar/events", { preHandler: requireAuth }, async (request, reply) => {
      try {
        if (!ctx.vault) throw new Error("VAULT_MASTER_KEY is not configured");
        const accessToken = await getValidGoogleAccessToken(ctx.db, ctx.vault, request.session!.tenantId);
        const days = Number(request.query.days ?? 7);
        const now = new Date();
        const events = await google.listCalendarEvents(accessToken, {
          timeMinIso: now.toISOString(),
          timeMaxIso: new Date(now.getTime() + days * 86_400_000).toISOString(),
        });
        return events;
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    });

    app.post<{
      Body: { summary: string; description?: string; startIso: string; endIso: string; timeZone?: string; attendeeEmails?: string[] };
    }>("/connectors/calendar/events", { preHandler: requireAuth }, async (request, reply) => {
      const tenantId = request.session!.tenantId;
      const identity = await getGoogleIdentity(ctx.db, tenantId);
      if (!identity) {
        return reply.code(400).send({ error: "Connect a Google account before proposing calendar events" });
      }
      const policy = await getTenantPolicy(ctx.db, tenantId);
      const action = await proposeAndDecideAction(ctx, policy, {
        tenantId,
        type: "book_calendar_event",
        targetSystem: "google_calendar",
        payload: { ...request.body },
        rationale: "Requested directly via the control center",
      });
      return reply.code(202).send(action);
    });

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

    app.post<{ Params: { provider: string } }>(
      "/connectors/:provider/disconnect",
      { preHandler: requireAuth },
      async (request, reply) => {
        const provider = request.params.provider === "whatsapp" ? "whatsapp_business" : request.params.provider;
        await disconnectProvider(ctx.db, request.session!.tenantId, provider);
        return reply.code(204).send();
      },
    );
  };
}
