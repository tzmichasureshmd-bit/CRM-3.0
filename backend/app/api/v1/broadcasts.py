from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from app.services.broadcast_service import get_broadcast_service
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


class SendAllRequest(BaseModel):
    batch_size: Optional[int] = Field(default=20, ge=1, le=50)
    delay_ms: Optional[int] = Field(default=50, ge=0, le=2000)
    selected_contact_ids: Optional[List[str]] = None


class RetryFailedRequest(BaseModel):
    batch_size: Optional[int] = Field(default=20, ge=1, le=50)
    delay_ms: Optional[int] = Field(default=50, ge=0, le=2000)


class SendIndividualRequest(BaseModel):
    contact_id: str
    platform: str = "whatsapp"
    message: str
    broadcast_id: Optional[str] = None
    subject: Optional[str] = None


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
    
    # 1. Query dedicated broadcasts table first
    query = (
        db.table("broadcasts")
        .select("*", count="exact")
        .eq("account_id", user["account_id"])
    )
    if status:
        query = query.eq("status", status)
    if platform:
        query = query.eq("platform", platform)

    res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    
    # Fallback to campaigns table if dedicated table has no records for this tenant
    if not res.data and page == 1:
        camp_query = (
            db.table("campaigns")
            .select("*", count="exact")
            .eq("account_id", user["account_id"])
        )
        if status:
            camp_query = camp_query.eq("status", status)
        if platform:
            camp_query = camp_query.eq("platform", platform)
        camp_res = camp_query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
        if camp_res.data:
            return {"data": camp_res.data, "total": camp_res.count or len(camp_res.data), "page": page, "limit": limit}

    return {"data": res.data or [], "total": res.count or 0, "page": page, "limit": limit}


@router.get("/broadcasts/{broadcast_id}")
async def get_broadcast(
    broadcast_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    # Try dedicated broadcasts table first
    res = (
        db.table("broadcasts")
        .select("*")
        .eq("id", broadcast_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        # Fallback to campaigns table
        res = (
            db.table("campaigns")
            .select("*")
            .eq("id", broadcast_id)
            .eq("account_id", user["account_id"])
            .execute()
        )
    if not res.data:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    return res.data[0]


@router.post("/broadcasts", status_code=201)
async def create_broadcast(
    body: BroadcastCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    data["account_id"] = user["account_id"]
    data["status"] = "draft"
    
    try:
        res = db.table("broadcasts").insert(data).execute()
        broadcast = res.data[0] if res.data else {}
    except Exception:
        res = db.table("campaigns").insert(data).execute()
        broadcast = res.data[0] if res.data else {}
    _audit(db, user["account_id"], user["user_id"], "broadcast.created",
           "broadcast", broadcast.get("id"),
           metadata={"name": body.name, "platform": body.platform})
    return broadcast


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
        db.table("broadcasts")
        .update(data)
        .eq("id", broadcast_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
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
    db.table("broadcasts").delete().eq("id", broadcast_id).eq("account_id", user["account_id"]).execute()
    db.table("campaigns").delete().eq("id", broadcast_id).eq("account_id", user["account_id"]).execute()
    _audit(db, user["account_id"], user["user_id"], "broadcast.deleted",
           "broadcast", broadcast_id)


# ─────────────────────────────────────────────────────────────
# BROADCAST ACTIONS & SEND ALL WORKFLOWS
# ─────────────────────────────────────────────────────────────

@router.get("/broadcasts/{broadcast_id}/recipients-preview")
async def get_recipients_preview(
    broadcast_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Returns eligible, opted-out, and invalid address recipient counts
    before committing to bulk dispatch.
    """
    svc = get_broadcast_service()
    # Look up broadcast to check channel and segment
    b_res = db.table("broadcasts").select("platform, segment_id, name, message").eq("id", broadcast_id).eq("account_id", user["account_id"]).execute()
    if not b_res.data:
        b_res = db.table("campaigns").select("platform, segment_id, name, message").eq("id", broadcast_id).eq("account_id", user["account_id"]).execute()
    if not b_res.data:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    b_data = b_res.data[0]
    preview = svc.get_recipients_for_channel(
        account_id=user["account_id"],
        platform=b_data.get("platform") or "whatsapp",
        segment_id=b_data.get("segment_id"),
    )
    preview["broadcast_id"] = broadcast_id
    preview["broadcast_name"] = b_data.get("name")
    preview["message_preview"] = b_data.get("message")
    return preview


@router.post("/broadcasts/{broadcast_id}/send-all")
async def trigger_send_all(
    broadcast_id: str,
    payload: Optional[SendAllRequest] = None,
    user: dict = Depends(get_current_user),
):
    """
    Executes Send All to all eligible recipients under tenant isolation,
    respecting opt-outs, provider rate limits, and server-side state locking.
    """
    svc = get_broadcast_service()
    batch_size = payload.batch_size if payload else 20
    delay_ms = payload.delay_ms if payload else 50
    selected_contact_ids = payload.selected_contact_ids if payload else None
    try:
        summary = await svc.send_all(
            broadcast_id=broadcast_id,
            account_id=user["account_id"],
            batch_size=batch_size,
            delay_ms=delay_ms,
            selected_contact_ids=selected_contact_ids,
        )
        return summary
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Broadcast send failed: {str(e)}")


@router.post("/broadcasts/{broadcast_id}/retry-failed")
async def trigger_retry_failed(
    broadcast_id: str,
    payload: Optional[RetryFailedRequest] = None,
    user: dict = Depends(get_current_user),
):
    """
    Retries sending strictly to recipients that failed in the previous run.
    Avoids resending to already successful contacts.
    """
    svc = get_broadcast_service()
    batch_size = payload.batch_size if payload else 20
    delay_ms = payload.delay_ms if payload else 50
    try:
        res = await svc.retry_failed(
            broadcast_id=broadcast_id,
            account_id=user["account_id"],
            batch_size=batch_size,
            delay_ms=delay_ms,
        )
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retry failed: {str(e)}")


@router.get("/broadcasts/{broadcast_id}/results")
async def get_broadcast_results(
    broadcast_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Retrieves the recipient-level delivery and failure breakdown.
    """
    svc = get_broadcast_service()
    try:
        return svc.get_results_summary(broadcast_id=broadcast_id, account_id=user["account_id"])
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch results: {str(e)}")


@router.post("/broadcasts/send-individual")
async def send_individual_message(
    body: SendIndividualRequest,
    user: dict = Depends(get_current_user),
):
    """
    Dispatches a single 1-to-1 message to a specific contact, respecting opt-out
    and updating broadcast counters if broadcast_id is supplied.
    """
    svc = get_broadcast_service()
    try:
        res = await svc.send_individual(
            account_id=user["account_id"],
            contact_id=body.contact_id,
            platform=body.platform,
            message=body.message,
            broadcast_id=body.broadcast_id,
            subject=body.subject,
        )
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Individual send failed: {str(e)}")
