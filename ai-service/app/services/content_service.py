"""
CRM 3.0 AI Service — Content Service
Business logic for content generation and optimization.
"""
from typing import Dict, List


PLATFORM_LIMITS = {
    "instagram": {"caption": 2200, "hashtags": 30},
    "facebook":  {"caption": 63206, "hashtags": 10},
    "whatsapp":  {"caption": 4096, "hashtags": 0},
    "twitter":   {"caption": 280, "hashtags": 3},
    "linkedin":  {"caption": 3000, "hashtags": 5},
    "email":     {"caption": 10000, "hashtags": 0},
}

TONE_PROMPTS = {
    "professional": "formal, authoritative, business-focused",
    "friendly":     "warm, conversational, approachable",
    "exciting":     "energetic, enthusiastic, action-oriented",
    "informative":  "educational, clear, factual",
    "urgent":       "time-sensitive, compelling, direct",
    "empathetic":   "understanding, supportive, human",
}


def get_platform_config(platform: str) -> Dict:
    return PLATFORM_LIMITS.get(platform.lower(), PLATFORM_LIMITS["instagram"])


def get_tone_description(tone: str) -> str:
    return TONE_PROMPTS.get(tone.lower(), TONE_PROMPTS["professional"])


def truncate_for_platform(text: str, platform: str) -> str:
    limit = get_platform_config(platform)["caption"]
    if len(text) <= limit:
        return text
    return text[:limit - 3] + "..."


def optimize_hashtags(hashtags: List[str], platform: str) -> List[str]:
    limit = get_platform_config(platform)["hashtags"]
    if limit == 0:
        return []
    cleaned = [f"#{h.lstrip('#').replace(' ', '').lower()}" for h in hashtags]
    return cleaned[:limit]


def build_content_prompt(prompt: str, platform: str, tone: str, brand_voice: str = "", target_audience: str = "") -> str:
    tone_desc = get_tone_description(tone)
    platform_config = get_platform_config(platform)

    parts = [
        f"Platform: {platform} (max {platform_config['caption']} chars, max {platform_config['hashtags']} hashtags)",
        f"Tone: {tone} — {tone_desc}",
    ]
    if brand_voice:
        parts.append(f"Brand voice: {brand_voice}")
    if target_audience:
        parts.append(f"Target audience: {target_audience}")

    return "\n".join(parts) + f"\n\nContent brief: {prompt}"


def template_fallback(prompt: str, platform: str, tone: str) -> Dict:
    """Returns template content when no AI key is configured."""
    topic = prompt[:60]
    emoji = "✨" if tone == "exciting" else "📢" if tone == "urgent" else "💼"

    return {
        "headline": f"{emoji} {topic}",
        "caption": f"We have something exciting to share!\n\n{prompt}\n\nReach out to learn more — we'd love to connect with you.",
        "cta": "Message us now" if platform == "whatsapp" else "Learn more",
        "hashtags": optimize_hashtags(["business", "growth", "offer", platform, "crm"], platform),
        "variants": {
            "instagram": f"{emoji} {prompt}\n\n👉 DM us now!\n\n#business #growth #{platform}",
            "facebook": f"{prompt}\n\nClick to learn more about how we can help you grow.",
            "whatsapp": f"Hi! We have something exciting:\n\n{prompt}\n\nReply to this message for details.",
            "short": f"{topic[:50]}",
            "long": f"We are excited to announce: {prompt}\n\nThis is a great opportunity for businesses looking to grow. Our team is ready to help you achieve your goals. Contact us today to learn more.",
        },
    }
