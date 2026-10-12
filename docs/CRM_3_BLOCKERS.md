# CRM 3.0 — BLOCKER REGISTER
> Every blocker that prevents VERIFIED status or production deployment.
> Updated after every session. Resolved only after actual verification.
> Last updated: Session 012

---

## BLOCKER STATUS LEGEND
| Status | Meaning |
|--------|---------|
| `OPEN` | Blocker active — work cannot proceed past this point |
| `PENDING OWNER ACTION` | Developer done — owner must act |
| `IN PROGRESS` | Being resolved |
| `RESOLVED` | Confirmed fixed and tested |

---

## P0 — FOUNDATION

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P0-B1 | Migration 001 not confirmed applied to production Supabase | crm3_content, crm3_attribution, crm3_journey_events, crm3_ai_agents, crm3_ai_agent_runs, crm3_next_best_actions, crm3_ai_operations, crm3_segments tables may not exist | Apply `supabase/migrations/001_crm3_foundation.sql` via Supabase dashboard SQL editor | Owner | 15 min after credentials | `PENDING OWNER ACTION` |

---

## P1 — UNIFIED CONVERSATIONS

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P1-B1 | OpenAI API key is placeholder (sk-...) | All AI features fall back to rule-based only | Owner must populate real `OPENAI_API_KEY` in `.env.local` | Owner | 5 min | `PENDING OWNER ACTION` |
| P1-B2 | Migration 002 not applied to Supabase | `ai_intent`, `ai_sentiment`, `ai_summary`, `ai_lead_score`, `ai_next_action`, `ai_analyzed_at`, `platform`, `priority` columns missing from conversations table | Apply `supabase/migrations/002_conversation_ai_columns.sql` via Supabase SQL editor | Owner | 5 min after P0-B1 | `PENDING OWNER ACTION` |
| P1-B3 | Browser E2E test not completed | P1 cannot be marked VERIFIED | After P1-B1 + P1-B2: login → inbox → open conversation → AI analyze → AI reply → send message → verify realtime | Owner + Developer | 30–60 min | `PENDING OWNER ACTION` |
| P1-B4 | WhatsApp/Instagram/Facebook channel regression not live-tested | Cannot confirm channels not regressed | Requires live Meta webhook environment | Owner | 60–120 min | `PENDING OWNER ACTION` |

---

## P2 — CUSTOMER 360

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P2-B1 | Live Supabase required for contacts/deals/messages timeline | Customer 360 timeline shows real data only with live DB | Resolve P1-B1 first | Owner | After P1-B1 | `PENDING OWNER ACTION` |
| P2-B2 | crm3_journey_events table not confirmed in production | Journey events timeline empty | Apply migration 001 (P0-B1) | Owner | After P0-B1 | `PENDING OWNER ACTION` |

---

## P3 — AI LEAD INTELLIGENCE

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P3-B1 | OpenAI API key required for AI scoring | Lead intelligence falls back to rule-based only | Populate `OPENAI_API_KEY` in `.env.local` | Owner | After P1-B1 | `PENDING OWNER ACTION` |
| P3-B2 | contacts table `lead_score`, `lead_score_tier`, `lead_score_reason` columns — existence unconfirmed in production | Lead scoring may fail if columns missing | Verify columns exist in production Supabase contacts table | Owner | 10 min | `PENDING OWNER ACTION` |

---

## P4 — SMART AUTOMATION

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P4-B1 | Migration 003 not applied to production | crm3_automation_ai_nodes, crm3_automation_executions, crm3_automation_templates tables missing | Apply `supabase/migrations/003_smart_automation_ai.sql` | Owner | After P0-B1 | `PENDING OWNER ACTION` |
| P4-B2 | CRM 2.0 automation engine runs server-side via webhooks | Full trigger-based execution requires CRM 2.0 webhook infrastructure | CRM 3.0 manual execute works independently; full trigger-based execution needs CRM 2.0 running | Developer | After P1-B1 | `OPEN` |

---

