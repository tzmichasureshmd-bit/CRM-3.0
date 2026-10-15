from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/campaigns")
async def list_campaigns(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    offset = (page - 1) * limit
    res = (
        db.table("campaigns")
        .select("*", count="exact")
        .eq("account_id", user["account_id"])
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"data": res.data or [], "total": res.count or 0}


@router.post("/campaigns", status_code=201)
async def create_campaign(
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    body["account_id"] = user["account_id"]
    body.setdefault("status", "draft")
    res = db.table("campaigns").insert(body).execute()
    return res.data[0] if res.data else {}


@router.patch("/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    body.pop("account_id", None)
    if not body:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = (
        db.table("campaigns")
        .update(body)
        .eq("id", campaign_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    return res.data[0] if res.data else {}


@router.delete("/campaigns/{campaign_id}", status_code=204)
async def delete_campaign(
    campaign_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("campaigns").delete().eq("id", campaign_id).eq("account_id", user["account_id"]).execute()


@router.get("/campaigns/{campaign_id}/intelligence")
async def campaign_intelligence(
    campaign_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """Returns content → lead → revenue attribution for a campaign."""
    # Contacts attributed to this campaign
    contacts_res = (
        db.table("contacts")
        .select("id, lead_status, lead_score")
        .eq("account_id", user["account_id"])
        .eq("campaign_id", campaign_id)
        .execute()
    )
    contacts = contacts_res.data or []
    total_leads = len(contacts)
    qualified = len([c for c in contacts if c.get("lead_status") in ["qualified", "proposal", "negotiation", "won"]])

    # Deals attributed
    deals_res = (
        db.table("deals")
        .select("status, value, currency")
        .eq("account_id", user["account_id"])
        .eq("campaign_id", campaign_id)
        .execute()
    )
    deals = deals_res.data or []
    total_deals = len(deals)
    won_deals = [d for d in deals if d.get("status") == "won"]
    revenue = sum(d.get("value") or 0 for d in won_deals)
    currency = won_deals[0].get("currency", "USD") if won_deals else "USD"

    return {
        "campaign_id": campaign_id,
        "total_leads": total_leads,
        "qualified_leads": qualified,
        "total_deals": total_deals,
        "won_deals": len(won_deals),
        "revenue_attributed": revenue,
        "currency": currency,
        "conversion_rate": round(qualified / total_leads * 100, 1) if total_leads > 0 else 0,
        "attribution_method": "direct",
        "attribution_confidence": "high" if total_leads > 0 else "unknown",
    }
