"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTION_TYPES, AUTONOMY_LEVEL_ORDER, type ActionType, type AutonomyLevel, type TenantPolicy } from "@agent/core";
import { apiFetch, getSession } from "@/lib/api";
import { Btn, CardSkeleton, ErrorState, PageHeader, Select, Skel } from "@/components/ui";

const LEVEL_HINT: Record<string, string> = {
  L0_OBSERVE: "Never acts",
  L1_SUGGEST: "Drafts only",
  L2_APPROVE_TO_ACT: "Needs approval",
  L3_ACT_AND_NOTIFY: "Acts, then tells you",
  L4_AUTONOMOUS: "Acts silently",
};

export default function PolicyPage() {
  const router = useRouter();
  const [policy, setPolicy] = useState<TenantPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!getSession()) {
      router.replace("/login");
      return;
    }
    apiFetch<TenantPolicy>("/policy")
      .then(setPolicy)
      .catch((err) => setError((err as Error).message));
  }, [router]);

  if (!policy) {
    return (
      <div>
        <PageHeader title="Policy" desc="Autonomy per action type. Anything without a level defaults to Observe, so the agent never acts without you." />
        {error ? <ErrorState message={error} /> : (
          <>
            <CardSkeleton />
            <Skel className="skel-btn" />
          </>
        )}
      </div>
    );
  }

  function setAutonomy(actionType: ActionType, level: AutonomyLevel) {
    setSaved(false);
    setPolicy((p) => (p ? { ...p, autonomyByActionType: { ...p.autonomyByActionType, [actionType]: level } } : p));
  }

  async function save() {
    if (!policy) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<TenantPolicy>("/policy", {
        method: "PATCH",
        body: JSON.stringify({
          autonomyByActionType: policy.autonomyByActionType,
          guardrails: policy.guardrails,
          killSwitchEngaged: policy.killSwitchEngaged,
        }),
      });
      setPolicy(updated);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Policy"
        desc="Autonomy per action type. Hard guardrails always win. No level can bypass blocklists, spend limits or the kill switch."
        actions={
          <Btn variant="primary" onClick={save} loading={saving}>
            Save policy
          </Btn>
        }
      />
      {error && <ErrorState message={error} />}
      {saved && <div className="notice" role="status">Policy saved.</div>}

      <div className="card" style={policy.killSwitchEngaged ? { borderColor: "rgba(248,113,113,.5)" } : undefined}>
        <div className="card-head">
          <h3>Kill switch</h3>
          <span className={`badge ${policy.killSwitchEngaged ? "failed" : "success"}`}>{policy.killSwitchEngaged ? "engaged" : "off"}</span>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={policy.killSwitchEngaged}
            onChange={(e) => setPolicy({ ...policy, killSwitchEngaged: e.target.checked })}
          />
          Pause all outbound actions for this tenant
        </label>
      </div>

      <div className="card">
        <h3>Spend limits</h3>
        <p className="muted" style={{ margin: "0 0 12px" }}>Minor units, e.g. cents. Guardrails only ever tighten the outcome.</p>
        <div className="two-col">
          <div className="field">
            <label className="field-label" htmlFor="spend-action">Max per action</label>
            <input
              id="spend-action"
              className="input"
              type="number"
              min={0}
              value={policy.guardrails.maxSpendPerActionMinor}
              onChange={(e) => setPolicy({ ...policy, guardrails: { ...policy.guardrails, maxSpendPerActionMinor: Number(e.target.value) } })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="spend-day">Max per day</label>
            <input
              id="spend-day"
              className="input"
              type="number"
              min={0}
              value={policy.guardrails.maxSpendPerDayMinor}
              onChange={(e) => setPolicy({ ...policy, guardrails: { ...policy.guardrails, maxSpendPerDayMinor: Number(e.target.value) } })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Autonomy by action type</h3>
          <span className="meta">L0 → L4</span>
        </div>
        {ACTION_TYPES.map((actionType) => (
          <div key={actionType} className="list-item" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{actionType}</div>
              <div className="meta">{LEVEL_HINT[policy.autonomyByActionType[actionType] ?? "L0_OBSERVE"]}</div>
            </div>
            <Select
              label={`Autonomy for ${actionType}`}
              value={policy.autonomyByActionType[actionType] ?? "L0_OBSERVE"}
              onChange={(v) => setAutonomy(actionType, v as AutonomyLevel)}
              options={AUTONOMY_LEVEL_ORDER.map((level) => ({ value: level, label: level }))}
              minWidth={210}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
