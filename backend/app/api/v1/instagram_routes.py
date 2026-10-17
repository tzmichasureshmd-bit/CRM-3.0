"""
Instagram Graph API — posts, stories, reels, comments, DMs
Requires: instagram_page_id + facebook_page_access_token in account_settings or config
"""
from fastapi import APIRouter, HTTPException, Query
from app.core.config import get_settings
from app.db.supabase import get_supabase
import httpx

router = APIRouter()
settings = get_settings()

GRAPH = "https://graph.facebook.com/v19.0"


def _get_ig_credentials() -> tuple[str, str]:
    """Load Instagram credentials from account_settings DB, fallback to env."""
    try:
        supabase = get_supabase()
        # Get first account_id
        acc_res = supabase.table("account_settings").select("account_id").limit(1).execute()
        account_id = acc_res.data[0]["account_id"] if acc_res.data else None
        if account_id:
            res = supabase.table("account_settings") \
                .select("key, value") \
                .eq("account_id", account_id) \
                .in_("key", ["INSTAGRAM_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"]) \
                .execute()
            data = {row["key"]: row["value"] for row in (res.data or [])}
            ig_id = data.get("INSTAGRAM_PAGE_ID") or settings.instagram_page_id
            token = data.get("FACEBOOK_PAGE_ACCESS_TOKEN") or settings.facebook_page_access_token
            return ig_id, token
    except Exception:
        pass
    return settings.instagram_page_id, settings.facebook_page_access_token


async def _get(path: str, params: dict = {}) -> dict:
    ig_id, token = _get_ig_credentials()
    if not ig_id or not token:
        raise HTTPException(status_code=400, detail="Instagram not configured. Go to Settings → Integrations.")
    params = {**params, "access_token": token}  # don't mutate default arg
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(f"{GRAPH}{path}", params=params)
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


async def _post(path: str, data: dict = {}) -> dict:
    _, token = _get_ig_credentials()
    data["access_token"] = token
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(f"{GRAPH}{path}", json=data)
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


# ── Status check ─────────────────────────────────────────────
@router.get("/instagram/status")
async def get_ig_status():
    ig_id, token = _get_ig_credentials()
    return {"configured": bool(ig_id and token), "ig_id": ig_id if ig_id else None}


# ── Profile ──────────────────────────────────────────────────
@router.get("/instagram/profile")
async def get_profile():
    ig_id, _ = _get_ig_credentials()
    return await _get(f"/{ig_id}", {
        "fields": "id,name,username,biography,followers_count,follows_count,media_count,profile_picture_url,website"
    })


# ── Media (Posts + Reels) ────────────────────────────────────
@router.get("/instagram/media")
async def get_media(limit: int = Query(20, le=50)):
    ig_id, _ = _get_ig_credentials()
    return await _get(f"/{ig_id}/media", {
        "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,is_shared_to_feed",
        "limit": limit,
    })


# ── Stories ──────────────────────────────────────────────────
@router.get("/instagram/stories")
async def get_stories():
    ig_id, _ = _get_ig_credentials()
    return await _get(f"/{ig_id}/stories", {
        "fields": "id,media_type,media_url,timestamp,story_cta_url"
    })


# ── Single media detail ──────────────────────────────────────
@router.get("/instagram/media/{media_id}")
async def get_media_detail(media_id: str):
    return await _get(f"/{media_id}", {
        "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count"
    })


# ── Comments on a post ───────────────────────────────────────
@router.get("/instagram/media/{media_id}/comments")
async def get_comments(media_id: str):
    return await _get(f"/{media_id}/comments", {
        "fields": "id,text,username,timestamp,like_count,replies{id,text,username,timestamp}"
    })


# ── Reply to a comment ───────────────────────────────────────
@router.post("/instagram/comments/{comment_id}/reply")
async def reply_comment(comment_id: str, body: dict):
    text: str = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    return await _post(f"/{comment_id}/replies", {"message": text})


# ── Like a comment ───────────────────────────────────────────
@router.post("/instagram/comments/{comment_id}/like")
async def like_comment(comment_id: str):
    return await _post(f"/{comment_id}/likes", {})


