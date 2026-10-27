# CRM 3.0 Feature Status — Phase F Audit

## Legend
- ✅ VERIFIED — code inspected + test evidence
- ⚠️ Implemented, blocker or caveat exists
- ❌ Not implemented / placeholder only
- 🔒 External dependency — requires live credentials to verify

---

## Authentication Architecture — VERIFIED
All CRM 3.0 routes use `verifyRequest()`. `supabase.auth.getUser()` eliminated from all account-scoped routes. `account_id` always re-derived from DB, never from token claims.

---

## 38-Module Audit

### 1. AI Command Center
| Feature | Status |
|---|---|
| Copilot chat UI (ai-center/page.tsx) | ✅ |
| Sends query to FastAPI `/api/v1/copilot` with Bearer token | ✅ |
| Suggested queries, message history, loading state | ✅ |
| Live CRM data via FastAPI backend | ⚠️ Requires live backend + OpenAI key |

**Status: IMPLEMENTED — backend integration requires live credentials**

---

### 2. Unified Omnichannel Inbox
| Feature | Status |
|---|---|
| Conversations list via `v3fetch('/api/v3/conversations')` | ✅ |
| Messages GET/POST via `v3fetch('/api/v3/conversations/[id]/messages')` | ✅ |
| Mark-read via `v3fetch POST /api/v3/conversations/[id]/read` | ✅ |
| Realtime via `useInboxRealtime` hook (account-scoped Postgres filter) | ✅ |
| Channel sub-pages (WhatsApp, Instagram, Facebook, Email, Telegram) | ⚠️ Placeholder pages |
| Live WhatsApp/Instagram/Facebook delivery | 🔒 External |

**Status: CORE IMPLEMENTED — channel sub-pages are placeholders**

---

### 3. Customer 360
| Feature | Status |
|---|---|
| Contacts page with CrmTab component | ✅ |
| Contact CRUD via `v3fetch` (no bare Supabase) | ✅ |
| Lead status, score, tier display | ✅ |
| Timeline/activity view | ⚠️ Partial — no dedicated timeline API |

**Status: IMPLEMENTED**

---

### 4. AI Lead Intelligence
| Feature | Status |
|---|---|
| Lead intelligence route `/api/v3/ai/lead-intelligence` | ✅ |
| Authenticated with `verifyRequest()` | ✅ |
| Requires OpenAI key for AI analysis | ⚠️ Falls back to rule-based |

**Status: IMPLEMENTED**

---

### 5. AI Lead Scoring & Qualification
| Feature | Status |
|---|---|
| Lead score (0-100) stored on contacts | ✅ |
| Lead score tier (hot/warm/cold) | ✅ |
| `update_lead_score` tool in agent engine | ✅ |
| AI scoring via `/api/v3/leads/[id]` | ✅ |
| Explainable score reason stored | ✅ |

**Status: VERIFIED**

---

### 6. Content Studio
| Feature | Status |
|---|---|
| GET content with status/platform filter validation | ✅ |
| POST content with title required, platform validated | ✅ |
| POST content with scheduled_at ISO validation | ✅ |
| POST content field whitelist | ✅ |
| account_id from token, never from body | ✅ |
| Content [id] GET/PATCH/DELETE with verifyRequest | ✅ |

**Status: VERIFIED**

---

### 7. AI Content Generator
| Feature | Status |
|---|---|
| POST `/api/v3/ai/generate-content` | ✅ |
| Authenticated with `verifyRequest()` | ✅ |
| OpenAI fallback to rule-based | ✅ |

**Status: VERIFIED**

---

### 8. Content Calendar & Publishing
| Feature | Status |
|---|---|
| ContentCalendar: month/week/day/agenda views | ✅ |
| ContentCalendar: navigation, today button | ✅ |
| ContentCalendar: status/platform filters | ✅ |
| ContentCalendar: error/loading states | ✅ |
| Actual publishing to social platforms | 🔒 External |

**Status: VERIFIED (UI) — live publishing requires external credentials**

---

### 9. Content Performance Intelligence
| Feature | Status |
|---|---|
| ContentGrid: search, sort, filter, pagination | ✅ |
| ContentGrid: attribution metrics display | ✅ |
| Real engagement metrics from platforms | 🔒 External |

**Status: IMPLEMENTED**

---

### 10. Content → Lead → Revenue Tracking
| Feature | Status |
|---|---|
| Attribution POST with contact/deal/content ownership check | ✅ |
| revenue_attributed update awaited (not fire-and-forget) | ✅ |
| Attribution method validated | ✅ |
| No double-counting in overview metrics | ✅ |

