import { eq, desc, and, lt } from "drizzle-orm";
import { schema, type Database } from "@agent/db";
import type { AuditActor } from "@agent/core";

export interface AuditLogEntry {
  tenantId: string;
  actor: AuditActor;
  actorId?: string;
  what: string;
  why?: string;
  referencedIds?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Append-only writer for the audit trail (PRD §9/§10). There is deliberately no
 * update or delete here — the DB schema doesn't expose one either — so "why did the
 * Agent send this?" always has an answer nobody, including the Agent, can edit later.
 */
export class AuditLogger {
  constructor(private readonly db: Database) {}

  async record(entry: AuditLogEntry): Promise<void> {
    await this.db.insert(schema.auditEvents).values({
      tenantId: entry.tenantId,
      actor: entry.actor,
      actorId: entry.actorId,
      what: entry.what,
      why: entry.why,
      referencedIds: entry.referencedIds ?? [],
      metadata: entry.metadata,
    });
  }

  async list(tenantId: string, options: { before?: Date; limit?: number } = {}) {
    const conditions = [eq(schema.auditEvents.tenantId, tenantId)];
    if (options.before) {
      conditions.push(lt(schema.auditEvents.createdAt, options.before));
    }
    return this.db
      .select()
      .from(schema.auditEvents)
      .where(and(...conditions))
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(options.limit ?? 50);
  }
}
