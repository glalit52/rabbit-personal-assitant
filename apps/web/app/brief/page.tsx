"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/api";

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

  const load = useCallback(async () => {
    if (!getSession()) {
      router.replace("/login");
      return;
    }
    try {
      setBrief(await apiFetch<Brief>("/brief"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function chase(id: string) {
    setChasing(id);
    try {
      await apiFetch(`/commitments/${id}/chase`, { method: "POST" });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChasing(null);
    }
  }

  if (!brief) {
    return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;
  }

  return (
    <div>
      <h2>Daily brief</h2>
      <p className="muted">As of {new Date(brief.generatedAt).toLocaleString()}.</p>
      {error && <p className="error">{error}</p>}

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <h3>{brief.pendingApprovalsCount}</h3>
          <p className="muted">waiting for approval</p>
        </div>
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <h3>{brief.executedLast24h}</h3>
          <p className="muted">sent, last 24h</p>
        </div>
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <h3>{brief.failedLast24h}</h3>
          <p className="muted">failed, last 24h</p>
        </div>
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <h3>{brief.newThreadsLast24h}</h3>
          <p className="muted">new conversations, last 24h</p>
        </div>
      </div>

      <div className="card">
        <h3>Overdue commitments</h3>
        <p className="muted">Things a sender said they&apos;d do that haven&apos;t happened yet.</p>
        {brief.overdueCommitments.length === 0 && <p className="muted">Nothing overdue.</p>}
        {brief.overdueCommitments.map((c) => (
          <div key={c.id} className="row" style={{ justifyContent: "space-between" }}>
            <span>
              {c.description}
              {c.dueAt && <span className="muted"> — due {new Date(c.dueAt).toLocaleDateString()}</span>}
            </span>
            <button onClick={() => chase(c.id)} disabled={chasing === c.id}>
              {chasing === c.id ? "Chasing…" : "Chase now"}
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Waiting on you</h3>
        {brief.pendingApprovals.length === 0 && <p className="muted">Nothing pending.</p>}
        {brief.pendingApprovals.map((a) => (
          <div key={a.id} style={{ marginBottom: 8 }}>
            <span className="badge pending_approval">{a.type}</span>{" "}
            <span className="muted">via {a.targetSystem}, {new Date(a.createdAt).toLocaleString()}</span>
            {typeof a.payload.draft === "string" && <p style={{ margin: "4px 0" }}>{a.payload.draft}</p>}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Recent activity</h3>
        {brief.recentActivity.map((event) => (
          <div key={event.id} className="row" style={{ justifyContent: "space-between" }}>
            <span>
              {event.what}
              {event.why && <span className="muted"> — {event.why}</span>}
            </span>
            <span className="muted">{new Date(event.createdAt).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
