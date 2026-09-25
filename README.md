# the Agent — Personal & Business AI Agent

This repo implements the roadmap's **Phase 0: Foundations** plus a first real slice
of **Phase 1**: live Gmail, Google Calendar, and WhatsApp Business connectors on top
of the Phase 0 scaffolding (tenancy, auth, event bus, model router, policy engine,
audit trail). A message arriving by real email or real WhatsApp — or one sent through
the demo `/events/inbound` endpoint — flows through the exact same pipeline: ingest →
triage → draft → policy decision → approval queue → real send → audit log.

See the product doc ("Personal & Business AI Agent — PRD and Architecture") for the
full vision, roadmap, and section numbers referenced throughout the code as `PRD §N`.

## What's here

A pnpm/TypeScript monorepo:

```
apps/
  api/            Fastify backend — auth, ingestion, orchestrator, connectors, approvals, audit, policy
  web/             Next.js control center — approvals queue, activity feed, policy editor, connectors
packages/
  core/            Shared domain types (Tenant, Contact, Thread, Action, autonomy levels, ...)
  db/              Drizzle ORM schema + migrations (Postgres + pgvector)
  secrets/         Envelope-encryption vault for OAuth tokens/credentials (KMS-swappable)
  auth/            Password hashing, JWT sessions, signed OAuth `state` tokens
  connectors/      Google OAuth + Gmail + Calendar clients; WhatsApp Cloud API client + webhook parsing
  model-router/    Provider-agnostic model router (Claude primary, Grok/xAI, mock fallback)
  event-bus/       Pub/sub abstraction (in-memory for dev, Redis/BullMQ for durability)
  policy-engine/   Autonomy ladder (L0–L4) + hard guardrails evaluator
  audit/           Append-only audit log writer/reader
  evals/           Eval harness stub + example triage-classification cases
```

### How a message flows through the system (PRD §5)

1. **Ingestion.** A real Gmail message (polled via `POST /connectors/gmail/sync`,
   `apps/api/src/services/gmail-sync.ts`) or a real WhatsApp message (pushed to
   `POST /webhooks/whatsapp`) — or a demo `POST /events/inbound` call — normalizes to
   one contact + one thread (`apps/api/src/services/ingestion.ts`) and publishes a
   `message.inbound` event. Every path is idempotent on the provider's own message id,
   so a Meta webhook retry or a re-run poll never double-ingests.
2. The orchestrator (`apps/api/src/services/orchestrator.ts`) picks the event up,
   classifies it via the model router (`triage_classify`), drafts a reply
   (`draft_reply`), and proposes an `Action`.
3. The policy engine (`packages/policy-engine`) evaluates the action against the
   tenant's autonomy level for that action type plus hard guardrails (blocklists,
   VIP contacts, spend limits, rate limits, kill switch) — deny-by-default for any
   action type with no configured autonomy level.
4. `ALLOW` or a human `approve` → **executed for real** (`apps/api/src/services/executor.ts`
   dispatches by action type: `send_email` → Gmail send, `send_whatsapp` → WhatsApp
   Cloud API send, `book_calendar_event`/`reschedule_calendar_event` → Google
   Calendar). A connector failure marks the action `failed` with the error captured —
   it never gets silently marked as sent. `NEEDS_APPROVAL` → sits in the Approvals
   queue. `DENY` → rejected outright.
5. Every step writes an append-only audit entry (`packages/audit`) with what happened
   and why, visible in the control center's Activity feed.

Nothing reaches a connector without passing through the policy engine — that's the
one architectural invariant the whole system is built to preserve as more connectors
(Outlook, SMS, CRMs, accounting, ...) are added on top of the same seam.

## What's real vs. stubbed

- **Real**: multi-tenant Postgres schema + migrations, JWT auth, the policy engine's
  guardrail logic, the model router's provider fallback chain, the event bus (both
  in-memory and Redis-backed), the audit trail, the Next.js control center talking to
  a live API, **Gmail send + polling sync**, **Google Calendar create/update/list/freeBusy**,
  **WhatsApp Business Cloud API send + inbound webhook** (signature-verified), OAuth
  token storage via the envelope-encryption vault with automatic refresh.
