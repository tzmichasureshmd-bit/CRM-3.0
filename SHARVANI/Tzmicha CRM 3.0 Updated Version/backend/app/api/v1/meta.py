"""
meta.py — Facebook Page info, posts, and outbound message sending.
Webhook handlers (Instagram/Facebook/WhatsApp) live in webhooks.py only.
"""
from fastapi import APIRouter, Request, HTTPException
from app.core.config import get_settings
from app.db.supabase import get_supabase
import httpx
import logging
import time

logger = logging.getLogger(__name__)
router = APIRouter()
GRAPH = "https://graph.facebook.com/v19.0"

# Simple TTL cache so we don't hit DB on every single request
_creds_cache: dict = {}
_CACHE_TTL = 30  # seconds


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


def _fb_creds() -> tuple[str, str]:
    """
    Load FB credentials — DB (account_settings) takes priority over .env.
    No account_id filter: picks the first account that has FB configured.
    This ensures Settings → Integrations always works, even after restart.
    """
    global _creds_cache
    now = time.time()

    if _creds_cache.get("ts", 0) + _CACHE_TTL > now:
        return _creds_cache.get("page_id", ""), _creds_cache.get("token", "")

    # Try DB first — no account_id filter so it works for any saved account
    try:
        supabase = get_supabase()
        res = supabase.table("account_settings") \
            .select("key, value") \
            .in_("key", ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"]) \
            .neq("value", "") \
            .execute()
        db = {row["key"]: row["value"] for row in (res.data or []) if row.get("value", "").strip()}
        logger.info("FB creds from DB keys found: %s", list(db.keys()))
        if db.get("FACEBOOK_PAGE_ID") and db.get("FACEBOOK_PAGE_ACCESS_TOKEN"):
            _creds_cache = {
                "page_id": db["FACEBOOK_PAGE_ID"],
                "token": db["FACEBOOK_PAGE_ACCESS_TOKEN"],
                "ts": now,
            }
            logger.info("Using FB creds from DB, page_id=%s", _creds_cache["page_id"])
            return _creds_cache["page_id"], _creds_cache["token"]
        else:
            logger.warning("FB creds not found in DB, falling back to .env")
    except Exception as e:
        logger.warning("Could not load FB creds from DB, falling back to env: %s", e)

    # Fallback to .env
    s = get_settings()
    _creds_cache = {
        "page_id": s.facebook_page_id,
        "token": s.facebook_page_access_token,
        "ts": now,
    }
    logger.info("Using FB creds from .env, page_id=%s, token_set=%s", _creds_cache["page_id"], bool(_creds_cache["token"]))
    return _creds_cache["page_id"], _creds_cache["token"]


# ── Facebook Page Info ────────────────────────────────────────
@router.get("/meta/page")
async def get_fb_page():
    page_id, token = _fb_creds()
    if not page_id or not token:
        raise HTTPException(status_code=400, detail="Facebook not configured. Go to Settings → Integrations.")
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
async def get_fb_posts(limit: int = 10):
    page_id, token = _fb_creds()
    if not page_id or not token:
        raise HTTPException(status_code=400, detail="Facebook not configured. Go to Settings → Integrations.")
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
async def get_fb_conversations():
    page_id, token = _fb_creds()
    if not page_id or not token:
        raise HTTPException(status_code=400, detail="Facebook not configured. Go to Settings → Integrations.")
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
                "id": other.get("id", c["id"]),
                "name": other.get("name", "Unknown"),
                "platform": "facebook",
                "last_message": c.get("snippet", ""),
                "timestamp": c.get("updated_time", ""),
                "unread": c.get("unread_count", 0),
            })
        return {"data": convs}


@router.get("/meta/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str):
    page_id, token = _fb_creds()
    if not page_id or not token:
        raise HTTPException(status_code=400, detail="Facebook not configured.")
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
async def get_fb_stories():
    page_id, token = _fb_creds()
    if not page_id or not token:
        raise HTTPException(status_code=400, detail="Facebook not configured.")
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
async def get_fb_comments():
    page_id, token = _fb_creds()
    if not page_id or not token:
        raise HTTPException(status_code=400, detail="Facebook not configured.")
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
async def send_meta_message(request: Request):
    data = await request.json()
    platform: str     = data.get("platform", "")
    recipient_id: str = data.get("recipient_id", "")
    text: str         = data.get("text", "")
    s = get_settings()

    if platform == "whatsapp":
        url   = f"{GRAPH}/{s.whatsapp_phone_number_id}/messages"
        token = s.whatsapp_access_token
        body  = {"messaging_product": "whatsapp", "to": recipient_id, "type": "text", "text": {"body": text}}
    elif platform in ("instagram", "facebook"):
        page_id, token = _fb_creds()
        if platform == "instagram":
            page_id = s.instagram_page_id
        url  = f"{GRAPH}/{page_id}/messages"
        body = {"recipient": {"id": recipient_id}, "message": {"text": text}}
    else:
        raise HTTPException(status_code=400, detail="Unknown platform")

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(url, json=body, headers={"Authorization": f"Bearer {token}"})
        if res.status_code != 200:
            _raise_fb_error(res)

    return {"status": "sent"}
