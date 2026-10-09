# TZMICHA CRM 3.0 — MASTER PLAN
> Last Updated: 2025 | Status: IN PROGRESS | Phase: P0 Foundation COMPLETE → P1 Active

---

## 1. VISION

**CRM 3.0 is not a CRM. It is an Intelligent Customer-Growth Operating System.**

Every customer interaction becomes intelligent action and measurable growth.

Core business flow:
```
CONTENT → CONVERSATION → INTELLIGENCE → LEAD → AUTOMATION → DEAL → REVENUE → RETENTION
```

---

## 2. PRODUCT STATEMENT

**CRM 2.0:** "Manage your customers and conversations."

**CRM 3.0:** "TURN EVERY CUSTOMER INTERACTION INTO INTELLIGENT ACTION AND MEASURABLE GROWTH."

Every major screen answers three questions:
- **WHAT HAPPENED?**
- **WHY DOES IT MATTER?**
- **WHAT SHOULD I DO?**

---

## 3. TECHNOLOGY STACK

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript / TSX |
| Styling | Tailwind CSS + CSS Variables + Global CSS |
| UI Icons | Lucide React |
| Charts | Recharts |
| Flow Builder | React Flow / XYFlow |
| Drag & Drop | dnd-kit |

### Backend
| Layer | Technology |
|-------|-----------|
| Runtime | Python 3.11+ |
| Framework | FastAPI |
| Validation | Pydantic v2 |
| ORM | SQLAlchemy (async) |
| Async | AsyncIO |

### Database
| Layer | Technology |
|-------|-----------|
| Primary DB | PostgreSQL (via Supabase) |
| Cache | Redis |
| Vector Search | pgvector |
| Auth | Supabase Auth (SSR) |
| Realtime | Supabase Realtime |
| RLS | PostgreSQL Row Level Security |

### AI
| Capability | Implementation |
|-----------|---------------|
| LLM | OpenAI GPT-4o + Anthropic Claude |
| RAG | pgvector + knowledge base |
| AI Agents | Tool-based agent architecture |
| Embeddings | OpenAI text-embedding-3-small |
| AI Copilot | Chat interface → real CRM data |
| Lead Intelligence | Explainable scoring model |
| Content Generation | Multi-platform AI writer |
| Recommendations | NBA engine |

### LOCKED — DO NOT CHANGE
- ❌ No C#
- ❌ No Rust
- ❌ No framework replacement
- ❌ No CRM 2.0 rebuild

---

