# CRM 3.0 — COMPLETE WORK DIVISION
# Last Updated: Full Audit Session
# Based on: Full scan of every frontend page, backend file, AI service, DB migration
# ─────────────────────────────────────────────────────────────────────────────

---

## ✅ ALREADY 100% DONE — NO WORK NEEDED

| Area | What's done |
|------|------------|
| Dashboard (P10) | Real data, realtime, AI insights, copilot widget |
| Inbox / Conversations (P1) | Full AI inbox, reply assist, intent, sentiment |
| Leads / AI Lead Intelligence (P3) | Full scoring, tier badges, NBA |
| Pipeline & CRM | Kanban deal board + CRM lead board (Sharvani integrated) |
| Customer 360 (P2) | Full timeline, AI summary, journey stage |
| Automations (P4) | AI-enhanced, templates, execution history |
| AI Agents (P5) | 16-tool registry, approval gates, audit log |
| Content Studio (P6) | AI generator, calendar, grid, DB persistence |
| Revenue Attribution (P7) | Full attribution chain, funnel, charts |
| Journey Builder (P8) | Visual builder, scheduler, wait nodes |
| Revenue Intelligence (P9) | 4 report tabs, forecast, win/loss, cohort |
| AI Copilot | Full chat, 8 suggested queries, real CRM data |
| Segments | List + create modal, API-backed |
| Backend: contacts.py | Full CRUD ✅ |
| Backend: conversations.py | Full CRUD + messages ✅ |
| Backend: deals.py | Full CRUD + stats + move + pipeline-stages ✅ |
| Backend: leads.py | List + AI analyze ✅ |
| Backend: reports.py | Revenue + leads + conversations ✅ |
| Backend: command_center.py | Full intelligence dashboard ✅ |
| Backend: auth.py | Login + logout ✅ |
| Backend: webhooks.py | WhatsApp verify + receive ✅ |
| Backend: health.py | Health check ✅ |
| Backend: content.py | List + create + generate ✅ |
| Backend: automations.py | List + toggle + logs ✅ |
| Backend: agents.py | List + create + run + runs ✅ |
| Backend: campaigns.py | List + intelligence ✅ |
| AI Service: lead_intelligence.py | Full scoring + LLM summary ✅ |
| AI Service: agents.py | Agent run + tool validation ✅ |
| AI Service: content_gen.py | Content generation ✅ |
| AI Service: llm/provider.py | OpenAI + Anthropic + fallback ✅ |
| All 10 DB migrations | Files created ✅ |

---
---
---

# 👨‍💻 YOUR TASKS (OWNER)
# Only YOU can do these. No developer can do them for you.
# ─────────────────────────────────────────────────────────────────────────────

## O-1 — Apply ALL Migrations to Supabase ⚠️ CRITICAL — DO THIS FIRST
**Blocks:** Every single CRM 3.0 feature. Nothing works without this.
**Where:** Supabase Dashboard → SQL Editor → paste each file → Run

Run in this exact order:
1. `supabase/migrations/000_crm3_standalone_base.sql`
2. `supabase/migrations/001_crm3_foundation.sql`
3. `supabase/migrations/002_conversation_ai_columns.sql`
4. `supabase/migrations/003_smart_automation_ai.sql`
5. `supabase/migrations/004_ai_agents_full.sql`
6. `supabase/migrations/005_attribution_enhancements.sql`
7. `supabase/migrations/006_journey_builder.sql`
8. `supabase/migrations/007_journey_scheduler.sql`
9. `supabase/migrations/008_auth_trigger.sql`
10. `supabase/migrations/009_fix_profiles_rls.sql`

**Time:** 30–45 minutes

---

## O-2 — Add Real OpenAI API Key
**File:** `.env.local`
**Change this line:** `OPENAI_API_KEY=sk-proj-YOUR-REAL-KEY-HERE`
**Why:** All AI features fall back to rule-based without it (still works, just no GPT)

