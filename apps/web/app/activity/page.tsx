"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/api";

interface AuditRow {
  id: string;
  actor: string;
  actorId: string | null;
  what: string;
  why: string | null;
  referencedIds: string[];
  createdAt: string;
}

export default function ActivityPage() {
  const router = useRouter();
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getSession()) {
      router.replace("/login");
      return;
    }
    apiFetch<AuditRow[]>("/audit")
      .then(setEvents)
      .catch((err) => setError((err as Error).message));
  }, [router]);

  return (
    <div>
      <h2>Activity</h2>
      <p className="muted">Every action links back to what triggered it and why (PRD §9 — full audit trail).</p>
      {error && <p className="error">{error}</p>}
      {events.map((event) => (
        <div className="card" key={event.id}>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 0 }}>
            <h3>{event.what}</h3>
            <span className="muted">{new Date(event.createdAt).toLocaleString()}</span>
          </div>
          <p className="muted">
            by {event.actor}
            {event.actorId ? ` (${event.actorId})` : ""}
          </p>
          {event.why && <p>{event.why}</p>}
        </div>
      ))}
      {events.length === 0 && !error && <p className="muted">No activity yet.</p>}
    </div>
  );
}
