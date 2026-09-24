# the Agent — Personal & Business AI Agent

This repo implements **Phase 0: Foundations** from the product's roadmap: the
scaffolding every later phase (real channel connectors, voice, business systems)
plugs into. It does not yet talk to Gmail, WhatsApp, or any other external system —
there's one demo ingestion endpoint standing in for real channel adapters, so the
whole pipeline (ingest → triage → draft → policy decision → approval queue → audit
log) can be exercised end to end before any connector exists.

See the product doc ("Personal & Business AI Agent — PRD and Architecture") for the
full vision, roadmap, and section numbers referenced throughout the code as `PRD §N`.

## What's here

A pnpm/TypeScript monorepo:

```
apps/
  api/            Fastify backend — auth, ingestion, orchestrator, approvals, audit, policy
  web/             Next.js control center — approvals queue, activity feed, policy editor
packages/
  core/            Shared domain types (Tenant, Contact, Thread, Action, autonomy levels, ...)
  db/              Drizzle ORM schema + migrations (Postgres + pgvector)
  secrets/         Envelope-encryption vault for OAuth tokens/credentials (KMS-swappable)
  auth/            Password hashing + JWT session issuing/verifying
  model-router/    Provider-agnostic model router (Claude primary, Grok/xAI, mock fallback)
  event-bus/       Pub/sub abstraction (in-memory for dev, Redis/BullMQ for durability)
  policy-engine/   Autonomy ladder (L0–L4) + hard guardrails evaluator
  audit/           Append-only audit log writer/reader
  evals/           Eval harness stub + example triage-classification cases
```

### How a message flows through the system (PRD §5)

1. `POST /events/inbound` normalizes an inbound message to one contact + one thread
   (`apps/api/src/services/ingestion.ts`) and publishes a `message.inbound` event.
2. The orchestrator (`apps/api/src/services/orchestrator.ts`) picks it up, classifies
   it via the model router (`triage_classify`), drafts a reply (`draft_reply`), and
   proposes an `Action`.
3. The policy engine (`packages/policy-engine`) evaluates the action against the
   tenant's autonomy level for that action type plus hard guardrails (blocklists,
   VIP contacts, spend limits, rate limits, kill switch) — deny-by-default for any
   action type with no configured autonomy level.
4. `ALLOW` → executed immediately (execution itself is a stub — logged, nothing sent
   anywhere — until real connectors exist). `NEEDS_APPROVAL` → sits in the Approvals
   queue until a human decides. `DENY` → rejected outright.
5. Every step writes an append-only audit entry (`packages/audit`) with what happened
   and why, visible in the control center's Activity feed.

Nothing reaches this system's stub "connector" without passing through the policy
engine — that's the one architectural invariant this phase exists to prove out
before real connectors (Gmail, WhatsApp, calendars, CRMs, ...) are added on top.

## What's real vs. stubbed

- **Real**: multi-tenant Postgres schema + migrations, JWT auth, the policy engine's
  guardrail logic, the model router's provider fallback chain, the event bus (both
  in-memory and Redis-backed), the audit trail, the Next.js control center talking to
  a live API.
- **Stubbed for this phase**: channel adapters (one demo HTTP endpoint stands in for
  Gmail/WhatsApp/SMS webhooks), action *execution* (policy decisions are real; actually
  sending a WhatsApp message or creating an invoice is not — see `proposeAndDecideAction`
  in `apps/api/src/services/actions.ts`), the secrets vault has a local envelope-encryption
  implementation but no real KMS integration, and there's no RAG/document retrieval yet
  (the `documents`/`document_chunks` tables exist in the schema so that migration isn't
  a breaking one later).

## Local setup

Requirements: Node 20+, pnpm (`corepack enable`), Docker (for Postgres + Redis) —
or local Postgres 16 with the `pgvector` extension and local Redis if you'd rather
not use Docker.

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET at minimum

docker compose up -d           # Postgres (pgvector) + Redis
pnpm db:generate                # generate SQL migrations from packages/db/src/schema.ts
pnpm db:migrate                 # apply them (also runs CREATE EXTENSION vector)

pnpm dev:api                    # http://localhost:4000
pnpm dev:web                    # http://localhost:3000
```

Without `REDIS_URL` set, the API falls back to the in-memory event bus (fine for a
single-process dev loop, not for anything durable). Without `ANTHROPIC_API_KEY` /
`XAI_API_KEY`, the model router falls back to a deterministic no-network mock
provider (`ALLOW_MOCK_MODEL_FALLBACK`, on by default) so the rest of the stack is
runnable without API keys — triage/drafting output will just be an echo, not a real
classification.

### Try the full loop

```bash
# 1. Create a tenant (you become its owner)
curl -X POST localhost:4000/auth/signup -H 'Content-Type: application/json' \
  -d '{"tenantName":"Acme Co","tenantType":"business","email":"owner@acme.test","password":"correct-horse-battery"}'
# -> {"token": "...", ...}  — save the token

# 2. Raise autonomy for WhatsApp replies to "approve to act" (defaults to Observe/deny)
curl -X PATCH localhost:4000/policy -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"autonomyByActionType":{"send_whatsapp":"L2_APPROVE_TO_ACT"}}'

# 3. Simulate an inbound WhatsApp message
curl -X POST localhost:4000/events/inbound -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"channel":"whatsapp","contactHandle":"whatsapp:+15551234567","contactName":"Jane","content":"Can I get a quote for 500 units?"}'

# 4. Open http://localhost:3000, log in, and see it waiting in Approvals
```

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

The roadmap's Phase 1 (Personal MVP) is the natural next slice: replace the demo
`/events/inbound` endpoint with real Gmail/Outlook push adapters, add calendar
read/write, and build out the daily-brief and follow-up-chasing jobs on top of the
event bus and workflow primitives already in place here.
