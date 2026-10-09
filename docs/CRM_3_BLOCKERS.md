# CRM 3.0 — BLOCKER REGISTER
> Every blocker that prevents VERIFIED status or production deployment.
> Updated after every session. Resolved only after actual verification.

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
| P1-B1 | `.env.local` has placeholder credentials | Cannot login, cannot test any live functionality | Owner must populate: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` | Owner | 5 min | `PENDING OWNER ACTION` |
| P1-B2 | Migration 002 not applied to Supabase | `ai_intent`, `ai_sentiment`, `ai_summary`, `ai_lead_score`, `ai_next_action`, `ai_analyzed_at`, `platform`, `priority` columns missing from conversations table — AI analysis will fail with DB error | Apply `supabase/migrations/002_conversation_ai_columns.sql` via Supabase SQL editor | Owner | 5 min after P1-B1 resolved | `PENDING OWNER ACTION` |
| P1-B3 | Browser E2E test not completed | P1 cannot be marked VERIFIED | After P1-B1 + P1-B2 resolved: login → inbox → open conversation → AI analyze → AI reply → send message → verify realtime | Owner + Developer | 30–60 min | `PENDING OWNER ACTION` |
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
| P4-B1 | Migration 003 not applied to production | crm3_automation_ai_nodes, crm3_automation_executions, crm3_automation_templates tables missing | Apply `supabase/migrations/003_smart_automation_ai.sql` | Owner | After CC-B1 | `PENDING OWNER ACTION` |
| P4-B2 | CRM 2.0 automation engine runs server-side via webhooks | Full automation execution requires CRM 2.0 webhook infrastructure | CRM 3.0 manual execute works independently; full trigger-based execution needs CRM 2.0 running | Developer | After P1-B1 | `OPEN` |

---

## P5 — AI AGENTS

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P5-B1 | Migration 004 not applied to production | crm3_agent_execution_steps, crm3_agent_approvals, crm3_agent_audit_log tables missing | Apply `supabase/migrations/004_ai_agents_full.sql` | Owner | After CC-B1 | `PENDING OWNER ACTION` |
| P5-B2 | OpenAI key required for LLM reasoning | Agent uses rule-based fallback only (still functional) | Populate `OPENAI_API_KEY` | Owner | After CC-B1 | `PENDING OWNER ACTION` |
| P5-B3 | Browser E2E test not completed | P5 cannot be marked VERIFIED | After P5-B1 resolved: create agent → run → verify steps → test approval flow | Owner + Developer | After P5-B1 | `PENDING OWNER ACTION` |

---

## P6 — CONTENT STUDIO

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P6-B1 | ~~Content not persisted to DB (in-memory only)~~ | ~~Content lost on page refresh~~ | **FIXED Session 007** — now calls `/api/v3/content` POST | Developer | RESOLVED | `RESOLVED` |
| P6-B2 | crm3_content table not confirmed in production | DB persistence will fail | Apply migration 001 (P0-B1) | Owner | After P0-B1 | `PENDING OWNER ACTION` |

---

## P7 — CONTENT → REVENUE INTELLIGENCE

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P7-B1 | Migration 005 not applied | source/channel/is_won columns missing from crm3_attribution | Apply `supabase/migrations/005_attribution_enhancements.sql` | Owner | After CC-B1 | `PENDING OWNER ACTION` |
| P7-B2 | Browser E2E test not completed | P7 cannot be marked VERIFIED | After P7-B1: test attribution API, revenue dashboard, content publish flow | Owner + Developer | After P7-B1 | `PENDING OWNER ACTION` |
| P7-B3 | Real attribution data requires contacts with source + linked deals | Dashboard shows empty state without real data | Populate contacts.source field and create attribution records | Owner | After CC-B1 | `PENDING OWNER ACTION` |

---

## P8 — CUSTOMER JOURNEY BUILDER

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P8-B1 | Migration 006 not applied | crm3_journeys, crm3_journey_contact_state, crm3_journey_executions tables missing | Apply `supabase/migrations/006_journey_builder.sql` | Owner | After CC-B1 | `PENDING OWNER ACTION` |
| P8-B2 | Browser E2E test not completed | P8 cannot be marked VERIFIED | After P8-B1: create journey, add nodes, publish, execute, verify events | Owner + Developer | After P8-B1 | `PENDING OWNER ACTION` |
| P8-B3 | Wait node background execution needs server scheduler | Wait nodes pause execution but don't auto-resume | Implement background job/cron to resume waiting journeys | Developer | Post-credentials | `OPEN` |

---

## P9 — REVENUE & BUSINESS INTELLIGENCE

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P9-B1 | Not started — depends on P7 attribution + P3 leads | Revenue intelligence has no attribution data | Complete P7 first | Developer | After P7 VERIFIED | `OPEN` |

---

## P10 — AI COMMAND CENTER

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| P10-B1 | ~~All dashboard KPIs are static/demo data~~ | ~~Command center shows fake numbers~~ | **FIXED Session 011** — PipelineOverview real data, AICopilot wired to API | Developer | RESOLVED | `RESOLVED` |
| P10-B2 | ~~AI Copilot widget not connected to `/api/v3/copilot`~~ | ~~Copilot on dashboard does nothing~~ | **FIXED Session 011** — full message history, real CRM data | Developer | RESOLVED | `RESOLVED` |
| P10-B3 | Realtime updates not implemented on dashboard | Hot leads / alerts don't update live | Implement Supabase realtime subscription on dashboard | Developer | 2–3 hours | `OPEN` |

---

## CROSS-CUTTING BLOCKERS

| # | Blocker | Impact | Required Action | Owner | Est. Resolution | Status |
|---|---------|--------|-----------------|-------|-----------------|--------|
| CC-B1 | No production Supabase credentials | ALL live testing blocked | Owner provides real `.env.local` values | Owner | Owner action | `PENDING OWNER ACTION` |
| CC-B2 | No OpenAI API key (real) | All AI features fall back to rule-based | Owner provides real `OPENAI_API_KEY` | Owner | Owner action | `PENDING OWNER ACTION` |
| CC-B3 | No Anthropic API key | Claude fallback unavailable | Owner provides `ANTHROPIC_API_KEY` | Owner | Owner action | `PENDING OWNER ACTION` |
| CC-B4 | Meta (WhatsApp/Instagram/Facebook) webhook secrets not configured | Channel integrations untestable | Owner provides `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Owner | Owner action | `PENDING OWNER ACTION` |
| CC-B5 | Migration 001 + 002 not confirmed applied | CRM 3.0 tables may not exist in production | Apply both migrations via Supabase SQL editor | Owner | 15 min after CC-B1 | `PENDING OWNER ACTION` |