---

## O-3 — Add WhatsApp / Meta Credentials
**File:** `.env.local`
Add real values:
- `WHATSAPP_VERIFY_TOKEN=your-token`
- `WHATSAPP_APP_SECRET=your-secret`
- `WHATSAPP_PHONE_NUMBER_ID=your-phone-id`
**Why:** WhatsApp channel won't receive/send messages without these

---

## O-4 — Browser E2E Testing (after O-1 + O-2)
Test every feature and report bugs to Amazon Q:
- [ ] Dashboard: KPIs load, attention section, copilot responds
- [ ] Inbox: open conversation → AI analyze → AI reply → send message
- [ ] Leads: click Analyze → score + NBA appear
- [ ] Pipeline & CRM: create deal, move stage, create lead, move status
- [ ] Agents: create agent → run → verify steps → test approval
- [ ] Journeys: create journey → add nodes → publish → execute with contact
- [ ] Content Studio: generate → save draft → publish
- [ ] Revenue: attribution dashboard loads with data
- [ ] Reports: all 4 tabs load
- [ ] Contacts: add contact, edit, delete
- [ ] Follow-ups: create, mark done
- [ ] Segments: create segment

---
---
---

# 👩‍💻 SHARVANI'S TASKS (FRONTEND)
# All frontend UI work. Use Supabase client directly (already set up).
# ─────────────────────────────────────────────────────────────────────────────

## S-1 — Contacts Page: Add Contact Modal
**File:** `src/app/(dashboard)/contacts/page.tsx`
**Priority:** HIGH — most used page
**What to build:**
- "Add Contact" button opens modal with fields: name, phone (required), email, company, source, lead_status
- On submit → `supabase.from('contacts').insert(...)` 
- On success → prepend to list, close modal, show success banner
- Validation: phone is required, email format check
**DB table:** `contacts`

---

## S-2 — Contacts Page: Edit & Delete
**File:** `src/app/(dashboard)/contacts/page.tsx`
**Priority:** HIGH
**What to build:**
- Click any row → opens slide-out drawer with contact details
- Edit fields inline in drawer: name, phone, email, company, lead_status
- Save button → `supabase.from('contacts').update(...).eq('id', id)`
- Delete button with confirmation → `supabase.from('contacts').delete().eq('id', id)`
- Remove from list on delete
**DB table:** `contacts`

---

## S-3 — Contacts Page: Filter + Pagination
**File:** `src/app/(dashboard)/contacts/page.tsx`
**Priority:** MEDIUM
**What to build:**
- Filter button opens dropdown: filter by lead_score_tier (Hot/Warm/Cold) and lead_status
- Apply filter → re-query Supabase with `.eq('lead_score_tier', tier)`
- Pagination: show 20 per page, Prev/Next buttons
- Show "Page 1 of X" indicator
**DB table:** `contacts`

---

## S-4 — Follow-ups Page: Create Follow-up Modal
**File:** `src/app/(dashboard)/follow-ups/page.tsx`
**Priority:** HIGH — used daily
**What to build:**
- "Add Follow-up" button opens modal with fields: title (required), contact picker (dropdown from contacts), due_date (datetime input), notes
- On submit → `supabase.from('follow_ups').insert({title, contact_id, due_date, notes, status: 'pending', account_id})`
- On success → prepend to list, close modal
**DB table:** `follow_ups`

---

## S-5 — Follow-ups Page: Delete Follow-up
**File:** `src/app/(dashboard)/follow-ups/page.tsx`
**Priority:** MEDIUM
**What to build:**
- Delete button (trash icon) on each follow-up card
- Confirmation: "Are you sure?" inline
- On confirm → `supabase.from('follow_ups').delete().eq('id', id)`
- Remove from list
**DB table:** `follow_ups`

---

