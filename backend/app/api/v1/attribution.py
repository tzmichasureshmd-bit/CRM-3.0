from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/attribution")
async def get_attribution(
    view: str = Query("overview"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    content_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    source: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]

    q = db.table("crm3_attribution").select(
        "id, content_id, campaign_id, contact_id, deal_id, revenue_amount, deal_value, "
        "is_won, source, channel, attribution_method, attribution_confidence, "
        "lead_created_at, deal_won_at, qualified_at, created_at"
    ).eq("account_id", account_id)

    if date_from:
        q = q.gte("created_at", date_from)
    if date_to:
        q = q.lte("created_at", date_to)
    if content_id:
        q = q.eq("content_id", content_id)
    if campaign_id:
        q = q.eq("campaign_id", campaign_id)
    if source:
        q = q.eq("source", source)

    res = q.order("created_at", desc=True).limit(500).execute()
    records = res.data or []

    total_leads = sum(1 for r in records if r.get("contact_id"))
    qualified_leads = sum(1 for r in records if r.get("qualified_at"))
    total_deals = sum(1 for r in records if r.get("deal_id"))
    won_deals = sum(1 for r in records if r.get("is_won"))
    attributed_revenue = sum(r.get("revenue_amount") or 0 for r in records if r.get("is_won"))
    pipeline_value = sum(r.get("deal_value") or 0 for r in records if r.get("deal_id") and not r.get("is_won"))
    conversion_rate = round(won_deals / total_leads * 100) if total_leads > 0 else 0

    overview = {
        "total_leads": total_leads,
        "qualified_leads": qualified_leads,
        "total_deals": total_deals,
        "won_deals": won_deals,
        "attributed_revenue": attributed_revenue,
        "pipeline_value": pipeline_value,
        "conversion_rate": conversion_rate,
    }

    if view == "overview":
        return {"overview": overview, "total_records": len(records)}

    if view == "source":
        contacts_res = db.table("contacts").select("id, source, lead_score_tier, lead_status").eq("account_id", account_id).not_.is_("source", "null").limit(500).execute()
        source_map: dict = {}
        for c in (contacts_res.data or []):
            src = c.get("source") or "direct"
            e = source_map.setdefault(src, {"source": src, "leads": 0, "hot": 0, "qualified": 0, "deals": 0, "revenue": 0})
            e["leads"] += 1
            if c.get("lead_score_tier") == "hot":
                e["hot"] += 1
            if c.get("lead_status") in ["qualified", "proposal", "negotiation", "won"]:
                e["qualified"] += 1
        sources = sorted(source_map.values(), key=lambda x: -x["leads"])
        return {"sources": sources, "overview": overview}

    return {"overview": overview}


@router.post("/attribution", status_code=201)
async def create_attribution(
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]

    valid_methods = ["direct", "last_touch", "first_touch", "inferred"]
    valid_confidence = ["high", "medium", "low", "unknown"]

    res = db.table("crm3_attribution").insert({
        "account_id": account_id,
        "content_id": body.get("content_id"),
        "campaign_id": body.get("campaign_id"),
        "contact_id": body.get("contact_id"),
        "deal_id": body.get("deal_id"),
        "revenue_amount": body.get("revenue_amount"),
        "deal_value": body.get("deal_value"),
        "currency": body.get("currency", "USD"),
        "is_won": body.get("is_won", False),
        "source": body.get("source"),
        "channel": body.get("channel"),
        "attribution_method": body.get("attribution_method") if body.get("attribution_method") in valid_methods else "inferred",
        "attribution_confidence": body.get("attribution_confidence") if body.get("attribution_confidence") in valid_confidence else "low",
        "lead_created_at": body.get("lead_created_at"),
        "deal_won_at": body.get("deal_won_at"),
        "qualified_at": body.get("qualified_at"),
    }).execute()

    return {"attribution": res.data[0] if res.data else {}}
