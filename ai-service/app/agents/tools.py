"""
CRM 3.0 AI Service — Agent Tool Implementations
Each tool queries real CRM data via Supabase.
No unrestricted DB access — every tool validates account_id ownership.
"""
from typing import Optional
from supabase import Client


async def get_contact(db: Client, contact_id: str, account_id: str) -> dict:
    """Get a specific contact by ID."""
    res = (
        db.table("contacts")
        .select("id, name, phone, email, company, lead_status, lead_score, lead_score_tier, source, tags, created_at")
        .eq("id", contact_id)
        .eq("account_id", account_id)
        .single()
        .execute()
    )
    return res.data or {}


async def search_contacts(db: Client, account_id: str, query: str = "", tier: Optional[str] = None, status: Optional[str] = None, limit: int = 10) -> list:
    """Search contacts by name/phone/email or filter by tier/status."""
    q = db.table("contacts").select("id, name, phone, email, lead_status, lead_score, lead_score_tier").eq("account_id", account_id)
    if query:
        q = q.or_(f"name.ilike.%{query}%,phone.ilike.%{query}%,email.ilike.%{query}%")
    if tier:
        q = q.eq("lead_score_tier", tier)
    if status:
        q = q.eq("lead_status", status)
    res = q.order("lead_score", desc=True).limit(limit).execute()
    return res.data or []


async def get_hot_leads(db: Client, account_id: str, limit: int = 10) -> list:
    """Get top hot leads (score >= 70) not yet won/lost."""
    res = (
        db.table("contacts")
        .select("id, name, phone, lead_score, lead_score_tier, lead_status, last_customer_reply_at")
        .eq("account_id", account_id)
        .gte("lead_score", 70)
        .not_.in_("lead_status", ["won", "lost"])
        .order("lead_score", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


async def get_conversation(db: Client, conversation_id: str, account_id: str) -> dict:
    """Get a conversation with contact info."""
    res = (
        db.table("conversations")
        .select("*, contacts(id, name, phone, lead_score)")
        .eq("id", conversation_id)
        .eq("account_id", account_id)
        .single()
        .execute()
    )
    return res.data or {}


async def get_messages(db: Client, conversation_id: str, account_id: str, limit: int = 20) -> list:
    """Get recent messages for a conversation."""
    conv = (
        db.table("conversations")
        .select("id")
        .eq("id", conversation_id)
        .eq("account_id", account_id)
        .single()
        .execute()
    )
    if not conv.data:
        return []
    res = (
        db.table("messages")
        .select("id, content, sender_type, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


async def get_deal(db: Client, deal_id: str, account_id: str) -> dict:
    """Get a deal with stage and contact info."""
    res = (
        db.table("deals")
        .select("*, contacts(name, phone), pipeline_stages(name, color)")
        .eq("id", deal_id)
        .eq("account_id", account_id)
        .single()
        .execute()
    )
    return res.data or {}


async def get_overdue_followups(db: Client, account_id: str, limit: int = 10) -> list:
    """Get overdue pending follow-ups."""
    from datetime import datetime
    res = (
        db.table("follow_ups")
        .select("id, title, due_date, contact_id, contacts(name)")
        .eq("account_id", account_id)
        .eq("status", "pending")
        .lt("due_date", datetime.utcnow().isoformat())
        .order("due_date")
        .limit(limit)
        .execute()
    )
    return res.data or []


async def create_followup(db: Client, account_id: str, user_id: str, contact_id: str, title: str, due_date: str, notes: Optional[str] = None) -> dict:
    """Create a follow-up task. Requires approval gate in agent engine."""
    payload = {
        "account_id": account_id,
        "user_id": user_id,
        "contact_id": contact_id,
        "title": title,
        "due_date": due_date,
        "status": "pending",
    }
    if notes:
        payload["notes"] = notes
    res = db.table("follow_ups").insert(payload).execute()
    return res.data[0] if res.data else {}


async def update_lead_status(db: Client, contact_id: str, account_id: str, new_status: str) -> dict:
    """Update a contact's lead status. Requires approval gate."""
    valid_statuses = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]
    if new_status not in valid_statuses:
        return {"error": f"Invalid status. Must be one of: {valid_statuses}"}
    res = (
        db.table("contacts")
        .update({"lead_status": new_status})
        .eq("id", contact_id)
        .eq("account_id", account_id)
        .execute()
    )
    return res.data[0] if res.data else {}


async def update_lead_score(db: Client, contact_id: str, account_id: str, score: int, reason: str) -> dict:
    """Update a contact's lead score."""
    score = max(0, min(100, score))
    tier = "hot" if score >= 70 else "warm" if score >= 40 else "cold"
    res = (
        db.table("contacts")
        .update({"lead_score": score, "lead_score_tier": tier, "lead_score_reason": reason})
        .eq("id", contact_id)
        .eq("account_id", account_id)
        .execute()
    )
    return res.data[0] if res.data else {}


async def update_deal_stage(db: Client, deal_id: str, account_id: str, stage_id: str) -> dict:
    """Move a deal to a new stage. Requires approval gate."""
    stage_res = (
        db.table("pipeline_stages")
        .select("name")
        .eq("id", stage_id)
        .eq("account_id", account_id)
        .single()
        .execute()
    )
    if not stage_res.data:
        return {"error": "Stage not found"}

    stage_name = stage_res.data.get("name", "").lower()
    new_status = "won" if stage_name == "won" else "lost" if stage_name == "lost" else "open"

    res = (
        db.table("deals")
        .update({"stage_id": stage_id, "status": new_status})
        .eq("id", deal_id)
        .eq("account_id", account_id)
        .execute()
    )
    return res.data[0] if res.data else {}


# Tool registry — maps tool name to function + metadata
TOOL_REGISTRY = {
    "get_contact":           {"fn": get_contact,           "category": "crm_read",  "approval": "auto",             "description": "Get a contact by ID"},
    "search_contacts":       {"fn": search_contacts,       "category": "crm_read",  "approval": "auto",             "description": "Search contacts by name/phone/email or filter"},
    "get_hot_leads":         {"fn": get_hot_leads,         "category": "crm_read",  "approval": "auto",             "description": "Get top hot leads (score >= 70)"},
    "get_conversation":      {"fn": get_conversation,      "category": "crm_read",  "approval": "auto",             "description": "Get a conversation with contact info"},
    "get_messages":          {"fn": get_messages,          "category": "crm_read",  "approval": "auto",             "description": "Get recent messages for a conversation"},
    "get_deal":              {"fn": get_deal,              "category": "crm_read",  "approval": "auto",             "description": "Get a deal with stage and contact info"},
    "get_overdue_followups": {"fn": get_overdue_followups, "category": "crm_read",  "approval": "auto",             "description": "Get overdue pending follow-ups"},
    "create_followup":       {"fn": create_followup,       "category": "crm_write", "approval": "auto",             "description": "Create a follow-up task"},
    "update_lead_status":    {"fn": update_lead_status,    "category": "crm_write", "approval": "requires_approval","description": "Update a contact's lead status"},
    "update_lead_score":     {"fn": update_lead_score,     "category": "crm_write", "approval": "auto",             "description": "Update a contact's lead score"},
    "update_deal_stage":     {"fn": update_deal_stage,     "category": "crm_write", "approval": "requires_approval","description": "Move a deal to a new pipeline stage"},
}