## S-6 — Broadcasts Page: New Broadcast Modal
**File:** `src/app/(dashboard)/broadcasts/page.tsx`
**Priority:** MEDIUM
**What to build:**
- "New Broadcast" button opens modal with fields: name (required), platform (WhatsApp/Instagram/Facebook/Email), message text, scheduled_at (optional datetime)
- On submit → `supabase.from('campaigns').insert({name, platform, status: 'draft', account_id})`
- On success → prepend to list
**DB table:** `campaigns` (broadcasts use campaigns table)

---

## S-7 — Broadcasts Page: Delete Broadcast
**File:** `src/app/(dashboard)/broadcasts/page.tsx`
**Priority:** LOW
**What to build:**
- Delete button on each broadcast card
- Confirmation dialog
- On confirm → `supabase.from('campaigns').delete().eq('id', id)`
**DB table:** `campaigns`

---

## S-8 — Appointments Page: Schedule Appointment Modal
**File:** `src/app/(dashboard)/appointments/page.tsx`
**Priority:** MEDIUM
**What to build:**
- "Schedule" button opens modal with fields: title (required), contact picker, date (date input), time (time input), duration_minutes (30/60/90/120), notes
- On submit → `supabase.from('follow_ups').insert({title, contact_id, due_date: combined datetime, notes, status: 'pending', account_id})`
- On success → prepend to list
**DB table:** `follow_ups` (appointments use follow_ups table with a type field)

---

## S-9 — Appointments Page: Cancel & Complete
**File:** `src/app/(dashboard)/appointments/page.tsx`
**Priority:** MEDIUM
**What to build:**
- "Complete" button → `supabase.from('follow_ups').update({status: 'done'}).eq('id', id)`
- "Cancel" button → `supabase.from('follow_ups').update({status: 'cancelled'}).eq('id', id)`
- Update card status badge immediately (optimistic update)
**DB table:** `follow_ups`

---

## S-10 — Settings Page: Profile Section (functional)
**File:** `src/app/(dashboard)/settings/page.tsx`
**Priority:** MEDIUM
**What to build:**
- Click "Profile" → expands section (or navigates to sub-section)
- Shows current full_name, avatar_url from `profiles` table
- Edit fields: full_name, avatar_url
- Save button → `supabase.from('profiles').update({full_name, avatar_url}).eq('user_id', user.id)`
- Change password button → `supabase.auth.updateUser({password: newPassword})`
**DB table:** `profiles`

---

## S-11 — Settings Page: Account Section (functional)
**File:** `src/app/(dashboard)/settings/page.tsx`
**Priority:** MEDIUM
**What to build:**
- Click "Account" → expands section
- Shows current account name, timezone, currency from `accounts` table
- Edit fields: name, timezone (dropdown), currency (USD/INR/EUR)
- Save button → `supabase.from('accounts').update({name, timezone, currency}).eq('id', account_id)`
**DB table:** `accounts`

---

## S-12 — Settings Page: Team Members List
**File:** `src/app/(dashboard)/settings/page.tsx`
**Priority:** LOW
**What to build:**
- Shows list of team members from `profiles` table for current account
- Each member: avatar, name, role badge (owner/admin/agent/viewer)
- "Invite Member" button → shows email input + copy invite link (placeholder, no actual email sending)
**DB table:** `profiles`

---
---
---

# 🤖 AMAZON Q TASKS (I WILL BUILD THESE — JUST ASK)
# ─────────────────────────────────────────────────────────────────────────────

## Q-1 — Analytics Page ✅ DONE
**File:** `src/app/(dashboard)/analytics/page.tsx`
**Priority:** HIGH — sidebar links to it, currently 404
**What to build:**
- Conversation volume chart (line chart by day/week/month)
- Lead funnel chart (new → contacted → qualified → won)
- Channel breakdown pie chart (WhatsApp vs Instagram vs Email vs Facebook)
- Response time metrics (avg first response time)
- Agent performance table (conversations handled, avg response time)
- All real data from Supabase
- Date range filter: 7D / 30D / 90D

