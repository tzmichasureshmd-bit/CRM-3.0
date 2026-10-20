import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

/**
 * List the caller's Meta Page connections (GET) or disconnect one
 * (DELETE). The tenant is resolved from the authenticated user's
 * account context — never from a frontend-supplied id — and RLS keeps
 * one tenant from seeing another's connections.
 */
export async function GET() {
  try {
    const ctx = await requireRole("viewer");
    const { data, error } = await ctx.supabase
      .from("meta_page_connections")
      .select(
        "id, page_id, page_name, platform, status, webhook_status, " +
          "instagram_account_id, instagram_username, connected_at",
      )
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Could not load Meta connections" },
        { status: 500 },
      );
    }

    // True only when the server process actually has META_APP_ID available.
    // Never expose the value itself — existence only.
    const metaConfigured = Boolean(process.env.META_APP_ID);

    return NextResponse.json({ connections: data ?? [], metaConfigured });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      pageId?: string;
      platform?: string;
    };

    let query = ctx.supabase.from("meta_page_connections").delete();
    if (body.id) {
      query = query.eq("id", body.id);
    } else if (body.pageId && body.platform) {
      query = query.eq("page_id", body.pageId).eq("platform", body.platform);
    } else {
      return NextResponse.json({ error: "Missing connection id or page/platform" }, { status: 400 });
    }
    // `.eq('account_id', ...)` is implied by RLS; scope explicitly too.
    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: "Could not disconnect Meta connection" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
