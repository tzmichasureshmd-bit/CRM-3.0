"""
CRM 3.0 — AI Agent Execution
Agents use explicit tools only. No unrestricted DB access.
Human approval required by default.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.llm.provider import call_llm
from app.core.config import get_ai_settings
from datetime import datetime
import json

router = APIRouter()
settings = get_ai_settings()

# ── Explicit tool definitions ─────────────────────────────────
AVAILABLE_TOOLS = {
    "getLead": "Get a specific lead by contact_id",
    "searchLeads": "Search leads by criteria",
    "getConversation": "Get conversation details",
    "summarizeConversation": "Summarize a conversation",
    "recommendNextAction": "Recommend next best action",
    "generateContent": "Generate marketing content",
    "createFollowUp": "Create a follow-up task (requires approval)",
    "assignLead": "Assign lead to agent (requires approval)",
}


class AgentRunRequest(BaseModel):
    agent: dict
    context: dict
    account_id: str


@router.post("/agents/run")
async def run_agent(body: AgentRunRequest):
    agent = body.agent
    allowed_tools = agent.get("allowed_tools", [])
    instructions = agent.get("instructions", "")
    agent_type = agent.get("type", "")
    max_actions = agent.get("max_actions_per_run", 10)

    # Validate tools against allowlist
    invalid_tools = [t for t in allowed_tools if t not in AVAILABLE_TOOLS]
    if invalid_tools:
        raise HTTPException(status_code=400, detail=f"Invalid tools: {invalid_tools}")

    if not settings.openai_api_key and not settings.anthropic_api_key:
        return {
            "status": "completed",
            "result_summary": "AI service not configured. Add OPENAI_API_KEY to enable AI agents.",
            "actions_taken": [],
            "tokens_used": 0,
            "completed_at": datetime.utcnow().isoformat(),
        }

    system_prompt = f"""You are a CRM AI agent of type: {agent_type}.
Instructions: {instructions}
Available tools: {json.dumps({k: v for k, v in AVAILABLE_TOOLS.items() if k in allowed_tools})}
Max actions: {max_actions}
Account: {body.account_id}

IMPORTANT RULES:
- Only use tools in your allowed_tools list
- Never access data outside the account
- For destructive actions, always flag for human approval
- Be factual, never invent CRM data
- If unsure, ask for clarification rather than guessing"""

    try:
        result = await call_llm(
            system_prompt=system_prompt,
            user_message=f"Context: {json.dumps(body.context)}\n\nExecute your task and report what you did.",
            temperature=0.2,
            max_tokens=500,
        )
        return {
            "status": "completed",
            "result_summary": result,
            "actions_taken": [],
            "tokens_used": 0,
            "completed_at": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        return {
            "status": "failed",
            "error_message": str(e),
            "actions_taken": [],
            "tokens_used": 0,
            "completed_at": datetime.utcnow().isoformat(),
        }
