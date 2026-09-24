import Fastify from "fastify";
import cors from "@fastify/cors";
import { createAppContext } from "./context.js";
import { registerAuthPlugin } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { eventRoutes } from "./routes/events.js";
import { actionRoutes } from "./routes/actions.js";
import { auditRoutes } from "./routes/audit.js";
import { policyRoutes } from "./routes/policy.js";
import { startOrchestrator } from "./services/orchestrator.js";

export async function buildServer() {
  const ctx = createAppContext();
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  registerAuthPlugin(app);

  await app.register(healthRoutes);
  await app.register(authRoutes(ctx));
  await app.register(eventRoutes(ctx));
  await app.register(actionRoutes(ctx));
  await app.register(auditRoutes(ctx));
  await app.register(policyRoutes(ctx));

  const stopOrchestrator = startOrchestrator(ctx);
  app.addHook("onClose", async () => {
    stopOrchestrator();
    await ctx.eventBus.close();
  });

  return app;
}
