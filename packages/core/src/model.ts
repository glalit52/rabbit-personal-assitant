/**
 * The task categories the model router dispatches on (PRD §6). Each maps to a
 * primary provider/tier and a fallback; the router owns that mapping, callers
 * only ever say what kind of work this is.
 */
export type ModelTaskType =
  | "agent_loop"
  | "draft_reply"
  | "triage_classify"
  | "extract_commitment"
  | "voice_turn"
  | "live_search"
  | "long_document_analysis"
  | "risk_review"
  | "embedding";

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelRequest {
  taskType: ModelTaskType;
  tenantId: string;
  messages: ModelMessage[];
  tools?: ModelToolDefinition[];
  maxTokens?: number;
}

export interface ModelToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelResponse {
  provider: string;
  model: string;
  text: string;
  toolCalls: ModelToolCall[];
  usage: ModelUsage;
  /** Wall-clock latency in ms, for router scoring and eval dashboards. */
  latencyMs: number;
}
