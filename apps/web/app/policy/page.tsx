"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTION_TYPES, AUTONOMY_LEVEL_ORDER, type ActionType, type AutonomyLevel, type TenantPolicy } from "@agent/core";
import { apiFetch, getSession } from "@/lib/api";

export default function PolicyPage() {
  const router = useRouter();
  const [policy, setPolicy] = useState<TenantPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;
  }

  function setAutonomy(actionType: ActionType, level: AutonomyLevel) {
    setPolicy((p) => (p ? { ...p, autonomyByActionType: { ...p.autonomyByActionType, [actionType]: level } } : p));
  }

  async function save() {
    if (!policy) return;
    setSaving(true);
    setError(null);
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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2>Policy</h2>
      <p className="muted">
        Autonomy per action type (PRD §9). An action type with no level set defaults to Observe — the Agent will
        never act on it without human approval.
      </p>

      <div className="card">
        <h3>Kill switch</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={policy.killSwitchEngaged}
            onChange={(e) => setPolicy({ ...policy, killSwitchEngaged: e.target.checked })}
          />
          Pause all outbound actions for this tenant
        </label>
      </div>

      <div className="card">
        <h3>Spend limits (minor units, e.g. cents)</h3>
        <label>Max per action</label>
        <input
          type="number"
          value={policy.guardrails.maxSpendPerActionMinor}
          onChange={(e) =>
            setPolicy({
              ...policy,
              guardrails: { ...policy.guardrails, maxSpendPerActionMinor: Number(e.target.value) },
            })
          }
        />
        <label>Max per day</label>
        <input
          type="number"
          value={policy.guardrails.maxSpendPerDayMinor}
          onChange={(e) =>
            setPolicy({ ...policy, guardrails: { ...policy.guardrails, maxSpendPerDayMinor: Number(e.target.value) } })
          }
        />
      </div>

      <div className="card">
        <h3>Autonomy by action type</h3>
        {ACTION_TYPES.map((actionType) => (
          <div key={actionType} className="row" style={{ justifyContent: "space-between" }}>
            <span>{actionType}</span>
            <select
              style={{ width: 220 }}
              value={policy.autonomyByActionType[actionType] ?? "L0_OBSERVE"}
              onChange={(e) => setAutonomy(actionType, e.target.value as AutonomyLevel)}
            >
              {AUTONOMY_LEVEL_ORDER.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save policy"}
      </button>
    </div>
  );
}
