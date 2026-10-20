import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";
import { hasServiceRole, serviceRoleClient } from "@/lib/supabase/admin";
import { describeError } from "@/lib/errors";
import {
  isTicketPriority,
  isTicketStatus,
  isUuid,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type AdminProfileRef,
  type AdminTicketBulkResponse,
  type AdminTicketListItem,
  type AdminTicketListResponse,
} from "./types";

const MAX_LIMIT = 100;
const MAX_BULK_IDS = 200;
const SEARCH_MAX_CONTACTS = 50;

function serviceUnavailable(): NextResponse {
  return NextResponse.json(
    {
      error:
        "The server is missing its service-role configuration (SUPABASE_SERVICE_ROLE_KEY). Set it in .env.local and restart the server.",
    },
    { status: 500 },
  );
}

function badRequest(reason: string): NextResponse {
  return NextResponse.json({ error: reason }, { status: 400 });
}

function failure(reason: string, status = 500): NextResponse {
  return NextResponse.json({ error: reason }, { status });
}

function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed)) return 25;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.max(1, parsed);
}

function sanitizeSearch(term: string): string {
  return term.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * GET /api/admin/tickets — every ticket across every tenant.
 *
 * Query params: status, priority, search, accountId, page | cursor, limit.
 * Response: { tickets, total, page, pageSize, nextCursor, stats }
 * `stats` is a platform-wide summary for the dashboard cards and is not
 * narrowed by the filters above.
 */
export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
    if (!hasServiceRole()) return serviceUnavailable();
    const admin = serviceRoleClient();

    const params = request.nextUrl.searchParams;
    const status = params.get("status");
    const priority = params.get("priority");
    const accountId = params.get("accountId");
    const search = sanitizeSearch(params.get("search") ?? params.get("q") ?? "");
    const limit = parseLimit(params.get("limit"));
    const page = parsePage(params.get("page"));
    const cursorRaw = params.get("cursor");
    const cursor =
      cursorRaw === null ? null : Math.max(0, Number.parseInt(cursorRaw, 10) || 0);
    const offset = cursor ?? (page - 1) * limit;
    const effectivePage = Math.floor(offset / limit) + 1;

    if (status && !isTicketStatus(status)) {
      return badRequest(
        `Invalid status "${status}". Allowed values: ${TICKET_STATUSES.join(", ")}.`,
      );
    }
    if (priority && !isTicketPriority(priority)) {
      return badRequest(
        `Invalid priority "${priority}". Allowed values: ${TICKET_PRIORITIES.join(", ")}.`,
      );
    }
    if (accountId && !isUuid(accountId)) {
      return badRequest(`Invalid accountId "${accountId}". Expected a UUID.`);
    }

    let query = admin
      .from("tickets")
      .select(
        "*, account:accounts(id,name,slug), contact:contacts(id,name,email,phone)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (priority) query = query.eq("priority", priority);
    if (accountId) query = query.eq("account_id", accountId);

    if (search) {
      const contactIds: string[] = [];
      const { data: matchingContacts, error: contactError } = await admin
        .from("contacts")
        .select("id")
        .or(`email.ilike.%${search}%,name.ilike.%${search}%`)
        .limit(SEARCH_MAX_CONTACTS);
      if (contactError) {
        return failure(
          describeError(contactError, "The requester search could not be run."),
        );
      }
      for (const row of matchingContacts ?? []) {
        const id = (row as { id: string }).id;
        if (isUuid(id)) contactIds.push(id);
      }
      const clauses = [
        `subject.ilike.%${search}%`,
        `description.ilike.%${search}%`,
        `ticket_number::text.ilike.%${search}%`,
      ];
      if (contactIds.length > 0) clauses.push(`contact_id.in.(${contactIds.join(",")})`);
      query = query.or(clauses.join(","));
    }

    const { data, error, count } = await query;
    if (error) {
      return failure(describeError(error, "The ticket list could not be loaded."));
    }

    const rows = (data ?? []) as unknown as AdminTicketListItem[];

    const userIds = new Set<string>();
    for (const row of rows) {
      if (row.assigned_agent_id) userIds.add(row.assigned_agent_id);
      if (row.created_by) userIds.add(row.created_by);
    }

    let profiles: AdminProfileRef[] = [];
    if (userIds.size > 0) {
      const { data: profileRows, error: profileError } = await admin
        .from("profiles")
        .select("user_id, full_name, email, avatar_url")
        .in("user_id", [...userIds]);
      if (profileError) {
        return failure(
          describeError(profileError, "The assignee profiles could not be loaded."),
        );
      }
      profiles = (profileRows ?? []) as unknown as AdminProfileRef[];
    }
    const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

    for (const row of rows) {
      const assignee = row.assigned_agent_id
        ? profileMap.get(row.assigned_agent_id)
        : undefined;
      const creator = row.created_by ? profileMap.get(row.created_by) : undefined;
      row.assignee = assignee ?? null;
      row.requester_name = row.contact?.name ?? creator?.full_name ?? null;
      row.requester_email = row.contact?.email ?? creator?.email ?? null;
    }

    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
    const sevenDaysAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const countQueries = [
      admin.from("tickets").select("id", { count: "exact", head: true }),
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      admin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress"),
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("status", "waiting"),
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("status", "resolved"),
      admin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("resolved_at", startOfDay),
      admin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("resolved_at", sevenDaysAgo),
      admin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .is("assigned_agent_id", null)
        .not("status", "in", "(resolved,closed)"),
    ];

    const counts = await Promise.all(
      countQueries.map(async (q) => {
        const result = await q;
        return { count: result.count ?? 0, error: result.error };
      }),
    );
    const failedCount = counts.find((c) => c.error);
    if (failedCount?.error) {
      return failure(
        describeError(failedCount.error, "The ticket summary could not be loaded."),
      );
    }

    const response: AdminTicketListResponse = {
      tickets: rows,
      total: count ?? 0,
      page: effectivePage,
      pageSize: limit,
      nextCursor: offset + rows.length < (count ?? 0) ? String(offset + rows.length) : null,
      stats: {
        total: counts[0].count,
        open: counts[1].count,
        in_progress: counts[2].count,
        waiting: counts[3].count,
        resolved: counts[4].count,
        resolved_today: counts[5].count,
        resolved_last_7_days: counts[6].count,
        unassigned: counts[7].count,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    return toErrorResponse(err);
  }
}

interface BulkTicketPatch {
  status?: string;
  priority?: string;
  assigned_agent_id?: string | null;
}

/**
 * PATCH /api/admin/tickets — bulk (or single) status / priority / assignee update.
 *
 * Body: { ids: string[] } or { id: string }, plus any of
 * { status, priority, assigned_agent_id }.
 * Response: { updated, tickets }
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireSuperAdmin();
    if (!hasServiceRole()) return serviceUnavailable();
    const admin = serviceRoleClient();

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return badRequest("A JSON request body is required.");
    }

    const ids: string[] = [];
    if (typeof body.id === "string") ids.push(body.id);
    if (Array.isArray(body.ids)) {
      for (const raw of body.ids) {
        if (typeof raw === "string") ids.push(raw);
      }
    }
    if (ids.length === 0) {
      return badRequest("Provide a ticket `id` or a non-empty `ids` array.");
    }
    if (ids.length > MAX_BULK_IDS) {
      return badRequest(`Cannot update more than ${MAX_BULK_IDS} tickets in one request.`);
    }
    for (const id of ids) {
      if (!isUuid(id)) return badRequest(`Invalid ticket id "${id}". Expected a UUID.`);
    }

    const patch: BulkTicketPatch = {};
    if ("status" in body) {
      if (!isTicketStatus(body.status)) {
        return badRequest(
          `Invalid status. Allowed values: ${TICKET_STATUSES.join(", ")}.`,
        );
      }
      patch.status = body.status;
    }
    if ("priority" in body) {
      if (!isTicketPriority(body.priority)) {
        return badRequest(
          `Invalid priority. Allowed values: ${TICKET_PRIORITIES.join(", ")}.`,
        );
      }
      patch.priority = body.priority;
    }
    if ("assigned_agent_id" in body) {
      const rawAgent = body.assigned_agent_id;
      if (rawAgent !== null && typeof rawAgent !== "string") {
        return badRequest("assigned_agent_id must be a profile user id or null.");
      }
      const agentId = typeof rawAgent === "string" && rawAgent.trim() ? rawAgent.trim() : null;
      if (agentId) {
        if (!isUuid(agentId)) {
          return badRequest(`Invalid assignee "${agentId}". Expected a UUID.`);
        }
        const { data: agent, error: agentError } = await admin
          .from("profiles")
          .select("user_id")
          .eq("user_id", agentId)
          .maybeSingle();
        if (agentError) {
          return failure(
            describeError(agentError, "The assignee could not be verified."),
          );
        }
        if (!agent) {
          return badRequest(
            `No profile with user id ${agentId}. Pick an assignee from the agent list.`,
          );
        }
      }
      patch.assigned_agent_id = agentId;
    }

    if (Object.keys(patch).length === 0) {
      return badRequest(
        "No fields to update. Provide at least one of: status, priority, assigned_agent_id.",
      );
    }

    const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    if (patch.status) {
      if (patch.status === "resolved") {
        update.resolved_at = new Date().toISOString();
        update.closed_at = null;
      } else if (patch.status === "closed") {
        update.closed_at = new Date().toISOString();
        update.resolved_at = null;
      } else {
        update.resolved_at = null;
        update.closed_at = null;
      }
    }

    const { data, error } = await admin
      .from("tickets")
      .update(update)
      .in("id", ids)
      .select("*");

    if (error) {
      return failure(describeError(error, "The tickets could not be updated."));
    }
    const updated = (data ?? []) as unknown as AdminTicketListItem[];
    if (updated.length === 0) {
      return failure(
        "No tickets matched the provided ids. They may have been deleted.",
        404,
      );
    }

    const response: AdminTicketBulkResponse = {
      updated: updated.length,
      tickets: updated,
    };
    return NextResponse.json(response);
  } catch (err) {
    return toErrorResponse(err);
  }
}
