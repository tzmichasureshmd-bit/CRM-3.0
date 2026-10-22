"""
Instagram Graph API — posts, stories, reels, comments, DMs
Requires: instagram_page_id + facebook_page_access_token in account_settings or config
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from app.core.config import get_settings
from app.db.supabase import get_supabase
from app.middleware.auth import get_current_user
import httpx

router = APIRouter()
settings = get_settings()

GRAPH = "https://graph.facebook.com/v19.0"


def _get_ig_credentials(account_id: str) -> tuple[str, str]:
    """Load Instagram credentials scoped to the authenticated account_id."""
    try:
        supabase = get_supabase()
        res = supabase.table("account_settings") \
            .select("key, value") \
            .eq("account_id", account_id) \
            .in_("key", ["INSTAGRAM_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"]) \
            .neq("value", "") \
            .execute()
        data = {row["key"]: row["value"] for row in (res.data or []) if row.get("value", "").strip()}
        ig_id = data.get("INSTAGRAM_PAGE_ID") or settings.instagram_page_id
        token = data.get("FACEBOOK_PAGE_ACCESS_TOKEN") or settings.facebook_page_access_token
        return ig_id, token
    except Exception:
        pass
    return settings.instagram_page_id, settings.facebook_page_access_token


async def _get(path: str, account_id: str, params: dict = {}) -> dict:
    ig_id, token = _get_ig_credentials(account_id)
    if not ig_id or not token:
        raise HTTPException(status_code=400, detail="Instagram not configured. Go to Settings → Integrations.")
    params = {**params, "access_token": token}
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(f"{GRAPH}{path}", params=params)
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


async def _post(path: str, account_id: str, data: dict = {}) -> dict:
    _, token = _get_ig_credentials(account_id)
    payload = {**data, "access_token": token}
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(f"{GRAPH}{path}", json=payload)
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


# ── Status check ─────────────────────────────────────────────
@router.get("/instagram/status")
async def get_ig_status(user: dict = Depends(get_current_user)):
    ig_id, token = _get_ig_credentials(user["account_id"])
    return {"configured": bool(ig_id and token), "ig_id": ig_id if ig_id else None}


# ── Profile ──────────────────────────────────────────────────
@router.get("/instagram/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    ig_id, _ = _get_ig_credentials(user["account_id"])
    return await _get(f"/{ig_id}", user["account_id"], {
        "fields": "id,name,username,biography,followers_count,follows_count,media_count,profile_picture_url,website"
    })


# ── Media (Posts + Reels) ────────────────────────────────────
@router.get("/instagram/media")
async def get_media(limit: int = Query(20, le=50), user: dict = Depends(get_current_user)):
    ig_id, _ = _get_ig_credentials(user["account_id"])
    return await _get(f"/{ig_id}/media", user["account_id"], {
        "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,is_shared_to_feed",
        "limit": limit,
    })


# ── Stories ──────────────────────────────────────────────────
@router.get("/instagram/stories")
async def get_stories(user: dict = Depends(get_current_user)):
    ig_id, _ = _get_ig_credentials(user["account_id"])
    return await _get(f"/{ig_id}/stories", user["account_id"], {
        "fields": "id,media_type,media_url,timestamp,story_cta_url"
    })


# ── Single media detail ──────────────────────────────────────
@router.get("/instagram/media/{media_id}")
async def get_media_detail(media_id: str, user: dict = Depends(get_current_user)):
    return await _get(f"/{media_id}", user["account_id"], {
        "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count"
    })


# ── Comments on a post ───────────────────────────────────────
@router.get("/instagram/media/{media_id}/comments")
async def get_comments(media_id: str, user: dict = Depends(get_current_user)):
    return await _get(f"/{media_id}/comments", user["account_id"], {
        "fields": "id,text,username,timestamp,like_count,replies{id,text,username,timestamp}"
    })


# ── Reply to a comment ───────────────────────────────────────
@router.post("/instagram/comments/{comment_id}/reply")
async def reply_comment(comment_id: str, body: dict, user: dict = Depends(get_current_user)):
    text: str = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    return await _post(f"/{comment_id}/replies", user["account_id"], {"message": text})


# ── Like a comment ───────────────────────────────────────────
@router.post("/instagram/comments/{comment_id}/like")
async def like_comment(comment_id: str, user: dict = Depends(get_current_user)):
    return await _post(f"/{comment_id}/likes", user["account_id"], {})


# ── Instagram DM Conversations ───────────────────────────────
@router.get("/instagram/conversations")
async def get_ig_conversations(user: dict = Depends(get_current_user)):
    ig_id, _ = _get_ig_credentials(user["account_id"])
    raw = await _get(f"/{ig_id}/conversations", user["account_id"], {
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
async def get_ig_messages(conversation_id: str, user: dict = Depends(get_current_user)):
    ig_id, _ = _get_ig_credentials(user["account_id"])
    raw = await _get(f"/{conversation_id}/messages", user["account_id"], {
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
async def reply_ig_dm(conversation_id: str, body: dict, user: dict = Depends(get_current_user)):
    ig_id, _ = _get_ig_credentials(user["account_id"])
    text: str = body.get("text", "")
    recipient_id: str = body.get("recipient_id", "")
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    if not recipient_id:
        raise HTTPException(status_code=400, detail="recipient_id required")
    return await _post(f"/{ig_id}/messages", user["account_id"], {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
    })


# ── Story replies (DMs from story mentions) ──────────────────
@router.get("/instagram/story_replies")
async def get_story_replies(user: dict = Depends(get_current_user)):
    ig_id, _ = _get_ig_credentials(user["account_id"])
    return await _get(f"/{ig_id}/conversations", user["account_id"], {
        "fields": "id,participants,messages{id,message,from,created_time,story{mention,reply}}",
        "platform": "instagram",
    })


# ── Insights for a post ──────────────────────────────────────
@router.get("/instagram/media/{media_id}/insights")
async def get_media_insights(media_id: str, user: dict = Depends(get_current_user)):
    return await _get(f"/{media_id}/insights", user["account_id"], {
        "metric": "impressions,reach,likes,comments,shares,saved,video_views"
    })


# ── Account insights ─────────────────────────────────────────
@router.get("/instagram/insights")
async def get_account_insights(period: str = Query("day"), user: dict = Depends(get_current_user)):
    ig_id, _ = _get_ig_credentials(user["account_id"])
    return await _get(f"/{ig_id}/insights", user["account_id"], {
        "metric": "impressions,reach,follower_count,profile_views",
        "period": period,
    })


# ── Mentions ─────────────────────────────────────────────────
@router.get("/instagram/mentions")
async def get_mentions(user: dict = Depends(get_current_user)):
    ig_id, _ = _get_ig_credentials(user["account_id"])
    return await _get(f"/{ig_id}", user["account_id"], {
        "fields": "mentioned_media.fields(id,media_url,caption,timestamp),mentioned_comment.fields(id,text,timestamp)"
    })


# ── Publish a post (image) ───────────────────────────────────
@router.post("/instagram/publish")
async def publish_post(body: dict, user: dict = Depends(get_current_user)):
    image_url: str = body.get("image_url", "")
    caption: str   = body.get("caption", "")
    if not image_url:
        raise HTTPException(status_code=400, detail="image_url required")
    ig_id, _ = _get_ig_credentials(user["account_id"])
    container = await _post(f"/{ig_id}/media", user["account_id"], {"image_url": image_url, "caption": caption})
    container_id = container.get("id")
    if not container_id:
        raise HTTPException(status_code=500, detail="Failed to create media container")
    return await _post(f"/{ig_id}/media_publish", user["account_id"], {"creation_id": container_id})
