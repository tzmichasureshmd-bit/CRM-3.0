from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "Tzmicha CRM 3.0"
    app_env: str = "development"
    debug_mode: bool = True
    port: int = 8000

    # Database
    database_url: str
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str

    # Redis
    redis_url: str = "redis://localhost:6379/0"

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
    ai_service_url: str = "http://localhost:8001"

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
    allowed_origins: str = "http://localhost:3001"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
