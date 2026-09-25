const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface NormalizedOutlookMessage {
  id: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  bodyText: string;
  receivedDateTime: string;
}

interface GraphMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  receivedDateTime: string;
}

async function graphFetch<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      // Ask for plain text bodies instead of HTML — one less thing to strip downstream.
      Prefer: 'outlook.body-content-type="text"',
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Microsoft Graph ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

function normalize(raw: GraphMessage): NormalizedOutlookMessage {
  return {
    id: raw.id,
    fromEmail: raw.from?.emailAddress?.address ?? "",
    fromName: raw.from?.emailAddress?.name ?? "",
    subject: raw.subject ?? "",
    bodyText: raw.body?.content ?? raw.bodyPreview ?? "",
    receivedDateTime: raw.receivedDateTime,
  };
}

/**
 * Delta query (PRD §5 ingestion, incremental sync — the Outlook equivalent of Gmail's
 * historyId): pass the previous call's deltaLink back in to get only what changed.
 * Omit it for the first sync, which both backfills and hands back a deltaLink to
 * store for next time.
 */
export async function listOutlookInboxDelta(
  accessToken: string,
  deltaLink?: string,
): Promise<{ messages: NormalizedOutlookMessage[]; deltaLink: string }> {
  let url = deltaLink ?? `${GRAPH_BASE}/me/mailFolders/inbox/messages/delta?$select=subject,from,body,bodyPreview,receivedDateTime`;
  const messages: NormalizedOutlookMessage[] = [];

  for (;;) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="text"' },
    });
    if (!res.ok) {
      throw new Error(`Microsoft Graph delta query failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as {
      value: GraphMessage[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    };
    messages.push(...data.value.map(normalize));

    if (data["@odata.deltaLink"]) {
      return { messages, deltaLink: data["@odata.deltaLink"] };
    }
    if (!data["@odata.nextLink"]) {
      throw new Error("Microsoft Graph delta query ended without a deltaLink or nextLink");
    }
    url = data["@odata.nextLink"];
  }
}

export interface SendOutlookMailInput {
  to: string;
  subject: string;
  bodyText: string;
}

export async function sendOutlookMail(accessToken: string, input: SendOutlookMailInput): Promise<void> {
  await graphFetch<void>(accessToken, "/me/sendMail", {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "Text", content: input.bodyText },
        toRecipients: [{ emailAddress: { address: input.to } }],
      },
      saveToSentItems: true,
    }),
  });
}
