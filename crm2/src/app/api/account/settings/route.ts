import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { canEditSettings } from "@/lib/auth/roles";

type SettingsType = "company" | "email" | "notifications";

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") || "company") as SettingsType;

    switch (type) {
      case "company": {
        const { data } = await ctx.supabase
          .from("accounts")
          .select("id, name, address, phone, website, industry")
          .eq("id", ctx.accountId)
          .single();
        return NextResponse.json({ data: data ?? null });
      }
      case "email": {
        const { data } = await ctx.supabase
          .from("email_config")
          .select("*")
          .eq("account_id", ctx.accountId)
          .maybeSingle();
        return NextResponse.json({ data: data ?? null });
      }
      case "notifications": {
        const { data } = await ctx.supabase
          .from("notification_preferences")
          .select("*")
          .eq("account_id", ctx.accountId)
          .eq("user_id", ctx.userId)
          .maybeSingle();
        return NextResponse.json({ data: data ?? null });
      }
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getCurrentAccount();

    if (!canEditSettings(ctx.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") || "company") as SettingsType;

    const body = await request.json();

    switch (type) {
      case "company": {
        const { data } = await ctx.supabase
          .from("accounts")
          .update({
            name: body.name,
            address: body.address,
            phone: body.phone,
            website: body.website,
            industry: body.industry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ctx.accountId)
          .select("id, name, address, phone, website, industry")
          .single();
        return NextResponse.json({ data: data ?? null });
      }
      case "email": {
        const { data } = await ctx.supabase
          .from("email_config")
          .upsert({
            account_id: ctx.accountId,
            provider: body.provider ?? "smtp",
            smtp_host: body.smtp_host,
            smtp_port: body.smtp_port,
            smtp_username: body.smtp_username,
            smtp_password: body.smtp_password,
            smtp_secure: body.smtp_secure ?? true,
            from_email: body.from_email ?? "",
            from_name: body.from_name ?? "",
            enabled: body.enabled ?? false,
            updated_at: new Date().toISOString(),
          })
          .select("*")
          .single();
        return NextResponse.json({ data: data ?? null });
      }
      case "notifications": {
        const { data } = await ctx.supabase
          .from("notification_preferences")
          .upsert({
            account_id: ctx.accountId,
            user_id: ctx.userId,
            email_messages: body.email_messages ?? true,
            email_broadcasts: body.email_broadcasts ?? true,
            email_automations: body.email_automations ?? true,
            email_deals: body.email_deals ?? true,
            push_messages: body.push_messages ?? true,
            push_broadcasts: body.push_broadcasts ?? true,
            push_automations: body.push_automations ?? true,
            push_deals: body.push_deals ?? true,
            updated_at: new Date().toISOString(),
          })
          .select("*")
          .single();
        return NextResponse.json({ data: data ?? null });
      }
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
