import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";
import { hasServiceRole, serviceRoleClient } from "@/lib/supabase/admin";
import { describeError } from "@/lib/errors";
import {
  isUuid,
  type AdminTicketCommentItem,
  type AdminTicketCommentResponse,
} from "../../types";

const COMMENT_MAX_LENGTH = 10000;

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

/**
 * POST /api/admin/tickets/[id]/comments — super-admin reply or internal note.
 *
 * Body: { body: string, is_internal?: boolean } (`content` is accepted as
 * an alias for `body`).
 * Response: { comment } with the author profile resolved.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireSuperAdmin();
    if (!hasServiceRole()) return serviceUnavailable();
    const admin = serviceRoleClient();

    const { id } = await params;
    if (!isUuid(id)) return badRequest(`Invalid ticket id "${id}". Expected a UUID.`);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return badRequest("A JSON request body is required.");
    }

    const rawText = typeof body.body === "string" ? body.body : body.content;
    if (typeof rawText !== "string" || !rawText.trim()) {
      return badRequest("A message body is required.");
    }
    const text = rawText.trim();
    if (text.length > COMMENT_MAX_LENGTH) {
      return badRequest(
        `The message is too long (${text.length} characters, maximum ${COMMENT_MAX_LENGTH}).`,
      );
    }

    if ("is_internal" in body && typeof body.is_internal !== "boolean") {
      return badRequest("is_internal must be a boolean.");
    }
    const isInternal = body.is_internal === true;

    const { data: ticket, error: ticketError } = await admin
      .from("tickets")
      .select("id, account_id, status")
      .eq("id", id)
      .maybeSingle();
    if (ticketError) {
      return failure(describeError(ticketError, "The ticket could not be loaded."));
    }
    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket not found. It may have been deleted." },
        { status: 404 },
      );
    }

    const { data, error } = await admin
      .from("ticket_comments")
      .insert({
        account_id: (ticket as { account_id: string }).account_id,
        ticket_id: id,
        user_id: ctx.userId,
        content: text,
        is_internal: isInternal,
      })
      .select("*")
      .single();
    if (error) {
      return failure(describeError(error, "The comment could not be saved."));
    }

    const comment = data as unknown as AdminTicketCommentItem;

    const { data: author } = await admin
      .from("profiles")
      .select("user_id, full_name, email, avatar_url")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    comment.author = (author as unknown as AdminTicketCommentItem["author"]) ?? null;

    return NextResponse.json({ comment } satisfies AdminTicketCommentResponse, {
      status: 201,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
