export type Channel =
  | "email"
  | "whatsapp"
  | "sms"
  | "voice"
  | "chat"
  | "social_dm";

export type ThreadStatus = "open" | "waiting" | "resolved" | "escalated";

/** Matches F2 triage classes. */
export type TriageLabel =
  | "urgent"
  | "needs_reply"
  | "fyi"
  | "spam"
  | "task"
  | "invoice"
  | "lead"
  | "complaint";

export interface Thread {
  id: string;
  tenantId: string;
  channel: Channel;
  participantContactIds: string[];
  status: ThreadStatus;
  /** Tenant user id, if a human is currently assigned/took over. */
  ownerUserId?: string;
  priority: number;
  triageLabel?: TriageLabel;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export type MessageDirection = "inbound" | "outbound";

export interface Message {
  id: string;
  tenantId: string;
  threadId: string;
  direction: MessageDirection;
  content: string;
  attachmentRefs: string[];
  /** Id of this message on the provider's own system, for idempotent ingestion. */
  providerMessageId?: string;
  createdAt: string;
}
