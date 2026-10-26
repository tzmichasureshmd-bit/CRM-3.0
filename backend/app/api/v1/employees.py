"""
Employees, Invitations, Audit Logs, Super Admin
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from app.middleware.auth import get_current_user, require_role
from app.db.supabase import get_supabase
from pydantic import BaseModel
from typing import Optional
import hashlib, secrets, logging

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Helpers ───────────────────────────────────────────────────

def _audit(db, account_id: str, actor_id: str, actor_name: str,
           action: str, entity_type: str = None, entity_id: str = None,
           result: str = "success", metadata: dict = None):
    try:
        db.table("audit_logs").insert({
            "account_id": account_id, "actor_id": actor_id,
            "actor_name": actor_name, "action": action,
            "entity_type": entity_type, "entity_id": entity_id,
            "result": result, "metadata": metadata or {},
        }).execute()
    except Exception as e:
        logger.warning("audit_log failed: %s", e)


def _require_super_admin(user=Depends(get_current_user)):
    db = get_supabase()
    res = db.table("profiles").select("is_super_admin").eq("user_id", user["user_id"]).limit(1).execute()
    if not res.data or not res.data[0].get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Super admin only")
    return user


# ── Employee Models ───────────────────────────────────────────

class EmployeeIn(BaseModel):
    name: str
    email: str
    role: str = "agent"
    channel_permissions: Optional[dict] = None
    can_view_conversations: bool = True
    can_reply_messages: bool = True
    can_manage_contacts: bool = False
    can_assign_conversations: bool = False
    can_access_reports: bool = False
    can_manage_integrations: bool = False
    can_invite_employees: bool = False
    can_view_audit_logs: bool = False


# ── Employees CRUD ────────────────────────────────────────────

@router.get("/employees")
async def list_employees(user=Depends(get_current_user)):
    db = get_supabase()
    res = db.table("employees").select("*").eq("account_id", user["account_id"]).order("created_at").execute()
    return res.data or []


@router.post("/employees", status_code=201)
async def create_employee(body: EmployeeIn, user=Depends(get_current_user)):
    db = get_supabase()
    perms = body.channel_permissions or {
        "whatsapp": True, "instagram": True,
        "facebook": True, "email": True, "telegram": True,
    }
    try:
        res = db.table("employees").insert({
            "account_id": user["account_id"],
            "name": body.name, "email": body.email.lower().strip(),
            "role": body.role, "channel_permissions": perms,
            "can_view_conversations": body.can_view_conversations,
            "can_reply_messages": body.can_reply_messages,
            "can_manage_contacts": body.can_manage_contacts,
            "can_assign_conversations": body.can_assign_conversations,
            "can_access_reports": body.can_access_reports,
            "can_manage_integrations": body.can_manage_integrations,
            "can_invite_employees": body.can_invite_employees,
            "can_view_audit_logs": body.can_view_audit_logs,
        }).execute()
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Employee with this email already exists")
        raise HTTPException(status_code=400, detail=str(e))
    emp = res.data[0]
    _audit(db, user["account_id"], user["user_id"], "", "employee.created",
           "employee", emp["id"], metadata={"email": body.email, "role": body.role})
    return emp


@router.patch("/employees/{employee_id}")
async def update_employee(employee_id: str, body: dict, user=Depends(get_current_user)):
    db = get_supabase()
    allowed = {"name", "role", "channel_permissions", "can_view_conversations",
               "can_reply_messages", "can_manage_contacts", "can_assign_conversations",
               "can_access_reports", "can_manage_integrations", "can_invite_employees",
               "can_view_audit_logs", "is_active"}
    update = {k: v for k, v in body.items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = db.table("employees").update(update)\
        .eq("id", employee_id).eq("account_id", user["account_id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    _audit(db, user["account_id"], user["user_id"], "", "employee.updated",
           "employee", employee_id, metadata=update)
    return res.data[0]


@router.delete("/employees/{employee_id}")
async def delete_employee(employee_id: str, user=Depends(get_current_user)):
    db = get_supabase()
    db.table("employees").delete()\
        .eq("id", employee_id).eq("account_id", user["account_id"]).execute()
    _audit(db, user["account_id"], user["user_id"], "", "employee.deleted",
           "employee", employee_id)
    return {"status": "deleted"}


# ── Invitations ───────────────────────────────────────────────

@router.post("/employees/invite", status_code=201)
async def invite_employee(body: dict, user=Depends(get_current_user)):
    db = get_supabase()
    email = body.get("email", "").lower().strip()
    role  = body.get("role", "agent")
    if not email:
        raise HTTPException(status_code=400, detail="email required")
    token      = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    res = db.table("employee_invitations").insert({
        "account_id": user["account_id"], "email": email,
        "role": role, "token_hash": token_hash,
        "invited_by": user["user_id"],
    }).execute()
    _audit(db, user["account_id"], user["user_id"], "", "invitation.sent",
           "invitation", res.data[0]["id"] if res.data else None,
           metadata={"email": email, "role": role})
    # Return token so frontend can build invite link (email sending is separate)
    return {"status": "invited", "token": token, "email": email}


@router.get("/employees/invitations")
async def list_invitations(user=Depends(get_current_user)):
    db = get_supabase()
    res = db.table("employee_invitations").select("id,email,role,status,expires_at,created_at")\
        .eq("account_id", user["account_id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.delete("/employees/invitations/{inv_id}")
async def revoke_invitation(inv_id: str, user=Depends(get_current_user)):
    db = get_supabase()
    db.table("employee_invitations").update({"status": "revoked"})\
        .eq("id", inv_id).eq("account_id", user["account_id"]).execute()
    _audit(db, user["account_id"], user["user_id"], "", "invitation.revoked",
           "invitation", inv_id)
    return {"status": "revoked"}


# ── Audit Logs ────────────────────────────────────────────────

@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = 50, offset: int = 0,
    action: Optional[str] = None,
    user=Depends(get_current_user)
):
    db = get_supabase()
    q = db.table("audit_logs").select("*").eq("account_id", user["account_id"])
    if action:
        q = q.eq("action", action)
    res = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return res.data or []


# ── Super Admin ───────────────────────────────────────────────

@router.get("/admin/stats")
async def admin_stats(user=Depends(_require_super_admin)):
    db = get_supabase()
    tenants = db.table("accounts").select("id", count="exact").execute()
    users   = db.table("profiles").select("user_id", count="exact").execute()
    emps    = db.table("employees").select("id", count="exact").execute()
    return {
        "total_tenants":   tenants.count or 0,
        "total_users":     users.count or 0,
        "total_employees": emps.count or 0,
    }


@router.get("/admin/tenants")
async def admin_tenants(user=Depends(_require_super_admin)):
    db = get_supabase()
    res = db.table("accounts").select("*").order("created_at", desc=True).execute()
    return res.data or []


@router.patch("/admin/tenants/{account_id}")
async def admin_update_tenant(account_id: str, body: dict, user=Depends(_require_super_admin)):
    db = get_supabase()
    allowed = {"name", "plan", "status"}
    update  = {k: v for k, v in body.items() if k in allowed}
    res = db.table("accounts").update(update).eq("id", account_id).execute()
    return res.data[0] if res.data else {}


@router.get("/admin/users")
async def admin_users(user=Depends(_require_super_admin)):
    db = get_supabase()
    res = db.table("profiles").select("user_id,account_id,full_name,email,role,avatar_url,created_at,is_super_admin")\
        .order("created_at", desc=True).execute()
    return res.data or []


@router.patch("/admin/users/{user_id}/super-admin")
async def toggle_super_admin(user_id: str, body: dict, user=Depends(_require_super_admin)):
    db = get_supabase()
    db.table("profiles").update({"is_super_admin": body.get("is_super_admin", False)})\
        .eq("user_id", user_id).execute()
    return {"status": "updated"}
