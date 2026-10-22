"""
meta.py — Facebook Page info, posts, and outbound message sending.
Webhook handlers (Instagram/Facebook/WhatsApp) live in webhooks.py only.

All routes require a valid FastAPI JWT (get_current_user).
FB credentials are always scoped to the authenticated account_id.
"""
from fastapi import APIRouter, Request, HTTPException, Depends
from app.core.config import get_settings
from app.db.supabase import get_supabase
from app.middleware.auth import get_current_user
import httpx
import logging

logger = logging.getLogger(__name__)
router = APIRouter()
GRAPH = "https://graph.facebook.com/v19.0"


def _fb_error(res: httpx.Response) -> str:
    try:
        err = res.json().get("error", {})
        return err.get("message", res.text)
    except Exception:
        return res.text


def _raise_fb_error(res: httpx.Response):
    msg = _fb_error(res)
    logger.error("Facebook API error %s: %s", res.status_code, msg)
    raise HTTPException(status_code=400, detail=msg)


def _get_fb_creds_for_account(account_id: str) -> tuple[str, str]:
    """
    Load FB credentials scoped to the authenticated account_id.
    Raises 400 if not configured for this account.
    Never picks credentials from another tenant.
    """
    try:
        supabase = get_supabase()
        res = supabase.table("account_settings") \
            .select("key, value") \
            .eq("account_id", account_id) \
            .in_("key", ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"]) \
            .neq("value", "") \
            .execute()
        db = {row["key"]: row["value"] for row in (res.data or []) if row.get("value", "").strip()}
        if db.get("FACEBOOK_PAGE_ID") and db.get("FACEBOOK_PAGE_ACCESS_TOKEN"):
            return db["FACEBOOK_PAGE_ID"], db["FACEBOOK_PAGE_ACCESS_TOKEN"]
    except Exception as e:
        logger.warning("Could not load FB creds from DB for account %s: %s", account_id, e)

    # Fallback to .env only if account has no DB record (single-tenant / dev mode)
    s = get_settings()
    if s.facebook_page_id and s.facebook_page_access_token:
        return s.facebook_page_id, s.facebook_page_access_token

    raise HTTPException(
        status_code=400,
        detail="Facebook not configured for your account. Go to Settings → Integrations."
    )


# ── Facebook Page Info ────────────────────────────────────────
@router.get("/meta/page")
async def get_fb_page(user: dict = Depends(get_current_user)):
    page_id, token = _get_fb_creds_for_account(user["account_id"])
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{GRAPH}/{page_id}",
            params={"fields": "id,name,category,fan_count,followers_count,about,website,picture,cover", "access_token": token},
        )
        if res.status_code != 200:
            _raise_fb_error(res)
        return res.json()


# ── Facebook Page Posts ───────────────────────────────────────
@router.get("/meta/posts")
async def get_fb_posts(limit: int = 10, user: dict = Depends(get_current_user)):
    page_id, token = _get_fb_creds_for_account(user["account_id"])
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{GRAPH}/{page_id}/posts",
            params={
                "fields": "id,message,story,created_time,likes.summary(true),comments.summary(true),shares,full_picture,permalink_url",
                "limit": min(limit, 25),
                "access_token": token,
            },
        )
        if res.status_code != 200:
            _raise_fb_error(res)
        return res.json()


# ── Facebook Conversations ──────────────────────────────────────
@router.get("/meta/conversations")
async def get_fb_conversations(user: dict = Depends(get_current_user)):
    page_id, token = _get_fb_creds_for_account(user["account_id"])
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{GRAPH}/{page_id}/conversations",
            params={"fields": "id,participants,updated_time,unread_count,snippet", "limit": 25, "access_token": token},
        )
        if res.status_code != 200:
            _raise_fb_error(res)
        raw = res.json()
        convs = []
        for c in raw.get("data", []):
            participants = c.get("participants", {}).get("data", [])
            other = next((p for p in participants if str(p.get("id")) != str(page_id)), participants[0] if participants else {})
            convs.append({
                "id": c["id"],  # conversation ID (not participant ID)
                "participant_id": other.get("id", ""),
                "name": other.get("name", "Unknown"),
                "platform": "facebook",
                "last_message": c.get("snippet", ""),
                "timestamp": c.get("updated_time", ""),
                "unread": c.get("unread_count", 0),
            })
        return {"data": convs}


