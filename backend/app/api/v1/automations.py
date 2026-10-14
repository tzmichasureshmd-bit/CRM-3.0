from fastapi import APIRouter, Depends, Query
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/automations")
async def list_automations(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("automations")
        .select("*")
        .eq("account_id", user["account_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": res.data or []}


@router.get("/automations/{automation_id}/logs")
async def get_automation_logs(
    automation_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    offset = (page - 1) * limit
    res = (
        db.table("automation_logs")
        .select("*", count="exact")
        .eq("automation_id", automation_id)
        .eq("account_id", user["account_id"])
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"data": res.data or [], "total": res.count or 0}


@router.patch("/automations/{automation_id}/toggle")
async def toggle_automation(
    automation_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    is_active = body.get("is_active", True)
    res = (
        db.table("automations")
        .update({"is_active": is_active})
        .eq("id", automation_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    return res.data[0] if res.data else {}


@router.post("/automations", status_code=201)
async def create_automation(
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    body["account_id"] = user["account_id"]
    body.setdefault("status", "draft")
    body.setdefault("is_active", False)
    res = db.table("automations").insert(body).execute()
    return res.data[0] if res.data else {}


@router.delete("/automations/{automation_id}", status_code=204)
async def delete_automation(
    automation_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("automations").delete().eq("id", automation_id).eq("account_id", user["account_id"]).execute()