---

## Q-2 — Campaigns Page ✅ DONE
**File to create:** `src/app/(dashboard)/campaigns/page.tsx`
**Priority:** HIGH — sidebar links to it, currently 404
**What to build:**
- Campaign list with status badges, platform icons, sent/delivered stats
- Create Campaign modal (name, platform, status)
- Campaign detail slide-out: performance metrics, linked content
- Delete campaign
- Link to Content Studio for content creation
**DB table:** `campaigns`

---

## Q-3 — Settings: Integrations Page ✅ DONE
**File to create:** `src/app/(dashboard)/settings/integrations/page.tsx`
**Priority:** HIGH — sidebar links to it, currently 404
**What to build:**
- WhatsApp Business: show connection status, phone number, webhook URL
- Instagram: show connection status, connected account
- Facebook: show connection status
- Email: SMTP config form (host, port, user, password)
- Each integration: connected/disconnected badge + connect/disconnect button

---

## Q-4 — Settings: Security Page ✅ DONE
**File to create:** `src/app/(dashboard)/settings/security/page.tsx`
**Priority:** MEDIUM — sidebar links to it, currently 404
**What to build:**
- Active sessions list (device, IP, last active, revoke button)
- Change password form (current password, new password, confirm)
- 2FA section (enable/disable — placeholder UI)
- API Keys list: show masked keys, create new key, revoke key
**DB table:** reads from Supabase auth sessions

---

## Q-5 — Settings: Billing Page ✅ DONE
**File to create:** `src/app/(dashboard)/settings/billing/page.tsx`
**Priority:** LOW — sidebar links to it, currently 404
**What to build:**
- Current plan card (Free/Starter/Pro/Enterprise)
- Usage stats: contacts count, messages this month, API calls
- Upgrade plan button (placeholder — links to pricing page)
- Invoice history table (placeholder with empty state)
**DB table:** `accounts` (plan field)

---

## Q-6 — Settings: Platform Health Page ✅ DONE
**File to create:** `src/app/(dashboard)/settings/health/page.tsx`
**Priority:** MEDIUM — sidebar links to it, currently 404
**What to build:**
- Supabase connection: green/red status indicator
- OpenAI API: configured/not configured badge
- WhatsApp webhook: configured/not configured
- Migration status: list all 10 migrations with applied/pending status
- Last build info
- All checks run on page load

---

## Q-7 — Backend: follow_ups.py ✅ DONE
**File to create:** `backend/app/api/v1/follow_ups.py`
**Priority:** HIGH — frontend follow-ups page needs this
**What to build:**
- `GET /api/v1/follow-ups` — list with filters (status, overdue, today)
- `POST /api/v1/follow-ups` — create follow-up
- `PATCH /api/v1/follow-ups/{id}` — update (status, title, due_date, notes)
- `DELETE /api/v1/follow-ups/{id}` — delete
- Register in `backend/app/main.py`
**DB table:** `follow_ups`

---

## Q-8 — Backend: broadcasts.py ✅ DONE
**File to create:** `backend/app/api/v1/broadcasts.py`
**Priority:** MEDIUM
**What to build:**
- `GET /api/v1/broadcasts` — list broadcasts
- `POST /api/v1/broadcasts` — create broadcast
- `PATCH /api/v1/broadcasts/{id}` — update status/details
- `DELETE /api/v1/broadcasts/{id}` — delete
- Register in `backend/app/main.py`
**DB table:** `campaigns` (with platform filter for broadcasts)

---

## Q-9 — Backend: appointments.py ✅ DONE
**File to create:** `backend/app/api/v1/appointments.py`
**Priority:** MEDIUM
**What to build:**
- `GET /api/v1/appointments` — list with filters (upcoming, today, past)
- `POST /api/v1/appointments` — create appointment
- `PATCH /api/v1/appointments/{id}` — update (status, reschedule)
- `DELETE /api/v1/appointments/{id}` — delete
- Register in `backend/app/main.py`
**DB table:** `follow_ups` (with type field) or separate appointments table

