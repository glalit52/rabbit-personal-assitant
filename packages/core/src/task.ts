export type CommitmentStatus = "open" | "done" | "cancelled" | "overdue";

/** A commitment/follow-up extracted from a message or call (F9). */
export interface Commitment {
  id: string;
  tenantId: string;
  sourceMessageId?: string;
  sourceCallId?: string;
  ownerUserId?: string;
  description: string;
  dueAt?: string;
  status: CommitmentStatus;
  nextChaseAt?: string;
  createdAt: string;
}
