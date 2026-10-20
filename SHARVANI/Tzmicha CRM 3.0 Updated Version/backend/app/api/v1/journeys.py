from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


class JourneyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_type: str = "manual"
    nodes: Optional[List[dict]] = None
    edges: Optional[List[dict]] = None


class JourneyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    nodes: Optional[List[dict]] = None
    edges: Optional[List[dict]] = None


class JourneyExecute(BaseModel):
    contact_id: str


@router.get("/journeys")
async def list_journeys(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("crm3_journeys")
        .select("*")
        .eq("account_id", user["account_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": res.data or []}


@router.get("/journeys/{journey_id}")
async def get_journey(
    journey_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("crm3_journeys")
        .select("*")
        .eq("id", journey_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Journey not found")
    return res.data


@router.post("/journeys", status_code=201)
async def create_journey(
    body: JourneyCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    data["account_id"] = user["account_id"]
    data["status"] = "draft"
    data["entry_count"] = 0
    data["completed_count"] = 0
    res = db.table("crm3_journeys").insert(data).execute()
    return res.data[0] if res.data else {}


@router.patch("/journeys/{journey_id}")
async def update_journey(
    journey_id: str,
    body: JourneyUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = (
        db.table("crm3_journeys")
        .update(data)
        .eq("id", journey_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Journey not found")
    return res.data[0]


@router.delete("/journeys/{journey_id}", status_code=204)
async def delete_journey(
    journey_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("crm3_journeys").delete().eq("id", journey_id).eq("account_id", user["account_id"]).execute()


@router.post("/journeys/{journey_id}/publish")
async def publish_journey(
    journey_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    journey_res = (
        db.table("crm3_journeys")
        .select("nodes")
        .eq("id", journey_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not journey_res.data:
        raise HTTPException(status_code=404, detail="Journey not found")

    nodes = journey_res.data.get("nodes") or []
    if len(nodes) < 2:
        raise HTTPException(status_code=400, detail="Journey needs at least 2 nodes to publish")

    has_trigger = any(n.get("type") == "trigger" for n in nodes)
    if not has_trigger:
        raise HTTPException(status_code=400, detail="Journey needs a trigger node")

    res = (
        db.table("crm3_journeys")
        .update({"status": "active"})
        .eq("id", journey_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    return res.data[0] if res.data else {}


@router.post("/journeys/{journey_id}/execute")
async def execute_journey(
    journey_id: str,
    body: JourneyExecute,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    journey_res = (
        db.table("crm3_journeys")
        .select("*")
        .eq("id", journey_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not journey_res.data:
        raise HTTPException(status_code=404, detail="Journey not found")

    contact_res = (
        db.table("contacts")
        .select("id, name, lead_score, lead_status")
        .eq("id", body.contact_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not contact_res.data:
        raise HTTPException(status_code=404, detail="Contact not found")

    execution_res = db.table("crm3_journey_executions").insert({
        "journey_id": journey_id,
        "contact_id": body.contact_id,
        "account_id": user["account_id"],
        "status": "completed",
        "nodes_executed": 1,
    }).execute()

    db.table("crm3_journeys").update({
        "entry_count": (journey_res.data.get("entry_count") or 0) + 1
    }).eq("id", journey_id).execute()

    return {
        "status": "completed",
        "journey_id": journey_id,
        "contact_id": body.contact_id,
        "execution_id": execution_res.data[0]["id"] if execution_res.data else None,
        "nodes_executed": 1,
    }


@router.get("/journeys/{journey_id}/executions")
async def get_journey_executions(
    journey_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("crm3_journey_executions")
        .select("*")
        .eq("journey_id", journey_id)
        .eq("account_id", user["account_id"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"data": res.data or []}
