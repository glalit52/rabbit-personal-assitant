const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailProfile {
  emailAddress: string;
  historyId: string;
}

export interface NormalizedGmailMessage {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  bodyText: string;
  snippet: string;
  internalDate: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessageResource {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload: GmailPart & { headers: GmailHeader[] };
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Gmail API ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function getGmailProfile(accessToken: string): Promise<GmailProfile> {
  return gmailFetch<GmailProfile>(accessToken, "/profile");
}

export async function listGmailMessageIds(
  accessToken: string,
  options: { query?: string; pageToken?: string; maxResults?: number } = {},
): Promise<{ ids: string[]; nextPageToken?: string }> {
  const params = new URLSearchParams();
  if (options.query) params.set("q", options.query);
  if (options.pageToken) params.set("pageToken", options.pageToken);
  params.set("maxResults", String(options.maxResults ?? 25));

  const data = await gmailFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
    accessToken,
    `/messages?${params.toString()}`,
  );
  return { ids: (data.messages ?? []).map((m) => m.id), nextPageToken: data.nextPageToken };
}

/**
 * Incremental sync (PRD §5 ingestion): Gmail's history API returns only what changed
 * since a historyId, so a poll after the first backfill is cheap. Falls back to a
 * fresh listing if the historyId is too old (Gmail expires history after ~7 days).
 */
export async function listGmailHistorySinceId(
  accessToken: string,
  startHistoryId: string,
): Promise<{ newMessageIds: string[]; historyId: string; expired: boolean }> {
  const res = await fetch(
    `${GMAIL_BASE}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.status === 404) {
    const profile = await getGmailProfile(accessToken);
    return { newMessageIds: [], historyId: profile.historyId, expired: true };
  }
  if (!res.ok) {
    throw new Error(`Gmail history API failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>;
    historyId: string;
  };
  const ids = new Set<string>();
  for (const entry of data.history ?? []) {
    for (const added of entry.messagesAdded ?? []) {
      ids.add(added.message.id);
    }
  }
  return { newMessageIds: [...ids], historyId: data.historyId, expired: false };
}

export async function getGmailMessage(accessToken: string, id: string): Promise<NormalizedGmailMessage> {
  const raw = await gmailFetch<GmailMessageResource>(accessToken, `/messages/${id}?format=full`);
  return normalizeMessage(raw);
}

function normalizeMessage(raw: GmailMessageResource): NormalizedGmailMessage {
  const header = (name: string) => raw.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  const from = header("From");
  const fromEmailMatch = from.match(/<([^>]+)>/);
  return {
    id: raw.id,
    threadId: raw.threadId,
    from,
    fromEmail: fromEmailMatch?.[1] ?? from,
    to: header("To"),
    subject: header("Subject"),
    bodyText: extractPlainText(raw.payload) ?? raw.snippet,
    snippet: raw.snippet,
    internalDate: raw.internalDate,
  };
}

function extractPlainText(part: GmailPart): string | undefined {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return base64UrlDecode(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = extractPlainText(child);
    if (found) return found;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return base64UrlDecode(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return undefined;
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface SendGmailInput {
  to: string;
  subject: string;
  bodyText: string;
  /** Set both to reply within the same Gmail thread. */
  inReplyToMessageId?: string;
  threadId?: string;
}

export async function sendGmailMessage(accessToken: string, input: SendGmailInput): Promise<{ id: string; threadId: string }> {
  const headers = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    ...(input.inReplyToMessageId
      ? [`In-Reply-To: ${input.inReplyToMessageId}`, `References: ${input.inReplyToMessageId}`]
      : []),
  ];
  const raw = base64UrlEncode(`${headers.join("\r\n")}\r\n\r\n${input.bodyText}`);

  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, threadId: input.threadId }),
  });
  if (!res.ok) {
    throw new Error(`Gmail send failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<{ id: string; threadId: string }>;
}
