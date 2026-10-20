// ============================================================
// GET /api/account/activity
//
// Paginated activity feed for the caller's own account, backed by
// the shared `audit_log` table (the same rows the Super Admin's
// /audit page reads platform-wide). Admin+ only.
//
// Rows are scoped server-side twice over:
//   1. RLS policy `audit_log_select_account` (migration 050) makes
//      non-admin reads impossible at the database level.
//   2. This route additionally filters by the caller's accountId
//      and enforces the role gate via requireRole("admin").
//
// Response shape:
//   {
//     entries: Array<AuditLogEntry & { actor_name, actor_avatar }>,
//     page, pageSize, total, totalPages
//   }
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import type { AuditLogEntry } from "@/types";

const PAGE_SIZE = 25;
const MAX_PAGES = 200;

interface RawEntry {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const url = new URL(request.url);
    const page = Math.min(
      Math.max(1, Number(url.searchParams.get("page")) || 1),
      MAX_PAGES,
    );
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, count, error } = await ctx.supabase
      .from("audit_log")
      .select(
        "id, actor_user_id, action, resource_type, resource_id, details, created_at",
        { count: "exact" },
      )
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[GET /api/account/activity] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load activity" },
        { status: 500 },
      );
    }

    const rows = (data ?? []) as RawEntry[];

    // Resolve actor names/avatars in one extra round trip so the UI
    // can show "Priya Sharma invited a member" instead of a bare
    // uuid. Profiles RLS scopes this to our account automatically.
    const actorIds = [
      ...new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => !!v)),
    ];
    const actorMap = new Map<string, { name: string; avatar: string | null }>();
    if (actorIds.length > 0) {
      const { data: actors } = await ctx.supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", actorIds);
      for (const a of actors ?? []) {
        actorMap.set(a.user_id, {
          name: a.full_name || "",
          avatar: a.avatar_url ?? null,
        });
      }
    }

    const entries = rows.map(
      (row): AuditLogEntry & { actor_name: string; actor_avatar: string | null } => ({
        id: row.id,
        actor_user_id: row.actor_user_id ?? undefined,
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id ?? undefined,
        details: row.details ?? undefined,
        created_at: row.created_at,
        actor_name: row.actor_user_id
          ? actorMap.get(row.actor_user_id)?.name || ""
          : "",
        actor_avatar: row.actor_user_id
          ? actorMap.get(row.actor_user_id)?.avatar ?? null
          : null,
      }),
    );

    const total = count ?? 0;

    return NextResponse.json({
      entries,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
