# TZMICHA CRM 3.0 — ARCHITECTURE
> Technical architecture reference. Read before implementing any module.

---

## SYSTEM OVERVIEW

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER / MOBILE                          │
│              Next.js 15 · React · TypeScript · Tailwind          │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Dashboard  │  │  Inbox/Conv  │  │  Content Studio        │  │
│  │  (Command   │  │  (Unified    │  │  AI Generator          │  │
│  │   Center)   │  │   Channels)  │  │  Calendar / Grid       │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  AI Copilot │  │  Customer360 │  │  Lead Intelligence     │  │
│  │  (Chat UI)  │  │  (Timeline)  │  │  (Score + NBA)         │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │ HTTPS
┌──────────────────────────────────────────────────────────────────┐
│                      NEXT.JS API ROUTES                          │
│                                                                  │
│  /api/v3/  (CRM 3.0 — new intelligence layer)                   │
│  /api/v1/  (CRM 2.0 — existing, DO NOT MODIFY)                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              AI ORCHESTRATOR                              │   │
│  │         src/lib/ai/orchestrator.ts                        │   │
│  │  All AI calls route here — never scattered in components  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
┌─────────────────┐  ┌────────────────┐  ┌────────────────────┐
│   SUPABASE      │  │  AI SERVICE    │  │  EXTERNAL APIs     │
│                 │  │  (FastAPI)     │  │                    │
│  PostgreSQL     │  │  ai-service/   │  │  OpenAI GPT-4o     │
│  Auth (SSR)     │  │  Python 3.11   │  │  Anthropic Claude  │
│  Realtime       │  │  FastAPI       │  │  Meta (WhatsApp)   │
│  RLS            │  │  Pydantic      │  │  Meta (Instagram)  │
│  pgvector       │  │  SQLAlchemy    │  │  Meta (Facebook)   │
│  Storage        │  │  AsyncIO       │  │  Telegram          │
└─────────────────┘  └────────────────┘  └────────────────────┘
```

---

## DIRECTORY STRUCTURE

```
CRM_3.0/
├── src/                          # CRM 3.0 Next.js app
│   ├── app/
│   │   ├── (auth)/               # Login, signup pages
│   │   ├── (dashboard)/          # All authenticated pages
│   │   │   ├── dashboard/        # AI Command Center (P10)
│   │   │   ├── inbox/            # Unified Conversations (P1)
│   │   │   ├── customers/        # Customer 360 (P2)
│   │   │   ├── leads/            # Lead Intelligence (P3)
│   │   │   ├── automations/      # Smart Automation (P4)
│   │   │   ├── ai-center/        # AI Copilot + Agents (P5/P10)
│   │   │   ├── content-studio/   # Content Studio (P6)
│   │   │   ├── journeys/         # Journey Builder (P8)
│   │   │   ├── reports/          # Revenue BI (P9)
│   │   │   ├── contacts/
│   │   │   ├── pipelines/
│   │   │   ├── broadcasts/
│   │   │   ├── appointments/
│   │   │   ├── follow-ups/
│   │   │   └── settings/
│   │   └── api/
│   │       └── v3/               # CRM 3.0 API routes
│   │           ├── copilot/
│   │           ├── command-center/
│   │           └── ai/
│   │               ├── lead-intelligence/
│   │               ├── generate-content/
│   │               ├── next-best-action/
│   │               └── summarize-conversation/
│   ├── components/
│   │   ├── dashboard/            # Command Center widgets
│   │   ├── inbox/                # Conversation components
│   │   ├── lead-intelligence/    # Lead score panels
│   │   ├── content-studio/       # Content components
│   │   ├── revenue-intelligence/ # Revenue charts
│   │   ├── command-center/       # Command center components
│   │   ├── copilot/              # AI Copilot components
│   │   ├── layout/               # Sidebar, topbar
│   │   └── ui/                   # Shared UI primitives
│   ├── lib/
│   │   ├── ai/
│   │   │   └── orchestrator.ts   # CENTRAL AI HUB
│   │   ├── supabase/
│   │   │   ├── client.ts         # Browser Supabase client
│   │   │   └── server.ts         # Server Supabase client
│   │   └── whatsapp/
│   ├── types/
│   │   └── crm3.ts               # All CRM 3.0 TypeScript types
│   └── styles/
│       └── crm-theme.css         # CSS variables + theme
├── supabase/
│   └── migrations/
│       └── 001_crm3_foundation.sql
├── ai-service/                   # FastAPI AI microservice
│   └── app/
│       ├── api/                  # API endpoints
│       ├── agents/               # AI agent implementations
│       ├── llm/                  # LLM provider abstraction
│       ├── rag/                  # RAG implementation
│       └── main.py
├── backend/                      # FastAPI backend (CRM 3.0)
├── CRM 2.0/                      # EXISTING — DO NOT MODIFY
│   └── src/                      # All CRM 2.0 source
└── docs/                         # THIS FOLDER — master docs
    ├── CRM_3_MASTER_PLAN.md
    ├── CRM_3_FEATURE_STATUS.md
    ├── CRM_3_ARCHITECTURE.md     # THIS FILE
    └── CRM_3_PROGRESS_LOG.md
```

---

## DATA FLOW ARCHITECTURE

### 1. Conversation Intelligence Flow
```
User sends message (WhatsApp/Instagram/Facebook/Email)
    ↓
CRM 2.0 webhook receives message
    ↓
Message stored in conversations/messages tables
    ↓
CRM 3.0 AI trigger fires (background)
    ↓
AI Orchestrator → /api/v3/ai/lead-intelligence
    ↓
OpenAI analyzes: intent + sentiment + score factors
    ↓
Results stored: crm3_next_best_actions + conversation AI columns
    ↓
