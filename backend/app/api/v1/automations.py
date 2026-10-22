from fastapi import APIRouter, Depends, Query
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/automations")
async def list_automations(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("automations")
        .select("*")
        .eq("account_id", user["account_id"])
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": res.data or []}


@router.get("/automations/{automation_id}/logs")
async def get_automation_logs(
    automation_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    offset = (page - 1) * limit
    res = (
        db.table("automation_logs")
        .select("*", count="exact")
        .eq("automation_id", automation_id)
        .eq("account_id", user["account_id"])
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"data": res.data or [], "total": res.count or 0}


@router.patch("/automations/{automation_id}/toggle")
async def toggle_automation(
    automation_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    is_active = body.get("is_active", True)
    res = (
        db.table("automations")
        .update({"is_active": is_active})
        .eq("id", automation_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    return res.data[0] if res.data else {}


@router.post("/automations", status_code=201)
async def create_automation(
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    body["account_id"] = user["account_id"]
    body.setdefault("status", "draft")
    body.setdefault("is_active", False)
    res = db.table("automations").insert(body).execute()
    return res.data[0] if res.data else {}


@router.delete("/automations/{automation_id}", status_code=204)
async def delete_automation(
    automation_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("automations").delete().eq("id", automation_id).eq("account_id", user["account_id"]).execute()


# ── Pure helper functions (used by tests and engine) ─────────────────────────

KNOWN_ACTIONS = {
    "send_message", "send_welcome_message", "send_list", "add_tag",
    "remove_tag", "assign_contact", "update_lead_status",
    "update_contact_field", "create_follow_up", "add_note",
    "send_notification", "webhook", "run_ai_agent",
}


def validate_automation_steps(steps: list) -> "str | None":
    """Return an error string if steps are invalid, else None."""
    for step in steps:
        st = step.get("step_type", "")
        cfg = step.get("config", {})
        if st == "condition":
            if not cfg.get("conditions") and not cfg.get("field"):
                return "A condition step is missing its configuration."
        elif st == "wait":
            if not cfg.get("amount") or not cfg.get("unit"):
                return "A wait step is missing its delay."
        elif st == "end":
            continue
        else:
            action = cfg.get("action", st)
            if action not in KNOWN_ACTIONS:
                return f"Unknown action \"{action}\"."
    return None


def handle_duplicate_event_key(pg_error_code: str) -> dict:
    """Return duplicate result when Postgres unique violation is detected."""
    if pg_error_code == "23505":
        return {"duplicate": True, "executions": 0, "results": []}
    return {"duplicate": False, "executions": 0, "results": []}


def evaluate_condition(field_value, operator: str, value) -> bool:
    """Evaluate a single condition clause."""
    try:
        if operator == "eq":
            return str(field_value).lower() == str(value).lower()
        if operator == "neq":
            return str(field_value).lower() != str(value).lower()
        if operator == "gt":
            return float(field_value) > float(value)
        if operator == "gte":
            return float(field_value) >= float(value)
        if operator == "lt":
            return float(field_value) < float(value)
        if operator == "lte":
            return float(field_value) <= float(value)
        if operator == "contains":
            return str(value).lower() in str(field_value).lower()
        if operator == "not_contains":
            return str(value).lower() not in str(field_value).lower()
        if operator == "in":
            vals = [v.strip() for v in str(value).split(",")] if isinstance(value, str) else list(value)
            return str(field_value) in vals
        if operator == "exists":
            return field_value is not None and field_value != ""
        if operator == "not_exists":
            return field_value is None or field_value == ""
    except (TypeError, ValueError):
        return False
    return False


def is_safe_webhook_url(url: str) -> bool:
    """Return True only for safe public URLs (SSRF guard)."""
    try:
        from urllib.parse import urlparse
        import ipaddress
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        host = parsed.hostname or ""
        if host in ("localhost", "metadata.google.internal"):
            return False
        if host.endswith(".localhost"):
            return False
        try:
            addr = ipaddress.ip_address(host)
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
                return False
        except ValueError:
            pass
        return True
    except Exception:
        return False


def build_wait_job_payload(
    automation_id: str,
    execution_id: str,
    contact_id: str,
    next_step_index: int,
    amount: int,
    unit: str,
) -> dict:
    """Build the scheduled job row for a wait step."""
    from datetime import datetime, timezone, timedelta
    unit_seconds = {"minutes": 60, "hours": 3600, "days": 86400}
    seconds = amount * unit_seconds.get(unit, 3600)
    run_at = (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()
    return {
        "automation_id": automation_id,
        "execution_id": execution_id,
        "contact_id": contact_id,
        "job_type": "resume_automation",
        "next_step_index": next_step_index,
        "run_at": run_at,
        "status": "pending",
    }


def compute_backoff_minutes(attempt: int) -> int:
    """Exponential backoff: 1, 2, 4, 8 … minutes."""
    return max(1, 2 ** attempt)


def check_automation_ownership(automation_account_id: str, requesting_account_id: str) -> bool:
    return automation_account_id == requesting_account_id


def should_execute_automation(automation: dict) -> bool:
    return automation.get("status") == "active" and automation.get("is_active", False) is not False
