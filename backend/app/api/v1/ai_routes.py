from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from app.core.config import get_settings
from datetime import datetime
import httpx
import json

router = APIRouter()
settings = get_settings()


# ── Lead Intelligence ─────────────────────────────────────────

class LeadIntelligenceRequest(BaseModel):
    contact_id: str


@router.post("/ai/lead-intelligence")
async def lead_intelligence(
    body: LeadIntelligenceRequest,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]

    contact_res = db.table("contacts").select("*").eq("id", body.contact_id).eq("account_id", account_id).single().execute()
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    contact = contact_res.data

    conv_res = db.table("conversations").select("id").eq("contact_id", body.contact_id).eq("account_id", account_id).limit(5).execute()
    conv_ids = [c["id"] for c in (conv_res.data or [])]
    messages = []
    if conv_ids:
        msg_res = db.table("messages").select("content_text, sender_type, created_at").in_("conversation_id", conv_ids).order("created_at", desc=True).limit(20).execute()
        messages = msg_res.data or []

    followups_res = db.table("follow_ups").select("status, due_date").eq("contact_id", body.contact_id).limit(5).execute()
    deals_res = db.table("deals").select("status, value, stage_id").eq("contact_id", body.contact_id).limit(5).execute()

    # Rule-based scoring
    score = 0
    factors = []
    now = datetime.utcnow()

    customer_msgs = [m for m in messages if m.get("sender_type") == "customer"]
    if len(customer_msgs) >= 5:
        score += 15
        factors.append({"factor": "High message count", "weight": 15, "reason": f"{len(customer_msgs)} customer messages"})
    elif len(customer_msgs) >= 2:
        score += 8
        factors.append({"factor": "Moderate engagement", "weight": 8, "reason": f"{len(customer_msgs)} customer messages"})

    if contact.get("last_customer_reply_at"):
        last_reply = datetime.fromisoformat(contact["last_customer_reply_at"].replace("Z", "+00:00"))
        hours_since = (now - last_reply.replace(tzinfo=None)).total_seconds() / 3600
        if hours_since < 2:
            score += 20
            factors.append({"factor": "Very recent activity", "weight": 20, "reason": "Replied within 2 hours"})
        elif hours_since < 24:
            score += 12
            factors.append({"factor": "Recent activity", "weight": 12, "reason": "Replied within 24 hours"})
        elif hours_since > 168:
            score -= 10
            factors.append({"factor": "Inactive", "weight": -10, "reason": "No reply in 7+ days"})

    status_scores = {"new": 5, "contacted": 10, "qualified": 25, "proposal": 30, "negotiation": 35}
    lead_status = contact.get("lead_status", "new")
    if lead_status in status_scores:
        w = status_scores[lead_status]
        score += w
        factors.append({"factor": f"Lead status: {lead_status}", "weight": w, "reason": "CRM lead stage"})

    if contact.get("source") == "Meta" or contact.get("source_platform"):
        score += 8
        factors.append({"factor": "Paid lead source", "weight": 8, "reason": "Came from Meta Lead Ad"})

    open_deals = [d for d in (deals_res.data or []) if d.get("status") == "open"]
    if open_deals:
        score += 15
        factors.append({"factor": "Active deal", "weight": 15, "reason": f"{len(open_deals)} open deal(s)"})

    if contact.get("messaging_opt_out"):
        score -= 30
        factors.append({"factor": "Opted out", "weight": -30, "reason": "Contact opted out of messaging"})

    score = max(0, min(100, score))
    tier = "hot" if score >= 70 else "warm" if score >= 40 else "cold"
    intent = "very_high" if score >= 80 else "high" if score >= 60 else "medium" if score >= 35 else "low"

    overdue = next((f for f in (followups_res.data or []) if f.get("status") == "pending" and
                    datetime.fromisoformat(f["due_date"].replace("Z", "+00:00")).replace(tzinfo=None) < now), None)

    if score >= 80:
        nba = "Contact immediately — high buying intent detected"
        urgency = "immediate"
    elif overdue:
        nba = "Complete overdue follow-up"
        urgency = "today"
    elif score >= 50:
        nba = "Send a personalized follow-up message"
        urgency = "today"
    elif score >= 30:
        nba = "Nurture with relevant content"
        urgency = "this_week"
    else:
        nba = "Monitor and wait for next interaction"
        urgency = "low"

    # Persist score
    db.table("contacts").update({
        "lead_score": score,
        "lead_score_tier": tier,
        "lead_score_reason": factors[0]["reason"] if factors else None,
        "lead_score_updated_at": now.isoformat(),
    }).eq("id", body.contact_id).eq("account_id", account_id).execute()

    return {
        "contact_id": body.contact_id,
        "score": score,
        "tier": tier,
        "intent": intent,
        "sentiment": "neutral",
        "engagement": "high" if len(customer_msgs) >= 5 else "medium" if len(customer_msgs) >= 2 else "low",
        "score_factors": factors,
        "ai_summary": f"{contact.get('name','This contact')} has a lead score of {score}/100 with {intent} intent.",
        "next_best_action": {"action": nba, "urgency": urgency},
        "qualification_status": "qualified" if score >= 70 else "qualifying" if score >= 40 else "unqualified",
        "confidence": "high" if score >= 60 else "medium" if score >= 30 else "low",
        "last_analyzed_at": now.isoformat(),
    }