# ── Instagram DM Conversations ───────────────────────────────
@router.get("/instagram/conversations")
async def get_ig_conversations():
    ig_id, _ = _get_ig_credentials()
    raw = await _get(f"/{ig_id}/conversations", {
        "fields": "id,participants,updated_time,unread_count,snippet",
        "platform": "instagram",
        "limit": 25,
    })
    convs = []
    for c in raw.get("data", []):
        parts = c.get("participants", {}).get("data", [])
        other = next((p for p in parts if str(p.get("id")) != str(ig_id)), parts[0] if parts else {})
        convs.append({
            "id": c["id"],
            "username": other.get("username", "Unknown"),
            "user_id": other.get("id", ""),
            "last_message": c.get("snippet", ""),
            "timestamp": c.get("updated_time", ""),
            "unread": c.get("unread_count", 0),
        })
    return {"data": convs}


@router.get("/instagram/conversations/{conversation_id}/messages")
async def get_ig_messages(conversation_id: str):
    _, _ = _get_ig_credentials()
    ig_id, _ = _get_ig_credentials()
    raw = await _get(f"/{conversation_id}/messages", {
        "fields": "id,from,message,created_time,attachments",
        "limit": 50,
    })
    msgs = [{
        "id": m["id"],
        "from": m.get("from", {}).get("username", ""),
        "from_id": m.get("from", {}).get("id", ""),
        "message": m.get("message", ""),
        "created_time": m.get("created_time", ""),
        "is_mine": str(m.get("from", {}).get("id")) == str(ig_id),
    } for m in raw.get("data", [])]
    return {"data": msgs}


@router.post("/instagram/conversations/{conversation_id}/reply")
async def reply_ig_dm(conversation_id: str, body: dict):
    ig_id, _ = _get_ig_credentials()
    text: str = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    # Extract recipient user_id from body
    recipient_id: str = body.get("recipient_id", "")
    if not recipient_id:
        raise HTTPException(status_code=400, detail="recipient_id required")
    return await _post(f"/{ig_id}/messages", {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
    })


# ── Story replies (DMs from story mentions) ──────────────────
@router.get("/instagram/story_replies")
async def get_story_replies():
    ig_id, _ = _get_ig_credentials()
    return await _get(f"/{ig_id}/conversations", {
        "fields": "id,participants,messages{id,message,from,created_time,story{mention,reply}}",
        "platform": "instagram",
    })


# ── Insights for a post ──────────────────────────────────────
@router.get("/instagram/media/{media_id}/insights")
async def get_media_insights(media_id: str):
    return await _get(f"/{media_id}/insights", {
        "metric": "impressions,reach,likes,comments,shares,saved,video_views"
    })


# ── Account insights ─────────────────────────────────────────
@router.get("/instagram/insights")
async def get_account_insights(period: str = Query("day")):
    ig_id, _ = _get_ig_credentials()
    return await _get(f"/{ig_id}/insights", {
        "metric": "impressions,reach,follower_count,profile_views",
        "period": period,
    })


# ── Mentions ─────────────────────────────────────────────────
@router.get("/instagram/mentions")
async def get_mentions():
    ig_id, _ = _get_ig_credentials()
    return await _get(f"/{ig_id}", {
        "fields": "mentioned_media.fields(id,media_url,caption,timestamp),mentioned_comment.fields(id,text,timestamp)"
    })


# ── Publish a post (image) ───────────────────────────────────
@router.post("/instagram/publish")
async def publish_post(body: dict):
    image_url: str = body.get("image_url", "")
    caption: str   = body.get("caption", "")
    if not image_url:
        raise HTTPException(status_code=400, detail="image_url required")
    ig_id, _ = _get_ig_credentials()
    container = await _post(f"/{ig_id}/media", {"image_url": image_url, "caption": caption})
    container_id = container.get("id")
    if not container_id:
        raise HTTPException(status_code=500, detail="Failed to create media container")
    return await _post(f"/{ig_id}/media_publish", {"creation_id": container_id})
