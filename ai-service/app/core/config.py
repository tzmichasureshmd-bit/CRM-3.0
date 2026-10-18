from pydantic_settings import BaseSettings
from functools import lru_cache


class AISettings(BaseSettings):
    app_name: str = "Tzmicha CRM 3.0 AI Service"
    port: int = 8001
    debug: bool = True

    openai_api_key: str = ""
    anthropic_api_key: str = ""
    default_model: str = "gpt-4o-mini"
    default_provider: str = "openai"

    supabase_url: str = ""
    supabase_service_role_key: str = ""

    redis_url: str = "redis://redis:6379/1"
    backend_url: str = "http://backend:8000"

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


@lru_cache
def get_ai_settings() -> AISettings:
    return AISettings()