# ── Reply Assist ──────────────────────────────────────────────

TONE_MAP = {
    "professional": "Write a professional, formal business reply.",
    "friendly": "Write a warm, friendly and conversational reply.",
    "short": "Write a very concise reply in 1-2 sentences maximum.",
    "detailed": "Write a comprehensive, detailed reply with next steps.",
    "qualify": "Write a reply that qualifies this lead by asking about needs, budget, and timeline.",
    "followup": "Write a follow-up message to re-engage this customer.",
    "summarize": "Summarize this conversation in 3-4 bullet points.",
}

FALLBACKS = {
    "professional": "Thank you for reaching out. We would be happy to assist you with your inquiry.",
    "friendly": "Hey! Thanks for messaging us 😊 We'd love to help — what can we do for you today?",
    "short": "Thanks for your message! We'll get back to you shortly.",
    "detailed": "Thank you for your detailed message. Our team is reviewing it and will respond within 24 hours.",
    "qualify": "Thank you for your interest! Could you share: (1) What challenge are you solving? (2) Your budget? (3) Your timeline?",
    "followup": "Hi! Following up on our previous conversation — any questions I can help with?",
    "summarize": "• Customer reached out with an inquiry\n• Needs: To be determined\n• Status: Awaiting response\n• Next step: Follow up within 24 hours",
}


class ReplyAssistRequest(BaseModel):
    conversation_id: str
    action: str


