from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


class SegmentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    type: str = "manual"
    rules: Optional[List[dict]] = None


class SegmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    rules: Optional[List[dict]] = None


@router.get("/segments")
async def list_segments(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("crm3_segments")
        .select("*")
        .eq("account_id", user["account_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": res.data or []}


@router.get("/segments/{segment_id}")
async def get_segment(
    segment_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("crm3_segments")
        .select("*")
        .eq("id", segment_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Segment not found")
    return res.data


@router.get("/segments/{segment_id}/contacts")
async def get_segment_contacts(
    segment_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    segment_res = (
        db.table("crm3_segments")
        .select("*")
        .eq("id", segment_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not segment_res.data:
        raise HTTPException(status_code=404, detail="Segment not found")

    segment = segment_res.data
    rules = segment.get("rules") or []

    query = db.table("contacts").select("*").eq("account_id", user["account_id"])

    for rule in rules:
        field = rule.get("field")
        op = rule.get("operator")
        value = rule.get("value")
        if not field or not op:
            continue
        if op == "eq":
            query = query.eq(field, value)
        elif op == "neq":
            query = query.neq(field, value)
        elif op == "gte":
            query = query.gte(field, value)
        elif op == "lte":
            query = query.lte(field, value)
        elif op == "ilike":
            query = query.ilike(field, f"%{value}%")

    res = query.order("created_at", desc=True).limit(500).execute()
    return {"data": res.data or [], "total": len(res.data or [])}


@router.post("/segments", status_code=201)
async def create_segment(
    body: SegmentCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    data["account_id"] = user["account_id"]
    res = db.table("crm3_segments").insert(data).execute()
    return res.data[0] if res.data else {}


@router.patch("/segments/{segment_id}")
async def update_segment(
    segment_id: str,
    body: SegmentUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = (
        db.table("crm3_segments")
        .update(data)
        .eq("id", segment_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Segment not found")
    return res.data[0]


@router.delete("/segments/{segment_id}", status_code=204)
async def delete_segment(
    segment_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("crm3_segments").delete().eq("id", segment_id).eq("account_id", user["account_id"]).execute()
