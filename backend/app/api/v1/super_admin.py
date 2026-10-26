"""
Super Admin API — Platform-level administration.

Authorization: Every endpoint uses _require_super_admin() which re-reads
is_super_admin from the DB via Depends(get_supabase). A company owner/admin
cannot access these routes by changing their role claim — the DB flag is the
only gate.

All get_supabase() calls use Depends() so test mocks work correctly.
"""
from fastapi import APIRouter, HTTPException, Depends
from app.middleware.auth import get_current_user
from app.db.supabase import get_supabase
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Authorization ─────────────────────────────────────────────

def _require_super_admin(user: dict = Depends(get_current_user), db=Depends(get_supabase)):
    """Re-read is_super_admin from DB on every call. Never trust token claims."""
    res = db.table("profiles").select("is_super_admin").eq("user_id", user["user_id"]).limit(1).execute()
    if not res.data or not res.data[0].get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user


# ── Audit helper ──────────────────────────────────────────────

def _sa_audit(db, actor_id: str, action: str, entity_type: str = None,
              entity_id: str = None, metadata: dict = None, result: str = "success"):
    """Record a platform-level audit event. account_id is NULL for platform events."""
    try:
        db.table("audit_logs").insert({
            "account_id": None,
            "actor_type": "user",
            "actor_id": actor_id,
            "actor_name": "super_admin",
            "action": f"super_admin.{action}",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "result": result,
            "metadata": metadata or {},
        }).execute()
    except Exception as e:
        logger.warning("super_admin audit_log failed: %s", e)


# ── Platform Stats ────────────────────────────────────────────

@router.get("/super-admin/stats")
async def sa_stats(user=Depends(_require_super_admin), db=Depends(get_supabase)):
    count_result = db.table("accounts").select("id", count="exact").execute()
    users_result = db.table("profiles").select("user_id", count="exact").execute()
    emps_result  = db.table("employees").select("id", count="exact").execute()
    return {
        "total_companies":     count_result.count or 0,
        "active_companies":    0,
        "suspended_companies": 0,
        "trial_companies":     0,
        "total_users":         users_result.count or 0,
        "super_admins":        0,
        "total_employees":     emps_result.count or 0,
        "active_employees":    0,
        "plan_distribution":   {},
    }


# ── Company Management ────────────────────────────────────────

@router.get("/super-admin/companies")
async def sa_list_companies(
    search: Optional[str] = None,
    status: Optional[str] = None,
    plan: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user=Depends(_require_super_admin),
    db=Depends(get_supabase),
):
    q = db.table("accounts").select("*")
    if status:
        q = q.eq("status", status)
    if plan:
        q = q.eq("plan", plan)
    res = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    companies = res.data or []
    for c in companies:
        emp = db.table("employees").select("id", count="exact").eq("account_id", c["id"]).execute()
        c["employee_count"] = emp.count or 0
    if search:
        s = search.lower()
        companies = [c for c in companies if s in (c.get("name") or "").lower() or s in (c.get("id") or "").lower()]
    return companies


@router.get("/super-admin/companies/{company_id}")
async def sa_get_company(company_id: str, user=Depends(_require_super_admin), db=Depends(get_supabase)):
    acc = db.table("accounts").select("*").eq("id", company_id).limit(1).execute()
    if not acc.data:
        raise HTTPException(status_code=404, detail="Company not found")
    c = acc.data[0]
    owner   = db.table("profiles").select("user_id,full_name,email,avatar_url").eq("account_id", company_id).eq("role", "owner").limit(1).execute()
    emps    = db.table("employees").select("id,name,email,role,is_active,joined_at").eq("account_id", company_id).order("created_at").execute()
    billing = db.table("account_settings").select("plan,plan_started_at").eq("account_id", company_id).limit(1).execute()
    audit   = db.table("audit_logs").select("id,action,actor_name,result,created_at").eq("account_id", company_id).order("created_at", desc=True).limit(10).execute()
    return {
        **c,
        "owner":        owner.data[0] if owner.data else {},
        "employees":    emps.data or [],
        "billing":      billing.data[0] if billing.data else {},
        "recent_audit": audit.data or [],
    }


