"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/api";

interface ActionRow {
  id: string;
  type: string;
  targetSystem: string;
  status: string;
  riskLevel: string;
  rationale: string | null;
  policyDecision: string | null;
  autonomyLevelApplied: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [filter, setFilter] = useState<string>("pending_approval");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getSession()) {
      router.replace("/login");
      return;
    }
    try {
      const query = filter === "all" ? "" : `?status=${filter}`;
      setActions(await apiFetch<ActionRow[]>(`/actions${query}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filter, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: "approve" | "reject") {
    await apiFetch(`/actions/${id}/${decision}`, { method: "POST" });
    load();
  }

  return (
    <div>
      <h2>Approvals</h2>
      <p className="muted">Every action the Agent can't yet take on its own waits here.</p>
      <div className="row" style={{ marginBottom: 16 }}>
        {["pending_approval", "executed", "rejected", "all"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={filter === s ? "primary" : ""}>
            {s.replace("_", " ")}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {actions.length === 0 && <p className="muted">Nothing here.</p>}
      {actions.map((action) => (
        <div className="card" key={action.id}>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 0 }}>
            <h3>
              {action.type} → {action.targetSystem}
            </h3>
            <span className={`badge ${action.status}`}>{action.status.replace("_", " ")}</span>
          </div>
          {typeof action.payload.draft === "string" && (
            <p style={{ whiteSpace: "pre-wrap" }}>{action.payload.draft}</p>
          )}
          <p className="muted">
            {action.rationale} · risk: {action.riskLevel} · autonomy: {action.autonomyLevelApplied ?? "—"}
          </p>
          {action.status === "pending_approval" && (
            <div className="row">
              <button className="primary" onClick={() => decide(action.id, "approve")}>
                Approve
              </button>
              <button className="danger" onClick={() => decide(action.id, "reject")}>
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
