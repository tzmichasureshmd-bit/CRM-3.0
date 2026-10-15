from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


class BroadcastCreate(BaseModel):
    name: str
    platform: str = "whatsapp"
    message: Optional[str] = None
    scheduled_at: Optional[str] = None
    segment_id: Optional[str] = None


class BroadcastUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    message: Optional[str] = None
    scheduled_at: Optional[str] = None


@router.get("/broadcasts")
async def list_broadcasts(
    status: Optional[str] = None,
    platform: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    offset = (page - 1) * limit
    query = (
        db.table("campaigns")
        .select("*", count="exact")
        .eq("account_id", user["account_id"])
    )
    if status:
        query = query.eq("status", status)
    if platform:
        query = query.eq("platform", platform)

    res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "limit": limit}


@router.get("/broadcasts/{broadcast_id}")
async def get_broadcast(
    broadcast_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("campaigns")
        .select("*")
        .eq("id", broadcast_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    return res.data


@router.post("/broadcasts", status_code=201)
async def create_broadcast(
    body: BroadcastCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    data["account_id"] = user["account_id"]
    data["status"] = "draft"
    res = db.table("campaigns").insert(data).execute()
    return res.data[0] if res.data else {}


@router.patch("/broadcasts/{broadcast_id}")
async def update_broadcast(
    broadcast_id: str,
    body: BroadcastUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = (
        db.table("campaigns")
        .update(data)
        .eq("id", broadcast_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    return res.data[0]


@router.delete("/broadcasts/{broadcast_id}", status_code=204)
async def delete_broadcast(
    broadcast_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("campaigns").delete().eq("id", broadcast_id).eq("account_id", user["account_id"]).execute()
