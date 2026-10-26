from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


def _audit(db, account_id, actor_id, action, entity_type=None, entity_id=None,
           result="success", metadata=None):
    try:
        db.table("audit_logs").insert({
            "account_id": account_id, "actor_id": actor_id,
            "actor_type": "user", "action": action,
            "entity_type": entity_type, "entity_id": entity_id,
            "result": result, "metadata": metadata or {},
        }).execute()
    except Exception as e:
        logger.warning("audit_log failed: %s", e)

MAX_JOURNEY_NODES = 20


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
    journey = res.data[0] if res.data else {}
    _audit(db, user["account_id"], user["user_id"], "journey.created",
           "journey", journey.get("id"), metadata={"name": body.name})
    return journey


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
    _audit(db, user["account_id"], user["user_id"], "journey.deleted",
           "journey", journey_id)


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
    _audit(db, user["account_id"], user["user_id"], "journey.published",
           "journey", journey_id)
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


# ── Pure helper functions (used by tests and engine) ─────────────────────────

def validate_journey_nodes(nodes: list) -> tuple:
    """Return (ok, error). ok=False if nodes are invalid."""
    if not nodes:
        return False, "Journey has no nodes"
    return True, None


def compute_wait_until(amount: int, unit: str) -> str:
    """Return ISO timestamp for when a wait node should resume."""
    from datetime import datetime, timezone, timedelta
    unit_seconds = {"minutes": 60, "hours": 3600, "days": 86400}
    seconds = amount * unit_seconds.get(unit, 3600)
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def should_resume_contact(state: dict) -> bool:
    """Return True if a contact's journey state should be resumed by the scheduler."""
    if state.get("terminal_error"):
        return False
    if state.get("status") not in ("waiting",):
        return False
    return True


def evaluate_journey_condition(field_value, operator: str, value) -> bool:
    """Evaluate a journey condition node."""
    try:
        if operator == "gt":
            return float(field_value) > float(value)
        if operator == "gte":
            return float(field_value) >= float(value)
        if operator == "lt":
            return float(field_value) < float(value)
        if operator == "lte":
            return float(field_value) <= float(value)
        if operator == "eq":
            return str(field_value) == str(value)
        if operator == "neq":
            return str(field_value) != str(value)
        if operator == "contains":
            return str(value).lower() in str(field_value).lower()
        if operator == "is_null":
            return field_value is None
        if operator == "is_not_null":
            return field_value is not None
    except (TypeError, ValueError):
        return False
    return False


def check_journey_ownership(journey_account_id: str, requesting_account_id: str) -> bool:
    return journey_account_id == requesting_account_id


def compute_journey_backoff_minutes(attempt: int) -> int:
    """Exponential backoff starting at 2 minutes: 2, 4, 8 …"""
    return 2 ** (attempt + 1)


def is_dead_letter(attempt_count: int, max_attempts: int) -> bool:
    return attempt_count >= max_attempts
