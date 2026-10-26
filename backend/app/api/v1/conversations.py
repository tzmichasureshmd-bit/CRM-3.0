from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
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


@router.get("/conversations")
async def list_conversations(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    platform: Optional[str] = None,
    assigned_to: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]
    offset = (page - 1) * limit

    query = (
        db.table("conversations")
        .select("*, contacts(id, name, phone, lead_score, lead_score_tier, lead_status)", count="exact")
        .eq("account_id", account_id)
    )
    if status:
        query = query.eq("status", status)
    if platform:
        query = query.eq("platform", platform)
    if assigned_to:
        query = query.eq("assigned_agent_id", assigned_to)

    res = query.order("last_message_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "limit": limit}


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("conversations")
        .select("*, contacts(*)")
        .eq("id", conversation_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return res.data


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    # Verify ownership
    conv = (
        db.table("conversations")
        .select("id")
        .eq("id", conversation_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    offset = (page - 1) * limit
    res = (
        db.table("messages")
        .select("*", count="exact")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"data": res.data or [], "total": res.count or 0}


@router.patch("/conversations/{conversation_id}/assign")
async def assign_conversation(
    conversation_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    agent_id    = body.get("agent_id")
    employee_id = body.get("employee_id")
    update: dict = {}
    if agent_id is not None:
        update["assigned_agent_id"] = agent_id
    if employee_id is not None:
        update["assigned_employee_id"] = employee_id
    if not update:
        raise HTTPException(status_code=400, detail="agent_id or employee_id required")
    res = (
        db.table("conversations")
        .update(update)
        .eq("id", conversation_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    _audit(db, user["account_id"], user["user_id"], "conversation.assigned",
           "conversation", conversation_id, metadata=update)
    return res.data[0] if res.data else {}


@router.patch("/conversations/{conversation_id}/status")
async def update_status(
    conversation_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    status = body.get("status")
    if status not in ["open", "pending", "closed"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    res = (
        db.table("conversations")
        .update({"status": status})
        .eq("id", conversation_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    _audit(db, user["account_id"], user["user_id"], "conversation.status_changed",
           "conversation", conversation_id, metadata={"status": status})
    return res.data[0] if res.data else {}
