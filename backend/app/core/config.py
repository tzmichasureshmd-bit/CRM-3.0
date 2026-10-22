from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "Tzmicha CRM 3.0"
    app_env: str = "development"
    debug_mode: bool = False  # FIX-014: default False; set DEBUG_MODE=true in .env for local dev
    port: int = 8000

    # Database
    database_url: str
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Firebase / Google Auth
    firebase_project_id: str = "tzmicha-crm-3"
    firebase_messaging_sender_id: str = "869766401718"

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # AI
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    ai_service_url: str = "http://ai-service:8001"

    # Meta / Facebook Ads
    meta_ad_account_id: str = ""
    meta_api_version: str = "v26.0"
    meta_access_token: str = ""
    meta_app_id: str = ""
    meta_app_secret: str = ""  # used for Lead Ads webhook signature verification

    # WhatsApp (Meta)
    whatsapp_verify_token: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""

    # Instagram (Meta)
    instagram_verify_token: str = ""
    instagram_app_secret: str = ""
    instagram_page_id: str = ""

    # Facebook Messenger (Meta)
    facebook_verify_token: str = ""
    facebook_app_secret: str = ""
    facebook_page_id: str = ""
    facebook_page_access_token: str = ""

    # Telegram Bot API
    telegram_bot_token: str = ""
    telegram_webhook_secret: str = ""

    # Email (SMTP/IMAP)
    email_smtp_host: str = "smtp.gmail.com"
    email_smtp_port: int = 587
    email_smtp_user: str = ""
    email_smtp_password: str = ""
    email_imap_host: str = "imap.gmail.com"
    email_imap_port: int = 993
    email_from_name: str = "CRM 3.0"
    email_from_address: str = ""
    email_fetch_interval: int = 60  # seconds

    # Encryption
    encryption_key: str

    # CORS
    allowed_origins: str = "https://crm3.tzmicha.com,http://localhost:3000"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
