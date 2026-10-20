from fastapi import APIRouter, Depends
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()


@router.get("/notifications")
async def list_notifications(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    try:
        res = (
            db.table("notifications")
            .select("*")
            .eq("account_id", user["account_id"])
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"data": res.data or [], "unread": sum(1 for n in (res.data or []) if not n.get("read"))}
    except Exception:
        return {"data": [], "unread": 0}


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    try:
        db.table("notifications").update({"read": True}).eq("id", notification_id).eq("account_id", user["account_id"]).execute()
    except Exception:
        pass
    return {"status": "ok"}


@router.patch("/notifications/read-all")
async def mark_all_read(
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    try:
        db.table("notifications").update({"read": True}).eq("account_id", user["account_id"]).execute()
    except Exception:
        pass
    return {"status": "ok"}
