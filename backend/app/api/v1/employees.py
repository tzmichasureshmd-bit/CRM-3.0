"""
Employees, Invitations, Audit Logs, Super Admin (legacy /admin/* routes)
All DB access uses Depends(get_supabase) so test mocks work correctly.
"""
from fastapi import APIRouter, HTTPException, Depends
from app.middleware.auth import get_current_user
from app.db.supabase import get_supabase
from pydantic import BaseModel
from typing import Optional
import hashlib, secrets, logging

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────

def _audit(db, account_id, actor_id, actor_name, action,
           entity_type=None, entity_id=None, result="success", metadata=None):
    try:
        db.table("audit_logs").insert({
            "account_id": account_id, "actor_id": actor_id,
            "actor_name": actor_name, "action": action,
            "entity_type": entity_type, "entity_id": entity_id,
            "result": result, "metadata": metadata or {},
        }).execute()
    except Exception as e:
        logger.warning("audit_log failed: %s", e)


def _require_super_admin(user: dict = Depends(get_current_user), db=Depends(get_supabase)):
    """DB-verified super admin check. Never trusts token claims."""
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
async def list_employees(user=Depends(get_current_user), db=Depends(get_supabase)):
    res = db.table("employees").select("*").eq("account_id", user["account_id"]).order("created_at").execute()
    return res.data or []


@router.post("/employees", status_code=201)
async def create_employee(body: EmployeeIn, user=Depends(get_current_user), db=Depends(get_supabase)):
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
async def update_employee(employee_id: str, body: dict, user=Depends(get_current_user), db=Depends(get_supabase)):
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
async def delete_employee(employee_id: str, user=Depends(get_current_user), db=Depends(get_supabase)):
    db.table("employees").delete()\
        .eq("id", employee_id).eq("account_id", user["account_id"]).execute()
    _audit(db, user["account_id"], user["user_id"], "", "employee.deleted",
           "employee", employee_id)
    return {"status": "deleted"}


# ── Invitations ───────────────────────────────────────────────

@router.post("/employees/invite", status_code=201)
async def invite_employee(body: dict, user=Depends(get_current_user), db=Depends(get_supabase)):
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
    return {"status": "invited", "token": token, "email": email}