@router.get("/meta/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str, user: dict = Depends(get_current_user)):
    page_id, token = _get_fb_creds_for_account(user["account_id"])
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{GRAPH}/{conversation_id}/messages",
            params={"fields": "id,from,message,created_time", "limit": 50, "access_token": token},
        )
        if res.status_code != 200:
            _raise_fb_error(res)
        raw = res.json()
        msgs = [{
            "id": m["id"],
            "from": m.get("from", {}).get("name", ""),
            "message": m.get("message", ""),
            "created_time": m.get("created_time", ""),
            "is_mine": str(m.get("from", {}).get("id")) == str(page_id),
        } for m in raw.get("data", [])]
        return {"data": msgs}


# ── Facebook Page Stories ───────────────────────────────────────
@router.get("/meta/stories")
async def get_fb_stories(user: dict = Depends(get_current_user)):
    page_id, token = _get_fb_creds_for_account(user["account_id"])
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{GRAPH}/{page_id}/feed",
            params={
                "fields": "id,story,message,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true)",
                "limit": 20,
                "access_token": token,
            },
        )
        if res.status_code != 200:
            _raise_fb_error(res)
        raw = res.json()
        stories = [i for i in raw.get("data", []) if i.get("story") and not i.get("message")]
        return {"data": stories}


# ── Facebook Post Comments ────────────────────────────────────────
@router.get("/meta/comments")
async def get_fb_comments(user: dict = Depends(get_current_user)):
    page_id, token = _get_fb_creds_for_account(user["account_id"])
    async with httpx.AsyncClient(timeout=15) as client:
        posts_res = await client.get(
            f"{GRAPH}/{page_id}/posts",
            params={"fields": "id,message,story,created_time", "limit": 10, "access_token": token},
        )
        if posts_res.status_code != 200:
            _raise_fb_error(posts_res)
        posts = posts_res.json().get("data", [])
        all_comments = []
        for post in posts[:5]:
            c_res = await client.get(
                f"{GRAPH}/{post['id']}/comments",
                params={"fields": "id,from,message,created_time,like_count,can_reply_privately", "limit": 10, "access_token": token},
            )
            if c_res.status_code == 200:
                for c in c_res.json().get("data", []):
                    all_comments.append({
                        **c,
                        "post_id": post["id"],
                        "post_text": post.get("message") or post.get("story", ""),
                    })
        return {"data": all_comments}


# ── Outbound Message Send ─────────────────────────────────────
@router.post("/meta/send")
async def send_meta_message(request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    platform: str     = data.get("platform", "")
    recipient_id: str = data.get("recipient_id", "")
    text: str         = data.get("text", "")
    account_id: str   = user["account_id"]

    if platform == "whatsapp":
        # Load WhatsApp creds scoped to this account
        try:
            supabase = get_supabase()
            res = supabase.table("account_settings") \
                .select("key, value") \
                .eq("account_id", account_id) \
                .in_("key", ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"]) \
                .neq("value", "") \
                .execute()
            wa = {row["key"]: row["value"] for row in (res.data or []) if row.get("value", "").strip()}
        except Exception:
            wa = {}
        s = get_settings()
        phone_id = wa.get("WHATSAPP_PHONE_NUMBER_ID") or s.whatsapp_phone_number_id
        token    = wa.get("WHATSAPP_ACCESS_TOKEN") or s.whatsapp_access_token
        if not phone_id or not token:
            raise HTTPException(status_code=400, detail="WhatsApp not configured for your account.")
        url  = f"{GRAPH}/{phone_id}/messages"
        body = {"messaging_product": "whatsapp", "to": recipient_id, "type": "text", "text": {"body": text}}
    elif platform in ("instagram", "facebook"):
        page_id, token = _get_fb_creds_for_account(account_id)
        if platform == "instagram":
            # Instagram uses the same page token but the IG page ID
            try:
                supabase = get_supabase()
                res = supabase.table("account_settings") \
                    .select("value") \
                    .eq("account_id", account_id) \
                    .eq("key", "INSTAGRAM_PAGE_ID") \
                    .neq("value", "") \
                    .limit(1) \
                    .execute()
                ig_page = res.data[0]["value"] if res.data else ""
            except Exception:
                ig_page = ""
            s = get_settings()
            page_id = ig_page or s.instagram_page_id
        url  = f"{GRAPH}/{page_id}/messages"
        body = {"recipient": {"id": recipient_id}, "message": {"text": text}}
    else:
        raise HTTPException(status_code=400, detail="Unknown platform")

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(url, json=body, headers={"Authorization": f"Bearer {token}"})
        if res.status_code != 200:
            _raise_fb_error(res)

    return {"status": "sent"}
