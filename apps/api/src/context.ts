import { getDb, type Database } from "@agent/db";
import { AuditLogger } from "@agent/audit";
import { createDefaultRouter, type ModelRouter } from "@agent/model-router";
import { InMemoryEventBus, RedisEventBus, type EventBus } from "@agent/event-bus";
import { InMemoryRateLimiter, type RateLimiter } from "@agent/policy-engine";
import { LocalEnvelopeVault, type Vault } from "@agent/secrets";
import { env } from "./env.js";

export interface AppContext {
  db: Database;
  eventBus: EventBus;
  modelRouter: ModelRouter;
  auditLogger: AuditLogger;
  rateLimiter: RateLimiter;
  vault?: Vault;
}

export function createAppContext(): AppContext {
  const { db } = getDb(env.databaseUrl);
  const eventBus = env.redisUrl ? new RedisEventBus(env.redisUrl) : new InMemoryEventBus();
  const modelRouter = createDefaultRouter();
  const auditLogger = new AuditLogger(db);
  const rateLimiter = new InMemoryRateLimiter();
  const vault = env.vaultMasterKey ? new LocalEnvelopeVault(env.vaultMasterKey) : undefined;

  return { db, eventBus, modelRouter, auditLogger, rateLimiter, vault };
}
