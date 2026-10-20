import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export const dynamic = "force-dynamic";

/**
 * Lead-count statistics for the Contacts page header. Computed by a
 * single server-side RPC (`count_meta_leads`) — never by loading every
 * contact into the browser. The account id comes from the trusted
 * authenticated session, never from the client.
 */
export async function GET() {
  try {
    const ctx = await requireRole("viewer");
    const { data, error } = await ctx.supabase.rpc("count_meta_leads", {
      p_account_id: ctx.accountId,
    });

    if (error) {
      console.error("[contacts/stats] rpc error:", error);
      return NextResponse.json(
        { error: "Could not load lead statistics" },
        { status: 500 },
      );
    }

    const row = data as
      | Array<{
          total_contacts: number;
          total_leads: number;
          new_leads: number;
          facebook_leads: number;
          instagram_leads: number;
          today_leads: number;
          week_leads: number;
          month_leads: number;
        }>
      | null;

    const fallback = {
      total_contacts: 0,
      total_leads: 0,
      new_leads: 0,
      facebook_leads: 0,
      instagram_leads: 0,
      today_leads: 0,
      week_leads: 0,
      month_leads: 0,
    };

    return NextResponse.json({ stats: row?.[0] ?? fallback });
  } catch (err) {
    return toErrorResponse(err);
  }
}
