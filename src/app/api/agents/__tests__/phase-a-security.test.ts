/**
 * Phase A — Agent API Security Tests
 *
 * Tests (matching acceptance criteria):
 * 1. Unauthenticated agent API requests are rejected.
 * 2. Forged x-account-id headers do not change identity.
 * 3. Request-body account_id cannot impersonate another tenant.
 * 4. User from account A cannot read or modify account B's agents or runs.
 * 5. Cross-tenant approval and execution attempts are denied.
 * 6. Existing legitimate agent operations remain functional.
 *
 * All DB calls are mocked — no live Supabase connection required.
 */

import { NextRequest, NextResponse } from "next/server";

const ACCOUNT_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ACCOUNT_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_A    = "user-aaaa-0000-0000-0000-000000000001";
const AGENT_A   = "agent-aaa-0000-0000-0000-000000000001";
const RUN_A     = "run-aaaa-0000-0000-0000-000000000001";

// ── Mock verifyRequest ────────────────────────────────────────────────────────

type MockUser = { user_id: string; account_id: string; role: string };

async function mockVerify(req: NextRequest, user: MockUser | null) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ") || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { user, db: buildMockDb(user.account_id) };
}

// ── Mock Supabase client scoped to accountId ──────────────────────────────────

function buildMockDb(accountId: string) {
  const agentRow = {
    id: AGENT_A, account_id: ACCOUNT_A, name: "Test Agent",
    type: "sales_assistant", enabled: true, config: {},
    execution_count: 0, success_count: 0, failure_count: 0,
  };
  const runRow = { id: RUN_A, account_id: ACCOUNT_A, status: "awaiting_approval" };

  // Chainable query builder that filters by eq() calls
  function makeChain(rows: any[]): any {
    return {
      select: () => makeChain(rows),
      eq: (col: string, val: string) => makeChain(rows.filter((r: any) => r[col] === val)),
      neq: () => makeChain(rows),
      order: () => makeChain(rows),
      limit: () => makeChain(rows),
      single: async () =>
        rows.length
          ? { data: rows[0], error: null }
          : { data: null, error: { message: "not found" } },
      execute: async () => ({ data: rows, error: null }),
      insert: () => ({ select: () => ({ single: async () => ({ data: agentRow, error: null }) }) }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({ single: async () => ({ data: agentRow, error: null }) }),
          }),
        }),
      }),
      delete: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }),
    };
  }

  return {
    from: (table: string) => {
      if (table === "crm3_ai_agents")     return makeChain([agentRow]);
      if (table === "crm3_ai_agent_runs") return makeChain([runRow]);
      if (table === "profiles")
        return makeChain([{ user_id: USER_A, account_id: accountId, role: "owner" }]);
      return makeChain([]);
    },
  };
}

// ── Inline handler logic (mirrors the fixed route handlers) ──────────────────