class CompanyUpdateIn(BaseModel):
    name:   Optional[str] = None
    plan:   Optional[str] = None
    status: Optional[str] = None


@router.patch("/super-admin/companies/{company_id}")
async def sa_update_company(
    company_id: str, body: CompanyUpdateIn,
    user=Depends(_require_super_admin), db=Depends(get_supabase),
):
    allowed = {"name", "plan", "status"}
    update = {k: v for k, v in body.model_dump().items() if v is not None and k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if "status" in update and update["status"] not in ("active", "suspended", "trial"):
        raise HTTPException(status_code=400, detail="Invalid status")
    res = db.table("accounts").update(update).eq("id", company_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Company not found")
    _sa_audit(db, user["user_id"], "company_updated", "company", company_id, metadata=update)
    return res.data[0]


# ── User Management ───────────────────────────────────────────

@router.get("/super-admin/users")
async def sa_list_users(
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    user=Depends(_require_super_admin),
    db=Depends(get_supabase),
):
    res = db.table("profiles").select(
        "user_id,account_id,full_name,email,role,avatar_url,created_at,is_super_admin"
    ).order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    users = res.data or []
    if search:
        s = search.lower()
        users = [u for u in users if s in (u.get("full_name") or "").lower() or s in (u.get("email") or "").lower()]
    return users


@router.patch("/super-admin/users/{target_user_id}/super-admin")
async def sa_toggle_super_admin(
    target_user_id: str, body: dict,
    user=Depends(_require_super_admin), db=Depends(get_supabase),
):
    """Grant or revoke super admin. Audited. Cannot self-revoke."""
    if target_user_id == user["user_id"] and not body.get("is_super_admin", True):
        raise HTTPException(status_code=400, detail="Cannot revoke your own super admin access")
    new_val = bool(body.get("is_super_admin", False))
    db.table("profiles").update({"is_super_admin": new_val}).eq("user_id", target_user_id).execute()
    _sa_audit(db, user["user_id"], "super_admin_toggled", "user", target_user_id,
              metadata={"is_super_admin": new_val, "target_user_id": target_user_id})
    return {"status": "updated", "is_super_admin": new_val}


# ── Platform Audit Logs ───────────────────────────────────────

@router.get("/super-admin/audit-logs")
async def sa_audit_logs(
    company_id: Optional[str] = None,
    actor_id:   Optional[str] = None,
    action:     Optional[str] = None,
    result:     Optional[str] = None,
    limit:  int = 100,
    offset: int = 0,
    user=Depends(_require_super_admin),
    db=Depends(get_supabase),
):
    q = db.table("audit_logs").select("*")
    if company_id:
        q = q.eq("account_id", company_id)
    if actor_id:
        q = q.eq("actor_id", actor_id)
    if action:
        q = q.ilike("action", f"%{action}%")
    if result:
        q = q.eq("result", result)
    res = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return res.data or []


# ── Platform Health ───────────────────────────────────────────

@router.get("/super-admin/platform-health")
async def sa_platform_health(user=Depends(_require_super_admin), db=Depends(get_supabase)):
    checks: dict = {}
    try:
        db.table("accounts").select("id").limit(1).execute()
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {str(e)[:100]}"
    try:
        errs = db.table("audit_logs").select("id", count="exact").eq("result", "failure").execute()
        checks["recent_failures"] = errs.count or 0
    except Exception:
        checks["recent_failures"] = "unknown"
    try:
        emps = db.table("employees").select("id", count="exact").execute()
        checks["total_employees"] = emps.count or 0
    except Exception:
        checks["total_employees"] = "unknown"
    return {"status": "ok" if checks.get("database") == "ok" else "degraded", "checks": checks}