---

## Q-10 — Backend: segments.py ✅ DONE
**File to create:** `backend/app/api/v1/segments.py`
**Priority:** MEDIUM
**What to build:**
- `GET /api/v1/segments` — list segments
- `POST /api/v1/segments` — create segment
- `PATCH /api/v1/segments/{id}` — update
- `DELETE /api/v1/segments/{id}` — delete
- `GET /api/v1/segments/{id}/contacts` — get contacts in segment
- Register in `backend/app/main.py`
**DB table:** `crm3_segments`

---

## Q-11 — Backend: journeys.py ✅ DONE
**File to create:** `backend/app/api/v1/journeys.py`
**Priority:** MEDIUM
**What to build:**
- `GET /api/v1/journeys` — list journeys
- `POST /api/v1/journeys` — create journey
- `PATCH /api/v1/journeys/{id}` — update
- `DELETE /api/v1/journeys/{id}` — delete
- `POST /api/v1/journeys/{id}/execute` — execute for a contact
- Register in `backend/app/main.py`
**DB table:** `crm3_journeys`

---

## Q-12 — Backend: Complete partial files ✅ DONE
**Priority:** MEDIUM
**campaigns.py** — add: `POST /create`, `PATCH /{id}`, `DELETE /{id}`
**automations.py** — add: `POST /create`, `DELETE /{id}`
**agents.py** — add: `PATCH /{id}` update, `DELETE /{id}`
**content.py** — add: `PATCH /{id}` update, `DELETE /{id}`

---

## Q-13 — AI Service: Complete empty folders ✅ DONE
**Priority:** LOW (AI service works without these, but incomplete)
**`ai-service/app/agents/`** — agent tool implementations (get_contact, search_leads, etc.)
**`ai-service/app/models/`** — Pydantic request/response models
**`ai-service/app/services/`** — service layer (lead service, content service)
**`ai-service/app/rag/`** — RAG/vector search implementation using pgvector

---

## Q-14 — DB: Verify broadcasts + appointments tables ✅ DONE exist
**Priority:** HIGH — frontend pages query these tables
**What to check:** Do `broadcasts` and `appointments` tables exist in Supabase?
**Action:** Create migration `010_broadcasts_appointments.sql` if missing:
- `broadcasts` table: id, account_id, name, platform, message, status, total_recipients, sent_count, delivered_count, read_count, scheduled_at, created_at
- `appointments` table: id, account_id, contact_id, title, scheduled_at, duration_minutes, status, notes, created_at

---

## Q-15 — Global Search (Ctrl+K) ✅ DONE
**File:** `src/components/layout/CRMTopbar.tsx`
**Priority:** LOW
**What to build:**
- ⌘K / Ctrl+K opens search modal overlay
- Searches contacts + deals + conversations simultaneously (3 parallel Supabase queries)
- Results grouped by type with icons
- Click result → navigate to correct page
- Keyboard navigation (arrow keys + enter)
- Debounced input (300ms)

---

## Q-16 — Bug fixes from browser testing
**Priority:** CRITICAL (after owner does O-4)
**File ready:** `docs/BUG_TRACKER.md` — fill this during testing, then share with Amazon Q.
When you test and find bugs, tell me exactly what's broken and I'll fix immediately.

---

## Q-17 — Mark all phases VERIFIED after testing
**Priority:** After O-4 complete
**Files to update:** `CRM_3_FEATURE_STATUS.md`, `CRM_3_BLOCKERS.md`, `SESSION_SAVE_STATE.md`
**Framework ready** — will be done immediately after you confirm browser tests pass.

---
---
---

# 📊 TASK COUNT SUMMARY