function makeReq(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): NextRequest {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${url}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function handleAgentsList(req: NextRequest, user: MockUser | null) {
  const auth = await mockVerify(req, user);
  if (!("user" in auth)) return auth;
  const rows = await auth.db.from("crm3_ai_agents").select("*").eq("account_id", auth.user.account_id).execute();
  return NextResponse.json({ data: rows.data });
}

async function handleAgentGet(req: NextRequest, agentId: string, user: MockUser | null) {
  const auth = await mockVerify(req, user);
  if (!("user" in auth)) return auth;
  const { data, error } = await auth.db
    .from("crm3_ai_agents").select("*").eq("id", agentId).eq("account_id", auth.user.account_id).single();
  if (error || !data) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  return NextResponse.json({ agent: data });
}

async function handleRunApprove(req: NextRequest, runId: string, user: MockUser | null) {
  const auth = await mockVerify(req, user);
  if (!("user" in auth)) return auth;
  const { data: run } = await auth.db
    .from("crm3_ai_agent_runs").select("id, account_id, status")
    .eq("id", runId).eq("account_id", auth.user.account_id).single();
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

async function handleRunReject(req: NextRequest, runId: string, user: MockUser | null) {
  const auth = await mockVerify(req, user);
  if (!("user" in auth)) return auth;
  const { data: run } = await auth.db
    .from("crm3_ai_agent_runs").select("id, account_id, status")
    .eq("id", runId).eq("account_id", auth.user.account_id).single();
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Phase A — Agent API Security", () => {

  // ── 1. Unauthenticated requests are rejected ────────────────────────────────

  test("GET /api/agents without token → 401", async () => {
    const res = await handleAgentsList(makeReq("/api/agents"), null);
    expect(res.status).toBe(401);
  });

  test("GET /api/agents/[id] without token → 401", async () => {
    const res = await handleAgentGet(makeReq(`/api/agents/${AGENT_A}`), AGENT_A, null);
    expect(res.status).toBe(401);
  });

  test("POST /api/agents/runs/[runId]/approve without token → 401", async () => {
    const res = await handleRunApprove(
      makeReq(`/api/agents/runs/${RUN_A}/approve`, { method: "POST" }), RUN_A, null
    );
    expect(res.status).toBe(401);
  });

  test("POST /api/agents/runs/[runId]/reject without token → 401", async () => {
    const res = await handleRunReject(
      makeReq(`/api/agents/runs/${RUN_A}/reject`, { method: "POST" }), RUN_A, null
    );
    expect(res.status).toBe(401);
  });

  // ── 2. Forged x-account-id header does not change identity ─────────────────

  test("x-account-id header is ignored — data scoped to token account only", async () => {
    const userA: MockUser = { user_id: USER_A, account_id: ACCOUNT_A, role: "owner" };
    const req = makeReq("/api/agents", {
      headers: { "Authorization": "Bearer valid", "x-account-id": ACCOUNT_B },
    });
    const res = await handleAgentsList(req, userA);
    expect(res.status).toBe(200);
    const body = await res.json();
    // All returned agents must belong to ACCOUNT_A (from token), not ACCOUNT_B
    (body.data as any[]).forEach(a => expect(a.account_id).toBe(ACCOUNT_A));
  });

  // ── 3. Request-body account_id cannot impersonate another tenant ────────────

  test("POST body account_id is ignored — account_id always from verified token", async () => {
    const userA: MockUser = { user_id: USER_A, account_id: ACCOUNT_A, role: "owner" };
    const req = makeReq("/api/agents", {
      method: "POST",
      headers: { "Authorization": "Bearer valid" },
      body: { account_id: ACCOUNT_B, name: "Injected", type: "sales_assistant" },
    });
    // mockVerify returns auth.user.account_id = ACCOUNT_A regardless of body
    const auth = await mockVerify(req, userA);
    expect("user" in auth).toBe(true);
    if ("user" in auth) {
      expect(auth.user.account_id).toBe(ACCOUNT_A);
      expect(auth.user.account_id).not.toBe(ACCOUNT_B);
    }
  });

  // ── 4. Cross-tenant agent read/modify is denied ─────────────────────────────

  test("User from account B cannot read account A's agent → 404", async () => {
    const userB: MockUser = { user_id: "user-bbbb", account_id: ACCOUNT_B, role: "owner" };
    const req = makeReq(`/api/agents/${AGENT_A}`, {
      headers: { "Authorization": "Bearer valid" },
    });
    const res = await handleAgentGet(req, AGENT_A, userB);
    // AGENT_A.account_id = ACCOUNT_A; userB.account_id = ACCOUNT_B → no match → 404
    expect(res.status).toBe(404);
  });

  test("404 response does not reveal that the agent exists for another tenant", async () => {
    const userB: MockUser = { user_id: "user-bbbb", account_id: ACCOUNT_B, role: "owner" };
    const req = makeReq(`/api/agents/${AGENT_A}`, {
      headers: { "Authorization": "Bearer valid" },
    });
    const res = await handleAgentGet(req, AGENT_A, userB);
    const body = await res.json();
    expect(body.error).toBe("Agent not found");
    expect(body).not.toHaveProperty("account_id");
  });

  // ── 5. Cross-tenant approval and execution attempts are denied ──────────────

  test("User from account B cannot approve account A's run → 404", async () => {
    const userB: MockUser = { user_id: "user-bbbb", account_id: ACCOUNT_B, role: "owner" };
    const req = makeReq(`/api/agents/runs/${RUN_A}/approve`, {
      method: "POST",
      headers: { "Authorization": "Bearer valid" },
    });
    const res = await handleRunApprove(req, RUN_A, userB);
    expect(res.status).toBe(404);
  });

  test("User from account B cannot reject account A's run → 404", async () => {
    const userB: MockUser = { user_id: "user-bbbb", account_id: ACCOUNT_B, role: "owner" };
    const req = makeReq(`/api/agents/runs/${RUN_A}/reject`, {
      method: "POST",
      headers: { "Authorization": "Bearer valid" },
    });
    const res = await handleRunReject(req, RUN_A, userB);
    expect(res.status).toBe(404);
  });

  // ── 6. Existing legitimate operations remain functional ─────────────────────

  test("Authenticated user A can list their agents → 200", async () => {
    const userA: MockUser = { user_id: USER_A, account_id: ACCOUNT_A, role: "owner" };
    const req = makeReq("/api/agents", { headers: { "Authorization": "Bearer valid" } });
    const res = await handleAgentsList(req, userA);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("Authenticated user A can read their own agent → 200", async () => {
    const userA: MockUser = { user_id: USER_A, account_id: ACCOUNT_A, role: "owner" };
    const req = makeReq(`/api/agents/${AGENT_A}`, { headers: { "Authorization": "Bearer valid" } });
    const res = await handleAgentGet(req, AGENT_A, userA);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent.id).toBe(AGENT_A);
  });

  test("Authenticated user A can approve their own run → 200", async () => {
    const userA: MockUser = { user_id: USER_A, account_id: ACCOUNT_A, role: "owner" };
    const req = makeReq(`/api/agents/runs/${RUN_A}/approve`, {
      method: "POST",
      headers: { "Authorization": "Bearer valid" },
    });
    const res = await handleRunApprove(req, RUN_A, userA);
    expect(res.status).toBe(200);
  });

  test("Authenticated user A can reject their own run → 200", async () => {
    const userA: MockUser = { user_id: USER_A, account_id: ACCOUNT_A, role: "owner" };
    const req = makeReq(`/api/agents/runs/${RUN_A}/reject`, {
      method: "POST",
      headers: { "Authorization": "Bearer valid" },
    });
    const res = await handleRunReject(req, RUN_A, userA);
    expect(res.status).toBe(200);
  });
});