**Status: VERIFIED**

---

### 11. Campaign Intelligence
| Feature | Status |
|---|---|
| Campaign CRUD scoped to account_id | ✅ |
| Hardcoded ad account ID removed | ✅ |
| Meta sync deduplication | ✅ |
| Permission check before create/update/pause/resume/archive | ✅ |
| Token redacted in all error messages | ✅ |
| Live Meta API calls | 🔒 External |

**Status: VERIFIED (code) — live Meta requires credentials**

---

### 12. Advanced Broadcasts
| Feature | Status |
|---|---|
| Broadcast CRUD with verifyRequest | ✅ |
| name/platform/message required validation | ✅ |
| Opt-out enforced server-side | ✅ |
| Phone/email validation before dispatch | ✅ |
| Duplicate send prevention (in-memory lock) | ✅ |
| send_all partial status fixed (Phase F) | ✅ FIXED |
| retry_failed partial status (Phase D) | ✅ |
| Batch processing with rate limiting | ✅ |
| Tenant isolation in recipient resolution | ✅ |
| In-memory lock lost on restart | ⚠️ MEDIUM blocker |
| Real WhatsApp/Email sends | 🔒 External |

**Status: VERIFIED — in-memory lock durability remains a medium blocker**

---

### 13. Customer Journey Builder
| Feature | Status |
|---|---|
| Journey CRUD with verifyRequest | ✅ |
| Journey publish/execute endpoints | ✅ |
| Journey scheduler with CRON_SECRET auth | ✅ |
| DB-backed scheduler lock (not in-memory) | ✅ |
| Exponential backoff retry (3 attempts) | ✅ |
| Dead-letter after max retries | ✅ |
| Journey engine (journey-engine.ts) | ✅ |

**Status: VERIFIED**

---

### 14. Smart Automation Builder
| Feature | Status |
|---|---|
| Automation CRUD with verifyRequest | ✅ |
| Automation execute endpoint | ✅ |
| Automation scheduler with CRON_SECRET auth | ✅ |
| DB-backed scheduler lock | ✅ |
| Automation templates endpoint | ✅ |
| Builder.tsx uses v3fetch (no bare Supabase) | ✅ |
| Detail.tsx uses v3fetch | ✅ |

**Status: VERIFIED**

---

### 15. AI Agents
| Feature | Status |
|---|---|
| GET/POST `/api/agents` with verifyRequest | ✅ |
| GET/PATCH/DELETE `/api/agents/[agentId]` with verifyRequest | ✅ |
| POST `/api/agents/[agentId]/run` with verifyRequest | ✅ |
| PATCH `/api/agents/[agentId]/toggle` with verifyRequest | ✅ |
| POST `/api/agents/runs/[runId]/approve` — arg-order fixed (Phase F) | ✅ FIXED |
| POST `/api/agents/runs/[runId]/reject` — arg-order fixed (Phase F) | ✅ FIXED |
| Agent scoped to account_id before execution | ✅ |
| Approval gate for sensitive tools | ✅ |
| v3 agent routes (execute, approve, executions) | ✅ |
| Tool permission enforcement | ✅ |
| Tenant-scoped audit log | ✅ |

**Status: VERIFIED — critical arg-order bug fixed in Phase F**

---

### 16. AI Follow-up Engine
| Feature | Status |
|---|---|
| Follow-ups CRUD via `/api/v3/follow-ups` | ✅ |
| Contact search via v3fetch (no bare Supabase) | ✅ |
| `create_followup` tool in agent engine | ✅ |
| Due date scheduling | ✅ |

**Status: VERIFIED**

---

### 17. Smart Sales Pipeline
| Feature | Status |
|---|---|
| PipelinesTab uses v3fetch (no bare Supabase) | ✅ |
| Pipeline stages via `/api/v3/pipeline-stages` | ✅ |
| Deal create POST `/api/v3/deals` | ✅ |
| Deal update PATCH `/api/v3/deals/[id]` | ✅ |
| Deal delete DELETE `/api/v3/deals/[id]` | ✅ |
| NLP deal creation via `/api/v3/ai/deal-automation` | ✅ |
| deal-automation dead auth code removed (Phase F) | ✅ FIXED |

**Status: VERIFIED**

---

### 18. Deal Intelligence & Forecasting
| Feature | Status |
|---|---|
| Revenue intelligence route | ✅ |
| `get_revenue_snapshot` tool | ✅ |
| `get_deals_at_risk` tool | ✅ |
| `calculate_pipeline_forecast` tool | ✅ |
| Deal value, currency, stage tracking | ✅ |

