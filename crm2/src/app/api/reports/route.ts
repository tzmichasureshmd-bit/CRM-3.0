import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

type ReportType = "leads" | "customers" | "conversations" | "sales" | "employees" | "agent-performance" | "daily" | "monthly";

interface ReportRow {
  [key: string]: unknown;
}

export interface ReportMetric {
  key: string;
  label: string;
  value: number;
}

/** Inclusive local range bounds as ISO instants; `null` means unbounded. */
interface Window {
  start: string | null;
  end: string | null;
}

interface ReportResult {
  rows: ReportRow[];
  count: number;
  metrics: ReportMetric[];
}

type Context = Awaited<ReturnType<typeof getCurrentAccount>>;

function parseLocalDay(value: string): Date | null {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Builds a query window from `?from=&to=` (`YYYY-MM-DD`, local calendar days,
 * `to` inclusive). Without explicit dates `fallbackDays` supplies a default
 * window; when both are absent the report stays unbounded.
 */
function buildWindow(from: string | null, to: string | null, fallbackDays?: number): Window {
  let startDay = from ? parseLocalDay(from) : null;
  let endDay = to ? parseLocalDay(to) : null;
  if (!startDay && !endDay && fallbackDays) {
    endDay = new Date();
    endDay.setHours(0, 0, 0, 0);
    startDay = new Date(endDay);
    startDay.setDate(startDay.getDate() - (fallbackDays - 1));
  }
  if (startDay && endDay && startDay > endDay) {
    const swap = startDay;
    startDay = endDay;
    endDay = swap;
  }
  if (endDay) {
    endDay = new Date(endDay);
    endDay.setDate(endDay.getDate() + 1);
  }
  return {
    start: startDay ? startDay.toISOString() : null,
    end: endDay ? endDay.toISOString() : null,
  };
}

function previousWindow(win: Window): Window {
  if (!win.start || !win.end) return { start: null, end: null };
  const start = new Date(win.start);
  const end = new Date(win.end);
  const span = end.getTime() - start.getTime();
  const prevEnd = new Date(start);
  const prevStart = new Date(start.getTime() - span);
  return { start: prevStart.toISOString(), end: prevEnd.toISOString() };
}

interface Windowable {
  gte: (column: string, value: string) => unknown;
  lt: (column: string, value: string) => unknown;
}

function inWindow<T extends Windowable>(query: T, column: string, win: Window): T {
  let out = query;
  if (win.start) out = out.gte(column, win.start) as unknown as T;
  if (win.end) out = out.lt(column, win.end) as unknown as T;
  return out;
}

async function headCount(
  ctx: Context,
  table: string,
  win: Window,
  column = "created_at",
): Promise<number> {
  const query = inWindow(
    ctx.supabase.from(table).select("id", { count: "exact", head: true }),
    column,
    win,
  );
  const res = (await query) as { count?: number | null };
  return res.count ?? 0;
}

const ROW_LIMIT = 2000;

/** Row set + exact record count for the requested report and window. */
async function runRows(ctx: Context, type: ReportType, win: Window): Promise<ReportResult> {
  let rows: ReportRow[] = [];
  let count = 0;
  let metrics: ReportMetric[] = [];

  switch (type) {
    case "leads": {
      const query = inWindow(
        ctx.supabase
          .from("contacts")
          .select("id, name, phone, email, company, lead_status, created_at")
          .eq("account_id", ctx.accountId),
        "created_at",
        win,
      ).order("created_at", { ascending: false }).limit(ROW_LIMIT);
      const { data } = await query;
      rows = (data ?? []).map((c) => ({
        ID: c.id,
        Name: c.name ?? "",
        Phone: c.phone,
        Email: c.email ?? "",
        Company: c.company ?? "",
        "Lead Status": c.lead_status ?? "new",
        "Created At": c.created_at,
      }));
      count = await headCount(ctx, "contacts", win);
      metrics = [{ key: "contacts", label: "Contacts", value: count }];
      break;
    }
    case "customers": {
      const query = inWindow(
        ctx.supabase
          .from("contacts")
          .select("id, name, phone, email, company, created_at, contact_tags(tags(name, color))")
          .eq("account_id", ctx.accountId),
        "created_at",
        win,
      ).order("created_at", { ascending: false }).limit(ROW_LIMIT);
      const { data } = await query;
      rows = (data ?? []).map((c) => ({
        ID: c.id,
        Name: c.name ?? "",
        Phone: c.phone,
        Email: c.email ?? "",
        Company: c.company ?? "",
        Tags: ((c as unknown as { contact_tags?: { tags?: { name?: string }[] }[] }).contact_tags ?? [])
          .map((ct) => ct.tags?.map((t) => t.name).filter(Boolean).join(", "))
          .filter(Boolean)
          .join(", ") ?? "",
        "Created At": c.created_at,
      }));
      count = await headCount(ctx, "contacts", win);
      metrics = [{ key: "contacts", label: "Contacts", value: count }];
      break;
    }
    case "conversations": {
      const query = inWindow(
        ctx.supabase
          .from("conversations")
          .select("id, status, last_message_text, last_message_at, unread_count, contact:contacts(name, phone), assigned_agent_id")
          .eq("account_id", ctx.accountId),
        "created_at",
        win,
      ).order("last_message_at", { ascending: false, nullsFirst: false }).limit(ROW_LIMIT);
      const { data } = await query;
      rows = (data ?? []).map((c) => {
        const conv = c as { contact?: { name: string | null; phone: string }[] | null; assigned_agent_id?: string | null };
        const contact = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;
        return {
          ID: c.id,
          Contact: contact?.name || contact?.phone || "Unknown",
          Status: c.status,
          "Last Message": c.last_message_text ?? "",
          "Last Message At": c.last_message_at ?? "",
          "Unread Count": c.unread_count,
          "Assigned Agent ID": conv.assigned_agent_id ?? "",
        };
      });
      count = await headCount(ctx, "conversations", win);
      metrics = [{ key: "conversations", label: "Conversations", value: count }];
      break;
    }
    case "sales": {
      const query = inWindow(
        ctx.supabase
          .from("deals")
          .select("id, title, value, currency, status, created_at, stage:pipeline_stages(name, color), contact:contacts(name, phone)")
          .eq("account_id", ctx.accountId),
        "created_at",
        win,
      ).order("created_at", { ascending: false }).limit(ROW_LIMIT);
      const { data } = await query;
      rows = (data ?? []).map((d) => {
        const deal = d as { stage?: { name: string }[] | null; contact?: { name: string | null; phone: string }[] | null };
        const stage = Array.isArray(deal.stage) ? deal.stage[0] : deal.stage;
        const contact = Array.isArray(deal.contact) ? deal.contact[0] : deal.contact;
        return {
          ID: d.id,
          Title: d.title,
          Value: `${d.currency ?? "$"}${(d.value ?? 0).toLocaleString()}`,
          Status: d.status ?? "active",
          Stage: stage?.name ?? "",
          Contact: contact?.name || contact?.phone || "Unknown",
          "Created At": d.created_at,
        };
      });
      const dealCount = await headCount(ctx, "deals", win);
      const valueQuery = inWindow(
        ctx.supabase.from("deals").select("value").eq("account_id", ctx.accountId),
        "created_at",
        win,
      );
      const { data: valueRows } = await valueQuery;
      const dealValue = (valueRows ?? []).reduce((sum, d) => sum + ((d as { value: number | null }).value ?? 0), 0);
      count = dealCount;
      metrics = [
        { key: "deals", label: "Deals created", value: dealCount },
        { key: "dealValue", label: "Deal value", value: dealValue },
      ];
      break;
    }
    case "employees": {
      const query = inWindow(
        ctx.supabase
          .from("profiles")
          .select("id, full_name, email, account_role, created_at")
          .eq("account_id", ctx.accountId),
        "created_at",
        win,
      ).order("created_at", { ascending: false }).limit(ROW_LIMIT);
      const { data } = await query;
      rows = (data ?? []).map((p) => ({
        ID: p.id,
        Name: p.full_name,
        Email: p.email,
        Role: p.account_role ?? "",
        "Created At": p.created_at,
      }));
      count = await headCount(ctx, "profiles", win);
      metrics = [{ key: "teamMembers", label: "Team members added", value: count }];
      break;
    }
    case "agent-performance": {
      // All agent hits are scoped to the account. `messages` has no
      // account_id column, so the message queries filter through the
      // embedded `conversations.account_id` relation (PostgREST).
      const [profilesRes, convsRes, msgsRes, customerRes] = await Promise.all([
        ctx.supabase
          .from("profiles")
          .select("id, full_name, email, account_role")
          .eq("account_id", ctx.accountId)
          .order("full_name"),
        inWindow(
          ctx.supabase
            .from("conversations")
            .select("id, assigned_agent_id, status")
            .eq("account_id", ctx.accountId),
          "created_at",
          win,
        ),
        inWindow(
          ctx.supabase
            .from("messages")
            .select("sender_id, sender_type, conversations(account_id)")
            .eq("sender_type", "agent")
            .eq("conversations.account_id", ctx.accountId),
          "created_at",
          win,
        ),
        inWindow(
          ctx.supabase
            .from("messages")
            .select("id, conversations(account_id)")
            .eq("sender_type", "customer")
            .eq("conversations.account_id", ctx.accountId),
          "created_at",
          win,
        ),
      ]);

      const agents = (profilesRes.data ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        account_role: string | null;
      }>;

      const byAgent = new Map<
        string,
        {
          name: string;
          email: string;
          role: string;
          assigned: number;
          open: number;
          replies: number;
        }
      >();
      for (const a of agents) {
        byAgent.set(a.id, {
          name: a.full_name || a.email || "Unknown",
          email: a.email ?? "",
          role: a.account_role ?? "",
          assigned: 0,
          open: 0,
          replies: 0,
        });
      }

      for (const c of (convsRes.data ?? []) as Array<{ assigned_agent_id: string | null; status: string | null }>) {
        const row = c.assigned_agent_id ? byAgent.get(c.assigned_agent_id) : null;
        if (!row) continue;
        row.assigned += 1;
        if (c.status !== "closed") row.open += 1;
      }

      const unassignedConvs = (convsRes.data ?? []).filter(
        (c) => !c.assigned_agent_id,
      ).length;
      const unassignedOpen = (convsRes.data ?? []).filter(
        (c) => !c.assigned_agent_id && c.status !== "closed",
      ).length;

      for (const m of (msgsRes.data ?? []) as Array<{ sender_id: string | null }>) {
        if (!m.sender_id) continue;
        const row = byAgent.get(m.sender_id);
        if (row) row.replies += 1;
      }

      const totalCustomerMsg = (customerRes.data ?? []).length;
      const totalReplies = (msgsRes.data ?? []).length;

      rows = Array.from(byAgent.values())
        .filter((r) => r.name !== "Unknown")
        .map((r) => ({
          Agent: r.name,
          Email: r.email,
          Role: r.role,
          "Assigned Conversations": r.assigned,
          "Open Conversations": r.open,
          "Replies Sent": r.replies,
          "Response Rate %":
            totalCustomerMsg === 0
              ? 0
              : Math.round((totalReplies / totalCustomerMsg) * 100),
        }));

      if (unassignedConvs > 0) {
        rows.push({
          Agent: "Unassigned",
          Email: "",
          Role: "",
          "Assigned Conversations": unassignedConvs,
          "Open Conversations": unassignedOpen,
          "Replies Sent": 0,
          "Response Rate %": 0,
        });
      }

      metrics = [
        { key: "replies", label: "Replies sent", value: totalReplies },
        { key: "customerMessages", label: "Customer messages", value: totalCustomerMsg },
        {
          key: "responseRate",
          label: "Response rate %",
          value:
            totalCustomerMsg === 0
              ? 0
              : Math.round((totalReplies / totalCustomerMsg) * 100),
        },
      ];
      count = rows.length;
      break;
    }
    case "daily":
    case "monthly": {
      const [conversations, messages, contacts, deals] = await Promise.all([
        inWindow(ctx.supabase.from("conversations").select("id, status, created_at").eq("account_id", ctx.accountId), "created_at", win),
        inWindow(ctx.supabase.from("messages").select("id, sender_type, content_type, created_at").eq("conversations.account_id", ctx.accountId), "created_at", win),
        inWindow(ctx.supabase.from("contacts").select("id, created_at").eq("account_id", ctx.accountId), "created_at", win),
        inWindow(ctx.supabase.from("deals").select("id, value, status, created_at").eq("account_id", ctx.accountId), "created_at", win),
      ]);

      const messageCount = (messages.data ?? []).length;
      const conversationCount = (conversations.data ?? []).length;
      const contactCount = (contacts.data ?? []).length;
      const dealValue = (deals.data ?? []).reduce((sum, d) => sum + (d.value ?? 0), 0);

      const startDate = win.start ? new Date(win.start) : null;
      const endDate = win.end ? new Date(win.end) : null;

      rows = [
        { Metric: "New Conversations", Value: conversationCount },
        { Metric: "New Messages", Value: messageCount },
        { Metric: "New Contacts", Value: contactCount },
        { Metric: "Deal Value", Value: dealValue },
        {
          Metric: "Period",
          Value:
            startDate && endDate
              ? `${startDate.toLocaleDateString()} - ${new Date(endDate.getTime() - 1).toLocaleDateString()}`
              : "",
        },
      ];
      metrics = [
        { key: "conversations", label: "New conversations", value: conversationCount },
        { key: "messages", label: "New messages", value: messageCount },
        { key: "contacts", label: "New contacts", value: contactCount },
        { key: "dealValue", label: "Deal value", value: dealValue },
      ];
      count = rows.length;
      break;
    }
    default:
      return { rows: [], count: 0, metrics: [] };
  }

  return { rows, count, metrics };
}

/** Aggregates only — used for the previous period when comparing. */
async function runMetrics(ctx: Context, type: ReportType, win: Window): Promise<ReportMetric[]> {
  if (!win.start || !win.end) return [];
  switch (type) {
    case "leads":
    case "customers":
      return [{ key: "contacts", label: "Contacts", value: await headCount(ctx, "contacts", win) }];
    case "conversations":
      return [{ key: "conversations", label: "Conversations", value: await headCount(ctx, "conversations", win) }];
    case "sales": {
      const [dealCount, valueRes] = await Promise.all([
        headCount(ctx, "deals", win),
        inWindow(
          ctx.supabase.from("deals").select("value").eq("account_id", ctx.accountId),
          "created_at",
          win,
        ),
      ]);
      const dealValue = (valueRes.data ?? []).reduce(
        (sum, d) => sum + ((d as { value: number | null }).value ?? 0),
        0,
      );
      return [
        { key: "deals", label: "Deals created", value: dealCount },
        { key: "dealValue", label: "Deal value", value: dealValue },
      ];
    }
    case "employees":
      return [{ key: "teamMembers", label: "Team members added", value: await headCount(ctx, "profiles", win) }];
    case "agent-performance": {
      const [repliesRes, customerRes] = await Promise.all([
        inWindow(
          ctx.supabase
            .from("messages")
            .select("id, conversations(account_id)")
            .eq("sender_type", "agent")
            .eq("conversations.account_id", ctx.accountId),
          "created_at",
          win,
        ),
        inWindow(
          ctx.supabase
            .from("messages")
            .select("id, conversations(account_id)")
            .eq("sender_type", "customer")
            .eq("conversations.account_id", ctx.accountId),
          "created_at",
          win,
        ),
      ]);
      const replies = (repliesRes.data ?? []).length;
      const customerMessages = (customerRes.data ?? []).length;
      return [
        { key: "replies", label: "Replies sent", value: replies },
        { key: "customerMessages", label: "Customer messages", value: customerMessages },
        {
          key: "responseRate",
          label: "Response rate %",
          value: customerMessages === 0 ? 0 : Math.round((replies / customerMessages) * 100),
        },
      ];
    }
    case "daily":
    case "monthly": {
      const [conversations, messages, contacts, deals] = await Promise.all([
        inWindow(ctx.supabase.from("conversations").select("id, created_at").eq("account_id", ctx.accountId), "created_at", win),
        inWindow(ctx.supabase.from("messages").select("id, created_at").eq("conversations.account_id", ctx.accountId), "created_at", win),
        inWindow(ctx.supabase.from("contacts").select("id, created_at").eq("account_id", ctx.accountId), "created_at", win),
        inWindow(ctx.supabase.from("deals").select("value, created_at").eq("account_id", ctx.accountId), "created_at", win),
      ]);
      return [
        { key: "conversations", label: "New conversations", value: (conversations.data ?? []).length },
        { key: "messages", label: "New messages", value: (messages.data ?? []).length },
        { key: "contacts", label: "New contacts", value: (contacts.data ?? []).length },
        {
          key: "dealValue",
          label: "Deal value",
          value: (deals.data ?? []).reduce((sum, d) => sum + ((d as { value: number | null }).value ?? 0), 0),
        },
      ];
    }
    default:
      return [];
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") || "daily") as ReportType;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const compare = searchParams.get("compare") === "1" || searchParams.get("compare") === "true";
    const fallbackDays = type === "monthly" ? 30 : type === "daily" ? 1 : undefined;

    const validTypes: ReportType[] = [
      "leads", "customers", "conversations", "sales", "employees", "agent-performance", "daily", "monthly",
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }

    const win = buildWindow(from, to, fallbackDays);
    const result = await runRows(ctx, type, win);

    const payload: Record<string, unknown> = {
      type,
      rows: result.rows,
      count: result.count,
      metrics: result.metrics,
      period: from || to || fallbackDays ? { from: win.start, to: win.end } : null,
    };

    if (compare && win.start && win.end) {
      const prev = previousWindow(win);
      payload.comparison = {
        period: { from: prev.start, to: prev.end },
        metrics: await runMetrics(ctx, type, prev),
      };
    }

    return NextResponse.json(payload);
  } catch (err) {
    return toErrorResponse(err);
  }
}