---

## OWNER ACTION CHECKLIST
> Complete these in order. Each unlocks the next.

- [x] **Step 1** — Provide real Supabase URL + anon key + service role key → update `.env.local` (**DONE — credentials present**)
- [ ] **Step 2** — Provide real OpenAI API key → update `.env.local`
- [ ] **Step 3** — Apply `supabase/migrations/001_crm3_foundation.sql` via Supabase SQL editor
- [ ] **Step 4** — Apply `supabase/migrations/002_conversation_ai_columns.sql` via Supabase SQL editor
- [ ] **Step 5** — Apply `supabase/migrations/003_smart_automation_ai.sql`
- [ ] **Step 6** — Apply `supabase/migrations/004_ai_agents_full.sql`
- [ ] **Step 7** — Run `npm run dev` and login to CRM 3.0
- [ ] **Step 8** — Test Inbox: open conversation → AI analyze → AI reply → send message
- [ ] **Step 9** — Test Agents: create agent → run → verify steps → test approval
- [ ] **Step 10** — Verify realtime: open inbox in 2 tabs, send message, confirm it appears
- [ ] **Step 11** — Notify developer → P1/P5 can be marked VERIFIED

---

## TIME ESTIMATES (after owner provides credentials)

| Task | Estimated Time |
|------|---------------|
| Apply migrations 001 + 002 | 15–30 min |
| P1 browser E2E test | 30–60 min |
| P1 channel regression test | 60–120 min |
| P2 Customer 360 live test | 30 min |
| P3 Lead Intelligence live test | 30 min |
| Full production hardening audit | 4–8 hours |
| **Total after credentials** | **~8–12 hours** |

---

*Last updated: Session 004 Final Verification*
*Next update: Session 005*