**Status: VERIFIED**

---

### 19. Smart Appointments
| Feature | Status |
|---|---|
| Appointments CRUD via `/api/v3/appointments` | ✅ |
| Authenticated with verifyRequest | ✅ |
| Calendar UI page exists | ✅ |

**Status: IMPLEMENTED**

---

### 20. Smart Contacts & Segmentation
| Feature | Status |
|---|---|
| Contacts CRUD via `/api/v3/contacts` | ✅ |
| Contact PATCH `/api/v3/contacts/[id]` | ✅ |
| Segments CRUD via `/api/v3/segments` | ✅ |
| Segment preview/refresh/export | ✅ |
| Segment membership | ✅ |
| CrmTab uses v3fetch | ✅ |
| NLP lead creation via `/api/v3/ai/lead-automation` | ✅ |
| lead-automation dead auth code removed (Phase F) | ✅ FIXED |

**Status: VERIFIED**

---

### 21. Revenue Attribution
| Feature | Status |
|---|---|
| Attribution GET with filters | ✅ |
| Attribution POST with ownership check | ✅ |
| revenue_attributed awaited | ✅ |
| Method/confidence validation | ✅ |
| No double-counting | ✅ |

**Status: VERIFIED**

---

### 22. Advanced Analytics & Business Intelligence
| Feature | Status |
|---|---|
| Analytics route `/api/v3/analytics` with verifyRequest | ✅ |
| KPI cards, charts, data table | ✅ |
| Date range presets, granularity | ✅ |
| Export CSV/Excel/PDF | ✅ |
| Realtime channel now account-scoped (Phase F) | ✅ FIXED |
| Drilldown panels | ✅ |

**Status: VERIFIED**

---

### 23. Customer Support & Ticket Center
| Feature | Status |
|---|---|
| Conversations endpoint with verifyRequest | ✅ |
| `update_conversation_status` tool | ✅ |
| `draft_support_reply` tool | ✅ |
| Dedicated ticket/support UI | ⚠️ Uses inbox page |

**Status: IMPLEMENTED via Inbox**

---

### 24. Knowledge Base + AI Knowledge Assistant
| Feature | Status |
|---|---|
| Knowledge agent type in engine | ✅ |
| `get_audit_logs` tool | ✅ |
| Dedicated KB UI/API | ❌ Not implemented |

**Status: PARTIAL — agent type exists, no dedicated KB module**

---

### 25. Media & Digital Asset Management
| Feature | Status |
|---|---|
| Dedicated DAM UI/API | ❌ Not implemented |
| File upload/storage | ❌ Not implemented |

**Status: NOT IMPLEMENTED**

---

### 26. Intelligent Action Center
| Feature | Status |
|---|---|
| Command center route `/api/v3/command-center` | ✅ |
| Authenticated with verifyRequest | ✅ |
| Next-best-action route | ✅ |
| Recommendations route | ✅ |

**Status: IMPLEMENTED**

---

### 27. Team & Agent Intelligence
| Feature | Status |
|---|---|
| `get_team_workload` tool | ✅ |
| Profile GET/PATCH with verifyRequest | ✅ |
| Team member listing in agent engine | ✅ |
| Dedicated team management UI | ⚠️ Settings page only |

**Status: PARTIAL**

---

### 28. Social Media Command Center
| Feature | Status |
|---|---|
| Instagram proxy route `/api/v3/instagram/[...path]` | ✅ |
| Social media settings (page IDs, tokens) | ✅ |
| Live posting/reading | 🔒 External |

**Status: IMPLEMENTED — live requires credentials**

---

### 29. Comments → Leads Intelligence
| Feature | Status |
|---|---|
| Meta Lead Ads webhook (POST + GET verify) | ✅ |
| HMAC-SHA256 signature verification | ✅ |
| Tenant routing by page_id | ✅ |
| Lead deduplication | ✅ |
| Attribution record on new lead | ✅ |
| Live Meta Lead Ads | 🔒 External |

**Status: VERIFIED (code) — live requires Meta app**

---

### 30. AI Workflow Marketplace
| Feature | Status |
|---|---|
| Automation templates endpoint | ✅ |
| Template gallery UI (TemplateGallery component) | ✅ |
| Template preview and install | ✅ |
| Compatibility evaluation | ✅ |

**Status: IMPLEMENTED**

---

### 31. A/B Testing & AI Optimization
| Feature | Status |
|---|---|
| Dedicated A/B testing UI/API | ❌ Not implemented |

