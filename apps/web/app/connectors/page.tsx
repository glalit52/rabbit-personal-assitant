"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getSession } from "@/lib/api";
import { Badge, Btn, ErrorState, PageHeader, Skel } from "@/components/ui";

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
  const [saving, setSaving] = useState<string | null>(null);
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
    if (googleResult === "error") setError("Could not connect your Google account. Check the server logs.");
    const msResult = searchParams.get("microsoft");
    if (msResult === "connected") setNotice("Microsoft account connected.");
    if (msResult === "error") setError("Could not connect your Microsoft account. Check the server logs.");
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
    setSaving("wa");
    setError(null);
    try {
      await apiFetch("/connectors/whatsapp/configure", { method: "POST", body: JSON.stringify(waForm) });
      setNotice("WhatsApp Business number configured.");
      setWaForm({ phoneNumberId: "", accessToken: "", wabaId: "" });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function submitSms(e: React.FormEvent) {
    e.preventDefault();
    setSaving("sms");
    setError(null);
    try {
      await apiFetch("/connectors/twilio/configure", { method: "POST", body: JSON.stringify(smsForm) });
      setNotice("Twilio SMS number configured.");
      setSmsForm({ accountSid: "", authToken: "", fromNumber: "" });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  if (!status) {
    return (
      <div>
        <PageHeader title="Connectors" desc="Connect the accounts the agent reads from and acts on behalf of." />
        {error ? <ErrorState message={error} onRetry={load} /> : (
          <>
            <Skel style={{ height: 150, borderRadius: 12 }} />
            <div style={{ height: 12 }} />
            <Skel style={{ height: 200, borderRadius: 12 }} />
          </>
        )}
      </div>
    );
  }

  const emailConnected = status.google.connected || status.microsoft.connected;

  return (
    <div>
      <PageHeader title="Connectors" desc="Connect the accounts the agent reads from and acts on behalf of." />
      {notice && <div className="notice" role="status">{notice}</div>}
      {error && <ErrorState message={error} />}

      <div className="card">
        <div className="card-head">
          <h3>Email &amp; Calendar</h3>
          <Badge status={emailConnected ? "connected" : "neutral"} label={emailConnected ? "connected" : "not connected"} />
        </div>
        <p className="muted" style={{ margin: "0 0 8px" }}>One provider at a time. Connecting the other replaces this one.</p>
        {status.google.connected && (
          <div className="list-item" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span>Gmail and Google Calendar (<span className="meta">{status.google.email}</span>)</span>
            <div className="row" style={{ marginTop: 0 }}>
              <Btn size="sm" loading={syncing} onClick={() => sync("gmail")}>Sync now</Btn>
              <Btn size="sm" variant="danger" onClick={() => disconnect("google")}>Disconnect</Btn>
            </div>
          </div>
        )}
        {status.microsoft.connected && (
          <div className="list-item" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span>Outlook and Microsoft Calendar (<span className="meta">{status.microsoft.email}</span>)</span>
            <div className="row" style={{ marginTop: 0 }}>
              <Btn size="sm" loading={syncing} onClick={() => sync("outlook")}>Sync now</Btn>
              <Btn size="sm" variant="danger" onClick={() => disconnect("microsoft")}>Disconnect</Btn>
            </div>
          </div>
        )}
        {!emailConnected && (
          <div className="row">
            <Btn variant="primary" onClick={() => connect("google")} disabled={!status.googleOAuthConfigured}>Connect Google</Btn>
            <Btn variant="primary" onClick={() => connect("microsoft")} disabled={!status.microsoftOAuthConfigured}>Connect Microsoft</Btn>
          </div>
        )}
        {!status.googleOAuthConfigured && !status.microsoftOAuthConfigured && !emailConnected && (
          <p className="muted">            Server has no OAuth client configured. Set GOOGLE_CLIENT_ID/SECRET or
            MICROSOFT_CLIENT_ID/SECRET (see README).</p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>WhatsApp Business</h3>
          <Badge status={status.whatsapp.connected ? "connected" : "neutral"} label={status.whatsapp.connected ? "connected" : "not connected"} />
        </div>
        {status.whatsapp.connected ? (
          <>
            <p className="muted">phone_number_id: {status.whatsapp.phoneNumberId}</p>
            <Btn variant="danger" size="sm" onClick={() => disconnect("whatsapp")}>Disconnect</Btn>
          </>
        ) : (
          <>
            <p className="muted">Complete Meta&apos;s WhatsApp Business setup first (see README), then paste the resulting IDs here.</p>
            <form onSubmit={submitWhatsApp} className="form" style={{ maxWidth: "100%" }}>
              <div className="field">
                <label className="field-label" htmlFor="wa-pnid">Phone number ID</label>
                <input id="wa-pnid" className="input" value={waForm.phoneNumberId} onChange={(e) => setWaForm({ ...waForm, phoneNumberId: e.target.value })} required autoComplete="off" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="wa-waba">WABA ID</label>
                <input id="wa-waba" className="input" value={waForm.wabaId} onChange={(e) => setWaForm({ ...waForm, wabaId: e.target.value })} required autoComplete="off" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="wa-token">Access token</label>
                <input id="wa-token" className="input" type="password" value={waForm.accessToken} onChange={(e) => setWaForm({ ...waForm, accessToken: e.target.value })} required autoComplete="new-password" />
              </div>
              <div className="row">
                <Btn variant="primary" type="submit" loading={saving === "wa"}>Save</Btn>
              </div>
            </form>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>SMS (Twilio)</h3>
          <Badge status={status.sms.connected ? "connected" : "neutral"} label={status.sms.connected ? "connected" : "not connected"} />
        </div>
        {status.sms.connected ? (
          <>
            <p className="muted">from: {status.sms.fromNumber}</p>
            <Btn variant="danger" size="sm" onClick={() => disconnect("sms")}>Disconnect</Btn>
          </>
        ) : (
          <>
            <p className="muted">From the Twilio console, copy your Account SID, an auth token, and a purchased phone number.</p>
            <form onSubmit={submitSms} className="form" style={{ maxWidth: "100%" }}>
              <div className="field">
                <label className="field-label" htmlFor="sms-sid">Account SID</label>
                <input id="sms-sid" className="input" value={smsForm.accountSid} onChange={(e) => setSmsForm({ ...smsForm, accountSid: e.target.value })} required autoComplete="off" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sms-token">Auth token</label>
                <input id="sms-token" className="input" type="password" value={smsForm.authToken} onChange={(e) => setSmsForm({ ...smsForm, authToken: e.target.value })} required autoComplete="new-password" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sms-from">From number (E.164, e.g. +15551234567)</label>
                <input id="sms-from" className="input" value={smsForm.fromNumber} onChange={(e) => setSmsForm({ ...smsForm, fromNumber: e.target.value })} required autoComplete="tel" />
                <div className="field-hint">Must match the number configured as the SMS webhook in Twilio.</div>
              </div>
              <div className="row">
                <Btn variant="primary" type="submit" loading={saving === "sms"}>Save</Btn>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