| Who | Total Tasks | High Priority | Medium | Low |
|-----|------------|--------------|--------|-----|
| **You (Owner)** | 4 | 2 (O-1, O-2) | 1 (O-3) | 1 (O-4) |
| **Sharvani** | 12 | 4 (S-1,2,4,6) | 6 | 2 |
| **Amazon Q** | 17 | 4 (Q-1,2,7,14) | 8 | 5 |
| **TOTAL** | **33** | **10** | **15** | **8** |

---

# 📋 PRIORITY ORDER — DO IN THIS SEQUENCE

### WEEK 1 (Unblock everything first)
| # | Task | Who | Why |
|---|------|-----|-----|
| 1 | O-1: Apply migrations | You | Unblocks ALL features |
| 2 | O-2: OpenAI key | You | Enables all AI |
| 3 | Q-14: Verify broadcasts/appointments tables | Amazon Q | Prevents 404 errors |
| 4 | Q-7: follow_ups.py backend | Amazon Q | Sharvani needs this |
| 5 | Q-8: broadcasts.py backend | Amazon Q | Sharvani needs this |
| 6 | S-1: Contacts Add modal | Sharvani | Most used feature |
| 7 | S-4: Follow-ups Create modal | Sharvani | Daily use |
| 8 | Q-1: Analytics page | Amazon Q | Sidebar 404 fix |
| 9 | Q-2: Campaigns page | Amazon Q | Sidebar 404 fix |

### WEEK 2
| # | Task | Who |
|---|------|-----|
| 10 | S-2: Contacts Edit/Delete | Sharvani |
| 11 | S-5: Follow-ups Delete | Sharvani |
| 12 | S-6: Broadcasts modal | Sharvani |
| 13 | S-8: Appointments modal | Sharvani |
| 14 | Q-3: Settings Integrations page | Amazon Q |
| 15 | Q-4: Settings Security page | Amazon Q |
| 16 | Q-12: Complete partial backend files | Amazon Q |
| 17 | O-3: Browser E2E testing | You |

### WEEK 3
| # | Task | Who |
|---|------|-----|
| 18 | Q-16: Fix bugs from testing | Amazon Q |
| 19 | S-9: Appointments Cancel/Complete | Sharvani |
| 20 | S-10: Settings Profile section | Sharvani |
| 21 | S-11: Settings Account section | Sharvani |
| 22 | Q-9: appointments.py backend | Amazon Q |
| 23 | Q-10: segments.py backend | Amazon Q |
| 24 | Q-11: journeys.py backend | Amazon Q |
| 25 | Q-6: Settings Health page | Amazon Q |

### WEEK 4 (Polish)
| # | Task | Who |
|---|------|-----|
| 26 | S-3: Contacts Filter/Pagination | Sharvani |
| 27 | S-7: Broadcasts Delete | Sharvani |
| 28 | S-12: Settings Team Members | Sharvani |
| 29 | Q-5: Settings Billing page | Amazon Q |
| 30 | Q-13: AI Service empty folders | Amazon Q |
| 31 | Q-15: Global Search ⌘K | Amazon Q |
| 32 | Q-17: Mark all phases VERIFIED | Amazon Q |
| 33 | O-4: WhatsApp credentials | You |

---

# 🚀 DEPLOYMENT CHECKLIST

- [ ] O-1: All 10 migrations applied to Supabase
- [ ] O-2: Real OpenAI API key in .env.local
- [ ] O-3: Browser E2E tests pass
- [ ] O-4: WhatsApp credentials set
- [ ] All HIGH priority tasks complete
- [ ] `npm run build` passes (0 errors)
- [ ] `git add . && git commit -m "feat: CRM 3.0 production ready"`
- [ ] `git push origin main`
- [ ] Vercel auto-deploys from main branch
- [ ] Set env vars in Vercel dashboard: OPENAI_API_KEY, CRON_SECRET, SUPABASE keys
- [ ] Apply all migrations to production Supabase

---

*Last updated: Full audit session*
*Next update: After Week 1 tasks complete*