**Status: NOT IMPLEMENTED**

---

### 32. Notifications & Smart Alerts
| Feature | Status |
|---|---|
| Notifications GET/PATCH with verifyRequest | ✅ |
| Read-all endpoint | ✅ |
| Notification UI | ✅ |

**Status: IMPLEMENTED**

---

### 33. Advanced Reports
| Feature | Status |
|---|---|
| Reports route `/api/v3/reports` with verifyRequest | ✅ |
| Reports page with range picker, charts, table | ✅ |
| Export CSV/Excel/PDF | ✅ |
| Drilldown panels | ✅ |

**Status: IMPLEMENTED**

---

### 34. Admin & Security Center
| Feature | Status |
|---|---|
| Settings pages (profile, security, integrations, billing) | ✅ |
| Profile PATCH with field validation | ✅ |
| Password change with verifyRequest | ✅ |
| API keys CRUD | ✅ |
| 2FA setup page | ✅ |

**Status: IMPLEMENTED**

---

### 35. Multi-Tenant Management
| Feature | Status |
|---|---|
| account_id always from DB (never from token claims) | ✅ |
| All queries scoped to account_id | ✅ |
| Tenant isolation in broadcasts, agents, journeys | ✅ |
| RLS gap mitigated by v3 API routes | ✅ |
| RLS policies for browser-side Supabase | ⚠️ auth.uid() NULL for CRM users |

**Status: VERIFIED at API layer — RLS gap documented**

---

### 36. Integration & API Center
| Feature | Status |
|---|---|
| API keys CRUD with verifyRequest | ✅ |
| Integration settings (Meta, WhatsApp, Email) | ✅ |
| Integration status hook | ✅ |
| Live integration testing | 🔒 External |

**Status: IMPLEMENTED**

---

### 37. Audit Logs & Platform Health
| Feature | Status |
|---|---|
| Health endpoint (public) | ✅ |
| Agent audit log (`crm3_agent_audit_log`) | ✅ |
| Agent run history | ✅ |
| Journey scheduler log | ✅ |
| Automation execution log | ✅ |
| Dedicated audit log UI | ⚠️ Via agents history tab |

**Status: IMPLEMENTED**

---

### 38. Billing, Plans & Usage Intelligence
| Feature | Status |
|---|---|
| Billing settings page exists | ✅ |
| Actual billing/payment integration | ❌ Not implemented |
| Usage metrics | ⚠️ Partial via analytics |

**Status: PLACEHOLDER — billing integration not implemented**

---

## Phase F Fixes Applied

| Fix | File | Severity |
|---|---|---|
| `approveAgentRun` called with wrong arg order (missing `accountId`) | `src/app/api/agents/runs/[runId]/approve/route.ts` | CRITICAL |
| `rejectAgentRun` called with wrong arg order (missing `accountId`) | `src/app/api/agents/runs/[runId]/reject/route.ts` | CRITICAL |
| `send_all` set `final_status='sent'` for partial success | `backend/app/services/broadcast_service.py` | HIGH |
| `deal-automation` used dead `supabase.auth.getUser()` (always null) | `src/app/api/v3/ai/deal-automation/route.ts` | MEDIUM |
| `lead-automation` used dead `supabase.auth.getUser()` (always null) | `src/app/api/v3/ai/lead-automation/route.ts` | MEDIUM |
| Analytics realtime channel not account-scoped | `src/app/(dashboard)/analytics/page.tsx` | MEDIUM |

## Remaining Blockers

| Blocker | Severity | Owner |
|---|---|---|
| `.env.local` tracked in git — credentials exposed | CRITICAL | Repo owner: BFG purge + rotate |
| Apply `021_fix_auth_fkeys_and_columns.sql` to live DB | CRITICAL | DBA: fixes Google sign-in 500 |
| RLS gap: auth.uid() NULL for CRM users (mitigated by v3 API) | HIGH | Architecture decision |
| Duplicate migration prefixes (005, 006, 007, 010, 011, 013, 014, 015) | HIGH | DBA review before applying |
| Broadcast in-memory lock lost on restart | MEDIUM | Persist to DB or Redis |
| Token refresh on realtime reconnect | MEDIUM | Add refresh logic to useInboxRealtime |
| Live Meta Lead Ads, WhatsApp, broadcast delivery | EXTERNAL | Requires live credentials |
| Knowledge Base module not implemented | LOW | Future phase |
| A/B Testing module not implemented | LOW | Future phase |
| Media/DAM module not implemented | LOW | Future phase |
| Billing integration not implemented | LOW | Future phase |