- **Stubbed / not yet built**: Outlook, SMS/RCS, voice, CRM/helpdesk/accounting/e-commerce
  connectors — any action type without a case in `executeAction` is logged as a no-op
  rather than failing, so the rest of the pipeline stays exercisable while those are
  built one at a time. Gmail push notifications (Pub/Sub) aren't wired — inbox sync is
  poll-based (`POST /connectors/gmail/sync`) since Pub/Sub needs a verified GCP topic
  and domain to provision, which is infrastructure setup, not code. There's no
  RAG/document retrieval yet (the `documents`/`document_chunks` tables exist in the
  schema so that migration isn't a breaking one later). WhatsApp onboarding is a manual
  paste of credentials from Meta's own setup, not an embedded-signup flow.

## Local setup

Requirements: Node 20+, pnpm (`corepack enable`), Docker (for Postgres + Redis) —
or local Postgres 16 with the `pgvector` extension and local Redis if you'd rather
not use Docker.

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, VAULT_MASTER_KEY at minimum

docker compose up -d           # Postgres (pgvector) + Redis
pnpm db:generate                # generate SQL migrations from packages/db/src/schema.ts
pnpm db:migrate                 # apply them (also runs CREATE EXTENSION vector)

pnpm dev:api                    # http://localhost:4000
pnpm dev:web                    # http://localhost:3000
```

Generate `VAULT_MASTER_KEY` with `openssl rand -base64 32` — it's the key-encryption
key for every OAuth token and credential stored in Postgres. Without `REDIS_URL` set,
the API falls back to the in-memory event bus (fine for a single-process dev loop,
not for anything durable). Without `ANTHROPIC_API_KEY` / `XAI_API_KEY`, the model
router falls back to a deterministic no-network mock provider
(`ALLOW_MOCK_MODEL_FALLBACK`, on by default) — triage/drafting output will just be an
echo, not a real classification.

### Connecting Google (Gmail + Calendar)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or
   use an existing one) and enable the **Gmail API** and **Google Calendar API**.
2. Configure the OAuth consent screen (External, unless you're on Workspace and want
   Internal). While the app is unverified you can add your own account(s) as test
   users — that's enough for development; public launch needs Google's app
   verification (PRD §4/§10 — restricted scopes like `gmail.modify` require it).
3. Create an **OAuth client ID** (type: Web application) under Credentials. Add
   `${API_URL}/connectors/google/callback` as an authorized redirect URI
   (`http://localhost:4000/connectors/google/callback` for local dev).
4. Put the client ID/secret in `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. Open the control center's **Connectors** page and click **Connect Google** — you'll
   be sent through Google's consent screen and back. Click **Sync Gmail now** to pull
   recent inbox messages through the same pipeline as everything else.

Google only returns a refresh token on a user's *first* consent for an app. If you
disconnect and reconnect and get an error, revoke the app's access at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions) first.

### Connecting WhatsApp (Business Cloud API)

There's no per-tenant OAuth flow for WhatsApp the way there is for Google — Meta
requires going through their own onboarding first:

1. Create a [Meta developer app](https://developers.facebook.com/apps/) and add the
   **WhatsApp** product to it.
2. In WhatsApp → API Setup, note the **phone number ID** and generate a token (a
   temporary token works for testing; production needs a permanent System User token).
3. In the app's **Basic Settings**, copy the **App Secret** — set it as
   `WHATSAPP_APP_SECRET` in `.env` (used to verify webhook signatures).
4. Pick your own `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (any random string) and set it in
   `.env` too.
5. Under WhatsApp → Configuration, set the webhook URL to
   `${API_URL}/webhooks/whatsapp` and the verify token to the value from step 4, then
   subscribe to the `messages` field. **Local dev needs a public URL** for Meta to
   reach — tunnel your API with `ngrok http 4000` (or similar) and use the tunnel's
   HTTPS URL here.
6. In the control center's **Connectors** page, paste the phone number ID, WABA ID,
   and access token from step 2 into the WhatsApp form.

Free-form replies only work inside the 24-hour customer service window opened by the
customer's own message (PRD §4); outside it, sending requires a pre-approved template
(`sendWhatsAppTemplate` in `packages/connectors/src/whatsapp/client.ts` — not yet
wired into the orchestrator's auto-draft path, which assumes the window is open).

### Try the full loop without any real credentials

```bash
# 1. Create a tenant (you become its owner)
curl -X POST localhost:4000/auth/signup -H 'Content-Type: application/json' \
  -d '{"tenantName":"Acme Co","tenantType":"business","email":"owner@acme.test","password":"correct-horse-battery"}'
# -> {"token": "...", ...}  — save the token

# 2. Raise autonomy for WhatsApp replies to "approve to act" (defaults to Observe/deny)
curl -X PATCH localhost:4000/policy -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"autonomyByActionType":{"send_whatsapp":"L2_APPROVE_TO_ACT"}}'

# 3. Simulate an inbound WhatsApp message (the demo path — bypasses the real webhook and Meta account lookup)
curl -X POST localhost:4000/events/inbound -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"channel":"whatsapp","contactHandle":"+15551234567","contactName":"Jane","content":"Can I get a quote for 500 units?"}'

# 4. Open http://localhost:3000, log in, and see it waiting in Approvals
```

Approving it without a connected WhatsApp account will correctly fail the action
(status `failed`, the error captured on the action and in the audit trail) rather than
pretending to have sent anything — connect a real account first (or a test one via
step 6 above) to see it actually send.

Or run the eval harness stub directly: `pnpm evals`.

## Autonomy and policy (PRD §9)

Every action type defaults to `L0_OBSERVE` (no autonomous action, ever) until a
tenant explicitly raises it via `PATCH /policy` or the Policy page in the control
center. The ladder: `L0_OBSERVE → L1_SUGGEST → L2_APPROVE_TO_ACT → L3_ACT_AND_NOTIFY
→ L4_AUTONOMOUS`. Hard guardrails (blocklist, VIP first-contact, spend limits,
`alwaysRequireApproval` action types, rate limits, the kill switch) are enforced in
`packages/policy-engine/src/evaluate.ts` and can only ever tighten the outcome — no
autonomy level lets an action bypass them.

## What's next

Natural next slices, each following the same connector → executor → policy pattern
already in place: Outlook (Microsoft Graph, same shape as Gmail), SMS (Twilio/similar),
a CRM connector (HubSpot or Zoho first, per PRD §4), and the daily/weekly brief job
(F13) built on top of the event bus's scheduling primitives. Voice (PRD §7) is its own
real-time service and a bigger lift — see the PRD for the recommended build path
(managed voice platform first, LiveKit/Pipecat later).