## P5 — AI AGENTS

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P5-B1 | Migration 004 not applied to production | crm3_agent_execution_steps, crm3_agent_approvals, crm3_agent_audit_log tables missing | Apply `supabase/migrations/004_ai_agents_full.sql` | Owner | After P0-B1 | `PENDING OWNER ACTION` |
| P5-B2 | OpenAI key required for LLM reasoning | Agent uses rule-based fallback only (still functional) | Populate `OPENAI_API_KEY` | Owner | After P1-B1 | `PENDING OWNER ACTION` |
| P5-B3 | Browser E2E test not completed | P5 cannot be marked VERIFIED | After P5-B1: create agent → run → verify steps → test approval flow | Owner + Developer | After P5-B1 | `PENDING OWNER ACTION` |

---

## P6 — CONTENT STUDIO

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P6-B1 | ~~Content not persisted to DB (in-memory only)~~ | ~~Content lost on page refresh~~ | **FIXED Session 007** | Developer | RESOLVED | `RESOLVED` |
| P6-B2 | crm3_content table not confirmed in production | DB persistence will fail | Apply migration 001 (P0-B1) | Owner | After P0-B1 | `PENDING OWNER ACTION` |

---

## P7 — CONTENT → REVENUE INTELLIGENCE

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P7-B1 | Migration 005 not applied | source/channel/is_won columns missing from crm3_attribution | Apply `supabase/migrations/005_attribution_enhancements.sql` | Owner | After P0-B1 | `PENDING OWNER ACTION` |
| P7-B2 | Browser E2E test not completed | P7 cannot be marked VERIFIED | After P7-B1: test attribution API, revenue dashboard, content publish flow | Owner + Developer | After P7-B1 | `PENDING OWNER ACTION` |
| P7-B3 | Real attribution data requires contacts with source + linked deals | Dashboard shows empty state without real data | Populate contacts.source field and create attribution records | Owner | After P0-B1 | `PENDING OWNER ACTION` |

---

## P8 — CUSTOMER JOURNEY BUILDER

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P8-B1 | Migration 006 not applied | crm3_journeys, crm3_journey_contact_state, crm3_journey_executions tables missing | Apply `supabase/migrations/006_journey_builder.sql` | Owner | After P0-B1 | `PENDING OWNER ACTION` |
| P8-B2 | Browser E2E test not completed | P8 cannot be marked VERIFIED | After P8-B1: create journey, add nodes, publish, execute, verify events | Owner + Developer | After P8-B1 | `PENDING OWNER ACTION` |
| P8-B3 | ~~Journey wait-node background scheduler~~ | ~~Wait nodes pause execution but don't auto-resume~~ | **FIXED Session 014** — POST /api/v3/journeys/scheduler with idempotency locks, 3-attempt retry, exponential backoff, dead-letter state, audit log. Vercel Cron configured in vercel.json. Migration 007 adds scheduler columns. | Developer | RESOLVED | `RESOLVED` |

---

## P9 — REVENUE & BUSINESS INTELLIGENCE

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P9-B1 | Live Supabase with real deals/contacts data required | Reports show empty state without real data | Apply migrations + populate real deals data | Owner | After P0-B1 | `PENDING OWNER ACTION` |
| P9-B2 | Browser E2E test not completed | P9 cannot be marked VERIFIED | After P9-B1: test all 4 report tabs, verify charts render with real data | Owner + Developer | After P9-B1 | `PENDING OWNER ACTION` |

---

## P10 — AI COMMAND CENTER

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P10-B1 | ~~All dashboard KPIs are static/demo data~~ | ~~Command center shows fake numbers~~ | **FIXED Session 011** — all dashboard components use real data | Developer | RESOLVED | `RESOLVED` |
| P10-B2 | ~~AI Copilot widget not connected to `/api/v3/copilot`~~ | ~~Copilot on dashboard does nothing~~ | **FIXED Session 011** — full message history, real CRM data | Developer | RESOLVED | `RESOLVED` |
| P10-B3 | ~~Realtime updates not implemented on dashboard~~ | ~~Hot leads / alerts don't update live without page refresh~~ | **FIXED Session 013** — Supabase realtime subscription on deals/contacts/follow_ups, KPIs auto-refresh | Developer | RESOLVED | `RESOLVED` |
| P10-B4 | Browser E2E test not completed | P10 cannot be marked VERIFIED | After migrations applied: test dashboard KPIs, attention section, copilot, charts | Owner + Developer | After P0-B1 | `PENDING OWNER ACTION` |

