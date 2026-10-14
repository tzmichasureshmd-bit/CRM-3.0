from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from datetime import datetime

router = APIRouter()


class CopilotRequest(BaseModel):
    query: str


def _detect_intent(query: str) -> str:
    q = query.lower()
    if any(w in q for w in ["hot lead", "high intent", "best lead"]):
        return "hot_leads"
    if any(w in q for w in ["follow", "overdue", "pending"]):
        return "overdue_followups"
    if any(w in q for w in ["deal", "risk", "stall", "pipeline"]):
        return "deals"
    if any(w in q for w in ["unanswer", "conversation", "inbox", "reply"]):
        return "conversations"
    if any(w in q for w in ["revenue", "forecast", "won"]):
        return "pipeline"
    return "general"


@router.post("/copilot")
async def copilot(
    body: CopilotRequest,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query required")

    account_id = user["account_id"]
    intent = _detect_intent(body.query)
    now = datetime.utcnow()

    if intent == "hot_leads":
        res = db.table("contacts").select("id, name, lead_score, lead_score_tier, lead_status").eq("account_id", account_id).gte("lead_score", 60).order("lead_score", desc=True).limit(10).execute()
        leads = res.data or []
        if not leads:
            answer = "No hot leads found in your CRM right now."
        else:
            lines = [f"{i+1}. **{l.get('name','Unknown')}** — Score: {l.get('lead_score',0)}/100 ({l.get('lead_score_tier','cold')}) · Status: {l.get('lead_status','new')}" for i, l in enumerate(leads)]
            answer = f"Found **{len(leads)} hot lead{'s' if len(leads)>1 else ''}**:\n\n" + "\n".join(lines) + "\n\n💡 Contact top leads within 30 minutes for best conversion."

    elif intent == "overdue_followups":
        res = db.table("follow_ups").select("id, title, due_date, contacts(name)").eq("account_id", account_id).eq("status", "pending").lt("due_date", now.isoformat()).order("due_date").limit(10).execute()
        followups = res.data or []
        if not followups:
            answer = "No overdue follow-ups. You're all caught up!"
        else:
            lines = []
            for i, f in enumerate(followups):
                contact = f.get("contacts") or {}
                due = datetime.fromisoformat(f["due_date"].replace("Z", "+00:00"))
                hours = int((now - due.replace(tzinfo=None)).total_seconds() / 3600)
                lines.append(f"{i+1}. **{f['title']}** — {contact.get('name','Unknown')} · {hours}h overdue")
            answer = f"Found **{len(followups)} overdue follow-up{'s' if len(followups)>1 else ''}**:\n\n" + "\n".join(lines)

    elif intent == "deals":
        seven_days_ago = datetime.utcnow().replace(microsecond=0).isoformat()
        res = db.table("deals").select("id, title, value, currency, updated_at, pipeline_stages(name)").eq("account_id", account_id).eq("status", "open").order("value", desc=True).limit(10).execute()
        deals = res.data or []
        at_risk = [d for d in deals if d.get("updated_at") and
                   (now - datetime.fromisoformat(d["updated_at"].replace("Z", "+00:00")).replace(tzinfo=None)).days >= 7]
        if not at_risk:
            answer = "No deals at risk. Your pipeline looks healthy!"
        else:
            lines = []
            for i, d in enumerate(at_risk):
                stage = (d.get("pipeline_stages") or {}).get("name", "Unknown")
                days = (now - datetime.fromisoformat(d["updated_at"].replace("Z", "+00:00")).replace(tzinfo=None)).days
                lines.append(f"{i+1}. **{d['title']}** — {d.get('value',0):,.0f} {d.get('currency','USD')} · {stage} · {days}d stalled")
            answer = f"Found **{len(at_risk)} deal{'s' if len(at_risk)>1 else ''} at risk**:\n\n" + "\n".join(lines)

    elif intent == "conversations":
        two_hours_ago = datetime.utcnow().replace(microsecond=0).isoformat()
        res = db.table("conversations").select("id, platform, last_message_at, contacts(name)").eq("account_id", account_id).eq("status", "open").order("last_message_at").limit(10).execute()
        convs = [c for c in (res.data or []) if c.get("last_message_at") and
                 (now - datetime.fromisoformat(c["last_message_at"].replace("Z", "+00:00")).replace(tzinfo=None)).total_seconds() >= 7200]
        if not convs:
            answer = "All conversations answered. Great work!"
        else:
            lines = []
            for i, c in enumerate(convs):
                contact = (c.get("contacts") or {})
                hours = int((now - datetime.fromisoformat(c["last_message_at"].replace("Z", "+00:00")).replace(tzinfo=None)).total_seconds() / 3600)
                lines.append(f"{i+1}. **{contact.get('name','Unknown')}** via {c.get('platform','')} · {hours}h ago")
            answer = f"Found **{len(convs)} unanswered conversation{'s' if len(convs)>1 else ''}**:\n\n" + "\n".join(lines)

    elif intent == "pipeline":
        res = db.table("deals").select("status, value, currency").eq("account_id", account_id).execute()
        deals = res.data or []
        open_d = [d for d in deals if d.get("status") == "open"]
        won_d = [d for d in deals if d.get("status") == "won"]
        lost_d = [d for d in deals if d.get("status") == "lost"]
        pipeline_val = sum(d.get("value") or 0 for d in open_d)
        won_val = sum(d.get("value") or 0 for d in won_d)
        total_closed = len(won_d) + len(lost_d)
        win_rate = round(len(won_d) / total_closed * 100) if total_closed > 0 else 0
        answer = f"**Pipeline Summary:**\n\n• Open deals: {len(open_d)} (Value: {pipeline_val:,.0f})\n• Won deals: {len(won_d)} (Revenue: {won_val:,.0f})\n• Lost deals: {len(lost_d)}\n• Win rate: {win_rate}%"

    else:
        hot = db.table("contacts").select("id", count="exact").eq("account_id", account_id).gte("lead_score", 60).execute()
        overdue = db.table("follow_ups").select("id", count="exact").eq("account_id", account_id).eq("status", "pending").lt("due_date", now.isoformat()).execute()
        open_convs = db.table("conversations").select("id", count="exact").eq("account_id", account_id).eq("status", "open").execute()
        answer = f"Here's a quick overview:\n\n• 🔥 Hot leads: {hot.count or 0}\n• ⏰ Overdue follow-ups: {overdue.count or 0}\n• 💬 Open conversations: {open_convs.count or 0}\n\nAsk me: \"Show hot leads\", \"Which deals are at risk?\", \"Show overdue follow-ups\""

    return {"answer": answer, "data_source": "database", "confidence": "high"}
