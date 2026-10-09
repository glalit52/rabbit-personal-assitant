"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, getSession } from "@/lib/api";
import { Badge, Btn, EmptyState, ErrorState, MetricSkeleton, CardSkeleton, PageHeader, Skel } from "@/components/ui";

interface ActionRow {
  id: string;
  type: string;
  targetSystem: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
interface CommitmentRow {
  id: string;
  description: string;
  dueAt: string | null;
  status: string;
  overdue: boolean;
}
interface AuditRow {
  id: string;
  actor: string;
  what: string;
  why: string | null;
  createdAt: string;
}
interface Brief {
  generatedAt: string;
  pendingApprovalsCount: number;
  pendingApprovals: ActionRow[];
  executedLast24h: number;
  failedLast24h: number;
  newThreadsLast24h: number;
  overdueCommitments: CommitmentRow[];
  recentActivity: AuditRow[];
}

export default function BriefPage() {
  const router = useRouter();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chasing, setChasing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (background = false) => {
      if (!getSession()) {
        router.replace("/login");
        return;
      }
      if (background) setRefreshing(true);
      else setError(null);
      try {
        setBrief(await apiFetch<Brief>("/brief"));
      } catch (err) {
        if (!background) setError((err as Error).message);
      } finally {
        setRefreshing(false);
      }
    },
    [router],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function chase(id: string) {
    setChasing(id);
    setError(null);
    try {
      await apiFetch(`/commitments/${id}/chase`, { method: "POST" });
      await load(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChasing(null);
    }
  }

  if (!brief && !error) {
    return (
      <div>
        <PageHeader title="Daily Brief" desc="What matters today and what you already handled." />
        <div className="grid-metrics">
          {[0, 1, 2, 3].map((i) => (
            <MetricSkeleton key={i} />
          ))}
        </div>
        <CardSkeleton />
        <CardSkeleton />
        <Skel className="skel-line" style={{ width: "40%" }} />
      </div>
    );
  }
  if (!brief) {
    return (
      <div>
        <PageHeader title="Daily Brief" desc="What matters today and what you already handled." />
        <ErrorState message={error ?? "Could not load brief."} onRetry={() => load()} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Daily Brief"
        desc={`Updated ${new Date(brief.generatedAt).toLocaleString()}. Covers pending work, promises owed, and the last 24 hours.`}
        actions={
          <Btn onClick={() => load(true)} loading={refreshing} aria-label="Refresh brief">
            Refresh
          </Btn>
        }
      />
      {error && <ErrorState message={error} />}

      <div className="grid-metrics" aria-live="polite">
        <div className="card metric metric-accent-warn">
          <div className="metric-value">{brief.pendingApprovalsCount}</div>
          <div className="metric-label">Waiting for approval</div>
        </div>
        <div className="card metric metric-accent-teal">
          <div className="metric-value">{brief.executedLast24h}</div>
          <div className="metric-label">Sent · last 24h</div>
        </div>
        <div className="card metric metric-accent-blue">
          <div className="metric-value">{brief.failedLast24h}</div>
          <div className="metric-label">Failed · last 24h</div>
        </div>
        <div className="card metric metric-accent-violet">
          <div className="metric-value">{brief.newThreadsLast24h}</div>
          <div className="metric-label">New conversations · 24h</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Overdue commitments</h3>
          <Badge status={brief.overdueCommitments.length ? "pending" : "success"} label={brief.overdueCommitments.length ? `${brief.overdueCommitments.length} overdue` : "clear"} />
        </div>
        <p className="muted" style={{ margin: "0 0 6px" }}>Promises and deadlines the sender is still waiting on.</p>
        {brief.overdueCommitments.length === 0 && <p className="muted">Nothing overdue. Follow-ups will appear here.</p>}
        {brief.overdueCommitments.map((c) => (
          <div key={c.id} className="list-item" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ minWidth: 0 }}>
              {c.description}
              {c.dueAt && <span className="muted"> (due {new Date(c.dueAt).toLocaleDateString()})</span>}
            </span>
            <Btn size="sm" loading={chasing === c.id} onClick={() => chase(c.id)}>
              Chase now
            </Btn>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Waiting on you</h3>
          <Link href="/approvals" className="btn btn-sm" style={{ textDecoration: "none" }}>Open queue</Link>
        </div>
        {brief.pendingApprovals.length === 0 && <p className="muted">Nothing pending. New drafts land here first.</p>}
        {brief.pendingApprovals.slice(0, 5).map((a) => (
          <div key={a.id} className="list-item">
            <div style={{ minWidth: 0 }}>
              <Badge status="pending_approval" label={a.type} />{" "}
              <span className="meta">via {a.targetSystem} · {new Date(a.createdAt).toLocaleString()}</span>
              {typeof a.payload.draft === "string" && <div className="draft">{a.payload.draft}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Recent activity</h3>
          <Link href="/activity" className="btn btn-sm" style={{ textDecoration: "none" }}>Full log</Link>
        </div>
        {brief.recentActivity.length === 0 && <p className="muted">No events yet.</p>}
        {brief.recentActivity.slice(0, 8).map((event) => (
          <div key={event.id} className="list-item" style={{ justifyContent: "space-between" }}>
            <span style={{ minWidth: 0 }}>
              <span className="calendar-badge">{event.what}</span>
              {event.why && <span className="muted">, {event.why}</span>}
            </span>
            <span className="meta" style={{ flexShrink: 0 }}>{new Date(event.createdAt).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
