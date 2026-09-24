export type CallDirection = "inbound" | "outbound";

export type CallOutcome =
  | "completed"
  | "voicemail"
  | "no_answer"
  | "transferred_to_human"
  | "failed";

/** The call brief the owner approves before an outbound call is placed (PRD §7). */
export interface CallBrief {
  goal: string;
  mustSay: string[];
  forbiddenTopics: string[];
  budgetMinorUnits?: number;
  exitRule: string;
}

export interface Call {
  id: string;
  tenantId: string;
  contactId?: string;
  direction: CallDirection;
  brief?: CallBrief;
  recordingRef?: string;
  transcript?: string;
  summary?: string;
  outcome?: CallOutcome;
  createdAt: string;
  endedAt?: string;
}
