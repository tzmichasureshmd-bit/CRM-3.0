from fastapi import APIRouter, Depends
from datetime import datetime, timedelta
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/command-center")
async def get_command_center(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]
    now = datetime.utcnow()
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    two_hours_ago = (now - timedelta(hours=2)).isoformat()
    now_iso = now.isoformat()

    # ── 1. Hot Leads ──────────────────────────────────────────
    hot_leads_res = (
        db.table("contacts")
        .select("id, name, lead_score, lead_score_tier, lead_score_reason, last_customer_reply_at, source, telegram_chat_id, instagram_user_id")
        .eq("account_id", account_id)
        .gte("lead_score", 70)
        .not_.in_("lead_status", ["won", "lost"])
        .order("lead_score", desc=True)
        .limit(10)
        .execute()
    )
    hot_leads = []
    for c in (hot_leads_res.data or []):
        score = c.get("lead_score") or 0
        hot_leads.append({
            "contact_id": c["id"],
            "contact_name": c.get("name") or "Unknown",
            "score": score,
            "intent": "very_high" if score >= 90 else "high" if score >= 75 else "medium",
            "reason": c.get("lead_score_reason") or "High engagement score",
            "last_activity": c.get("last_customer_reply_at") or "",
            "channel": "telegram" if c.get("telegram_chat_id") else "instagram" if c.get("instagram_user_id") else "whatsapp",
        })

    # ── 2. Overdue Follow-ups ─────────────────────────────────
    overdue_res = (
        db.table("follow_ups")
        .select("id, contact_id, title, due_date, user_id")
        .eq("account_id", account_id)
        .eq("status", "pending")
        .lt("due_date", now_iso)
        .order("due_date")
        .limit(10)
        .execute()
    )
    overdue_followups = []
    for f in (overdue_res.data or []):
        due = datetime.fromisoformat(f["due_date"].replace("Z", "+00:00"))
        hours_overdue = int((now.replace(tzinfo=None) - due.replace(tzinfo=None)).total_seconds() / 3600)
        contact_res = db.table("contacts").select("name").eq("id", f["contact_id"]).single().execute()
        overdue_followups.append({
            "followup_id": f["id"],
            "contact_id": f["contact_id"],
            "contact_name": contact_res.data.get("name", "Unknown") if contact_res.data else "Unknown",
            "title": f["title"],
            "due_date": f["due_date"],
            "overdue_hours": max(0, hours_overdue),
        })

    # ── 3. Deals at Risk ──────────────────────────────────────
    deals_res = (
        db.table("deals")
        .select("id, title, value, currency, updated_at, stage_id")
        .eq("account_id", account_id)
        .eq("status", "open")
        .lt("updated_at", seven_days_ago)
        .order("value", desc=True)
        .limit(8)
        .execute()
    )
    deals_at_risk = []
    for d in (deals_res.data or []):
        updated = datetime.fromisoformat(d["updated_at"].replace("Z", "+00:00"))
        days_stalled = int((now.replace(tzinfo=None) - updated.replace(tzinfo=None)).total_seconds() / 86400)
        stage_res = db.table("pipeline_stages").select("name").eq("id", d["stage_id"]).single().execute()
        deals_at_risk.append({
            "deal_id": d["id"],
            "deal_title": d["title"],
            "value": d.get("value") or 0,
            "currency": d.get("currency") or "USD",
            "days_stalled": days_stalled,
            "stage": stage_res.data.get("name", "Unknown") if stage_res.data else "Unknown",
            "risk_reason": f"No activity for {days_stalled} days",
        })

    # ── 4. Unanswered Conversations ───────────────────────────
    conv_res = (
        db.table("conversations")
        .select("id, platform, last_message_text, last_message_at, contact_id")
        .eq("account_id", account_id)
        .eq("status", "open")
        .lt("last_message_at", two_hours_ago)
        .order("last_message_at")
        .limit(8)
        .execute()
    )
    important_conversations = []
    for c in (conv_res.data or []):
        last_msg = datetime.fromisoformat(c["last_message_at"].replace("Z", "+00:00"))
        hours_ago = int((now.replace(tzinfo=None) - last_msg.replace(tzinfo=None)).total_seconds() / 3600)
        contact_res = db.table("contacts").select("name, lead_score").eq("id", c["contact_id"]).single().execute()
        score = contact_res.data.get("lead_score") or 0 if contact_res.data else 0
        important_conversations.append({
            "conversation_id": c["id"],
            "contact_name": contact_res.data.get("name", "Unknown") if contact_res.data else "Unknown",
            "channel": c["platform"],
            "last_message": c.get("last_message_text") or "",
            "unanswered_hours": hours_ago,
            "intent": "high" if score >= 70 else "medium" if score >= 40 else "low",
        })

    # ── 5. Team Workload ──────────────────────────────────────
    team_res = db.table("profiles").select("user_id, full_name, avatar_url").eq("account_id", account_id).limit(20).execute()
    team_workload = []
    for m in (team_res.data or []):
        open_convs = db.table("conversations").select("id", count="exact").eq("account_id", account_id).eq("assigned_agent_id", m["user_id"]).eq("status", "open").execute()
        overdue_count = db.table("follow_ups").select("id", count="exact").eq("account_id", account_id).eq("user_id", m["user_id"]).eq("status", "pending").lt("due_date", now_iso).execute()
        team_workload.append({
            "user_id": m["user_id"],
            "name": m.get("full_name") or "Unknown",
            "avatar_url": m.get("avatar_url"),
            "open_conversations": open_convs.count or 0,
            "assigned_leads": 0,
            "overdue_followups": overdue_count.count or 0,
        })

    # ── 6. Revenue Snapshot ───────────────────────────────────
    all_deals = db.table("deals").select("status, value, currency").eq("account_id", account_id).execute()
    open_deals = [d for d in (all_deals.data or []) if d.get("status") == "open"]
    won_deals = [d for d in (all_deals.data or []) if d.get("status") == "won"]
    pipeline_value = sum(d.get("value") or 0 for d in open_deals)
    won_value = sum(d.get("value") or 0 for d in won_deals)
    currency = open_deals[0].get("currency", "USD") if open_deals else "USD"

    # ── 7. AI Recommendations (rule-based, real data) ─────────
    recommendations = []
    if hot_leads:
        recommendations.append({
            "id": "hot-leads",
            "what": f"{len(hot_leads)} hot lead{'s' if len(hot_leads) > 1 else ''} need attention",
            "why": "High lead scores indicate strong buying intent",
            "action_label": "View Hot Leads",
            "action_href": "/leads",
            "urgency": "immediate",
            "category": "lead",
        })
    if overdue_followups:
        recommendations.append({
            "id": "overdue-followups",
            "what": f"{len(overdue_followups)} follow-up{'s' if len(overdue_followups) > 1 else ''} are overdue",
            "why": "Delayed follow-ups reduce conversion rates significantly",
            "action_label": "View Follow-ups",
            "action_href": "/automations/followups",
            "urgency": "today",
            "category": "lead",
        })
    if deals_at_risk:
        total_at_risk = sum(d["value"] for d in deals_at_risk)
        recommendations.append({
            "id": "deals-at-risk",
            "what": f"{len(deals_at_risk)} deals worth {total_at_risk:,.0f} are stalling",
            "why": "No activity for 7+ days increases deal loss probability",
            "action_label": "View Pipeline",
            "action_href": "/pipelines",
            "urgency": "today",
            "category": "deal",
        })
    if important_conversations:
        recommendations.append({
            "id": "unanswered-convs",
            "what": f"{len(important_conversations)} conversations unanswered for 2+ hours",
            "why": "Fast response time is the #1 driver of lead conversion",
            "action_label": "Open Inbox",
            "action_href": "/inbox",
            "urgency": "immediate",
            "category": "lead",
        })

    return {
        "hot_leads": hot_leads,
        "overdue_followups": overdue_followups,
        "deals_at_risk": deals_at_risk,
        "important_conversations": important_conversations,
        "ai_recommendations": recommendations,
        "team_workload": team_workload,
        "revenue_snapshot": {
            "pipeline_value": pipeline_value,
            "won_this_month": won_value,
            "open_deals": len(open_deals),
            "currency": currency,
        },
        "generated_at": now_iso,
    }
