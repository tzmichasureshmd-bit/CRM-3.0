"""
CRM 3.0 — AI Content Generator
Generates multi-platform content. Falls back to templates if no AI key.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.llm.provider import call_llm
from app.core.config import get_ai_settings
import json

router = APIRouter()
settings = get_ai_settings()


class ContentGenRequest(BaseModel):
    prompt: str
    platform: str = "instagram"
    tone: str = "professional"
    brand_voice: Optional[str] = None
    target_audience: Optional[str] = None
    language: str = "English"


@router.post("/content/generate")
async def generate_content(body: ContentGenRequest):
    system_prompt = f"""You are a professional social media content creator for a business CRM.
Platform: {body.platform}. Tone: {body.tone}. Language: {body.language}.
{f'Brand voice: {body.brand_voice}.' if body.brand_voice else ''}
{f'Target audience: {body.target_audience}.' if body.target_audience else ''}

Respond ONLY with valid JSON:
{{
  "headline": "short punchy headline",
  "caption": "full caption with line breaks",
  "cta": "call to action",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "variants": {{
    "instagram": "instagram-optimized version with emojis",
    "facebook": "facebook version, slightly longer",
    "whatsapp": "whatsapp version, no hashtags, conversational",
    "short": "under 50 chars version",
    "long": "detailed version for blog/email"
  }}
}}"""

    if not settings.openai_api_key and not settings.anthropic_api_key:
        return _template_fallback(body.prompt, body.platform)

    try:
        raw = await call_llm(
            system_prompt=system_prompt,
            user_message=body.prompt,
            temperature=0.7,
            max_tokens=900,
            json_mode=True,
        )
        return json.loads(raw)
    except Exception:
        return _template_fallback(body.prompt, body.platform)


def _template_fallback(prompt: str, platform: str) -> dict:
    topic = prompt[:60]
    return {
        "headline": f"Exciting Update: {topic}",
        "caption": f"We're thrilled to share something special with you!\n\n{prompt}\n\nReach out to learn more — we'd love to connect.",
        "cta": "Message us now",
        "hashtags": ["business", "growth", "offer", platform, "crm3"],
        "variants": {
            "instagram": f"✨ {prompt}\n\n👉 Message us now!\n\n#business #growth",
            "facebook": f"{prompt}\n\nClick to learn more about how we can help you.",
            "whatsapp": f"Hi! We have something exciting to share:\n\n{prompt}\n\nReply to this message to learn more.",
            "short": f"{topic[:50]} — Contact us!",
            "long": f"We are excited to announce: {prompt}\n\nThis is a great opportunity for businesses looking to grow. Our team is ready to help you achieve your goals. Contact us today to learn more about how we can work together.",
        },
    }