Supabase Realtime pushes update to browser
    ↓
Conversation view shows: intent badge + NBA + score
```

### 2. Content → Revenue Attribution Flow
```
Content created in Content Studio
    ↓
crm3_content record created
    ↓
Content published to platform
    ↓
User engages (comment/like/message)
    ↓
Engagement event captured
    ↓
Contact identified / created
    ↓
crm3_attribution record created (content_id → contact_id)
    ↓
Lead created from contact
    ↓
crm3_attribution updated (→ lead_created_at)
    ↓
Deal created
    ↓
crm3_attribution updated (→ deal_id, deal_value)
    ↓
Deal won
    ↓
crm3_attribution updated (→ revenue_amount)
    ↓
Content card shows: "This post generated ₹2,40,000"
```

### 3. AI Command Center Flow
```
User opens dashboard
    ↓
/api/v3/command-center called
    ↓
Server queries (parallel):
  - contacts with high lead_score + no recent reply
  - follow_ups where due_date < now
  - deals with no activity > 7 days
  - conversations unanswered > 2 hours
  - automation runs with status = 'failed'
    ↓
AI analyzes results → generates recommendations
    ↓
CommandCenterState returned
    ↓
Dashboard renders: Hot Leads / Overdue / Deals at Risk / Recommendations
    ↓
Supabase Realtime subscription keeps it live
```

---

## AI ORCHESTRATOR ARCHITECTURE

All AI calls MUST go through `src/lib/ai/orchestrator.ts`.

### Tool Registry
```typescript
AI_TOOLS = {
  getLead, searchLeads,
  getCustomer, searchCustomers,
  getConversation, getCampaign,
  getPipeline, getDeals,
  createTask, createFollowUp,
  assignLead, generateContent,
  summarizeConversation, recommendNextAction,
  getTeamWorkload, getRevenueMetrics,
  searchKnowledge
}
```

### AI Safety Enforcement
1. Tools are the ONLY way AI accesses data
2. No raw SQL from AI
3. Every tool call is logged to `crm3_ai_operations`
4. Agent actions require `requires_approval = true` by default
5. Max actions per run enforced at orchestrator level

---

## DATABASE ARCHITECTURE

### Multi-tenancy Pattern
Every table follows this pattern:
```sql
CREATE TABLE crm3_example (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- ... fields
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm3_example ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm3_example_rls ON crm3_example
  USING (account_id IN (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));
```

### Table Relationships
```
accounts (CRM 2.0)
  ├── contacts (CRM 2.0)
  │   ├── conversations (CRM 2.0)
  │   │   └── messages (CRM 2.0)
  │   ├── deals (CRM 2.0)
  │   ├── crm3_journey_events (CRM 3.0)
  │   └── crm3_attribution (CRM 3.0) ←── crm3_content
  ├── crm3_content (CRM 3.0)
  ├── crm3_ai_agents (CRM 3.0)
  │   └── crm3_ai_agent_runs (CRM 3.0)
  ├── crm3_next_best_actions (CRM 3.0)
  ├── crm3_ai_operations (CRM 3.0)
  └── crm3_segments (CRM 3.0)
```

---

## SECURITY ARCHITECTURE

### Authentication Flow
```
Browser → Supabase Auth (SSR)
    ↓
Next.js middleware validates session
    ↓
API routes use createServerClient() — server-side only
    ↓
account_id extracted from session (NEVER from request body)
    ↓
All DB queries scoped to account_id
    ↓
RLS provides second layer of isolation
```

### Secret Management
```
.env.local (never committed)
├── NEXT_PUBLIC_SUPABASE_URL        → browser safe
├── NEXT_PUBLIC_SUPABASE_ANON_KEY   → browser safe (RLS protected)
├── SUPABASE_SERVICE_ROLE_KEY       → server-side ONLY
├── OPENAI_API_KEY                  → server-side ONLY
└── ANTHROPIC_API_KEY               → server-side ONLY
```

---

## REALTIME ARCHITECTURE

### Supabase Realtime Subscriptions
```typescript
// Pattern for all realtime subscriptions
const channel = supabase
  .channel(`crm3:${accountId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'crm3_next_best_actions',
    filter: `account_id=eq.${accountId}`
  }, (payload) => {
    // Handle update
  })
  .subscribe();
```

### Realtime-enabled Tables
- `crm3_content` — publishing status updates
- `crm3_journey_events` — customer journey progression
- `crm3_next_best_actions` — NBA updates
- `crm3_ai_agent_runs` — agent progress
- `conversations` (CRM 2.0) — new messages
- `messages` (CRM 2.0) — message delivery status

---

## COMPONENT ARCHITECTURE

### Page → Component → Hook → API Pattern
```
Page (app/dashboard/page.tsx)
  └── Component (components/dashboard/KPIWidget.tsx)
        └── Hook (hooks/use-command-center.ts)
              └── API call (/api/v3/command-center)
                    └── Supabase query (server-side)
```

### Shared UI Primitives (src/components/ui/)
- GlassPanel — frosted glass card container
- CustomCursor — custom cursor effect
- All shadcn/ui components

---

## PERFORMANCE ARCHITECTURE

### Caching Strategy
- Command Center: `cache: 'no-store'` (always fresh)
- Lead Intelligence: 5-minute cache per contact
- Content Analytics: 1-hour cache
- Revenue Intelligence: 1-hour cache

### Parallel Data Fetching
```typescript
// Command center fetches all data in parallel
const [hotLeads, overdueFollowups, dealsAtRisk, conversations] =
  await Promise.all([
    getHotLeads(accountId),
    getOverdueFollowups(accountId),
    getDealsAtRisk(accountId),
    getUnansweredConversations(accountId),
  ]);
```

---

*Read this document before implementing any new module.*
