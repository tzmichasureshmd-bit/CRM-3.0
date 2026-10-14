from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import datetime, timedelta
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


def _build_monthly_revenue(won_deals: list, months: int) -> list:
    result = []
    for i in range(months):
        d = datetime.utcnow().replace(day=1) - timedelta(days=1)
        # go back (months-1-i) months
        month_offset = months - 1 - i
        target = datetime.utcnow()
        for _ in range(month_offset):
            target = (target.replace(day=1) - timedelta(days=1))
        label = target.strftime("%b %y")
        revenue = sum(
            deal.get("value") or 0
            for deal in won_deals
            if deal.get("updated_at") and
            datetime.fromisoformat(deal["updated_at"].replace("Z", "+00:00")).replace(tzinfo=None).month == target.month and
            datetime.fromisoformat(deal["updated_at"].replace("Z", "+00:00")).replace(tzinfo=None).year == target.year
        )
        result.append({"label": label, "revenue": revenue})
    return result


@router.get("/revenue-intelligence")
async def revenue_intelligence(
    view: str = Query("overview"),
    months: int = Query(6, ge=1, le=24),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    account_id = user["account_id"]

    deal_query = db.table("deals").select("id, title, value, currency, status, created_at, updated_at, contact_id").eq("account_id", account_id)
    if date_from:
        deal_query = deal_query.gte("created_at", date_from)
    if date_to:
        deal_query = deal_query.lte("created_at", date_to)
    deals_res = deal_query.limit(1000).execute()
    deals = deals_res.data or []

    contacts_res = db.table("contacts").select("id, lead_score_tier, source, lead_status, created_at").eq("account_id", account_id).limit(1000).execute()
    contacts = contacts_res.data or []

    open_deals = [d for d in deals if d.get("status") == "open"]
    won_deals = [d for d in deals if d.get("status") == "won"]
    lost_deals = [d for d in deals if d.get("status") == "lost"]

    total_revenue = sum(d.get("value") or 0 for d in won_deals)
    pipeline_value = sum(d.get("value") or 0 for d in open_deals)
    lost_value = sum(d.get("value") or 0 for d in lost_deals)
    total_closed = len(won_deals) + len(lost_deals)
    win_rate = round(len(won_deals) / total_closed * 100) if total_closed > 0 else 0
    avg_deal_value = round(total_revenue / len(won_deals)) if won_deals else 0
    weighted_pipeline = round(pipeline_value * (win_rate / 100))
    currency = deals[0].get("currency", "USD") if deals else "USD"

    if view == "overview":
        monthly_revenue = _build_monthly_revenue(won_deals, months)
        tier_breakdown = {
            "hot": sum(1 for c in contacts if c.get("lead_score_tier") == "hot"),
            "warm": sum(1 for c in contacts if c.get("lead_score_tier") == "warm"),
            "cold": sum(1 for c in contacts if c.get("lead_score_tier") == "cold"),
        }
        source_map: dict = {}
        for c in contacts:
            src = c.get("source") or "Direct"
            source_map[src] = source_map.get(src, 0) + 1
        source_breakdown = sorted(
            [{"source": k, "count": v} for k, v in source_map.items()],
            key=lambda x: -x["count"]
        )[:6]

        return {
            "overview": {
                "total_revenue": total_revenue,
                "pipeline_value": pipeline_value,
                "weighted_pipeline": weighted_pipeline,
                "lost_value": lost_value,
                "win_rate": win_rate,
                "avg_deal_value": avg_deal_value,
                "total_deals": len(deals),
                "open_deals": len(open_deals),
                "won_deals": len(won_deals),
                "lost_deals": len(lost_deals),
                "total_contacts": len(contacts),
                "currency": currency,
            },
            "monthly_revenue": monthly_revenue,
            "tier_breakdown": tier_breakdown,
            "source_breakdown": source_breakdown,
        }

    if view == "forecast":
        monthly_revenue = _build_monthly_revenue(won_deals, 6)
        avg_monthly = sum(m["revenue"] for m in monthly_revenue) / len(monthly_revenue) if monthly_revenue else 0
        last_three = monthly_revenue[-3:]
        trend = (last_three[-1]["revenue"] - last_three[0]["revenue"]) / len(last_three) if len(last_three) >= 2 else 0
        forecast = []
        for i in range(3):
            target = datetime.utcnow()
            for _ in range(i + 1):
                days_in_month = 28
                target = target + timedelta(days=days_in_month)
            label = target.strftime("%b %y")
            projected = max(0, round(avg_monthly + trend * (i + 1)))
            forecast.append({"label": label, "projected": projected, "confidence": ["high", "medium", "low"][i]})
        return {
            "forecast": forecast,
            "weighted_pipeline": weighted_pipeline,
            "avg_monthly_revenue": round(avg_monthly),
            "trend_direction": "up" if trend > 0 else "down" if trend < 0 else "flat",
            "currency": currency,
        }

    if view == "win_loss":
        avg_cycle = 0
        if won_deals:
            cycles = []
            for d in won_deals:
                if d.get("created_at") and d.get("updated_at"):
                    c = (datetime.fromisoformat(d["updated_at"].replace("Z", "+00:00")) -
                         datetime.fromisoformat(d["created_at"].replace("Z", "+00:00"))).days
                    cycles.append(abs(c))
            avg_cycle = round(sum(cycles) / len(cycles)) if cycles else 0
        return {
            "win_rate": win_rate,
            "avg_deal_value": avg_deal_value,
            "avg_cycle_days": avg_cycle,
            "total_won": len(won_deals),
            "total_lost": len(lost_deals),
            "won_value": total_revenue,
            "lost_value": lost_value,
            "currency": currency,
        }

    return {"error": "Unknown view"}, 400
