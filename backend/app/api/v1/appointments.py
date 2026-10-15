from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


class AppointmentCreate(BaseModel):
    title: str
    contact_id: Optional[str] = None
    scheduled_at: str
    duration_minutes: int = 60
    notes: Optional[str] = None
    location: Optional[str] = None


class AppointmentUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_at: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None


@router.get("/appointments")
async def list_appointments(
    status: Optional[str] = None,
    upcoming: bool = False,
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
    if upcoming:
        query = query.gte("due_date", datetime.utcnow().isoformat())

    res = query.order("due_date", desc=False).range(offset, offset + limit - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "limit": limit}


@router.get("/appointments/{appointment_id}")
async def get_appointment(
    appointment_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("follow_ups")
        .select("*, contacts(id, name, phone)")
        .eq("id", appointment_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return res.data


@router.post("/appointments", status_code=201)
async def create_appointment(
    body: AppointmentCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = {
        "title": body.title,
        "contact_id": body.contact_id,
        "due_date": body.scheduled_at,
        "notes": body.notes,
        "status": "pending",
        "account_id": user["account_id"],
        "user_id": user["user_id"],
    }
    res = db.table("follow_ups").insert({k: v for k, v in data.items() if v is not None}).execute()
    return res.data[0] if res.data else {}


@router.patch("/appointments/{appointment_id}")
async def update_appointment(
    appointment_id: str,
    body: AppointmentUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data: dict = {}
    if body.title: data["title"] = body.title
    if body.scheduled_at: data["due_date"] = body.scheduled_at
    if body.notes: data["notes"] = body.notes
    if body.status: data["status"] = body.status

    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    res = (
        db.table("follow_ups")
        .update(data)
        .eq("id", appointment_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return res.data[0]


@router.delete("/appointments/{appointment_id}", status_code=204)
async def delete_appointment(
    appointment_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("follow_ups").delete().eq("id", appointment_id).eq("account_id", user["account_id"]).execute()
