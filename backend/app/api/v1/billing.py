from fastapi import APIRouter, Depends
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from datetime import datetime, timezone

router = APIRouter()

PLANS = {
    "starter": {
        "name": "Starter",
        "limits": {"contacts": 500, "broadcasts_per_month": 10, "automations": 5, "agents": 2, "storage_mb": 100},
        "features": ["WhatsApp Inbox", "Basic CRM", "Email Broadcasts"],
    },
    "growth": {
        "name": "Growth",
        "limits": {"contacts": 5000, "broadcasts_per_month": 50, "automations": 20, "agents": 5, "storage_mb": 1000},
        "features": ["All Starter features", "AI Lead Scoring", "Journeys", "Campaigns", "Analytics"],
    },
    "scale": {
        "name": "Scale",
        "limits": {"contacts": 50000, "broadcasts_per_month": 500, "automations": 100, "agents": 20, "storage_mb": 10000},
        "features": ["All Growth features", "AI Agents", "A/B Testing", "Revenue Intelligence", "API Access"],
    },
    "enterprise": {
        "name": "Enterprise",
        "limits": {"contacts": -1, "broadcasts_per_month": -1, "automations": -1, "agents": -1, "storage_mb": -1},
        "features": ["All Scale features", "Custom integrations", "Dedicated support", "SLA"],
    },
}


@router.get("/billing")
async def get_billing(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]

    # Get plan from account_settings
    settings_res = (
        db.table("account_settings")
        .select("plan, plan_started_at")
        .eq("account_id", account_id)
        .limit(1)
        .execute()
    )
    settings = settings_res.data[0] if settings_res.data else {}
    plan_key = settings.get("plan") or "growth"
    plan = PLANS.get(plan_key, PLANS["growth"])

    # Current month start
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Parallel usage counts
    contacts_res = db.table("contacts").select("id", count="exact").eq("account_id", account_id).execute()
    broadcasts_res = (
        db.table("broadcasts")
        .select("id", count="exact")
        .eq("account_id", account_id)
        .gte("created_at", month_start)
        .execute()
    )
    automations_res = db.table("automations").select("id", count="exact").eq("account_id", account_id).execute()
    agents_res = db.table("crm3_ai_agents").select("id", count="exact").eq("account_id", account_id).execute()

    usage = {
        "contacts": contacts_res.count or 0,
        "broadcasts_this_month": broadcasts_res.count or 0,
        "automations": automations_res.count or 0,
        "agents": agents_res.count or 0,
    }

    # Utilization percentages (-1 limit = unlimited = None)
    utilization = {}
    for key, used in usage.items():
        limit_key = "broadcasts_per_month" if key == "broadcasts_this_month" else key
        limit = plan["limits"].get(limit_key, -1)
        utilization[key] = None if limit == -1 else (round(used / limit * 100, 1) if limit > 0 else 0)

    return {
        "plan": {
            "key": plan_key,
            "name": plan["name"],
            "limits": plan["limits"],
            "features": plan["features"],
            "started_at": settings.get("plan_started_at"),
        },
        "usage": usage,
        "utilization": utilization,
        "billing_contact": {
            "method": "whatsapp",
            "number": "919346947043",
            "message": "Hello, I need assistance with TZMICHA CRM billing.",
        },
    }
