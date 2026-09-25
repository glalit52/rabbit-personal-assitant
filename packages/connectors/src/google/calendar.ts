const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarEventInput {
  summary: string;
  description?: string;
  /** ISO 8601, e.g. 2026-10-06T15:00:00-07:00 */
  startIso: string;
  endIso: string;
  timeZone?: string;
  attendeeEmails?: string[];
}

export interface CalendarEvent {
  id: string;
  summary: string;
  htmlLink: string;
  status: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

async function calendarFetch<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${CALENDAR_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    throw new Error(`Calendar API ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function listCalendarEvents(
  accessToken: string,
  options: { calendarId?: string; timeMinIso: string; timeMaxIso: string },
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: options.timeMinIso,
    timeMax: options.timeMaxIso,
    singleEvents: "true",
    orderBy: "startTime",
  });
  const data = await calendarFetch<{ items: CalendarEvent[] }>(
    accessToken,
    `/calendars/${encodeURIComponent(options.calendarId ?? "primary")}/events?${params.toString()}`,
  );
  return data.items;
}

export async function createCalendarEvent(
  accessToken: string,
  input: CalendarEventInput,
  calendarId = "primary",
): Promise<CalendarEvent> {
  return calendarFetch<CalendarEvent>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.startIso, timeZone: input.timeZone },
      end: { dateTime: input.endIso, timeZone: input.timeZone },
      attendees: input.attendeeEmails?.map((email) => ({ email })),
    }),
  });
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  patch: Partial<CalendarEventInput>,
  calendarId = "primary",
): Promise<CalendarEvent> {
  return calendarFetch<CalendarEvent>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(patch.summary ? { summary: patch.summary } : {}),
      ...(patch.description ? { description: patch.description } : {}),
      ...(patch.startIso ? { start: { dateTime: patch.startIso, timeZone: patch.timeZone } } : {}),
      ...(patch.endIso ? { end: { dateTime: patch.endIso, timeZone: patch.timeZone } } : {}),
    }),
  });
}

export interface FreeBusyResult {
  busy: Array<{ start: string; end: string }>;
}

export async function getFreeBusy(
  accessToken: string,
  options: { timeMinIso: string; timeMaxIso: string; calendarId?: string },
): Promise<FreeBusyResult> {
  const data = await calendarFetch<{ calendars: Record<string, FreeBusyResult> }>(accessToken, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: options.timeMinIso,
      timeMax: options.timeMaxIso,
      items: [{ id: options.calendarId ?? "primary" }],
    }),
  });
  return data.calendars[options.calendarId ?? "primary"] ?? { busy: [] };
}
