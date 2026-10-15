from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from app.core.config import get_settings
import httpx

router = APIRouter()
settings = get_settings()


class ContentCreate(BaseModel):
    title: str
    caption: str
    platform: str
    content_type: str = "text"
    cta: Optional[str] = None
    hashtags: List[str] = []
    media_urls: List[str] = []
    campaign_id: Optional[str] = None
    scheduled_at: Optional[str] = None


class GenerateContentRequest(BaseModel):
    prompt: str
    platform: str = "instagram"
    tone: str = "professional"
    brand_voice: Optional[str] = None
    target_audience: Optional[str] = None


@router.get("/content")
async def list_content(
    status: Optional[str] = None,
    platform: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    offset = (page - 1) * limit
    query = (
        db.table("crm3_content")
        .select("*", count="exact")
        .eq("account_id", user["account_id"])
    )
    if status:
        query = query.eq("status", status)
    if platform:
        query = query.eq("platform", platform)

    res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"data": res.data or [], "total": res.count or 0}


@router.post("/content", status_code=201)
async def create_content(
    body: ContentCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    data["account_id"] = user["account_id"]
    data["user_id"] = user["user_id"]
    data["status"] = "draft"
    data["ai_generated"] = False
    res = db.table("crm3_content").insert(data).execute()
    return res.data[0] if res.data else {}


@router.patch("/content/{content_id}")
async def update_content(
    content_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    body.pop("account_id", None)
    body.pop("user_id", None)
    if not body:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = (
        db.table("crm3_content")
        .update(body)
        .eq("id", content_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Content not found")
    return res.data[0]


@router.delete("/content/{content_id}", status_code=204)
async def delete_content(
    content_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("crm3_content").delete().eq("id", content_id).eq("account_id", user["account_id"]).execute()


@router.post("/content/generate")
async def generate_content(
    body: GenerateContentRequest,
    user: dict = Depends(get_current_user),
):
    """Generate content using AI service."""
    if not settings.openai_api_key:
        # Template fallback — no fake AI
        topic = body.prompt[:60]
        return {
            "headline": f"Exciting Update: {topic}",
            "caption": f"We're thrilled to share something special!\n\n{body.prompt}\n\nReach out to learn more.",
            "cta": "Message us now",
            "hashtags": ["business", "growth", body.platform],
            "variants": {
                "instagram": f"✨ {body.prompt}\n\n👉 Message us now!",
                "facebook": f"{body.prompt}\n\nClick to learn more.",
                "whatsapp": f"Hi! {body.prompt}\n\nReply to this message for details.",
                "short": f"{topic} — Contact us today!",
            },
        }

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": f"You are a professional social media content creator. Platform: {body.platform}. Tone: {body.tone}. Respond ONLY with valid JSON: {{\"headline\": \"\", \"caption\": \"\", \"cta\": \"\", \"hashtags\": [], \"variants\": {{\"instagram\": \"\", \"facebook\": \"\", \"whatsapp\": \"\", \"short\": \"\"}}}}",
                    },
                    {"role": "user", "content": body.prompt},
                ],
                "temperature": 0.7,
                "max_tokens": 800,
                "response_format": {"type": "json_object"},
            },
            timeout=30,
        )
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail="AI service unavailable")
        import json
        data = res.json()
        return json.loads(data["choices"][0]["message"]["content"])
