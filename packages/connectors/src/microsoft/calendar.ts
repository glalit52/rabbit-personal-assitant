const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface OutlookEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  timeZone?: string;
  attendeeEmails?: string[];
}

export interface OutlookEvent {
  id: string;
  subject: string;
  webLink: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

async function graphFetch<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    throw new Error(`Microsoft Graph ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function listOutlookEvents(
  accessToken: string,
  options: { startIso: string; endIso: string },
): Promise<OutlookEvent[]> {
  const params = new URLSearchParams({ startDateTime: options.startIso, endDateTime: options.endIso });
  const data = await graphFetch<{ value: OutlookEvent[] }>(accessToken, `/me/calendarView?${params.toString()}`, {
    headers: { Prefer: 'outlook.timezone="UTC"' },
  });
  return data.value;
}

export async function createOutlookEvent(accessToken: string, input: OutlookEventInput): Promise<OutlookEvent> {
  return graphFetch<OutlookEvent>(accessToken, "/me/events", {
    method: "POST",
    body: JSON.stringify({
      subject: input.summary,
      body: input.description ? { contentType: "Text", content: input.description } : undefined,
      start: { dateTime: input.startIso, timeZone: input.timeZone ?? "UTC" },
      end: { dateTime: input.endIso, timeZone: input.timeZone ?? "UTC" },
      attendees: input.attendeeEmails?.map((email) => ({ emailAddress: { address: email }, type: "required" })),
    }),
  });
}

export async function updateOutlookEvent(
  accessToken: string,
  eventId: string,
  patch: Partial<OutlookEventInput>,
): Promise<OutlookEvent> {
  return graphFetch<OutlookEvent>(accessToken, `/me/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(patch.summary ? { subject: patch.summary } : {}),
      ...(patch.startIso ? { start: { dateTime: patch.startIso, timeZone: patch.timeZone ?? "UTC" } } : {}),
      ...(patch.endIso ? { end: { dateTime: patch.endIso, timeZone: patch.timeZone ?? "UTC" } } : {}),
    }),
  });
}

export interface FreeBusySlot {
  status: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
  start: string;
  end: string;
}

export async function getOutlookSchedule(
  accessToken: string,
  options: { email: string; startIso: string; endIso: string },
): Promise<FreeBusySlot[]> {
  const data = await graphFetch<{
    value: Array<{ scheduleItems: Array<{ status: FreeBusySlot["status"]; start: { dateTime: string }; end: { dateTime: string } }> }>;
  }>(accessToken, "/me/calendar/getSchedule", {
    method: "POST",
    body: JSON.stringify({
      schedules: [options.email],
      startTime: { dateTime: options.startIso, timeZone: "UTC" },
      endTime: { dateTime: options.endIso, timeZone: "UTC" },
    }),
  });
  const schedule = data.value[0];
  return (schedule?.scheduleItems ?? []).map((item) => ({
    status: item.status,
    start: item.start.dateTime,
    end: item.end.dateTime,
  }));
}
