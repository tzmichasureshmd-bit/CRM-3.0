"""
CRM 3.0 — LLM Provider Abstraction
Supports OpenAI and Anthropic. Falls back gracefully if unavailable.
"""
from app.core.config import get_ai_settings
from typing import Optional
import httpx

settings = get_ai_settings()


async def call_llm(
    system_prompt: str,
    user_message: str,
    model: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 1000,
    json_mode: bool = False,
) -> str:
    """Call LLM with fallback. Returns text response."""
    model = model or settings.default_model

    if settings.openai_api_key:
        return await _call_openai(system_prompt, user_message, model, temperature, max_tokens, json_mode)
    elif settings.anthropic_api_key:
        return await _call_anthropic(system_prompt, user_message, temperature, max_tokens)
    else:
        return _rule_based_fallback(user_message)


async def _call_openai(
    system_prompt: str,
    user_message: str,
    model: str,
    temperature: float,
    max_tokens: int,
    json_mode: bool,
) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json=payload,
        )
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]


async def _call_anthropic(
    system_prompt: str,
    user_message: str,
    temperature: float,
    max_tokens: int,
) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": "claude-3-haiku-20240307",
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_message}],
            },
        )
        res.raise_for_status()
        return res.json()["content"][0]["text"]


def _rule_based_fallback(query: str) -> str:
    """No AI key — return honest fallback."""
    return (
        "AI service is not configured. Please add OPENAI_API_KEY or ANTHROPIC_API_KEY "
        "to your environment variables. CRM data queries still work without AI."
    )
