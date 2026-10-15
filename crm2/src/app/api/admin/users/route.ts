// GET /api/admin/users — List all platform users (super admin only)

import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";

export async function GET(request: Request) {
  try {
    const ctx = await requireSuperAdmin();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const search = searchParams.get("search")?.trim() ?? "";

    let query = ctx.supabase
      .from("profiles")
      .select("id, user_id, full_name, email, avatar_url, account_id, account_role, platform_role, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: users, error } = await query;

    if (error) {
      console.error("[GET /api/admin/users] fetch error:", error);
      return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
    }

    // Total count for pagination
    let countQuery = ctx.supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (search) {
      countQuery = countQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { count } = await countQuery;

    return NextResponse.json({
      users: users ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
