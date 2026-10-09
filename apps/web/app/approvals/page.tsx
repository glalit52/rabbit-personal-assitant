"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession } from "@/lib/api";
import { Badge, Btn, EmptyState, ErrorState, CardSkeleton, PageHeader, Segmented } from "@/components/ui";

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

type Filter = "pending_approval" | "executed" | "rejected" | "all";

export default function ApprovalsPage() {
  const router = useRouter();
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [filter, setFilter] = useState<Filter>("pending_approval");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getSession()) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = filter === "all" ? "" : `?status=${filter}`;
      setActions(await apiFetch<ActionRow[]>(`/actions${query}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: "approve" | "reject") {
    setActing(`${decision}:${id}`);
    setError(null);
    try {
      await apiFetch(`/actions/${id}/${decision}`, { method: "POST" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Approvals"
        desc="Every action the agent can't take on its own waits here. Approve to send for real, reject to drop it."
        actions={
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "pending_approval", label: "Pending" },
              { value: "executed", label: "Sent" },
              { value: "rejected", label: "Rejected" },
              { value: "all", label: "All" },
            ]}
          />
        }
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : actions.length === 0 && !error ? (
        <EmptyState title={filter === "pending_approval" ? "Queue is clear" : "Nothing here"} hint="New drafts from email, WhatsApp or SMS will appear in this queue." />
      ) : (
        actions.map((action) => (
          <article className="card" key={action.id} aria-label={`${action.type} to ${action.targetSystem}`}>
            <div className="card-head">
              <h3>{action.type} → {action.targetSystem}</h3>
              <Badge status={action.status} />
            </div>
            {typeof action.payload.draft === "string" && <div className="draft">{action.payload.draft}</div>}
            <p className="meta">
              {action.rationale ?? "No rationale recorded"} · risk {action.riskLevel} · autonomy {action.autonomyLevelApplied ?? "none"} ·{" "}
              {new Date(action.createdAt).toLocaleString()}
            </p>
            {action.status === "pending_approval" && (
              <div className="row">
                <Btn variant="primary" size="sm" loading={acting === `approve:${action.id}`} onClick={() => decide(action.id, "approve")}>
                  Approve &amp; send
                </Btn>
                <Btn variant="danger" size="sm" loading={acting === `reject:${action.id}`} onClick={() => decide(action.id, "reject")}>
                  Reject
                </Btn>
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}
