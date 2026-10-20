from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timedelta
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/analytics")
async def get_analytics(
    granularity: str = Query("day"),
    preset: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]

    contacts_res = db.table("contacts").select("id, created_at, lead_status, lead_score_tier").eq("account_id", account_id).limit(1000).execute()
    contacts = contacts_res.data or []

    conversations_res = db.table("conversations").select("id, created_at, status, platform").eq("account_id", account_id).limit(1000).execute()
    conversations = conversations_res.data or []

    deals_res = db.table("deals").select("id, value, status, created_at").eq("account_id", account_id).limit(1000).execute()
    deals = deals_res.data or []

    return {
        "summary": {
            "total_contacts": len(contacts),
            "total_conversations": len(conversations),
            "total_deals": len(deals),
            "open_deals": sum(1 for d in deals if d.get("status") == "open"),
            "won_deals": sum(1 for d in deals if d.get("status") == "won"),
            "revenue": sum(d.get("value") or 0 for d in deals if d.get("status") == "won"),
        },
        "contacts_by_tier": {
            "hot": sum(1 for c in contacts if c.get("lead_score_tier") == "hot"),
            "warm": sum(1 for c in contacts if c.get("lead_score_tier") == "warm"),
            "cold": sum(1 for c in contacts if c.get("lead_score_tier") == "cold"),
        },
        "conversations_by_platform": {},
        "data": [],
        "granularity": granularity,
    }
