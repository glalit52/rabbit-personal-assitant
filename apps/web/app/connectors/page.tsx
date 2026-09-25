"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getSession } from "@/lib/api";

interface ConnectorStatus {
  google: { connected: boolean; email?: string; health?: string };
  whatsapp: { connected: boolean; phoneNumberId?: string; health?: string };
  googleOAuthConfigured: boolean;
}

export default function ConnectorsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <ConnectorsPageContent />
    </Suspense>
  );
}

function ConnectorsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [waForm, setWaForm] = useState({ phoneNumberId: "", accessToken: "", wabaId: "" });

  const load = useCallback(async () => {
    if (!getSession()) {
      router.replace("/login");
      return;
    }
    try {
      setStatus(await apiFetch<ConnectorStatus>("/connectors/status"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [router]);

  useEffect(() => {
    load();
    const googleResult = searchParams.get("google");
    if (googleResult === "connected") setNotice("Google account connected.");
    if (googleResult === "error") setError("Connecting your Google account failed — check the server logs.");
  }, [load, searchParams]);

  async function connectGoogle() {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/connectors/google/connect");
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function syncGmail() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ synced: number }>("/connectors/gmail/sync", { method: "POST" });
      setNotice(`Synced ${result.synced} new message${result.synced === 1 ? "" : "s"} from Gmail.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect(provider: "google" | "whatsapp") {
    await apiFetch(`/connectors/${provider}/disconnect`, { method: "POST" });
    load();
  }

  async function submitWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/connectors/whatsapp/configure", { method: "POST", body: JSON.stringify(waForm) });
      setNotice("WhatsApp Business number configured.");
      setWaForm({ phoneNumberId: "", accessToken: "", wabaId: "" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!status) {
    return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;
  }

  return (
    <div>
      <h2>Connectors</h2>
      <p className="muted">Connect the accounts the Agent reads from and acts on behalf of.</p>
      {notice && <p style={{ color: "var(--success)" }}>{notice}</p>}
      {error && <p className="error">{error}</p>}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginTop: 0 }}>
          <h3>Gmail &amp; Google Calendar</h3>
          <span className={`badge ${status.google.connected ? "executed" : ""}`}>
            {status.google.connected ? "connected" : "not connected"}
          </span>
        </div>
        {status.google.connected ? (
          <>
            <p className="muted">{status.google.email}</p>
            <div className="row">
              <button className="primary" onClick={syncGmail} disabled={syncing}>
                {syncing ? "Syncing…" : "Sync Gmail now"}
              </button>
              <button className="danger" onClick={() => disconnect("google")}>
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            {!status.googleOAuthConfigured && (
              <p className="muted">
                Server has no Google OAuth client configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README).
              </p>
            )}
            <button className="primary" onClick={connectGoogle} disabled={!status.googleOAuthConfigured}>
              Connect Google
            </button>
          </>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginTop: 0 }}>
          <h3>WhatsApp Business</h3>
          <span className={`badge ${status.whatsapp.connected ? "executed" : ""}`}>
            {status.whatsapp.connected ? "connected" : "not connected"}
          </span>
        </div>
        {status.whatsapp.connected ? (
          <>
            <p className="muted">phone_number_id: {status.whatsapp.phoneNumberId}</p>
            <button className="danger" onClick={() => disconnect("whatsapp")}>
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              Complete Meta&apos;s WhatsApp Business setup first (see README), then paste the resulting IDs here.
            </p>
            <form onSubmit={submitWhatsApp}>
              <label>Phone number ID</label>
              <input
                value={waForm.phoneNumberId}
                onChange={(e) => setWaForm({ ...waForm, phoneNumberId: e.target.value })}
                required
              />
              <label>WABA ID</label>
              <input value={waForm.wabaId} onChange={(e) => setWaForm({ ...waForm, wabaId: e.target.value })} required />
              <label>Access token</label>
              <input
                type="password"
                value={waForm.accessToken}
                onChange={(e) => setWaForm({ ...waForm, accessToken: e.target.value })}
                required
              />
              <div className="row">
                <button className="primary" type="submit">
                  Save
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
