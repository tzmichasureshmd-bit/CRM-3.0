from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from app.core.config import get_settings
from datetime import datetime
import httpx

router = APIRouter()
settings = get_settings()

AGENT_TYPES = [
    "lead_qualification", "sales_assistant", "followup",
    "customer_support", "content", "campaign", "reporting", "knowledge"
]

# Tools that require post-write verification
WRITE_TOOLS = {
    "create_followup", "update_lead_status", "update_lead_score",
    "update_contact_field", "add_tag", "remove_tag", "assign_lead",
    "create_task", "update_deal_stage", "classify_conversation",
    "send_notification",
}

# Tools that require approval before execution
APPROVAL_REQUIRED_TOOLS = {
    "update_lead_status", "update_contact_field", "assign_lead", "update_deal_stage",
}

# All known tools in the registry
KNOWN_TOOLS = WRITE_TOOLS | {
    "get_contact", "get_conversation", "get_messages", "get_deal",
    "list_deals", "search_conversations", "get_followups", "search_contacts",
    "get_overdue_followups", "get_hot_leads", "analyze_lead",
    "classify_conversation", "recommend_actions", "generate_reply",
    "summarize_conversation", "prepare_message",
}


class AgentCreate(BaseModel):
    name: str
    type: str
    description: Optional[str] = None
    instructions: str = ""
    allowed_tools: List[str] = []
    requires_approval: bool = True
    max_actions_per_run: int = 10


@router.get("/agents")
async def list_agents(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("crm3_ai_agents")
        .select("*")
        .eq("account_id", user["account_id"])
        .execute()
    )
    return {"data": res.data or []}


@router.post("/agents", status_code=201)
async def create_agent(
    body: AgentCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if body.type not in AGENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid agent type. Must be one of: {AGENT_TYPES}")
    data = body.model_dump()
    data["account_id"] = user["account_id"]
    data["status"] = "idle"
    data["execution_count"] = 0
    res = db.table("crm3_ai_agents").insert(data).execute()
    return res.data[0] if res.data else {}


@router.post("/agents/{agent_id}/run")
async def run_agent(
    agent_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    """Run an AI agent. Requires human approval by default."""
    agent_res = (
        db.table("crm3_ai_agents")
        .select("*")
        .eq("id", agent_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not agent_res.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent = agent_res.data

    if agent["requires_approval"]:
        run_res = db.table("crm3_ai_agent_runs").insert({
            "account_id": user["account_id"],
            "agent_id": agent_id,
            "triggered_by": user["user_id"],
            "status": "awaiting_approval",
            "actions_taken": [],
            "tokens_used": 0,
            "started_at": datetime.utcnow().isoformat(),
        }).execute()
        return {
            "status": "awaiting_approval",
            "message": "Agent run requires human approval before execution.",
            "run_id": run_res.data[0]["id"] if run_res.data else None,
        }

    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(
                f"{settings.ai_service_url}/api/agents/run",
                json={"agent": agent, "context": body, "account_id": user["account_id"]},
                timeout=60,
            )
            return res.json()
        except Exception:
            raise HTTPException(status_code=502, detail="AI service unavailable")


@router.get("/agents/{agent_id}/runs")
async def get_agent_runs(
    agent_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("crm3_ai_agent_runs")
        .select("*")
        .eq("agent_id", agent_id)
        .eq("account_id", user["account_id"])
        .order("started_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"data": res.data or []}


@router.patch("/agents/{agent_id}")
async def update_agent(
    agent_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    body.pop("account_id", None)
    if not body:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = (
        db.table("crm3_ai_agents")
        .update(body)
        .eq("id", agent_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    return res.data[0]


@router.delete("/agents/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("crm3_ai_agents").delete().eq("id", agent_id).eq("account_id", user["account_id"]).execute()


# ── Pure helper functions (used by tests and engine) ─────────────────────────

def check_agent_runnable(agent: dict) -> tuple:
    """Return (ok, error_message). ok=False if agent cannot run."""
    if not agent.get("enabled", True):
        return False, "agent is disabled"
    return True, ""


def is_tool_permitted(agent: dict, tool_name: str) -> bool:
    return tool_name in (agent.get("allowed_tools") or [])


def requires_approval_gate(tool_name: str, agent_requires_approval: bool) -> bool:
    """Return True if this tool call must go through the approval gate."""
    return agent_requires_approval and tool_name in APPROVAL_REQUIRED_TOOLS


def can_execute_approval(approval: dict) -> bool:
    """Return True only if approval is approved and not expired."""
    from datetime import datetime, timezone
    if approval.get("status") != "approved":
        return False
    expires_at = approval.get("expires_at")
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if exp < datetime.now(timezone.utc):
                return False
        except (ValueError, AttributeError):
            return False
    return True


def cap_tool_plan(plan: list, max_actions: int) -> list:
    return plan[:max_actions]


def check_agent_ownership(agent_account_id: str, requesting_account_id: str) -> bool:
    return agent_account_id == requesting_account_id


def validate_tool_name(tool_name: str) -> bool:
    return tool_name in KNOWN_TOOLS


def is_write_tool(tool_name: str) -> bool:
    return tool_name in WRITE_TOOLS


def detect_provider(preferred: "str | None") -> dict:
    """Detect which AI provider is configured."""
    import os
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")

    def usable(k: str) -> bool:
        return bool(k) and len(k) >= 20 and not k.startswith("your-")

    if preferred == "anthropic" and usable(anthropic_key):
        return {"provider": "anthropic", "model": "claude-3-5-sonnet-latest", "configured": True}
    if preferred == "openai" and usable(openai_key):
        return {"provider": "openai", "model": "gpt-4o-mini", "configured": True}
    if usable(openai_key):
        return {"provider": "openai", "model": "gpt-4o-mini", "configured": True}
    if usable(anthropic_key):
        return {"provider": "anthropic", "model": "claude-3-5-sonnet-latest", "configured": True}
    return {"provider": "rule_based", "model": "rule-based", "configured": False}


def sanitize_execution_log(log: dict) -> dict:
    """Remove API keys and secrets from execution logs."""
    import re
    import json
    raw = json.dumps(log)
    # Redact OpenAI-style keys
    raw = re.sub(r'sk-[A-Za-z0-9\-_]{20,}', '[REDACTED]', raw)
    # Redact anything that looks like a bearer token
    raw = re.sub(r'Bearer\s+[A-Za-z0-9\-_\.]{20,}', 'Bearer [REDACTED]', raw)
    return json.loads(raw)


def check_idempotency(prior_run: "dict | None") -> dict:
    """If a prior run exists for this idempotency key, return it."""
    if prior_run:
        return {"reused": True, "run_id": prior_run.get("id"), "status": prior_run.get("status")}
    return {"reused": False}