## 4. ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│                    CRM 3.0 FRONTEND                      │
│  Next.js 15 · TypeScript · Tailwind · Lucide · Recharts  │
├─────────────────────────────────────────────────────────┤
│                  AI ORCHESTRATOR LAYER                   │
│     src/lib/ai/orchestrator.ts — all AI calls here       │
├──────────────────────┬──────────────────────────────────┤
│   CRM 3.0 API v3     │      CRM 2.0 API v1 (REUSED)     │
│  /app/api/v3/        │      /CRM 2.0/src/app/api/v1/    │
├──────────────────────┴──────────────────────────────────┤
│                    SUPABASE LAYER                        │
│  PostgreSQL · RLS · Realtime · Auth · pgvector · Redis   │
├──────────────────────┬──────────────────────────────────┤
│  CRM 2.0 Tables      │  CRM 3.0 Tables (crm3_ prefix)   │
│  (REUSED AS-IS)      │  crm3_content, crm3_attribution  │
│                      │  crm3_journey_events             │
│                      │  crm3_ai_agents, crm3_ai_ops     │
│                      │  crm3_next_best_actions          │
│                      │  crm3_segments                   │
├──────────────────────┴──────────────────────────────────┤
│                  AI SERVICE (FastAPI)                    │
│         ai-service/ · Python · LLM · RAG · Agents        │
└─────────────────────────────────────────────────────────┘
```

### Key Architecture Rules
1. CRM 3.0 EXTENDS CRM 2.0 — never replaces it
2. All AI calls route through `src/lib/ai/orchestrator.ts`
3. New DB tables use `crm3_` prefix only
4. All tables follow existing RLS patterns
5. No secrets exposed to browser
6. Multi-tenant isolation via `account_id` on every table

---

## 5. THE 38 CRM MODULES

### CRM 2.0 Modules (REUSED — DO NOT TOUCH)
| # | Module | Location | Status |
|---|--------|----------|--------|
| 1 | Authentication | CRM 2.0/src/lib/auth/ | ✅ SOLID |
| 2 | Multi-tenancy / RLS | supabase/migrations/ | ✅ SOLID |
| 3 | RBAC (owner/admin/agent/viewer) | src/lib/auth/roles.ts | ✅ SOLID |
| 4 | WhatsApp Business API | CRM 2.0/src/lib/whatsapp/ | ✅ SOLID |
| 5 | Telegram | CRM 2.0/src/lib/telegram/ | ✅ SOLID |
| 6 | Facebook / Instagram (Meta) | CRM 2.0/src/lib/meta/ | ✅ SOLID |
| 7 | Threads / X | CRM 2.0/src/lib/threads/ | ✅ SOLID |
| 8 | Contacts + Tags + Custom Fields | CRM 2.0/src/lib/contacts/ | ✅ SOLID |
| 9 | Conversations + Messages | CRM 2.0/src/lib/inbox/ | ✅ SOLID |
| 10 | Broadcasts | CRM 2.0/src/lib/whatsapp/broadcast-core.ts | ✅ SOLID |
| 11 | Automations Engine | CRM 2.0/src/lib/automations/engine.ts | ✅ SOLID |
| 12 | Flows (visual bot builder) | CRM 2.0/src/lib/flows/ | ✅ SOLID |
| 13 | Pipelines + Deals | CRM 2.0/src/components/pipelines/ | ✅ SOLID |
| 14 | AI (OpenAI + Anthropic) | CRM 2.0/src/lib/ai/ | ✅ SOLID |
| 15 | Knowledge Base (pgvector) | CRM 2.0/src/lib/ai/knowledge.ts | ✅ SOLID |
| 16 | AI Auto-reply | CRM 2.0/src/lib/ai/auto-reply.ts | ✅ SOLID |
| 17 | Dashboard KPIs | CRM 2.0/src/lib/dashboard/ | ✅ SOLID |
| 18 | Notifications | CRM 2.0/src/lib/notifications.ts | ✅ SOLID |
| 19 | Realtime (Supabase) | CRM 2.0/src/hooks/use-realtime.ts | ✅ SOLID |
| 20 | API Keys (scoped) | CRM 2.0/src/lib/api-keys/ | ✅ SOLID |
| 21 | Public REST API v1 | CRM 2.0/src/app/api/v1/ | ✅ SOLID |
| 22 | MCP Server | CRM 2.0/mcp-server/ | ✅ SOLID |
| 23 | Webhooks (HMAC signed) | CRM 2.0/src/lib/webhooks/ | ✅ SOLID |
| 24 | Rate Limiting | CRM 2.0/src/lib/rate-limit.ts | ✅ SOLID |
| 25 | Media Storage | CRM 2.0/src/lib/storage/ | ✅ SOLID |
| 26 | Presence | CRM 2.0/src/lib/presence.ts | ✅ SOLID |
| 27 | Super Admin | CRM 2.0/src/lib/auth/super-admin.ts | ✅ SOLID |
| 28 | Audit Logs | supabase/migrations/050_customer_activity_log.sql | ✅ SOLID |

### CRM 3.0 New / Upgraded Modules
| # | Module | Priority | Status |
|---|--------|----------|--------|
| 29 | AI Command Center | P10 | IN_PROGRESS |
| 30 | AI Business Copilot | P10 | IN_PROGRESS |
| 31 | Unified Conversations (AI layer) | P1 | NOT_STARTED |
| 32 | Customer 360 (full timeline) | P2 | NOT_STARTED |
| 33 | AI Lead Intelligence | P3 | IN_PROGRESS |
| 34 | Smart Automation (AI-enhanced) | P4 | NOT_STARTED |
| 35 | AI Agent Center | P5 | NOT_STARTED |
| 36 | Content Studio | P6 | IN_PROGRESS |
| 37 | Content → Revenue Attribution | P7 | NOT_STARTED |
| 38 | Customer Journey Builder | P8 | NOT_STARTED |

---

## 6. THE 10 SIGNATURE MODULES

| # | Module | Description | Priority |
|---|--------|-------------|----------|
| 01 | Unified Conversations | All channels + AI intent/sentiment/NBA per conversation | P1 |
| 02 | Customer 360 | One complete customer story — profile to revenue | P2 |
| 03 | AI Lead Intelligence | Explainable score + intent + NBA | P3 |
| 04 | Smart Automation | Event → AI Analysis → Condition → Action chains | P4 |
| 05 | AI Agents | Autonomous agents with approval policies | P5 |
| 06 | Content Studio | Create / schedule / publish + AI generator | P6 |
| 07 | Content → Revenue Intelligence | Post → Engagement → Lead → Deal → Revenue | P7 |
| 08 | Customer Journey Builder | Visual journey stages connected to automation | P8 |
| 09 | Revenue & Business Intelligence | Forecast + attribution + team performance | P9 |
| 10 | AI Command Center | Primary home — "Here's what needs your attention today" | P10 |

---

## 7. PRIORITY ORDER

```
P0  → Foundation (COMPLETE)
P1  → Unified Conversations
P2  → Customer 360
P3  → AI Lead Intelligence
P4  → Smart Automation
P5  → AI Agents
P6  → Content Studio
P7  → Content → Revenue Intelligence
P8  → Customer Journey Builder
P9  → Revenue & Business Intelligence
P10 → AI Command Center
```

**RULE: Do not start Pn+1 until Pn is VERIFIED.**

---

## 8. MODULE DEPENDENCIES

```
P0 Foundation
  └── P1 Unified Conversations (needs: contacts, conversations, messages, channels)
        └── P2 Customer 360 (needs: P1 conversation data + deals + timeline)
              └── P3 AI Lead Intelligence (needs: P2 customer data + scoring model)
                    └── P4 Smart Automation (needs: P3 intent signals + triggers)
                          └── P5 AI Agents (needs: P4 automation engine + tools)
