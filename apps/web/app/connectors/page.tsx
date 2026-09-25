"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getSession } from "@/lib/api";

interface ProviderStatus {
  connected: boolean;
  email?: string;
  phoneNumberId?: string;
  fromNumber?: string;
  health?: string;
}

interface ConnectorStatus {
  google: ProviderStatus;
  microsoft: ProviderStatus;
  whatsapp: ProviderStatus;
  sms: ProviderStatus;
  googleOAuthConfigured: boolean;
  microsoftOAuthConfigured: boolean;
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
  const [smsForm, setSmsForm] = useState({ accountSid: "", authToken: "", fromNumber: "" });

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
    const msResult = searchParams.get("microsoft");
    if (msResult === "connected") setNotice("Microsoft account connected.");
    if (msResult === "error") setError("Connecting your Microsoft account failed — check the server logs.");
  }, [load, searchParams]);

  async function connect(provider: "google" | "microsoft") {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(`/connectors/${provider}/connect`);
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function sync(provider: "gmail" | "outlook") {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ synced: number }>(`/connectors/${provider}/sync`, { method: "POST" });
      setNotice(`Synced ${result.synced} new message${result.synced === 1 ? "" : "s"}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect(provider: "google" | "microsoft" | "whatsapp" | "sms") {
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

  async function submitSms(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/connectors/twilio/configure", { method: "POST", body: JSON.stringify(smsForm) });
      setNotice("Twilio SMS number configured.");
      setSmsForm({ accountSid: "", authToken: "", fromNumber: "" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!status) {
    return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;
  }

  const emailConnected = status.google.connected || status.microsoft.connected;

  return (
    <div>
      <h2>Connectors</h2>
      <p className="muted">Connect the accounts the Agent reads from and acts on behalf of.</p>
      {notice && <p style={{ color: "var(--success)" }}>{notice}</p>}
      {error && <p className="error">{error}</p>}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginTop: 0 }}>
          <h3>Email &amp; Calendar</h3>
          <span className={`badge ${emailConnected ? "executed" : ""}`}>{emailConnected ? "connected" : "not connected"}</span>
        </div>
        <p className="muted">One provider at a time — connecting the other replaces this one.</p>
        {status.google.connected && (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Gmail &amp; Google Calendar — {status.google.email}</span>
            <div className="row" style={{ marginTop: 0 }}>
              <button onClick={() => sync("gmail")} disabled={syncing}>
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              <button className="danger" onClick={() => disconnect("google")}>
                Disconnect
              </button>
            </div>
          </div>
        )}
        {status.microsoft.connected && (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>Outlook &amp; Microsoft Calendar — {status.microsoft.email}</span>
            <div className="row" style={{ marginTop: 0 }}>
              <button onClick={() => sync("outlook")} disabled={syncing}>
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              <button className="danger" onClick={() => disconnect("microsoft")}>
                Disconnect
              </button>
            </div>
          </div>
        )}
        {!emailConnected && (
          <div className="row">
            <button className="primary" onClick={() => connect("google")} disabled={!status.googleOAuthConfigured}>
              Connect Google
            </button>
            <button className="primary" onClick={() => connect("microsoft")} disabled={!status.microsoftOAuthConfigured}>
              Connect Microsoft
            </button>
          </div>
        )}
        {!status.googleOAuthConfigured && !status.microsoftOAuthConfigured && !emailConnected && (
          <p className="muted">
            Server has no OAuth client configured for either provider — set GOOGLE_CLIENT_ID/SECRET or
            MICROSOFT_CLIENT_ID/SECRET (see README).
          </p>
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

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginTop: 0 }}>
          <h3>SMS (Twilio)</h3>
          <span className={`badge ${status.sms.connected ? "executed" : ""}`}>
            {status.sms.connected ? "connected" : "not connected"}
          </span>
        </div>
        {status.sms.connected ? (
          <>
            <p className="muted">from: {status.sms.fromNumber}</p>
            <button className="danger" onClick={() => disconnect("sms")}>
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              From a <a href="https://console.twilio.com" target="_blank" rel="noreferrer">Twilio console</a>, copy your
              Account SID, an auth token, and a purchased phone number.
            </p>
            <form onSubmit={submitSms}>
              <label>Account SID</label>
              <input value={smsForm.accountSid} onChange={(e) => setSmsForm({ ...smsForm, accountSid: e.target.value })} required />
              <label>Auth token</label>
              <input
                type="password"
                value={smsForm.authToken}
                onChange={(e) => setSmsForm({ ...smsForm, authToken: e.target.value })}
                required
              />
              <label>From number (E.164, e.g. +15551234567)</label>
              <input
                value={smsForm.fromNumber}
                onChange={(e) => setSmsForm({ ...smsForm, fromNumber: e.target.value })}
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
