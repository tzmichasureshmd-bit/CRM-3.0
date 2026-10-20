from fastapi import APIRouter, Depends, Query, HTTPException, Body
from typing import Optional
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from app.services.meta_campaign_service import MetaCampaignService

router = APIRouter()
meta_service = MetaCampaignService()


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


# ══════════════════════════════════════════════════════════════
# META ADS CAMPAIGN INTEGRATION ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.post("/campaigns/sync-meta")
async def sync_meta_campaigns(
    body: Optional[dict] = Body(default={}),
    user: dict = Depends(get_current_user),
):
    """
    Synchronizes campaigns from Meta Ads Manager into CRM 3.0.
    Enforces tenant isolation by linking all synchronized records to user['account_id'].
    Supports optional temporary override_token in body for initial connection testing.
    """
    account_id = user["account_id"]
    override_token = body.get("access_token") if body else None
    override_ad_account = body.get("ad_account_id") if body else None

    try:
        result = await meta_service.sync_campaigns(
            account_id=account_id,
            override_token=override_token,
            override_ad_account_id=override_ad_account,
        )
        return result
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Meta Ads synchronization failed: {str(e)}")


@router.get("/campaigns/meta")
async def list_meta_campaigns(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Lists locally synchronized Meta Ads campaigns for the authenticated tenant.
    Never exposes Meta access tokens or full token-bearing URLs.
    """
    offset = (page - 1) * limit
    query = (
        db.table("campaigns")
        .select("*", count="exact")
        .eq("account_id", user["account_id"])
        .eq("platform", "facebook")
    )
    if status and status != "all":
        query = query.eq("status", status)

    res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    data = res.data or []

    # If DB rows lack meta_campaign_id, auto-enrich from Meta Marketing API
    needs_meta_id = any(not item.get("meta_campaign_id") for item in data)
    if needs_meta_id:
        try:
            live_camps = await meta_service.fetch_meta_campaigns()
            live_by_name = {c.get("name", "").strip().lower(): c for c in live_camps}
            for item in data:
                if not item.get("meta_campaign_id"):
                    matched = live_by_name.get(item.get("name", "").strip().lower())
                    if matched:
                        item["meta_campaign_id"] = str(matched.get("id"))
                        if not item.get("objective"):
                            item["objective"] = matched.get("objective")
        except Exception:
            pass

    return {
        "data": data,
        "total": res.count or len(data),
        "page": page,
        "limit": limit,
    }


@router.get("/campaigns/meta/sync-status")
async def get_meta_sync_status(
    user: dict = Depends(get_current_user),
):
    """
    Returns observability metadata: ad account ID, API version,
    token status, and last synchronization outcome.
    """
    return meta_service.get_latest_sync_status(account_id=user["account_id"])


@router.get("/campaigns/meta/credentials")
async def get_meta_credentials(
    user: dict = Depends(get_current_user),
):
    """
    Returns sanitized Meta Ads connection status and credentials preview
    without exposing full secret tokens.
    """
    return meta_service.get_credentials_info()


@router.post("/campaigns/meta/credentials")
async def save_meta_credentials(
    body: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """
    Saves and updates Meta Ads credentials (ad_account_id, app_id, access_token, api_version).
    Persists configuration into server environment.
    """
    ad_account_id = body.get("ad_account_id")
    app_id = body.get("app_id")
    access_token = body.get("access_token")
    api_version = body.get("api_version")

    return meta_service.save_credentials(
        ad_account_id=ad_account_id,
        app_id=app_id,
        access_token=access_token,
        api_version=api_version,
    )


@router.post("/campaigns/meta/test-connection")
async def test_meta_connection(
    body: Optional[dict] = Body(default={}),
    user: dict = Depends(get_current_user),
):
    """
    Tests live connection to Meta Graph API using either currently saved
    credentials or the credentials provided in the request payload.
    """
    payload = body or {}
    return await meta_service.test_connection(
        ad_account_id=payload.get("ad_account_id"),
        access_token=payload.get("access_token"),
        api_version=payload.get("api_version"),
    )


# ══════════════════════════════════════════════════════════════
# META ADS CAMPAIGN MANAGEMENT MUTATION ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/campaigns/meta/permissions")
async def get_meta_permissions(
    user: dict = Depends(get_current_user),
):
    """
    Validates token scopes and ad-account permissions directly with Meta.
    Reports whether 'ads_read' and 'ads_management' are granted.
    """
    try:
        return await meta_service.validate_token_permissions()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check Meta permissions: {str(e)}")


@router.post("/campaigns/meta/create")
async def create_meta_campaign(
    body: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """
    Creates a new campaign in Meta Ads Manager.
    Enforces 'ads_management' permission and tenant isolation.
    """
    name = body.get("name")
    objective = body.get("objective")
    status = body.get("status", "PAUSED")
    daily_budget = body.get("daily_budget")
    lifetime_budget = body.get("lifetime_budget")
    special_ad_categories = body.get("special_ad_categories")

    try:
        return await meta_service.create_campaign(
            account_id=user["account_id"],
            name=name,
            objective=objective,
            status=status,
            daily_budget=daily_budget,
            lifetime_budget=lifetime_budget,
            special_ad_categories=special_ad_categories,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Meta campaign creation failed: {str(e)}")


@router.patch("/campaigns/meta/{meta_campaign_id}")
async def update_meta_campaign(
    meta_campaign_id: str,
    body: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """
    Updates supported fields of an existing Meta campaign (name, status, budget).
    Enforces tenant ownership of the campaign.
    """
    try:
        return await meta_service.update_campaign(
            account_id=user["account_id"],
            meta_campaign_id=meta_campaign_id,
            name=body.get("name"),
            status=body.get("status"),
            daily_budget=body.get("daily_budget"),
            lifetime_budget=body.get("lifetime_budget"),
        )
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Meta campaign update failed: {str(e)}")


@router.post("/campaigns/meta/{meta_campaign_id}/pause")
async def pause_meta_campaign(
    meta_campaign_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Pauses live ad delivery for a Meta campaign (status=PAUSED).
    """
    try:
        return await meta_service.pause_campaign(
            account_id=user["account_id"],
            meta_campaign_id=meta_campaign_id,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to pause Meta campaign: {str(e)}")


@router.post("/campaigns/meta/{meta_campaign_id}/resume")
async def resume_meta_campaign(
    meta_campaign_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Resumes ad delivery for a paused Meta campaign (status=ACTIVE).
    """
    try:
        return await meta_service.resume_campaign(
            account_id=user["account_id"],
            meta_campaign_id=meta_campaign_id,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to resume Meta campaign: {str(e)}")


@router.post("/campaigns/meta/{meta_campaign_id}/archive")
async def archive_meta_campaign(
    meta_campaign_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Archives a Meta campaign (status=ARCHIVED).
    """
    try:
        return await meta_service.archive_campaign(
            account_id=user["account_id"],
            meta_campaign_id=meta_campaign_id,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to archive Meta campaign: {str(e)}")


@router.get("/campaigns/meta/{meta_campaign_id}")
async def get_meta_campaign_details(
    meta_campaign_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Retrieves live metadata and insights directly from Meta Marketing API.
    """
    try:
        return await meta_service.get_campaign_details(
            account_id=user["account_id"],
            meta_campaign_id=meta_campaign_id,
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to retrieve Meta campaign details: {str(e)}")


