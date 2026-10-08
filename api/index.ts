import type { buildServer as buildServerType } from "../apps/api/dist/server.js";

// ponytail: dev-only Vercel wrapper — 10s timeout, no REDIS_URL (in-memory bus), max:10 pool. Move to Railway/Render when real model calls time out.

type App = Awaited<ReturnType<typeof buildServerType>>;

let app: App | undefined;

async function getApp(): Promise<App> {
  if (!app) {
    const { buildServer } = await import("../apps/api/dist/server.js");
    app = await buildServer();
    await app.ready();
  }
  return app;
}

export default async function handler(req: unknown, res: unknown) {
  const fastify = await getApp();
  fastify.server.emit("request", req, res);
}
