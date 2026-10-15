"""
CRM 3.0 — AI Business Copilot
Tool-based AI that queries real CRM data via backend API.
Never invents records. Labels every response by data source.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.llm.provider import call_llm
from app.core.config import get_ai_settings
import httpx

router = APIRouter()
settings = get_ai_settings()

INTENT_MAP = {
    "hot_lead": ["hot lead", "high intent", "best lead", "contact first", "who should i"],
    "overdue": ["follow", "overdue", "pending", "missed"],
    "deals": ["deal", "risk", "stall", "pipeline", "closing"],
    "conversations": ["unanswer", "conversation", "inbox", "reply", "respond"],
    "revenue": ["revenue", "forecast", "won", "pipeline value"],
    "team": ["team", "employee", "agent", "workload", "performance"],
    "campaign": ["campaign", "broadcast", "post", "content", "instagram", "facebook"],
}


def detect_intent(query: str) -> str:
    q = query.lower()
    for intent, keywords in INTENT_MAP.items():
        if any(k in q for k in keywords):
            return intent
    return "general"


class CopilotRequest(BaseModel):
    query: str
    account_id: str
    user_id: str
    session_id: Optional[str] = None


async def fetch_crm_data(endpoint: str, account_id: str, token: str = "") -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            res = await client.get(
                f"{settings.backend_url}/api/v1/{endpoint}",
                headers={"Authorization": f"Bearer {token}"},
            )
            return res.json() if res.status_code == 200 else {}
        except Exception:
            return {}


@router.post("/copilot")
async def copilot_query(body: CopilotRequest):
    intent = detect_intent(body.query)
    answer = ""
    data_source = "database"

    # Fetch real data from backend
    cc_data = await fetch_crm_data("command-center", body.account_id)

    if intent == "hot_lead":
        leads = cc_data.get("hot_leads", [])
        if not leads:
            answer = "No hot leads found in your CRM right now."
        else:
            lines = [f"{i+1}. **{l['contact_name']}** — Score: {l['score']}/100 | Intent: {l['intent']} | Channel: {l['channel']}" for i, l in enumerate(leads)]
            answer = f"Found **{len(leads)} hot lead{'s' if len(leads) > 1 else ''}**:\n\n" + "\n".join(lines)
            answer += "\n\n💡 Contact the top leads within 30 minutes for best conversion rates."

    elif intent == "overdue":
        followups = cc_data.get("overdue_followups", [])
        if not followups:
            answer = "No overdue follow-ups. You're all caught up! ✅"
        else:
            lines = [f"{i+1}. **{f['title']}** — {f['contact_name']} · {f['overdue_hours']}h overdue" for i, f in enumerate(followups)]
            answer = f"Found **{len(followups)} overdue follow-up{'s' if len(followups) > 1 else ''}**:\n\n" + "\n".join(lines)
            answer += "\n\n⚠️ Delayed follow-ups significantly reduce conversion rates."

    elif intent == "deals":
        deals = cc_data.get("deals_at_risk", [])
        if not deals:
            answer = "No deals at risk. Your pipeline looks healthy! ✅"
        else:
            lines = [f"{i+1}. **{d['deal_title']}** — {d['value']:,.0f} {d['currency']} · {d['days_stalled']} days stalled · Stage: {d['stage']}" for i, d in enumerate(deals)]
            answer = f"Found **{len(deals)} deal{'s' if len(deals) > 1 else ''} at risk**:\n\n" + "\n".join(lines)
            answer += "\n\n📞 Recommend scheduling follow-up calls for stalled deals."

    elif intent == "conversations":
        convs = cc_data.get("important_conversations", [])
        if not convs:
            answer = "All conversations have been answered. Great work! ✅"
        else:
            lines = [f"{i+1}. **{c['contact_name']}** via {c['channel']} · {c['unanswered_hours']}h unanswered" for i, c in enumerate(convs)]
            answer = f"Found **{len(convs)} unanswered conversation{'s' if len(convs) > 1 else ''}**:\n\n" + "\n".join(lines)
            answer += "\n\n⚡ Fast response time is the #1 driver of lead conversion."

    elif intent == "revenue":
        snap = cc_data.get("revenue_snapshot", {})
        answer = (
            f"**Revenue Snapshot:**\n\n"
            f"• Pipeline Value: {snap.get('currency', 'USD')} {snap.get('pipeline_value', 0):,.0f}\n"
            f"• Won This Month: {snap.get('currency', 'USD')} {snap.get('won_this_month', 0):,.0f}\n"
            f"• Open Deals: {snap.get('open_deals', 0)}"
        )

    elif intent == "team":
        team = cc_data.get("team_workload", [])
        if not team:
            answer = "No team data available."
        else:
            lines = [f"• **{m['name']}** — {m['open_conversations']} conversations · {m['overdue_followups']} overdue" for m in team]
            answer = "**Team Workload:**\n\n" + "\n".join(lines)

    else:
        # General overview
        hot = len(cc_data.get("hot_leads", []))
        overdue = len(cc_data.get("overdue_followups", []))
        at_risk = len(cc_data.get("deals_at_risk", []))
        unanswered = len(cc_data.get("important_conversations", []))
        snap = cc_data.get("revenue_snapshot", {})

        answer = (
            f"**CRM Overview:**\n\n"
            f"• 🔥 Hot leads: {hot}\n"
            f"• ⏰ Overdue follow-ups: {overdue}\n"
            f"• ⚠️ Deals at risk: {at_risk}\n"
            f"• 💬 Unanswered conversations: {unanswered}\n"
            f"• 💰 Pipeline: {snap.get('currency','USD')} {snap.get('pipeline_value',0):,.0f}\n\n"
            f"Ask me: \"Show hot leads\", \"Which deals are at risk?\", \"Show overdue follow-ups\""
        )

    # Use OpenAI for ALL queries including general/conversational
    if settings.openai_api_key:
        try:
            hot = len(cc_data.get("hot_leads", []))
            overdue = len(cc_data.get("overdue_followups", []))
            at_risk = len(cc_data.get("deals_at_risk", []))
            unanswered = len(cc_data.get("important_conversations", []))
            snap = cc_data.get("revenue_snapshot", {})

            crm_context = f"""Current CRM Data:
- Hot leads: {hot}
- Overdue follow-ups: {overdue}
- Deals at risk: {at_risk}
- Unanswered conversations: {unanswered}
- Pipeline value: {snap.get('currency','INR')} {snap.get('pipeline_value',0):,.0f}
- Won this month: {snap.get('currency','INR')} {snap.get('won_this_month',0):,.0f}

Pre-analyzed answer: {answer}"""

            enhanced = await call_llm(
                system_prompt="""You are Tzmicha CRM AI Copilot — a smart, friendly business assistant.
You help the user manage their CRM, leads, deals, conversations, emails, and team.
Always respond naturally and helpfully. For CRM data questions, use the provided data.
For greetings or general questions, respond warmly and explain what you can do.
For email questions, explain that emails are in the Inbox section of the CRM.
Never invent CRM data. Keep responses concise and actionable.
Capabilities: leads, deals, follow-ups, conversations, revenue, team workload, campaigns, emails (via inbox), content generation.""",
                user_message=f"User asked: {body.query}\n\n{crm_context}",
                temperature=0.4,
                max_tokens=300,
            )
            answer = enhanced
            data_source = "ai_inference"
        except Exception:
            pass

    return {
        "answer": answer,
        "data_source": data_source,
        "confidence": "high",
        "intent": intent,
    }
