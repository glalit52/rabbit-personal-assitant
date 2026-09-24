import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  boolean,
  customType,
  index,
} from "drizzle-orm/pg-core";
import type { ActionType, AutonomyLevel, Guardrails } from "@agent/core";

const vector1536 = customType<{ data: number[] }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
});

export const tenantTypeEnum = pgEnum("tenant_type", ["personal", "business"]);
export const tenantPlanEnum = pgEnum("tenant_plan", ["trial", "personal", "business", "enterprise"]);
export const tenantRoleEnum = pgEnum("tenant_role", ["owner", "admin", "manager", "operator", "auditor"]);
export const identityHealthEnum = pgEnum("identity_health", ["connected", "expired", "revoked", "error"]);
export const trustLevelEnum = pgEnum("trust_level", ["unknown", "known", "vip", "blocked"]);
export const channelEnum = pgEnum("channel", ["email", "whatsapp", "sms", "voice", "chat", "social_dm"]);
export const threadStatusEnum = pgEnum("thread_status", ["open", "waiting", "resolved", "escalated"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const commitmentStatusEnum = pgEnum("commitment_status", ["open", "done", "cancelled", "overdue"]);
export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high"]);
export const policyDecisionEnum = pgEnum("policy_decision", ["ALLOW", "NEEDS_APPROVAL", "DENY"]);
export const actionStatusEnum = pgEnum("action_status", [
  "proposed",
  "pending_approval",
  "approved",
  "rejected",
  "executed",
  "failed",
  "undone",
]);
export const callDirectionEnum = pgEnum("call_direction", ["inbound", "outbound"]);
export const callOutcomeEnum = pgEnum("call_outcome", [
  "completed",
  "voicemail",
  "no_answer",
  "transferred_to_human",
  "failed",
]);
export const auditActorEnum = pgEnum("audit_actor", ["agent", "human", "system"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: tenantTypeEnum("type").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  plan: tenantPlanEnum("plan").notNull().default("trial"),
  dataRegion: varchar("data_region", { length: 8 }).notNull().default("US"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantUsers = pgTable(
  "tenant_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: tenantRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tenant_users_tenant_id_idx").on(table.tenantId),
    index("tenant_users_email_idx").on(table.email),
  ],
);

/** Encrypted-at-rest OAuth/API credentials. The plaintext never reaches this table — see @agent/secrets. */
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    /** Envelope-encrypted ciphertext blob produced by @agent/secrets. */
    encryptedPayload: text("encrypted_payload").notNull(),
    /** Id of the data-encryption key used, so keys can be rotated without re-encrypting everything at once. */
    keyId: varchar("key_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("credentials_tenant_id_idx").on(table.tenantId)],
);

export const identities = pgTable(
  "identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    credentialId: uuid("credential_id").references(() => credentials.id, { onDelete: "set null" }),
    health: identityHealthEnum("health").notNull().default("connected"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("identities_tenant_id_idx").on(table.tenantId)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    names: jsonb("names").$type<string[]>().notNull().default([]),
    phones: jsonb("phones").$type<string[]>().notNull().default([]),
    emails: jsonb("emails").$type<string[]>().notNull().default([]),
    handles: jsonb("handles").$type<string[]>().notNull().default([]),
    company: varchar("company", { length: 255 }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    trustLevel: trustLevelEnum("trust_level").notNull().default("unknown"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contacts_tenant_id_idx").on(table.tenantId)],
);

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    participantContactIds: jsonb("participant_contact_ids").$type<string[]>().notNull().default([]),
    status: threadStatusEnum("status").notNull().default("open"),
    ownerUserId: uuid("owner_user_id").references(() => tenantUsers.id, { onDelete: "set null" }),
    priority: integer("priority").notNull().default(0),
    triageLabel: varchar("triage_label", { length: 32 }),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("threads_tenant_id_idx").on(table.tenantId),
    index("threads_status_idx").on(table.status),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    content: text("content").notNull(),
    attachmentRefs: jsonb("attachment_refs").$type<string[]>().notNull().default([]),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_tenant_id_idx").on(table.tenantId),
    index("messages_thread_id_idx").on(table.threadId),
    index("messages_provider_message_id_idx").on(table.providerMessageId),
  ],
);

export const commitments = pgTable(
  "commitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
    sourceCallId: uuid("source_call_id"),
    ownerUserId: uuid("owner_user_id").references(() => tenantUsers.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: commitmentStatusEnum("status").notNull().default("open"),
    nextChaseAt: timestamp("next_chase_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("commitments_tenant_id_idx").on(table.tenantId)],
);

export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    targetSystem: varchar("target_system", { length: 64 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    riskLevel: riskLevelEnum("risk_level").notNull().default("low"),
    status: actionStatusEnum("status").notNull().default("proposed"),
    triggeringEventId: uuid("triggering_event_id"),
    rationale: text("rationale"),
    policyDecision: policyDecisionEnum("policy_decision"),
    autonomyLevelApplied: varchar("autonomy_level_applied", { length: 32 }),
    approvedByUserId: uuid("approved_by_user_id").references(() => tenantUsers.id, { onDelete: "set null" }),
    result: jsonb("result").$type<Record<string, unknown>>(),
    undoHandle: text("undo_handle"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (table) => [
    index("actions_tenant_id_idx").on(table.tenantId),
    index("actions_status_idx").on(table.status),
  ],
);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    direction: callDirectionEnum("direction").notNull(),
    brief: jsonb("brief").$type<Record<string, unknown>>(),
    recordingRef: text("recording_ref"),
    transcript: text("transcript"),
    summary: text("summary"),
    outcome: callOutcomeEnum("outcome"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [index("calls_tenant_id_idx").on(table.tenantId)],
);

/** Append-only. No update/delete path is exposed by @agent/audit on purpose. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    actor: auditActorEnum("actor").notNull(),
    actorId: varchar("actor_id", { length: 255 }),
    what: varchar("what", { length: 128 }).notNull(),
    why: text("why"),
    referencedIds: jsonb("referenced_ids").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_tenant_id_idx").on(table.tenantId),
    index("audit_events_created_at_idx").on(table.createdAt),
  ],
);

export const tenantPolicies = pgTable("tenant_policies", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  autonomyByActionType: jsonb("autonomy_by_action_type")
    .$type<Partial<Record<ActionType, AutonomyLevel>>>()
    .notNull()
    .default({}),
  guardrails: jsonb("guardrails").$type<Guardrails>().notNull().default({
    maxSpendPerActionMinor: 0,
    maxSpendPerDayMinor: 0,
    blockedContactIds: [],
    vipContactIds: [],
    rateLimitPerChannelPerHour: {},
    alwaysRequireApproval: [],
  }),
  killSwitchEngaged: boolean("kill_switch_engaged").notNull().default(false),
  killSwitchChannels: jsonb("kill_switch_channels").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Minimal document + chunk model for semantic recall (PRD §8 vector index). Ingestion
 * connectors and RAG land here in a later phase; the table exists now so the schema
 * doesn't need a breaking migration when they do.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 64 }).notNull(),
    sourceRef: text("source_ref"),
    title: varchar("title", { length: 512 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("documents_tenant_id_idx").on(table.tenantId)],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector1536("embedding"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("document_chunks_tenant_id_idx").on(table.tenantId),
    index("document_chunks_document_id_idx").on(table.documentId),
  ],
);
