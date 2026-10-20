"""
AI API Keys settings — save/load per account, test connections, fallback chain.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.middleware.auth import get_current_user
from app.db.supabase import get_supabase
import json

router = APIRouter()


class ProviderConfig(BaseModel):
    api_key:        str   = ""
    model:          str   = ""
    enabled:        bool  = False
    is_default:     bool  = False
    fallback_order: int   = 0


class AIKeysConfig(BaseModel):
    openai:    Optional[ProviderConfig] = None
    anthropic: Optional[ProviderConfig] = None
    groq:      Optional[ProviderConfig] = None
    gemini:    Optional[ProviderConfig] = None


class TestRequest(BaseModel):
    provider: str
    api_key:  str
    model:    str


@router.get("/settings/ai-keys")
async def get_ai_keys(current_user: dict = Depends(get_current_user)):
    db = get_supabase()
    res = db.table("account_settings").select("value") \
            .eq("account_id", current_user["account_id"]) \
            .eq("key", "ai_keys").limit(1).execute()
    if res and res.data:
        raw = res.data[0]["value"]
        # value column is text — parse JSON string back to dict
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except Exception:
                return {}
        return raw  # already a dict (legacy jsonb)
    return {}


@router.post("/settings/ai-keys")
async def save_ai_keys(payload: AIKeysConfig, current_user: dict = Depends(get_current_user)):
    db = get_supabase()
    # Serialize to JSON string because account_settings.value is text
    db.table("account_settings").upsert({
        "account_id": current_user["account_id"],
        "key":        "ai_keys",
        "value":      json.dumps(payload.model_dump(exclude_none=True)),
    }, on_conflict="account_id,key").execute()
    return {"status": "saved"}


@router.post("/settings/ai-keys/test")
async def test_ai_key(payload: TestRequest, current_user: dict = Depends(get_current_user)):
    """Test an API key by making a minimal real API call."""
    try:
        if payload.provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=payload.api_key)
            resp = await client.chat.completions.create(
                model=payload.model,
                messages=[{"role": "user", "content": "Say OK"}],
                max_tokens=5,
            )
            return {"ok": True, "message": f"Model: {resp.model}"}

        elif payload.provider == "anthropic":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=payload.api_key)
            resp = await client.messages.create(
                model=payload.model,
                max_tokens=5,
                messages=[{"role": "user", "content": "Say OK"}],
            )
            return {"ok": True, "message": f"Model: {resp.model}"}

        elif payload.provider == "groq":
            from groq import AsyncGroq
            client = AsyncGroq(api_key=payload.api_key)
            resp = await client.chat.completions.create(
                model=payload.model,
                messages=[{"role": "user", "content": "Say OK"}],
                max_tokens=5,
            )
            return {"ok": True, "message": f"Model: {resp.model}"}

        elif payload.provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=payload.api_key)
            model = genai.GenerativeModel(payload.model)
            resp = model.generate_content("Say OK")
            return {"ok": True, "message": "Gemini connected"}

        else:
            raise HTTPException(status_code=400, detail=f"Unknown provider: {payload.provider}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)[:200])
