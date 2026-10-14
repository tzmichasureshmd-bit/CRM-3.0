from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


class ContactCreate(BaseModel):
    name: Optional[str] = None
    phone: str
    email: Optional[str] = None
    company: Optional[str] = None
    lead_status: Optional[str] = "new"
    source: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    lead_status: Optional[str] = None


@router.get("/contacts")
async def list_contacts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    lead_status: Optional[str] = None,
    lead_score_tier: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]
    offset = (page - 1) * limit

    query = db.table("contacts").select("*", count="exact").eq("account_id", account_id)

    if search:
        query = query.or_(f"name.ilike.%{search}%,phone.ilike.%{search}%,email.ilike.%{search}%")
    if lead_status:
        query = query.eq("lead_status", lead_status)
    if lead_score_tier:
        query = query.eq("lead_score_tier", lead_score_tier)

    res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

    return {
        "data": res.data or [],
        "total": res.count or 0,
        "page": page,
        "limit": limit,
    }


@router.get("/contacts/{contact_id}")
async def get_contact(
    contact_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = db.table("contacts").select("*").eq("id", contact_id).eq("account_id", user["account_id"]).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Contact not found")
    return res.data


@router.post("/contacts", status_code=201)
async def create_contact(
    body: ContactCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    data["account_id"] = user["account_id"]
    data["user_id"] = user["user_id"]
    res = db.table("contacts").insert(data).execute()
    return res.data[0] if res.data else {}


@router.patch("/contacts/{contact_id}")
async def update_contact(
    contact_id: str,
    body: ContactUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = (
        db.table("contacts")
        .update(data)
        .eq("id", contact_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    return res.data[0] if res.data else {}


@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(
    contact_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("contacts").delete().eq("id", contact_id).eq("account_id", user["account_id"]).execute()
