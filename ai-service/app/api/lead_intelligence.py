"""
CRM 3.0 — AI Lead Intelligence
Explainable scoring. No fake scores.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from app.llm.provider import call_llm
from app.core.config import get_ai_settings
import json

router = APIRouter()
settings = get_ai_settings()


class LeadAnalysisRequest(BaseModel):
    contact_id: str
    account_id: str
    contact_name: Optional[str] = None
    lead_status: Optional[str] = None
    lead_score: Optional[int] = None
    messages: Optional[List[dict]] = []
    source: Optional[str] = None
    last_reply_hours_ago: Optional[float] = None


@router.post("/lead-intelligence/analyze")
async def analyze_lead(body: LeadAnalysisRequest):
    """
    AI-enhanced lead analysis.
    Rule-based scoring + optional LLM summary.
    """
    score = body.lead_score or 0
    factors = []

    # Message engagement
    customer_msgs = [m for m in (body.messages or []) if m.get("sender_type") == "customer"]
    if len(customer_msgs) >= 5:
        factors.append({"factor": "High message count", "weight": 15, "reason": f"{len(customer_msgs)} customer messages"})
        score = min(100, score + 15)
    elif len(customer_msgs) >= 2:
        factors.append({"factor": "Moderate engagement", "weight": 8, "reason": f"{len(customer_msgs)} messages"})
        score = min(100, score + 8)

    # Recency
    if body.last_reply_hours_ago is not None:
        if body.last_reply_hours_ago < 2:
            factors.append({"factor": "Very recent activity", "weight": 20, "reason": "Replied within 2 hours"})
            score = min(100, score + 20)
        elif body.last_reply_hours_ago < 24:
            factors.append({"factor": "Recent activity", "weight": 12, "reason": "Replied within 24 hours"})
            score = min(100, score + 12)
        elif body.last_reply_hours_ago > 168:
            factors.append({"factor": "Inactive", "weight": -10, "reason": "No reply in 7+ days"})
            score = max(0, score - 10)

    # Lead status
    status_scores = {"new": 5, "contacted": 10, "qualified": 25, "proposal": 30, "negotiation": 35}
    if body.lead_status in status_scores:
        w = status_scores[body.lead_status]
        factors.append({"factor": f"Lead status: {body.lead_status}", "weight": w, "reason": "CRM lead stage"})
        score = min(100, score + w)

    # Source
    if body.source in ["Meta", "Instagram", "Facebook"]:
        factors.append({"factor": "Paid lead source", "weight": 8, "reason": f"Came from {body.source}"})
        score = min(100, score + 8)

    score = max(0, min(100, score))
    tier = "hot" if score >= 70 else "warm" if score >= 40 else "cold"
    intent = "very_high" if score >= 80 else "high" if score >= 60 else "medium" if score >= 35 else "low"
    sentiment = "positive" if len([m for m in customer_msgs if any(w in (m.get("content_text") or "").lower() for w in ["yes", "interested", "price", "want", "buy"])]) >= 1 else "neutral"

    # NBA
    if score >= 80:
        nba = "Contact immediately — high buying intent detected"
        urgency = "immediate"
    elif score >= 50:
        nba = "Send a personalized follow-up message today"
        urgency = "today"
    elif score >= 30:
        nba = "Nurture with relevant content this week"
        urgency = "this_week"
    else:
        nba = "Monitor and wait for next interaction"
        urgency = "low"

    # AI summary (optional)
    ai_summary = f"{body.contact_name or 'This contact'} has a lead score of {score}/100 with {intent} intent."
    if settings.openai_api_key and factors:
        try:
            summary = await call_llm(
                system_prompt="You are a CRM lead analyst. Write a 1-2 sentence summary of this lead based on the data. Be factual, not speculative.",
                user_message=f"Lead: {body.contact_name}, Score: {score}/100, Intent: {intent}, Factors: {json.dumps(factors)}",
                temperature=0.2,
                max_tokens=100,
            )
            ai_summary = summary
        except Exception:
            pass

    return {
        "contact_id": body.contact_id,
        "score": score,
        "tier": tier,
        "intent": intent,
        "sentiment": sentiment,
        "score_factors": factors,
        "next_best_action": {"action": nba, "urgency": urgency},
        "ai_summary": ai_summary,
        "confidence": "high" if score >= 60 else "medium" if score >= 30 else "low",
        "analyzed_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