P6 Content Studio (needs: P0 foundation + media storage)
  └── P7 Content → Revenue (needs: P6 content + P3 leads + P2 deals)
        └── P8 Journey Builder (needs: P7 attribution + P1 conversations + P4 automation)
              └── P9 Revenue BI (needs: P7 attribution + P3 leads + deals + campaigns)
                    └── P10 AI Command Center (needs: ALL previous modules)
```

---

## 9. DATABASE REQUIREMENTS

### Strategy
- Reuse ALL CRM 2.0 tables
- New tables use `crm3_` prefix
- Every new table has `account_id` FK + RLS policy
- No duplicate tables

### CRM 3.0 New Tables (Migration: 001_crm3_foundation.sql)
| Table | Purpose | Status |
|-------|---------|--------|
| crm3_content | Content Studio items | ✅ CREATED |
| crm3_attribution | Content→Revenue attribution chain | ✅ CREATED |
| crm3_journey_events | Customer journey stage events | ✅ CREATED |
| crm3_ai_agents | AI agent definitions | ✅ CREATED |
| crm3_ai_agent_runs | Agent execution history | ✅ CREATED |
| crm3_next_best_actions | NBA recommendations | ✅ CREATED |
| crm3_ai_operations | AI usage/cost log | ✅ CREATED |
| crm3_segments | Smart contact segments | ✅ CREATED |

### Planned Extensions to CRM 2.0 Tables
| Table | Extension | Migration |
|-------|-----------|-----------|
| conversations | ai_intent, ai_sentiment, ai_summary, nba_id | PENDING |
| contacts | journey_stage, ai_qualification_status | PENDING |
| deals | attribution_content_id, attribution_campaign_id | PENDING |

---

## 10. API REQUIREMENTS

### CRM 3.0 API Routes (src/app/api/v3/)
| Route | Method | Purpose | Status |
|-------|--------|---------|--------|
| /api/v3/copilot | POST | AI Business Copilot queries | IN_PROGRESS |
| /api/v3/command-center | GET | Command center state | IN_PROGRESS |
| /api/v3/ai/lead-intelligence | POST | Lead scoring + intent | IN_PROGRESS |
| /api/v3/ai/generate-content | POST | AI content generation | IN_PROGRESS |
| /api/v3/ai/next-best-action | POST | NBA per object | PLANNED |
| /api/v3/ai/summarize-conversation | POST | Conversation summary | PLANNED |
| /api/v3/ai/recommendations | GET | AI recommendations list | PLANNED |
| /api/v3/content | GET/POST | Content Studio CRUD | PLANNED |
| /api/v3/attribution | GET | Attribution chain data | PLANNED |
| /api/v3/journey | GET/POST | Journey events | PLANNED |
| /api/v3/agents | GET/POST | AI agent management | PLANNED |
| /api/v3/segments | GET/POST | Smart segments | PLANNED |

### Security Rules for All API Routes
- Validate Supabase session server-side
- Extract `account_id` from session (never from request body)
- Apply RLS at DB level
- Rate limit all AI endpoints
- Log all AI operations to `crm3_ai_operations`

---

## 11. AI REQUIREMENTS

### AI Providers
- OpenAI GPT-4o (primary)
- Anthropic Claude 3.5 Sonnet (fallback / specialized)

### AI Capabilities Required
| Capability | Used By | Status |
|-----------|---------|--------|
| Lead scoring (0-100) | AI Lead Intelligence | IN_PROGRESS |
| Intent detection | Conversations, Lead Intel | IN_PROGRESS |
| Sentiment analysis | Conversations, Customer 360 | IN_PROGRESS |
| Next Best Action | All modules | IN_PROGRESS |
| Conversation summary | Unified Conversations | PLANNED |
| Content generation | Content Studio | IN_PROGRESS |
| Copilot Q&A | AI Copilot | IN_PROGRESS |
| Revenue forecasting | Revenue BI | PLANNED |
| Agent orchestration | AI Agents | PLANNED |
| RAG (knowledge base) | Copilot + Agents | PLANNED |

### AI Safety Rules
- AI NEVER sends messages without explicit user authorization
- All agent actions require approval (configurable)
- No unrestricted DB access — tool-based architecture only
- All AI operations logged with tokens + latency
- Explainability required for all scores (show WHY)
- No fake/fabricated data — real CRM data only

---

## 12. AUTOMATION REQUIREMENTS

### Smart Automation Flow
```
EVENT → AI ANALYSIS → CONDITION → ACTION → WAIT → CONDITION → NEXT ACTION
```

### Supported Triggers
- Customer message received
- Comment on social post
- Lead score change
- Deal stage change
- Campaign engagement
- Form submission
- Appointment booked
- Time-based (wait nodes)

### Supported Actions
- Create lead
- Assign agent
- Send WhatsApp / Email / Telegram
- Update contact fields
- Create follow-up task
- Move deal stage
- Trigger AI agent
- Send notification

### AI Enhancement Layer
- Intent detection on incoming messages
- Sentiment scoring before routing
- Lead qualification scoring
- Next Best Action injection into flows

---

## 13. REALTIME REQUIREMENTS

### Realtime Channels
| Channel | Purpose | Implementation |
|---------|---------|---------------|
| conversations | New messages, status updates | Supabase Realtime |
| leads | Score changes, new leads | Supabase Realtime |
| command_center | Hot leads, alerts | Supabase Realtime |
| agent_runs | Agent progress updates | Supabase Realtime |
| content | Publishing status | Supabase Realtime |

### Realtime Tables (Supabase Publication)
- crm3_content ✅
- crm3_journey_events ✅
- crm3_next_best_actions ✅
- crm3_ai_agent_runs ✅

---

## 14. SECURITY REQUIREMENTS

| Requirement | Implementation |
|------------|---------------|
| Multi-tenancy | account_id on every table |
| Row Level Security | RLS policy on every table |
| RBAC | owner / admin / agent / viewer roles |
| Authentication | Supabase Auth SSR (server-side) |
| API Authorization | Session validation on every route |
| Secret Management | .env.local — never in browser |
| Audit Logs | crm3_ai_operations + customer_activity_log |
| Rate Limiting | src/lib/rate-limit.ts |
| Webhook Security | HMAC signed webhooks |
| AI Safety | Tool-based agents, approval policies |

### NEVER expose to browser
- Supabase service-role key
- OpenAI / Anthropic API keys
- Meta / WhatsApp secrets
- Any internal API secrets

---

## 15. UI/UX REQUIREMENTS

### Design Principles
1. Every screen answers: WHAT HAPPENED? / WHY? / WHAT SHOULD I DO?
2. AI recommendations are always explainable
3. Actions are always one click away
4. Real data only — no fake placeholders in production
5. Mobile-responsive (PWA + Android app exists)

### Design System
- CSS Variables via `src/styles/crm-theme.css`
- Tailwind CSS utility classes
- Lucide icons (consistent set)
- Recharts for all data visualization
- React Flow for visual builders

### Key UI Patterns
- KPI cards with trend indicators
- Timeline views for customer history
- Kanban boards for pipelines
- Visual flow builders for automation/journey
- Chat interfaces for AI copilot
- Card grids for content studio

---

## 16. TESTING REQUIREMENTS

### Per Module Checklist
- [ ] TypeScript typecheck passes (`tsc --noEmit`)
- [ ] ESLint passes (`next lint`)
- [ ] Build passes (`next build`)
- [ ] Browser test: page loads without errors
- [ ] Browser test: core user flow works
- [ ] API routes return correct responses
- [ ] RLS verified: user cannot access other org's data
- [ ] Realtime: events fire correctly

### Test Files Location
- Unit tests: `*.test.ts` alongside source files
- Vitest config: `vitest.config.ts`

---

## 17. DEPLOYMENT REQUIREMENTS

### Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only
OPENAI_API_KEY=                   # server-side only
ANTHROPIC_API_KEY=                # server-side only
```

