"""
meta.py — Facebook Page info, posts, and outbound message sending.
Webhook handlers (Instagram/Facebook/WhatsApp) live in webhooks.py only.
"""
from fastapi import APIRouter, Request, HTTPException
from app.core.config import get_settings
import httpx

router = APIRouter()
settings = get_settings()
GRAPH = "https://graph.facebook.com/v19.0"


def _fb_creds() -> tuple[str, str]:
    """Load FB credentials from env (DB lookup skipped for now)."""
    return settings.facebook_page_id, settings.facebook_page_access_token


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
            raise HTTPException(status_code=res.status_code, detail=res.text)
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
            raise HTTPException(status_code=res.status_code, detail=res.json().get("error", {}).get("message", res.text))
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
            raise HTTPException(status_code=res.status_code, detail=res.json().get("error", {}).get("message", res.text))
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
            raise HTTPException(status_code=res.status_code, detail=res.json().get("error", {}).get("message", res.text))
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
            raise HTTPException(status_code=res.status_code, detail=res.json().get("error", {}).get("message", res.text))
        raw = res.json()
        # Stories are feed items that have a 'story' field but no 'message'
        stories = [i for i in raw.get("data", []) if i.get("story") and not i.get("message")]
        return {"data": stories}


# ── Facebook Post Comments ────────────────────────────────────────
@router.get("/meta/comments")
async def get_fb_comments():
    page_id, token = _fb_creds()
    if not page_id or not token:
        raise HTTPException(status_code=400, detail="Facebook not configured.")
    async with httpx.AsyncClient(timeout=15) as client:
        # Get recent posts first
        posts_res = await client.get(
            f"{GRAPH}/{page_id}/posts",
            params={"fields": "id,message,story,created_time", "limit": 10, "access_token": token},
        )
        if posts_res.status_code != 200:
            raise HTTPException(status_code=posts_res.status_code, detail=posts_res.json().get("error", {}).get("message", posts_res.text))
        posts = posts_res.json().get("data", [])
        all_comments = []
        for post in posts[:5]:  # limit to 5 posts to avoid rate limits
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

    if platform == "whatsapp":
        url   = f"{GRAPH}/{settings.whatsapp_phone_number_id}/messages"
        token = settings.whatsapp_access_token
        body  = {"messaging_product": "whatsapp", "to": recipient_id, "type": "text", "text": {"body": text}}
    elif platform in ("instagram", "facebook"):
        _, token = _fb_creds()
        page_id, _ = _fb_creds()
        if platform == "instagram":
            page_id = settings.instagram_page_id
        url  = f"{GRAPH}/{page_id}/messages"
        body = {"recipient": {"id": recipient_id}, "message": {"text": text}}
    else:
        raise HTTPException(status_code=400, detail="Unknown platform")

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(url, json=body, headers={"Authorization": f"Bearer {token}"})
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)

    return {"status": "sent"}