@router.get("/employees/invitations")
async def list_invitations(user=Depends(get_current_user), db=Depends(get_supabase)):
    res = db.table("employee_invitations").select("id,email,role,status,expires_at,created_at")\
        .eq("account_id", user["account_id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.delete("/employees/invitations/{inv_id}")
async def revoke_invitation(inv_id: str, user=Depends(get_current_user), db=Depends(get_supabase)):
    db.table("employee_invitations").update({"status": "revoked"})\
        .eq("id", inv_id).eq("account_id", user["account_id"]).execute()
    _audit(db, user["account_id"], user["user_id"], "", "invitation.revoked",
           "invitation", inv_id)
    return {"status": "revoked"}


# ── Invitation Accept (public — token IS the credential) ──────

@router.post("/employees/invitations/accept")
async def accept_invitation(body: dict, db=Depends(get_supabase)):
    token = body.get("token", "")
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    inv = db.table("employee_invitations").select("*").eq("token_hash", token_hash)\
        .eq("status", "pending").limit(1).execute()
    if not inv.data:
        raise HTTPException(status_code=404, detail="Invitation not found or already used")
    i = inv.data[0]
    from datetime import datetime, timezone
    expires = datetime.fromisoformat(i["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires:
        db.table("employee_invitations").update({"status": "expired"}).eq("id", i["id"]).execute()
        raise HTTPException(status_code=410, detail="Invitation has expired")
    db.table("employee_invitations").update({"status": "accepted", "accepted_at": "now()"}).eq("id", i["id"]).execute()
    _audit(db, i["account_id"], i.get("invited_by") or "", "", "invitation.accepted",
           "invitation", i["id"], metadata={"email": i["email"]})
    return {"status": "accepted", "email": i["email"], "role": i["role"], "account_id": i["account_id"]}


@router.get("/employees/invitations/by-token")
async def get_invitation_by_token(token: str, db=Depends(get_supabase)):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    inv = db.table("employee_invitations").select("id,email,role,status,expires_at,account_id")\
        .eq("token_hash", token_hash).limit(1).execute()
    if not inv.data:
        raise HTTPException(status_code=404, detail="Invitation not found")
    i = inv.data[0]
    acc = db.table("accounts").select("name").eq("id", i["account_id"]).limit(1).execute()
    company_name = acc.data[0]["name"] if acc.data else ""
    return {**i, "company_name": company_name}


# ── Audit Logs ────────────────────────────────────────────────

@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = 50, offset: int = 0,
    action: Optional[str] = None,
    user=Depends(get_current_user), db=Depends(get_supabase),
):
    q = db.table("audit_logs").select("*").eq("account_id", user["account_id"])
    if action:
        q = q.eq("action", action)
    res = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return res.data or []


# ── Super Admin (legacy /admin/* routes) ──────────────────────

@router.get("/admin/stats")
async def admin_stats(user=Depends(_require_super_admin), db=Depends(get_supabase)):
    tenants = db.table("accounts").select("id", count="exact").execute()
    users   = db.table("profiles").select("user_id", count="exact").execute()
    emps    = db.table("employees").select("id", count="exact").execute()
    return {
        "total_tenants":   tenants.count or 0,
        "total_users":     users.count or 0,
        "total_employees": emps.count or 0,
    }


@router.get("/admin/tenants")
async def admin_tenants(user=Depends(_require_super_admin), db=Depends(get_supabase)):
    res = db.table("accounts").select("*").order("created_at", desc=True).execute()
    return res.data or []


@router.patch("/admin/tenants/{account_id}")
async def admin_update_tenant(account_id: str, body: dict, user=Depends(_require_super_admin), db=Depends(get_supabase)):
    allowed = {"name", "plan", "status"}
    update  = {k: v for k, v in body.items() if k in allowed}
    res = db.table("accounts").update(update).eq("id", account_id).execute()
    _audit(db, account_id, user["user_id"], "super_admin", "super_admin.company_updated",
           "company", account_id, metadata=update)
    return res.data[0] if res.data else {}


@router.get("/admin/users")
async def admin_users(user=Depends(_require_super_admin), db=Depends(get_supabase)):
    res = db.table("profiles").select("user_id,account_id,full_name,email,role,avatar_url,created_at,is_super_admin")\
        .order("created_at", desc=True).execute()
    return res.data or []


@router.patch("/admin/users/{user_id}/super-admin")
async def toggle_super_admin(user_id: str, body: dict, user=Depends(_require_super_admin), db=Depends(get_supabase)):
    new_val = bool(body.get("is_super_admin", False))
    db.table("profiles").update({"is_super_admin": new_val}).eq("user_id", user_id).execute()
    _audit(db, user["account_id"], user["user_id"], "super_admin", "super_admin.privilege_toggled",
           "user", user_id, metadata={"is_super_admin": new_val, "target_user_id": user_id})
    return {"status": "updated"}


# ── Company Profile ───────────────────────────────────────────

class CompanyProfileIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None


@router.get("/company/profile")
async def get_company_profile(user=Depends(get_current_user), db=Depends(get_supabase)):
    acc = db.table("accounts").select("*").eq("id", user["account_id"]).limit(1).execute()
    if not acc.data:
        raise HTTPException(status_code=404, detail="Company not found")
    a = acc.data[0]
    emp_count = db.table("employees").select("id", count="exact").eq("account_id", user["account_id"]).eq("is_active", True).execute()
    owner = db.table("profiles").select("full_name,email,avatar_url").eq("account_id", user["account_id"]).eq("role", "owner").limit(1).execute()
    return {
        "id": a["id"], "name": a.get("name", ""), "plan": a.get("plan", "free"),
        "status": a.get("status", "active"), "currency": a.get("currency", "USD"),
        "email": a.get("email", ""), "phone": a.get("phone", ""),
        "website": a.get("website", ""), "industry": a.get("industry", ""),
        "description": a.get("description", ""), "logo_url": a.get("logo_url", ""),
        "address": a.get("address", ""), "created_at": a.get("created_at", ""),
        "active_employees": emp_count.count or 0,
        "connected_integrations": 0,
        "owner": owner.data[0] if owner.data else {},
    }


@router.patch("/company/profile")
async def update_company_profile(body: CompanyProfileIn, user=Depends(get_current_user), db=Depends(get_supabase)):
    # Re-read role from DB — never trust token claims for authorization
    profile = db.table("profiles").select("role").eq("user_id", user["user_id"]).limit(1).execute()
    role = profile.data[0]["role"] if profile.data else "agent"
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owner or admin can update company profile")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = db.table("accounts").update(update).eq("id", user["account_id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Company not found")
    _audit(db, user["account_id"], user["user_id"], "", "company.profile_updated",
           "company", user["account_id"], metadata=update)
    return res.data[0]


# ── Join Requests ─────────────────────────────────────────────

class JoinRequestIn(BaseModel):
    company_id: str
    message: Optional[str] = None


@router.post("/join-requests", status_code=201)
async def create_join_request(body: JoinRequestIn, user=Depends(get_current_user), db=Depends(get_supabase)):
    acc = db.table("accounts").select("id").eq("id", body.company_id).limit(1).execute()
    if not acc.data:
        raise HTTPException(status_code=404, detail="Company not found")
    existing = db.table("join_requests").select("id,status").eq("account_id", body.company_id)\
        .eq("requester_id", user["user_id"]).eq("status", "pending").limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="You already have a pending request for this company")
    profile = db.table("profiles").select("full_name,email").eq("user_id", user["user_id"]).limit(1).execute()
    p = profile.data[0] if profile.data else {}
    res = db.table("join_requests").insert({
        "account_id": body.company_id, "requester_id": user["user_id"],
        "requester_name": p.get("full_name", ""), "requester_email": p.get("email", ""),
        "message": body.message or "", "status": "pending",
    }).execute()
    _audit(db, body.company_id, user["user_id"], p.get("full_name", ""), "join_request.created",
           "join_request", res.data[0]["id"] if res.data else None)
    return res.data[0] if res.data else {}


@router.get("/join-requests")
async def list_join_requests(user=Depends(get_current_user), db=Depends(get_supabase)):
    res = db.table("join_requests").select("*").eq("account_id", user["account_id"])\
        .order("created_at", desc=True).execute()
    return res.data or []


@router.get("/join-requests/mine")
async def my_join_requests(user=Depends(get_current_user), db=Depends(get_supabase)):
    res = db.table("join_requests").select("*").eq("requester_id", user["user_id"])\
        .order("created_at", desc=True).execute()
    return res.data or []


@router.patch("/join-requests/{req_id}")
async def update_join_request(req_id: str, body: dict, user=Depends(get_current_user), db=Depends(get_supabase)):
    new_status = body.get("status")
    if new_status not in ("approved", "rejected", "cancelled"):
        raise HTTPException(status_code=400, detail="status must be approved, rejected, or cancelled")
    if new_status == "cancelled":
        res = db.table("join_requests").update({"status": "cancelled"})\
            .eq("id", req_id).eq("requester_id", user["user_id"]).execute()
    else:
        # Re-read role from DB for authorization
        profile = db.table("profiles").select("role").eq("user_id", user["user_id"]).limit(1).execute()
        role = profile.data[0]["role"] if profile.data else "agent"
        if role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="Only owner or admin can approve/reject requests")
        res = db.table("join_requests").update({"status": new_status, "reviewed_by": user["user_id"]})\
            .eq("id", req_id).eq("account_id", user["account_id"]).execute()
        if res.data and new_status == "approved":
            jr = res.data[0]
            try:
                db.table("employees").insert({
                    "account_id": user["account_id"], "user_id": jr["requester_id"],
                    "name": jr.get("requester_name", ""), "email": jr.get("requester_email", ""),
                    "role": "agent", "joined_at": "now()",
                }).execute()
            except Exception:
                pass
    if not res.data:
        raise HTTPException(status_code=404, detail="Request not found")
    _audit(db, user["account_id"], user["user_id"], "", f"join_request.{new_status}",
           "join_request", req_id)
    return res.data[0]
