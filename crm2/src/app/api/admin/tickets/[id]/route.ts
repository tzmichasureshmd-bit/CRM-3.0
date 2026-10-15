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
  type AdminTicketCommentItem,
  type AdminTicketDetailResponse,
  type AdminTicketDetailRow,
  type AdminTicketMutationResponse,
  type AdminTicketRow,
  type AdminTicketTimelineEntry,
} from "../types";

const SUBJECT_MAX_LENGTH = 300;
const CATEGORY_MAX_LENGTH = 60;

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

function notFound(): NextResponse {
  return NextResponse.json(
    { error: "Ticket not found. It may have been deleted." },
    { status: 404 },
  );
}

function buildTimeline(
  ticket: AdminTicketRow,
  comments: AdminTicketCommentItem[],
): AdminTicketTimelineEntry[] {
  const entries: AdminTicketTimelineEntry[] = [
    { at: ticket.created_at, kind: "created", label: "Ticket opened" },
  ];

  for (const comment of comments) {
    const author = comment.author?.full_name ?? "Someone";
    entries.push({
      at: comment.created_at,
      kind: comment.is_internal ? "note" : "reply",
      label: comment.is_internal
        ? `${author} added an internal note`
        : `${author} replied`,
    });
  }

  if (ticket.resolved_at) {
    entries.push({ at: ticket.resolved_at, kind: "resolved", label: "Marked resolved" });
  }
  if (ticket.closed_at) {
    entries.push({ at: ticket.closed_at, kind: "closed", label: "Ticket closed" });
  }

  const hasExactUpdate = entries.some(
    (entry) => Math.abs(new Date(entry.at).getTime() - new Date(ticket.updated_at).getTime()) < 1000,
  );
  if (!hasExactUpdate) {
    entries.push({ at: ticket.updated_at, kind: "updated", label: "Ticket updated" });
  }

  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/**
 * GET /api/admin/tickets/[id] — full ticket detail for the support desk.
 *
 * Response: { ticket, assignee, comments, timeline, agents }
 * `agents` are the profiles of the ticket's tenant (plus the current
 * assignee) and back the assignee picker.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
    if (!hasServiceRole()) return serviceUnavailable();
    const admin = serviceRoleClient();

    const { id } = await params;
    if (!isUuid(id)) return badRequest(`Invalid ticket id "${id}". Expected a UUID.`);

    const { data, error } = await admin
      .from("tickets")
      .select("*, account:accounts(id,name,slug), contact:contacts(id,name,email,phone)")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return failure(describeError(error, "The ticket could not be loaded."));
    }
    if (!data) return notFound();

    const ticket = data as unknown as AdminTicketDetailRow;

    const { data: commentRows, error: commentError } = await admin
      .from("ticket_comments")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });
    if (commentError) {
      return failure(
        describeError(commentError, "The comment thread could not be loaded."),
      );
    }

    const { data: tenantAgents, error: agentError } = await admin
      .from("profiles")
      .select("user_id, full_name, email, avatar_url")
      .eq("account_id", ticket.account_id)
      .order("full_name", { ascending: true })
      .limit(200);
    if (agentError) {
      return failure(describeError(agentError, "The agent list could not be loaded."));
    }

    const userIds = new Set<string>();
    if (ticket.assigned_agent_id) userIds.add(ticket.assigned_agent_id);
    if (ticket.created_by) userIds.add(ticket.created_by);
    for (const row of (commentRows ?? []) as unknown as AdminTicketCommentItem[]) {
      if (row.user_id) userIds.add(row.user_id);
    }

    let profiles: AdminProfileRef[] = [];
    if (userIds.size > 0) {
      const { data: profileRows, error: profileError } = await admin
        .from("profiles")
        .select("user_id, full_name, email, avatar_url")
        .in("user_id", [...userIds]);
      if (profileError) {
        return failure(
          describeError(profileError, "The comment authors could not be loaded."),
        );
      }
      profiles = (profileRows ?? []) as unknown as AdminProfileRef[];
    }
    const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

    const comments = ((commentRows ?? []) as unknown as AdminTicketCommentItem[]).map(
      (comment) => ({
        ...comment,
        author: comment.user_id ? (profileMap.get(comment.user_id) ?? null) : null,
      }),
    );

    const assignee = ticket.assigned_agent_id
      ? (profileMap.get(ticket.assigned_agent_id) ?? null)
      : null;

    const agents = [...((tenantAgents ?? []) as unknown as AdminProfileRef[])];
    if (assignee && !agents.some((agent) => agent.user_id === assignee.user_id)) {
      agents.push(assignee);
    }

    const response: AdminTicketDetailResponse = {
      ticket,
      assignee,
      comments,
      timeline: buildTimeline(ticket, comments),
      agents,
    };

    return NextResponse.json(response);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/admin/tickets/[id] — update status, priority, assignee,
 * category or subject on a single ticket.
 *
 * Response: { ticket }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
    if (!hasServiceRole()) return serviceUnavailable();
    const admin = serviceRoleClient();

    const { id } = await params;
    if (!isUuid(id)) return badRequest(`Invalid ticket id "${id}". Expected a UUID.`);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return badRequest("A JSON request body is required.");
    }

    const update: Record<string, unknown> = {};
    const allowed = ["status", "priority", "assigned_agent_id", "category", "subject"];
    for (const key of allowed) {
      if (!(key in body)) continue;
      const value = body[key];

      if (key === "assigned_agent_id") {
        if (value !== null && typeof value !== "string") {
          return badRequest("assigned_agent_id must be a profile user id or null.");
        }
        const agentId = typeof value === "string" && value.trim() ? value.trim() : null;
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
            return failure(describeError(agentError, "The assignee could not be verified."));
          }
          if (!agent) {
            return badRequest(
              `No profile with user id ${agentId}. Pick an assignee from the agent list.`,
            );
          }
        }
        update.assigned_agent_id = agentId;
        continue;
      }

      if (typeof value !== "string") {
        return badRequest(`${key} must be a string.`);
      }
      const text = value.trim();

      if (key === "status") {
        if (!isTicketStatus(text)) {
          return badRequest(
            `Invalid status "${text}". Allowed values: ${TICKET_STATUSES.join(", ")}.`,
          );
        }
        update.status = text;
        if (text === "resolved") {
          update.resolved_at = new Date().toISOString();
          update.closed_at = null;
        } else if (text === "closed") {
          update.closed_at = new Date().toISOString();
          update.resolved_at = null;
        } else {
          update.resolved_at = null;
          update.closed_at = null;
        }
        continue;
      }

      if (key === "priority") {
        if (!isTicketPriority(text)) {
          return badRequest(
            `Invalid priority "${text}". Allowed values: ${TICKET_PRIORITIES.join(", ")}.`,
          );
        }
        update.priority = text;
        continue;
      }

      if (key === "subject") {
        if (!text) return badRequest("subject cannot be empty.");
        if (text.length > SUBJECT_MAX_LENGTH) {
          return badRequest(
            `subject is too long (${text.length} characters, maximum ${SUBJECT_MAX_LENGTH}).`,
          );
        }
        update.subject = text;
        continue;
      }

      if (!text) return badRequest("category cannot be empty.");
      if (text.length > CATEGORY_MAX_LENGTH) {
        return badRequest(
          `category is too long (${text.length} characters, maximum ${CATEGORY_MAX_LENGTH}).`,
        );
      }
      update.category = text;
    }

    if (Object.keys(update).length === 0) {
      return badRequest(
        "No fields to update. Provide at least one of: status, priority, assigned_agent_id, category, subject.",
      );
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from("tickets")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      return failure(describeError(error, "The ticket could not be updated."));
    }
    if (!data) return notFound();

    const response: AdminTicketMutationResponse = {
      ticket: data as unknown as AdminTicketRow,
    };
    return NextResponse.json(response);
  } catch (err) {
    return toErrorResponse(err);
  }
}
