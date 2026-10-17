"""
GET/POST /api/v1/settings/integrations/{channel}
Saves Meta credentials to account_settings table and reloads config.
"""
from fastapi import APIRouter, HTTPException, Depends
from app.middleware.auth import get_current_user
from app.db.supabase import get_supabase
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Maps channel id → env key names stored in account_settings
CHANNEL_KEYS = {
    "instagram": [
        "INSTAGRAM_PAGE_ID",
        "INSTAGRAM_VERIFY_TOKEN",
        "INSTAGRAM_APP_SECRET",
        "FACEBOOK_PAGE_ACCESS_TOKEN",
    ],
    "facebook": [
        "FACEBOOK_PAGE_ID",
        "FACEBOOK_VERIFY_TOKEN",
        "FACEBOOK_APP_SECRET",
        "FACEBOOK_PAGE_ACCESS_TOKEN",
    ],
    "whatsapp": [
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_VERIFY_TOKEN",
        "WHATSAPP_APP_SECRET",
    ],
    "telegram": [
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_WEBHOOK_SECRET",
    ],
}


@router.get("/settings/integrations/{channel}")
async def get_integration(channel: str, user=Depends(get_current_user)):
    if channel not in CHANNEL_KEYS:
        raise HTTPException(status_code=404, detail="Unknown channel")
    supabase = get_supabase()
    res = supabase.table("account_settings") \
        .select("key, value") \
        .eq("account_id", user["account_id"]) \
        .in_("key", CHANNEL_KEYS[channel]) \
        .execute()
    return {row["key"]: row["value"] for row in (res.data or [])}


@router.post("/settings/integrations/{channel}")
async def save_integration(channel: str, body: dict, user=Depends(get_current_user)):
    if channel not in CHANNEL_KEYS:
        raise HTTPException(status_code=404, detail="Unknown channel")
    supabase = get_supabase()
    account_id = user["account_id"]

    for key in CHANNEL_KEYS[channel]:
        val = body.get(key, "")
        # Never overwrite an existing non-empty value with an empty string.
        # This prevents the Facebook channel save from wiping the token
        # that was already saved via the Instagram channel (they share
        # FACEBOOK_PAGE_ACCESS_TOKEN).
        if not val:
            existing = supabase.table("account_settings") \
                .select("value") \
                .eq("account_id", account_id) \
                .eq("key", key) \
                .maybe_single() \
                .execute()
            if existing.data and existing.data.get("value", "").strip():
                logger.info("Skipping empty value for %s — keeping existing", key)
                continue
        supabase.table("account_settings").upsert({
            "account_id": account_id,
            "key": key,
            "value": val,
        }, on_conflict="account_id,key").execute()

    # Invalidate meta.py creds cache so new token is used immediately
    try:
        from app.api.v1 import meta as meta_module
        meta_module._creds_cache.clear()
        logger.info("Cleared meta creds cache after saving %s integration", channel)
    except Exception as e:
        logger.warning("Could not clear meta cache: %s", e)

    _reload_meta_settings(supabase, account_id)
    return {"status": "saved"}


def _reload_meta_settings(supabase, account_id: str):
    """Pull all Meta keys from DB and patch the live settings object."""
    all_keys = sum(CHANNEL_KEYS.values(), [])
    res = supabase.table("account_settings") \
        .select("key, value") \
        .eq("account_id", account_id) \
        .in_("key", list(set(all_keys))) \
        .execute()

    settings = get_settings()
    for row in (res.data or []):
        k, v = row["key"].lower(), row["value"]
        if hasattr(settings, k):
            object.__setattr__(settings, k, v)
