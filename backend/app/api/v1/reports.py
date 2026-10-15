from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from datetime import datetime, timedelta

router = APIRouter()


@router.get("/reports/revenue")
async def revenue_report(
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()

    deals_res = db.table("deals").select("status, value, currency, created_at, updated_at").eq("account_id", account_id).execute()
    deals = deals_res.data or []

    open_deals = [d for d in deals if d.get("status") == "open"]
    won_deals = [d for d in deals if d.get("status") == "won"]
    lost_deals = [d for d in deals if d.get("status") == "lost"]

    pipeline_value = sum(d.get("value") or 0 for d in open_deals)
    won_value = sum(d.get("value") or 0 for d in won_deals)
    lost_value = sum(d.get("value") or 0 for d in lost_deals)
    total = len(won_deals) + len(lost_deals)
    win_rate = round(len(won_deals) / total * 100, 1) if total > 0 else 0
    currency = deals[0].get("currency", "USD") if deals else "USD"

    return {
        "period_days": days,
        "pipeline_value": pipeline_value,
        "won_revenue": won_value,
        "lost_value": lost_value,
        "open_deals": len(open_deals),
        "won_deals": len(won_deals),
        "lost_deals": len(lost_deals),
        "win_rate": win_rate,
        "currency": currency,
        "forecast_confidence": "medium",
        "generated_at": datetime.utcnow().isoformat(),
    }


@router.get("/reports/leads")
async def leads_report(
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()

    contacts_res = (
        db.table("contacts")
        .select("lead_status, lead_score_tier, source, source_platform, created_at")
        .eq("account_id", account_id)
        .gte("created_at", since)
        .execute()
    )
    contacts = contacts_res.data or []

    by_status: dict = {}
    by_tier: dict = {}
    by_source: dict = {}

    for c in contacts:
        s = c.get("lead_status") or "new"
        by_status[s] = by_status.get(s, 0) + 1
        t = c.get("lead_score_tier") or "cold"
        by_tier[t] = by_tier.get(t, 0) + 1
        src = c.get("source") or "direct"
        by_source[src] = by_source.get(src, 0) + 1

    return {
        "period_days": days,
        "total_leads": len(contacts),
        "by_status": by_status,
        "by_tier": by_tier,
        "by_source": by_source,
        "generated_at": datetime.utcnow().isoformat(),
    }


@router.get("/reports/conversations")
async def conversations_report(
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()

    res = (
        db.table("conversations")
        .select("platform, status, created_at")
        .eq("account_id", account_id)
        .gte("created_at", since)
        .execute()
    )
    convs = res.data or []

    by_platform: dict = {}
    by_status: dict = {}
    for c in convs:
        p = c.get("platform") or "unknown"
        by_platform[p] = by_platform.get(p, 0) + 1
        s = c.get("status") or "open"
        by_status[s] = by_status.get(s, 0) + 1

    return {
        "period_days": days,
        "total": len(convs),
        "by_platform": by_platform,
        "by_status": by_status,
        "generated_at": datetime.utcnow().isoformat(),
    }
