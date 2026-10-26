from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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


# ── Pydantic Models ───────────────────────────────────────────

class DealCreate(BaseModel):
    title: str
    stage_id: Optional[str] = None
    contact_id: Optional[str] = None
    value: float = 0
    currency: str = "USD"
    notes: Optional[str] = None
    close_date: Optional[str] = None


class DealUpdate(BaseModel):
    title: Optional[str] = None
    stage_id: Optional[str] = None
    contact_id: Optional[str] = None
    value: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    close_date: Optional[str] = None


class StageCreate(BaseModel):
    name: str
    position: int = 0
    color: str = "#4d7cff"


class StageUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None
    color: Optional[str] = None


# ── Pipeline Stages ───────────────────────────────────────────

@router.get("/pipeline-stages")
async def list_pipeline_stages(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("pipeline_stages")
        .select("*")
        .eq("account_id", user["account_id"])
        .order("position")
        .execute()
    )
    return {"data": res.data or []}


@router.post("/pipeline-stages", status_code=201)
async def create_pipeline_stage(
    body: StageCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump()
    data["account_id"] = user["account_id"]
    res = db.table("pipeline_stages").insert(data).execute()
    stage = res.data[0] if res.data else {}
    _audit(db, user["account_id"], user["user_id"], "pipeline_stage.created",
           "pipeline_stage", stage.get("id"), metadata={"name": body.name})
    return stage


@router.patch("/pipeline-stages/{stage_id}")
async def update_pipeline_stage(
    stage_id: str,
    body: StageUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = (
        db.table("pipeline_stages")
        .update(data)
        .eq("id", stage_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    _audit(db, user["account_id"], user["user_id"], "pipeline_stage.updated",
           "pipeline_stage", stage_id, metadata=data)
    return res.data[0] if res.data else {}


@router.delete("/pipeline-stages/{stage_id}", status_code=204)
async def delete_pipeline_stage(
    stage_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("deals").update({"stage_id": None}).eq("stage_id", stage_id).eq("account_id", user["account_id"]).execute()
    db.table("pipeline_stages").delete().eq("id", stage_id).eq("account_id", user["account_id"]).execute()
    _audit(db, user["account_id"], user["user_id"], "pipeline_stage.deleted",
           "pipeline_stage", stage_id)


# ── Deals ─────────────────────────────────────────────────────

@router.get("/deals")
async def list_deals(
    status: Optional[str] = None,
    stage_id: Optional[str] = None,
    contact_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    query = (
        db.table("deals")
        .select("*, contacts(id, name, phone, email, lead_score, lead_score_tier), pipeline_stages(id, name, color, position)")
        .eq("account_id", user["account_id"])
    )
    if status:
        query = query.eq("status", status)
    if stage_id:
        query = query.eq("stage_id", stage_id)
    if contact_id:
        query = query.eq("contact_id", contact_id)

    res = query.order("created_at", desc=True).limit(200).execute()
    return {"data": res.data or []}


@router.get("/deals/stats")
async def get_pipeline_stats(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("deals")
        .select("status, value, currency, pipeline_stages(name)")
        .eq("account_id", user["account_id"])
        .execute()
    )
    deals = res.data or []

    total = len(deals)
    open_deals = [d for d in deals if d["status"] == "open"]
    won_deals = [d for d in deals if d["status"] == "won"]
    lost_deals = [d for d in deals if d["status"] == "lost"]

    total_pipeline_value = sum(d["value"] or 0 for d in open_deals)
    total_won_value = sum(d["value"] or 0 for d in won_deals)
    win_rate = round(len(won_deals) / (len(won_deals) + len(lost_deals)) * 100, 1) if (won_deals or lost_deals) else 0

    stage_breakdown: dict = {}
    for d in open_deals:
        stage_name = (d.get("pipeline_stages") or {}).get("name", "Unknown")
        if stage_name not in stage_breakdown:
            stage_breakdown[stage_name] = {"count": 0, "value": 0}
        stage_breakdown[stage_name]["count"] += 1
        stage_breakdown[stage_name]["value"] += d["value"] or 0

    return {
        "total_deals": total,
        "open_deals": len(open_deals),
        "won_deals": len(won_deals),
        "lost_deals": len(lost_deals),
        "total_pipeline_value": total_pipeline_value,
        "total_won_value": total_won_value,
        "win_rate_pct": win_rate,
        "by_stage": stage_breakdown,
    }


@router.get("/deals/{deal_id}")
async def get_deal(
    deal_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("deals")
        .select("*, contacts(id, name, phone, email, lead_score, lead_score_tier), pipeline_stages(id, name, color, position)")
        .eq("id", deal_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Deal not found")
    return res.data


@router.post("/deals", status_code=201)
async def create_deal(
    body: DealCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    data["account_id"] = user["account_id"]

    if data.get("stage_id"):
        stage_res = db.table("pipeline_stages").select("name").eq("id", data["stage_id"]).limit(1).execute()
        if stage_res.data:
            stage_name = stage_res.data[0].get("name", "").lower()
            if stage_name == "won":
                data["status"] = "won"
            elif stage_name == "lost":
                data["status"] = "lost"
            else:
                data["status"] = "open"
    else:
        data["status"] = "open"

    res = db.table("deals").insert(data).execute()
    deal = res.data[0] if res.data else {}
    _audit(db, user["account_id"], user["user_id"], "deal.created",
           "deal", deal.get("id"),
           metadata={"title": body.title, "value": body.value, "currency": body.currency})
    return deal


@router.patch("/deals/{deal_id}")
async def update_deal(
    deal_id: str,
    body: DealUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    if data.get("stage_id"):
        stage_res = db.table("pipeline_stages").select("name").eq("id", data["stage_id"]).limit(1).execute()
        if stage_res.data:
            stage_name = stage_res.data[0].get("name", "").lower()
            if stage_name == "won":
                data["status"] = "won"
            elif stage_name == "lost":
                data["status"] = "lost"
            else:
                data.setdefault("status", "open")

    res = (
        db.table("deals")
        .update(data)
        .eq("id", deal_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Deal not found")
    _audit(db, user["account_id"], user["user_id"], "deal.updated",
           "deal", deal_id, metadata={k: v for k, v in data.items() if k != "notes"})
    return res.data[0]


@router.delete("/deals/{deal_id}", status_code=204)
async def delete_deal(
    deal_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("deals").delete().eq("id", deal_id).eq("account_id", user["account_id"]).execute()
    _audit(db, user["account_id"], user["user_id"], "deal.deleted",
           "deal", deal_id)


@router.patch("/deals/{deal_id}/move")
async def move_deal_stage(
    deal_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    new_stage_id = body.get("stage_id")
    if not new_stage_id:
        raise HTTPException(status_code=400, detail="stage_id is required")

    stage_res = db.table("pipeline_stages").select("name").eq("id", new_stage_id).eq("account_id", user["account_id"]).limit(1).execute()
    if not stage_res.data:
        raise HTTPException(status_code=404, detail="Stage not found")

    stage_name = stage_res.data[0].get("name", "").lower()
    new_status = "won" if stage_name == "won" else "lost" if stage_name == "lost" else "open"

    res = (
        db.table("deals")
        .update({"stage_id": new_stage_id, "status": new_status})
        .eq("id", deal_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Deal not found")
    _audit(db, user["account_id"], user["user_id"], "deal.stage_moved",
           "deal", deal_id,
           metadata={"stage_id": new_stage_id, "status": new_status})
    return res.data[0]