---

## CROSS-CUTTING BLOCKERS

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| CC-B1 | ~~No production Supabase credentials~~ | ~~ALL live testing blocked~~ | **RESOLVED Session 011** — real Supabase URL + keys present in .env.local | Owner | RESOLVED | `RESOLVED` |
| CC-B2 | OpenAI API key is placeholder (sk-...) | All AI features fall back to rule-based | Owner provides real `OPENAI_API_KEY` | Owner | Owner action | `PENDING OWNER ACTION` |
| CC-B3 | No Anthropic API key | Claude fallback unavailable | Owner provides `ANTHROPIC_API_KEY` | Owner | Owner action | `PENDING OWNER ACTION` |
| CC-B4 | Meta (WhatsApp/Instagram/Facebook) webhook secrets not configured | Channel integrations untestable | Owner provides `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Owner | Owner action | `PENDING OWNER ACTION` |
| CC-B5 | Migrations 001–006 not confirmed applied to production | CRM 3.0 tables do not exist in production | Apply all 6 migrations via Supabase SQL editor in order | Owner | 30 min after CC-B2 | `PENDING OWNER ACTION` |

---

## OWNER ACTION CHECKLIST
> Complete these in order. Each unlocks the next.

- [x] **Step 1** — Provide real Supabase URL + anon key + service role key → update `.env.local` (**DONE**)
- [ ] **Step 2** — Provide real OpenAI API key → update `OPENAI_API_KEY` in `.env.local`
- [ ] **Step 3** — Apply `supabase/migrations/001_crm3_foundation.sql` via Supabase SQL editor
- [ ] **Step 4** — Apply `supabase/migrations/002_conversation_ai_columns.sql`
- [ ] **Step 5** — Apply `supabase/migrations/003_smart_automation_ai.sql`
- [ ] **Step 6** — Apply `supabase/migrations/004_ai_agents_full.sql`
- [ ] **Step 7** — Apply `supabase/migrations/005_attribution_enhancements.sql`
- [ ] **Step 8** — Apply `supabase/migrations/006_journey_builder.sql`
- [ ] **Step 9** — Run `npm run dev` and login to CRM 3.0
- [ ] **Step 10** — Test Dashboard: verify KPIs load, attention section shows real data, copilot responds
- [ ] **Step 11** — Test Inbox: open conversation → AI analyze → AI reply → send message
- [ ] **Step 12** — Test Leads: click Analyze on a contact → verify score + NBA appear
- [ ] **Step 13** — Test Agents: create agent → run → verify steps → test approval flow
- [ ] **Step 14** — Test Journeys: create journey → add nodes → publish → execute with contact ID
- [ ] **Step 15** — Verify realtime: open inbox in 2 tabs, send message, confirm it appears in both
- [ ] **Step 16** — Notify developer → phases can be marked VERIFIED

---

## TIME ESTIMATES (after owner provides credentials)

| Task | Estimated Time |
|------|---------------|
| Apply migrations 001–006 | 30–45 min |
| Dashboard E2E test | 20 min |
| P1 Inbox E2E test | 30–60 min |
| P1 channel regression test | 60–120 min |
| P2 Customer 360 live test | 20 min |
| P3 Lead Intelligence live test | 20 min |
| P4 Automation live test | 30 min |
| P5 Agents live test | 30 min |
| P6 Content Studio live test | 20 min |
| P7 Attribution live test | 20 min |
| P8 Journey Builder live test | 30 min |
| P9 Revenue Intelligence live test | 20 min |
| P10 Command Center live test | 20 min |
| **Total after credentials** | **~6–8 hours** |

---

*Last updated: Session 012*
