// ============================================================
// GET /api/admin/audit — View audit log (super admin only)
// ============================================================

import { NextResponse } from "next/server";
import { requireSuperAdmin, toErrorResponse } from "@/lib/auth/super-admin";

export async function GET(request: Request) {
  try {
    const ctx = await requireSuperAdmin();

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("account_id");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    let query = ctx.supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (accountId) {
      query = query.eq("account_id", accountId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[GET /api/admin/audit] fetch error:", error);
      return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
    }

    return NextResponse.json({ entries: data ?? [], count: (data ?? []).length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
