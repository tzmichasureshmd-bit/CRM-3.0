"""
CRM 3.0 AI Service — Lead Service
Business logic layer for lead intelligence operations.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime


def calculate_lead_score(
    messages: List[Dict[str, Any]],
    lead_status: Optional[str],
    source: Optional[str],
    last_reply_hours_ago: Optional[float],
    existing_score: int = 0,
    opted_out: bool = False,
) -> tuple[int, list]:
    """
    Rule-based explainable lead scoring.
    Returns (score, factors[]).
    """
    score = existing_score
    factors = []

    if opted_out:
        return 0, [{"factor": "Opted out", "weight": -100, "reason": "Contact opted out of messaging"}]

    # Message engagement
    customer_msgs = [m for m in messages if m.get("sender_type") in ["contact", "customer"]]
    if len(customer_msgs) >= 10:
        score = min(100, score + 20)
        factors.append({"factor": "Very high engagement", "weight": 20, "reason": f"{len(customer_msgs)} customer messages"})
    elif len(customer_msgs) >= 5:
        score = min(100, score + 15)
        factors.append({"factor": "High message count", "weight": 15, "reason": f"{len(customer_msgs)} customer messages"})
    elif len(customer_msgs) >= 2:
        score = min(100, score + 8)
        factors.append({"factor": "Moderate engagement", "weight": 8, "reason": f"{len(customer_msgs)} customer messages"})

    # Recency
    if last_reply_hours_ago is not None:
        if last_reply_hours_ago < 1:
            score = min(100, score + 25)
            factors.append({"factor": "Very recent activity", "weight": 25, "reason": "Replied within 1 hour"})
        elif last_reply_hours_ago < 2:
            score = min(100, score + 20)
            factors.append({"factor": "Recent activity", "weight": 20, "reason": "Replied within 2 hours"})
        elif last_reply_hours_ago < 24:
            score = min(100, score + 12)
            factors.append({"factor": "Active today", "weight": 12, "reason": "Replied within 24 hours"})
        elif last_reply_hours_ago > 168:
            score = max(0, score - 10)
            factors.append({"factor": "Inactive", "weight": -10, "reason": "No reply in 7+ days"})

    # Lead status
    status_scores = {"new": 5, "contacted": 10, "qualified": 25, "proposal": 30, "negotiation": 35}
    if lead_status in status_scores:
        w = status_scores[lead_status]
        score = min(100, score + w)
        factors.append({"factor": f"Lead status: {lead_status}", "weight": w, "reason": "CRM lead stage"})

    # Source
    paid_sources = ["Meta", "Instagram", "Facebook", "Google Ads", "LinkedIn"]
    if source in paid_sources:
        score = min(100, score + 8)
        factors.append({"factor": "Paid lead source", "weight": 8, "reason": f"Came from {source}"})

    # Buying intent keywords
    intent_keywords = ["price", "cost", "how much", "buy", "purchase", "interested", "want", "need", "when can"]
    msg_texts = " ".join([m.get("content", "") or m.get("content_text", "") for m in customer_msgs]).lower()
    if any(kw in msg_texts for kw in intent_keywords):
        score = min(100, score + 15)
        factors.append({"factor": "Buying intent detected", "weight": 15, "reason": "Keywords: price/buy/interested in messages"})

    score = max(0, min(100, score))
    return score, factors


def score_to_tier(score: int) -> str:
    if score >= 70: return "hot"
    if score >= 40: return "warm"
    return "cold"


def score_to_intent(score: int) -> str:
    if score >= 80: return "very_high"
    if score >= 60: return "high"
    if score >= 35: return "medium"
    return "low"


def score_to_nba(score: int) -> Dict[str, str]:
    if score >= 80:
        return {"action": "Contact immediately — high buying intent detected", "urgency": "immediate"}
    if score >= 60:
        return {"action": "Send a personalized follow-up message today", "urgency": "today"}
    if score >= 40:
        return {"action": "Nurture with relevant content this week", "urgency": "this_week"}
    return {"action": "Monitor and wait for next interaction", "urgency": "low"}


def detect_sentiment(messages: List[Dict[str, Any]]) -> str:
    """Simple keyword-based sentiment detection."""
    customer_msgs = [m for m in messages if m.get("sender_type") in ["contact", "customer"]]
    text = " ".join([m.get("content", "") or m.get("content_text", "") for m in customer_msgs]).lower()

    positive_words = ["yes", "great", "interested", "love", "perfect", "amazing", "want", "buy", "thanks", "good"]
    negative_words = ["no", "not interested", "stop", "cancel", "bad", "terrible", "never", "unsubscribe"]

    pos = sum(1 for w in positive_words if w in text)
    neg = sum(1 for w in negative_words if w in text)

    if pos > neg * 2: return "positive"
    if neg > pos: return "negative"
    if pos > 0: return "mixed"
    return "neutral"
