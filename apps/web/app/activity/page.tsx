"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/api";
import { EmptyState, ErrorState, CardSkeleton, PageHeader } from "@/components/ui";

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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!getSession()) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setEvents(await apiFetch<AuditRow[]>("/audit"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader title="Activity" desc="Append-only audit trail. Every send, approval, denial and connection links back to what triggered it and why." />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : events.length === 0 && !error ? (
        <EmptyState title="No activity yet" hint="Inbound messages, approvals and connector events will be recorded here." />
      ) : (
        events.map((event) => (
          <article className="card" key={event.id}>
            <div className="card-head">
              <h3 className="calendar-badge" style={{ fontSize: 13 }}>{event.what}</h3>
              <span className="meta">{new Date(event.createdAt).toLocaleString()}</span>
            </div>
            <p className="meta" style={{ margin: "0 0 4px" }}>
              by {event.actor}{event.actorId ? ` (${event.actorId.slice(0, 8)}…)` : ""}
            </p>
            {event.why && <p style={{ margin: "4px 0 0", fontSize: 13.5 }}>{event.why}</p>}
          </article>
        ))
      )}
    </div>
  );
}
