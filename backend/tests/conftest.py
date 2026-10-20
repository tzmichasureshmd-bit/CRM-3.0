"""
CRM 3.0 — Auth test fixtures.
All tests use mocked DB and mocked external services.
No production data, no real Firebase calls, no real email delivery.
"""
import os
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

# ── Inject required env vars BEFORE any app import ───────────────────────────
os.environ.setdefault("DATABASE_URL",              "postgresql://test:test@localhost/test")
os.environ.setdefault("SUPABASE_URL",              "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("SUPABASE_ANON_KEY",         "test-anon-key")
os.environ.setdefault("JWT_SECRET",                "test-secret-do-not-use-in-production")
os.environ.setdefault("ENCRYPTION_KEY",            "test-encryption-key-32-chars-long!")
os.environ.setdefault("DEBUG_MODE",                "false")
os.environ.setdefault("ALLOWED_ORIGINS",           "http://localhost:3000,https://crm3.tzmicha.com")
os.environ.setdefault("FIREBASE_PROJECT_ID",       "test-firebase-project")

from jose import jwt
from datetime import datetime, timedelta
import hashlib, secrets

# ── Test constants ────────────────────────────────────────────
TEST_JWT_SECRET    = "test-secret-do-not-use-in-production"
TEST_ALGORITHM     = "HS256"
TEST_FIREBASE_PID  = "test-firebase-project"
TEST_USER_ID       = "00000000-0000-0000-0000-000000000001"
TEST_ACCOUNT_ID    = "00000000-0000-0000-0000-000000000002"
TEST_USER_ID_2     = "00000000-0000-0000-0000-000000000003"
TEST_ACCOUNT_ID_2  = "00000000-0000-0000-0000-000000000004"


def make_token(user_id=TEST_USER_ID, account_id=TEST_ACCOUNT_ID,
               role="owner", partial=False, expired=False,
               token_version=1, wrong_secret=False):
    exp = datetime.utcnow() + timedelta(minutes=-1 if expired else 60)
    payload = {"sub": user_id, "account_id": account_id,
               "role": role, "exp": exp, "ver": token_version}
    if partial:
        payload["partial"] = True
    secret = "wrong-secret" if wrong_secret else TEST_JWT_SECRET
    return jwt.encode(payload, secret, algorithm=TEST_ALGORITHM)


def hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def make_mock_db():
    db = MagicMock()
    chain = db.table.return_value.select.return_value.eq.return_value
    chain.maybe_single.return_value.execute.return_value.data = None
    chain.single.return_value.execute.return_value.data = None
    db.table.return_value.insert.return_value.execute.return_value.data = [{"id": TEST_ACCOUNT_ID}]
    db.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [{}]
    db.table.return_value.upsert.return_value.execute.return_value.data = [{}]
    return db


@pytest.fixture
def mock_db():
    return make_mock_db()


@pytest.fixture
def mock_email_service(monkeypatch):
    svc = MagicMock()
    svc.send_email = AsyncMock(return_value=None)
    monkeypatch.setattr("app.services.email_service.get_email_service", lambda: svc)
    return svc


@pytest.fixture
def app_client(mock_db):
    from app.core.config import get_settings
    get_settings.cache_clear()

    from app.main import app
    from app.db.supabase import get_db, get_supabase

    # Override FastAPI Depends() injections
    app.dependency_overrides[get_db]      = lambda: mock_db
    app.dependency_overrides[get_supabase] = lambda: mock_db

    # Also patch the direct call in middleware/auth.py (not via Depends)
    with patch("app.middleware.auth.get_supabase", return_value=mock_db):
        from fastapi.testclient import TestClient
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, mock_db

    app.dependency_overrides.clear()
