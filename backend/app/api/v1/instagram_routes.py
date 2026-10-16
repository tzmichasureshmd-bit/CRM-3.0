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
        res = supabase.table("account_settings") \
            .select("key, value") \
            .in_("key", ["INSTAGRAM_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"]) \
            .execute()
        data = {row["key"]: row["value"] for row in (res.data or [])}
        ig_id = data.get("INSTAGRAM_PAGE_ID") or settings.instagram_page_id
        token = data.get("FACEBOOK_PAGE_ACCESS_TOKEN") or settings.facebook_page_access_token
        return ig_id, token
    except Exception:
        return settings.instagram_page_id, settings.facebook_page_access_token


async def _get(path: str, params: dict = {}) -> dict:
    ig_id, token = _get_ig_credentials()
    if not ig_id or not token:
        raise HTTPException(status_code=400, detail="Instagram not configured. Go to Settings → Integrations.")
    params["access_token"] = token
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
