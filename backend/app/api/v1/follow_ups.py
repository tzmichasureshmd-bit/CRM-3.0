from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


class FollowUpCreate(BaseModel):
    title: str
    contact_id: Optional[str] = None
    due_date: str
    notes: Optional[str] = None


class FollowUpUpdate(BaseModel):
    title: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


@router.get("/follow-ups")
async def list_follow_ups(
    status: Optional[str] = None,
    overdue: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    from datetime import datetime
    offset = (page - 1) * limit
    query = (
        db.table("follow_ups")
        .select("*, contacts(id, name, phone)", count="exact")
        .eq("account_id", user["account_id"])
    )
    if status:
        query = query.eq("status", status)
    if overdue:
        query = query.lt("due_date", datetime.utcnow().isoformat()).eq("status", "pending")

    res = query.order("due_date", desc=False).range(offset, offset + limit - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "limit": limit}


@router.get("/follow-ups/{follow_up_id}")
async def get_follow_up(
    follow_up_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("follow_ups")
        .select("*, contacts(id, name, phone)")
        .eq("id", follow_up_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return res.data


@router.post("/follow-ups", status_code=201)
async def create_follow_up(
    body: FollowUpCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    data["account_id"] = user["account_id"]
    data["user_id"] = user["user_id"]
    data["status"] = "pending"
    res = db.table("follow_ups").insert(data).execute()
    return res.data[0] if res.data else {}


@router.patch("/follow-ups/{follow_up_id}")
async def update_follow_up(
    follow_up_id: str,
    body: FollowUpUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = (
        db.table("follow_ups")
        .update(data)
        .eq("id", follow_up_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return res.data[0]


@router.delete("/follow-ups/{follow_up_id}", status_code=204)
async def delete_follow_up(
    follow_up_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("follow_ups").delete().eq("id", follow_up_id).eq("account_id", user["account_id"]).execute()
