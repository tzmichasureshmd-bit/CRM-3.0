from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()

VALID_STATUSES = {"draft", "running", "paused", "completed"}
VALID_METRICS = {"click_rate", "conversion_rate", "open_rate", "reply_rate", "revenue"}
VALID_EVENT_TYPES = {"exposure", "conversion"}
VALID_TRANSITIONS = {
    "draft": {"running"},
    "running": {"paused", "completed"},
    "paused": {"running", "completed"},
    "completed": set(),
}
MIN_EXPOSURES = 100  # minimum per variant before conclusions are valid


class VariantDef(BaseModel):
    name: str
    description: Optional[str] = None


class ExperimentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    metric: str = "conversion_rate"
    variants: List[VariantDef] = []


class ExperimentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    winner_variant: Optional[str] = None


class ExperimentEvent(BaseModel):
    variant: str
    event_type: str
    contact_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@router.get("/experiments")
async def list_experiments(
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if status and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(VALID_STATUSES)}")

    q = (
        db.table("crm3_experiments")
        .select("id, name, description, status, metric, variants, started_at, ended_at, winner_variant, created_at", count="exact")
        .eq("account_id", user["account_id"])
    )
    if status:
        q = q.eq("status", status)

    res = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    experiments = res.data or []

    # Attach live stats to each experiment
    for exp in experiments:
        events_res = (
            db.table("crm3_experiment_events")
            .select("variant, event_type")
            .eq("experiment_id", exp["id"])
            .eq("account_id", user["account_id"])
            .execute()
        )
        stats: Dict[str, Dict] = {}
        for ev in (events_res.data or []):
            v = ev["variant"]
            if v not in stats:
                stats[v] = {"exposures": 0, "conversions": 0, "rate": 0.0}
            if ev["event_type"] == "exposure":
                stats[v]["exposures"] += 1
            elif ev["event_type"] == "conversion":
                stats[v]["conversions"] += 1
        for v in stats:
            exp_count = stats[v]["exposures"]
            stats[v]["rate"] = round(stats[v]["conversions"] / exp_count * 100, 2) if exp_count > 0 else 0.0

        exp["stats"] = stats
        exp["has_enough_data"] = all(s["exposures"] >= MIN_EXPOSURES for s in stats.values()) if stats else False
        exp["min_exposures_required"] = MIN_EXPOSURES

    return {"data": experiments, "total": res.count or 0}


@router.get("/experiments/{experiment_id}")
async def get_experiment(
    experiment_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("crm3_experiments")
        .select("*")
        .eq("id", experiment_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return res.data


@router.post("/experiments", status_code=201)
async def create_experiment(
    body: ExperimentCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    if body.metric not in VALID_METRICS:
        raise HTTPException(status_code=400, detail=f"metric must be one of: {', '.join(VALID_METRICS)}")

    variants = body.variants if body.variants else [VariantDef(name="control"), VariantDef(name="variant_a")]
    if len(variants) < 2:
        raise HTTPException(status_code=400, detail="At least 2 variants required (e.g. control + variant_a)")
    if len(variants) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 variants per experiment")
    for v in variants:
        if not v.name.strip():
            raise HTTPException(status_code=400, detail="Each variant must have a name")

    data = {
        "account_id": user["account_id"],
        "created_by": user["user_id"],
        "name": body.name.strip(),
        "description": body.description,
        "metric": body.metric,
        "variants": [{"name": v.name.strip(), "description": v.description} for v in variants],
        "status": "draft",
    }
    res = db.table("crm3_experiments").insert(data).execute()
    return res.data[0] if res.data else {}


@router.patch("/experiments/{experiment_id}")
async def update_experiment(
    experiment_id: str,
    body: ExperimentUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    current_res = (
        db.table("crm3_experiments")
        .select("status, variants")
        .eq("id", experiment_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not current_res.data:
        raise HTTPException(status_code=404, detail="Experiment not found")

    current = current_res.data
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "status" in data:
        if data["status"] not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(VALID_STATUSES)}")
        allowed = VALID_TRANSITIONS.get(current["status"], set())
        if data["status"] not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from '{current['status']}' to '{data['status']}'. Allowed: {', '.join(allowed) or 'none'}"
            )
        if data["status"] == "running" and not current.get("started_at"):
            from datetime import datetime, timezone
            data["started_at"] = datetime.now(timezone.utc).isoformat()
        if data["status"] == "completed":
            from datetime import datetime, timezone
            data["ended_at"] = datetime.now(timezone.utc).isoformat()

    if "winner_variant" in data:
        variant_names = [v["name"] for v in (current.get("variants") or [])]
        if data["winner_variant"] not in variant_names:
            raise HTTPException(status_code=400, detail=f"winner_variant must be one of: {', '.join(variant_names)}")

    res = (
        db.table("crm3_experiments")
        .update(data)
        .eq("id", experiment_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Update failed")
    return res.data[0]


@router.delete("/experiments/{experiment_id}", status_code=204)
async def delete_experiment(
    experiment_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    current_res = (
        db.table("crm3_experiments")
        .select("status")
        .eq("id", experiment_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not current_res.data:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if current_res.data["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft experiments can be deleted")
    db.table("crm3_experiments").delete().eq("id", experiment_id).eq("account_id", user["account_id"]).execute()


@router.post("/experiments/{experiment_id}/events", status_code=201)
async def record_experiment_event(
    experiment_id: str,
    body: ExperimentEvent,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if body.event_type not in VALID_EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"event_type must be one of: {', '.join(VALID_EVENT_TYPES)}")

    exp_res = (
        db.table("crm3_experiments")
        .select("status, variants")
        .eq("id", experiment_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not exp_res.data:
        raise HTTPException(status_code=404, detail="Experiment not found")
    if exp_res.data["status"] != "running":
        raise HTTPException(status_code=400, detail=f"Experiment is not running (status: {exp_res.data['status']})")

    variant_names = [v["name"] for v in (exp_res.data.get("variants") or [])]
    if body.variant not in variant_names:
        raise HTTPException(status_code=400, detail=f"variant must be one of: {', '.join(variant_names)}")

    # Dedup: one exposure per contact per experiment
    if body.event_type == "exposure" and body.contact_id:
        existing = (
            db.table("crm3_experiment_events")
            .select("id")
            .eq("experiment_id", experiment_id)
            .eq("account_id", user["account_id"])
            .eq("contact_id", body.contact_id)
            .eq("event_type", "exposure")
            .limit(1)
            .execute()
        )
        if existing.data:
            return {"skipped": True, "reason": "Contact already exposed to this experiment"}

    # Conversion requires prior exposure
    if body.event_type == "conversion" and body.contact_id:
        prior = (
            db.table("crm3_experiment_events")
            .select("id")
            .eq("experiment_id", experiment_id)
            .eq("account_id", user["account_id"])
            .eq("contact_id", body.contact_id)
            .eq("event_type", "exposure")
            .limit(1)
            .execute()
        )
        if not prior.data:
            raise HTTPException(status_code=400, detail="Cannot record conversion without prior exposure")

    data = {
        "account_id": user["account_id"],
        "experiment_id": experiment_id,
        "variant": body.variant,
        "event_type": body.event_type,
        "contact_id": body.contact_id,
        "metadata": body.metadata or {},
    }
    res = db.table("crm3_experiment_events").insert(data).execute()
    return res.data[0] if res.data else {}
