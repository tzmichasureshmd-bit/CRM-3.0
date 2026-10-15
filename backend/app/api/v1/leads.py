from fastapi import APIRouter, Depends, HTTPException
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from datetime import datetime
import httpx

router = APIRouter()


@router.get("/leads")
async def list_leads(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("contacts")
        .select("*")
        .eq("account_id", user["account_id"])
        .not_.is_("lead_status", "null")
        .order("lead_score", desc=True)
        .limit(100)
        .execute()
    )
    return {"data": res.data or [], "total": len(res.data or [])}


@router.post("/leads/{contact_id}/analyze")
async def analyze_lead(
    contact_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """Trigger AI lead intelligence analysis via AI service."""
    contact_res = (
        db.table("contacts")
        .select("*")
        .eq("id", contact_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")

    contact = contact_res.data

    # Fetch recent messages for context
    conv_res = (
        db.table("conversations")
        .select("id")
        .eq("contact_id", contact_id)
        .eq("account_id", user["account_id"])
        .limit(5)
        .execute()
    )
    conv_ids = [c["id"] for c in (conv_res.data or [])]
    messages = []
    if conv_ids:
        msg_res = (
            db.table("messages")
            .select("content_text, sender_type, created_at")
            .in_("conversation_id", conv_ids)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        messages = msg_res.data or []

    # Rule-based scoring (explainable, no fake AI)
    score = 0
    factors = []

    customer_msgs = [m for m in messages if m.get("sender_type") == "customer"]
    if len(customer_msgs) >= 5:
        score += 15
        factors.append({"factor": "High message count", "weight": 15, "reason": f"{len(customer_msgs)} customer messages"})
    elif len(customer_msgs) >= 2:
        score += 8
        factors.append({"factor": "Moderate engagement", "weight": 8, "reason": f"{len(customer_msgs)} customer messages"})

    if contact.get("last_customer_reply_at"):
        last_reply = datetime.fromisoformat(contact["last_customer_reply_at"].replace("Z", "+00:00"))
        hours_since = (datetime.utcnow() - last_reply.replace(tzinfo=None)).total_seconds() / 3600
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

    if contact.get("messaging_opt_out"):
        score -= 30
        factors.append({"factor": "Opted out", "weight": -30, "reason": "Contact opted out of messaging"})

    score = max(0, min(100, score))
    tier = "hot" if score >= 70 else "warm" if score >= 40 else "cold"
    intent = "very_high" if score >= 80 else "high" if score >= 60 else "medium" if score >= 35 else "low"

    # Persist score
    db.table("contacts").update({
        "lead_score": score,
        "lead_score_tier": tier,
        "lead_score_reason": factors[0]["reason"] if factors else None,
        "lead_score_updated_at": datetime.utcnow().isoformat(),
    }).eq("id", contact_id).eq("account_id", user["account_id"]).execute()

    nba = "Contact immediately — high buying intent" if score >= 80 else \
          "Send a personalized follow-up message" if score >= 50 else \
          "Nurture with relevant content" if score >= 30 else \
          "Monitor and wait for next interaction"

    return {
        "contact_id": contact_id,
        "score": score,
        "tier": tier,
        "intent": intent,
        "score_factors": factors,
        "next_best_action": nba,
        "ai_summary": f"{contact.get('name', 'This contact')} has a lead score of {score}/100 with {intent} intent.",
        "confidence": "high" if score >= 60 else "medium" if score >= 30 else "low",
        "analyzed_at": datetime.utcnow().isoformat(),
    }
