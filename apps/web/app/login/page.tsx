"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, setSession, type Session } from "@/lib/api";
import { Btn, Select } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [tenantName, setTenantName] = useState("");
  const [tenantType, setTenantType] = useState<"personal" | "business">("personal");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const session =
        mode === "login"
          ? await apiFetch<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })
          : await apiFetch<Session>("/auth/signup", {
              method: "POST",
              body: JSON.stringify({ tenantName, tenantType, email, password }),
            });
      setSession(session);
      router.push("/brief");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div className="brand-mark" aria-hidden="true">A</div>
          <div>
            <h1 style={{ fontSize: 18 }}>the Agent</h1>
            <div className="muted" style={{ marginTop: -2 }}>Control Center</div>
          </div>
        </div>
        <p className="muted" style={{ margin: "0 0 16px" }}>
          {mode === "login" ? "Sign in to review drafts, promises and activity." : "Create your tenant. You become the owner."}
        </p>
        <form onSubmit={onSubmit} noValidate>
          {mode === "signup" && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="tenant-name">Tenant name *</label>
                <input id="tenant-name" className="input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} required autoComplete="organization" placeholder="Acme Co" />
              </div>
              <div className="field">
                <span className="field-label" id="tenant-type-label">Tenant type</span>
                <Select
                  label="Tenant type"
                  value={tenantType}
                  onChange={(v) => setTenantType(v as "personal" | "business")}
                  options={[
                    { value: "personal", label: "Personal" },
                    { value: "business", label: "Business" },
                  ]}
                />
              </div>
            </>
          )}
          <div className="field">
            <label className="field-label" htmlFor="email">Email *</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@company.com" aria-invalid={Boolean(error)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">Password *</label>
            <div className="pw-wrap">
              <input
                id="password"
                className="input"
                style={{ paddingRight: 64 }}
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "auth-error" : undefined}
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}>
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            <div className="field-hint">Minimum 8 characters.</div>
          </div>
          {error && <p className="form-error" id="auth-error" role="alert">{error}</p>}
          <div className="row" style={{ marginTop: 16 }}>
            <Btn variant="primary" type="submit" loading={loading} style={{ flex: 1 }}>
              {mode === "login" ? "Sign in" : "Create tenant"}
            </Btn>
          </div>
          <div className="row">
            <Btn variant="ghost" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }} style={{ flex: 1 }}>
              {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}