@router.post("/ai/reply-assist")
async def reply_assist(
    body: ReplyAssistRequest,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if body.action not in TONE_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown action. Valid: {list(TONE_MAP.keys())}")

    msgs_res = db.table("messages").select("content_text, sender_type, created_at").eq("conversation_id", body.conversation_id).order("created_at", desc=False).limit(15).execute()
    msgs = msgs_res.data or []
    last_customer = next((m["content_text"] for m in reversed(msgs) if m.get("sender_type") == "customer"), "")

    if not settings.openai_api_key:
        return {"reply": FALLBACKS.get(body.action, "Thank you for your message."), "action": body.action}

    transcript = "\n".join([f"{'Customer' if m.get('sender_type')=='customer' else 'Agent'}: {m.get('content_text','')}" for m in msgs[-10:]])
    instruction = TONE_MAP[body.action]

    system = f"You are a CRM sales assistant. {instruction} Reply with ONLY the message text — no labels, no quotes."
    user_prompt = f"Conversation:\n{transcript}\n\nCustomer's last message: \"{last_customer}\"\n\nWrite the reply:"

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={"model": "gpt-4o-mini", "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_prompt}], "temperature": 0.7, "max_tokens": 300},
            timeout=30,
        )
    if res.status_code != 200:
        return {"reply": FALLBACKS.get(body.action, "Thank you for your message."), "action": body.action}

    reply = res.json()["choices"][0]["message"]["content"].strip()
    return {"reply": reply, "action": body.action, "generated_at": datetime.utcnow().isoformat()}


# ── Summarize Conversation ────────────────────────────────────

class SummarizeRequest(BaseModel):
    conversation_id: str


@router.post("/ai/summarize-conversation")
async def summarize_conversation(
    body: SummarizeRequest,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    msgs_res = db.table("messages").select("content_text, sender_type, created_at").eq("conversation_id", body.conversation_id).order("created_at").limit(30).execute()
    msgs = msgs_res.data or []

    if not msgs:
        return {"summary": "No messages found in this conversation.", "intent": "unknown", "sentiment": "neutral"}

    transcript = "\n".join([f"{'Customer' if m.get('sender_type')=='customer' else 'Agent'}: {m.get('content_text','')}" for m in msgs])
    customer_texts = " ".join([m.get("content_text","") for m in msgs if m.get("sender_type") == "customer"]).lower()

    positive = ["interested", "yes", "please", "want", "need", "price", "buy", "purchase"]
    negative = ["no", "not interested", "stop", "cancel", "unsubscribe"]
    pos_hits = sum(1 for w in positive if w in customer_texts)
    neg_hits = sum(1 for w in negative if w in customer_texts)
    sentiment = "negative" if neg_hits > 0 else "positive" if pos_hits >= 2 else "neutral"

    if not settings.openai_api_key:
        return {
            "summary": f"Conversation with {len(msgs)} messages. Customer sentiment: {sentiment}.",
            "intent": "medium",
            "sentiment": sentiment,
            "key_points": ["Customer reached out", "Awaiting follow-up"],
        }

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "Summarize this CRM conversation in JSON: {\"summary\": \"\", \"intent\": \"\", \"key_points\": [], \"recommended_action\": \"\"}"},
                    {"role": "user", "content": transcript},
                ],
                "temperature": 0.2,
                "max_tokens": 300,
                "response_format": {"type": "json_object"},
            },
            timeout=30,
        )
    if res.status_code != 200:
        return {"summary": "Summary unavailable.", "intent": "unknown", "sentiment": sentiment}

    result = json.loads(res.json()["choices"][0]["message"]["content"])
    result["sentiment"] = sentiment
    return result


# ── Next Best Action ──────────────────────────────────────────

class NBARequest(BaseModel):
    contact_id: str


@router.post("/ai/next-best-action")
async def next_best_action(
    body: NBARequest,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]
    contact_res = db.table("contacts").select("*").eq("id", body.contact_id).eq("account_id", account_id).single().execute()
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    contact = contact_res.data
    score = contact.get("lead_score") or 0

    if score >= 80:
        action, urgency = "Contact immediately — high buying intent", "immediate"
    elif score >= 50:
        action, urgency = "Send a personalized follow-up message", "today"
    elif score >= 30:
        action, urgency = "Nurture with relevant content", "this_week"
    else:
        action, urgency = "Monitor and wait for next interaction", "low"

    return {
        "contact_id": body.contact_id,
        "action": action,
        "urgency": urgency,
        "reason": f"Lead score: {score}/100",
        "confidence": "high" if score >= 60 else "medium" if score >= 30 else "low",
    }


# ── AI Recommendations ────────────────────────────────────────

@router.get("/ai/recommendations")
async def get_recommendations(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]
    now = datetime.utcnow()

    hot = db.table("contacts").select("id", count="exact").eq("account_id", account_id).gte("lead_score", 70).execute()
    overdue = db.table("follow_ups").select("id", count="exact").eq("account_id", account_id).eq("status", "pending").lt("due_date", now.isoformat()).execute()
    seven_days_ago = now.replace(microsecond=0).isoformat()
    at_risk = db.table("deals").select("id", count="exact").eq("account_id", account_id).eq("status", "open").execute()

    recs = []
    if (hot.count or 0) > 0:
        recs.append({"id": "hot-leads", "what": f"{hot.count} hot leads need attention", "why": "High lead scores indicate buying intent", "action_label": "View Hot Leads", "action_href": "/leads", "urgency": "immediate", "category": "lead"})
    if (overdue.count or 0) > 0:
        recs.append({"id": "overdue-followups", "what": f"{overdue.count} follow-ups are overdue", "why": "Delayed follow-ups reduce conversion rates", "action_label": "View Follow-ups", "action_href": "/follow-ups", "urgency": "today", "category": "lead"})

    return {"recommendations": recs, "generated_at": now.isoformat()}
