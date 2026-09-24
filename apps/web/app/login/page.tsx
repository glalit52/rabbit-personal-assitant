"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, setSession, type Session } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantType, setTenantType] = useState<"personal" | "business">("personal");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
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
      router.push("/approvals");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="content" style={{ maxWidth: 420, margin: "80px auto" }}>
      <h1 style={{ fontSize: 20 }}>the Agent</h1>
      <p className="muted">
        {mode === "login" ? "Sign in to your control center." : "Create your tenant — you'll be the owner."}
      </p>
      <form onSubmit={onSubmit}>
        {mode === "signup" && (
          <>
            <label>Tenant name</label>
            <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} required />
            <label>Tenant type</label>
            <select value={tenantType} onChange={(e) => setTenantType(e.target.value as "personal" | "business")}>
              <option value="personal">Personal</option>
              <option value="business">Business</option>
            </select>
          </>
        )}
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="primary" type="submit" disabled={loading}>
            {mode === "login" ? "Sign in" : "Create tenant"}
          </button>
          <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Need an account?" : "Have an account?"}
          </button>
        </div>
      </form>
    </div>
  );
}
