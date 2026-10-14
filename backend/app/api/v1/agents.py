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
        # Create run record in awaiting_approval state
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

    # Forward to AI service for execution
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
