"""
Instagram Graph API — posts, stories, reels, comments, DMs
Requires: instagram_page_id + facebook_page_access_token in config
"""
from fastapi import APIRouter, HTTPException, Query
from app.core.config import get_settings
import httpx

router = APIRouter()
settings = get_settings()

GRAPH = "https://graph.facebook.com/v19.0"


def _token() -> str:
    return settings.facebook_page_access_token


def _ig_id() -> str:
    return settings.instagram_page_id


async def _get(path: str, params: dict = {}) -> dict:
    params["access_token"] = _token()
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(f"{GRAPH}{path}", params=params)
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


async def _post(path: str, data: dict = {}) -> dict:
    data["access_token"] = _token()
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(f"{GRAPH}{path}", json=data)
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


# ── Profile ──────────────────────────────────────────────────
@router.get("/instagram/profile")
async def get_profile():
    return await _get(f"/{_ig_id()}", {
        "fields": "id,name,username,biography,followers_count,follows_count,media_count,profile_picture_url,website"
    })


# ── Media (Posts + Reels) ────────────────────────────────────
@router.get("/instagram/media")
async def get_media(limit: int = Query(20, le=50)):
    return await _get(f"/{_ig_id()}/media", {
        "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,is_shared_to_feed",
        "limit": limit,
    })


# ── Stories ──────────────────────────────────────────────────
@router.get("/instagram/stories")
async def get_stories():
    return await _get(f"/{_ig_id()}/stories", {
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
    """Fetch conversations that started from story replies"""
    return await _get(f"/{_ig_id()}/conversations", {
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
    return await _get(f"/{_ig_id()}/insights", {
        "metric": "impressions,reach,follower_count,profile_views",
        "period": period,
    })


# ── Mentions ─────────────────────────────────────────────────
@router.get("/instagram/mentions")
async def get_mentions():
    return await _get(f"/{_ig_id()}", {
        "fields": "mentioned_media.fields(id,media_url,caption,timestamp),mentioned_comment.fields(id,text,timestamp)"
    })


# ── Publish a post (image) ───────────────────────────────────
@router.post("/instagram/publish")
async def publish_post(body: dict):
    image_url: str = body.get("image_url", "")
    caption: str   = body.get("caption", "")
    if not image_url:
        raise HTTPException(status_code=400, detail="image_url required")

    # Step 1: create container
    container = await _post(f"/{_ig_id()}/media", {
        "image_url": image_url,
        "caption": caption,
    })
    container_id = container.get("id")
    if not container_id:
        raise HTTPException(status_code=500, detail="Failed to create media container")

    # Step 2: publish
    return await _post(f"/{_ig_id()}/media_publish", {
        "creation_id": container_id
    })