### Deployment Targets
- Primary: Vercel (Next.js)
- Database: Supabase (managed PostgreSQL)
- AI Service: Docker (ai-service/)
- Mobile: Android (Capacitor)

### Pre-Deployment Checklist
- [ ] All migrations applied to production Supabase
- [ ] Environment variables set in Vercel
- [ ] RLS policies verified on production
- [ ] AI API keys valid and rate-limited
- [ ] Build passes without errors
- [ ] No TypeScript errors
- [ ] No console.log with sensitive data

---

## 18. PRODUCTION READINESS CHECKLIST

### Foundation
- [x] CRM 2.0 audit complete
- [x] CRM 3.0 types defined (src/types/crm3.ts)
- [x] AI orchestrator architecture (src/lib/ai/orchestrator.ts)
- [x] Database migration 001 created
- [x] Supabase client configured
- [x] Dashboard page with KPIs
- [x] AI Copilot page (ai-center)
- [x] Content Studio page (basic)

### In Progress
- [ ] API routes fully implemented (v3/)
- [ ] AI Lead Intelligence panel
- [ ] Command Center with real data
- [ ] Unified Conversations AI layer

### Not Started
- [ ] Customer 360 full timeline
- [ ] Smart Automation upgrade
- [ ] AI Agent Center
- [ ] Content → Revenue Attribution
- [ ] Customer Journey Builder
- [ ] Revenue & Business Intelligence
- [ ] Full E2E testing
- [ ] Performance optimization
- [ ] Production monitoring

---

*This document is the source of truth for CRM 3.0. Update after every verified module.*
