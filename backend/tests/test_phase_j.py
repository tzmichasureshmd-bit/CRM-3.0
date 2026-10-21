"""
Phase J — Regression Tests
Covers:
  1. TokenResponse None-coercion (avatar_url/full_name/email None -> "")
  2. auth.py register insert().select() fix
  3. Login endpoint with NULL DB fields
  4. Broadcast DB-level lock source verification
  5. Realtime hook source verification
  6. Playwright infrastructure
"""
import pathlib, sys, re
ROOT = pathlib.Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import pytest
from unittest.mock import MagicMock
from tests.conftest import make_token, set_db_result, TEST_ACCOUNT_ID, TEST_USER_ID


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_profile(account_id=TEST_ACCOUNT_ID):
    return {"account_id": account_id, "role": "owner", "token_version": 1}


# ── J1: TokenResponse None-coercion ──────────────────────────────────────────

class TestTokenResponseNoneCoercion:
    """TokenResponse must never raise ValidationError for NULL DB fields."""

    def test_token_response_accepts_none_avatar_url(self):
        from app.api.v1.auth import TokenResponse
        r = TokenResponse(
            access_token="tok", user_id="u1", account_id="a1", role="owner",
            full_name="Test", email="test@test.com", avatar_url=None,
        )
        assert r.avatar_url == ""

    def test_token_response_accepts_none_full_name(self):
        from app.api.v1.auth import TokenResponse
        r = TokenResponse(
            access_token="tok", user_id="u1", account_id="a1", role="owner",
            full_name=None, email="test@test.com",
        )
        assert r.full_name == ""

    def test_token_response_accepts_none_email(self):
        from app.api.v1.auth import TokenResponse
        r = TokenResponse(
            access_token="tok", user_id="u1", account_id="a1", role="owner",
            full_name="Test", email=None,
        )
        assert r.email == ""

    def test_login_endpoint_with_null_avatar_url(self, app_client):
        client, db = app_client
        from passlib.context import CryptContext
        pw_hash = CryptContext(schemes=["bcrypt"], deprecated="auto").hash("testpass123")
        result = MagicMock()
        result.data = [{
            "user_id": TEST_USER_ID, "account_id": TEST_ACCOUNT_ID,
            "role": "owner", "full_name": "Test", "email": "test@example.com",
            "avatar_url": None, "password_hash": pw_hash,
            "totp_secret": None, "totp_enabled": False, "token_version": 1,
        }]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = result
        resp = client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "testpass123"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["avatar_url"] == ""

    def test_login_endpoint_with_null_full_name(self, app_client):
        client, db = app_client
        from passlib.context import CryptContext
        pw_hash = CryptContext(schemes=["bcrypt"], deprecated="auto").hash("testpass123")
        result = MagicMock()
        result.data = [{
            "user_id": TEST_USER_ID, "account_id": TEST_ACCOUNT_ID,
            "role": "owner", "full_name": None, "email": "test@example.com",
            "avatar_url": None, "password_hash": pw_hash,
            "totp_secret": None, "totp_enabled": False, "token_version": 1,
        }]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = result
        resp = client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "testpass123"})
        assert resp.status_code == 200
        assert resp.json()["full_name"] == ""

    def test_login_endpoint_with_null_email_in_profile(self, app_client):
        client, db = app_client
        from passlib.context import CryptContext
        pw_hash = CryptContext(schemes=["bcrypt"], deprecated="auto").hash("testpass123")
        result = MagicMock()
        result.data = [{
            "user_id": TEST_USER_ID, "account_id": TEST_ACCOUNT_ID,
            "role": "owner", "full_name": "Test", "email": None,
            "avatar_url": None, "password_hash": pw_hash,
            "totp_secret": None, "totp_enabled": False, "token_version": 1,
        }]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = result
        resp = client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "testpass123"})
        assert resp.status_code == 200
        assert resp.json()["email"] == ""


# ── J2: Register insert().select() fix ───────────────────────────────────────

class TestRegisterInsertFix:
    def test_register_source_no_insert_select_same_line(self):
        src = (ROOT / "backend" / "app" / "api" / "v1" / "auth.py").read_text(encoding="utf-8")
        bad = [l.strip() for l in src.splitlines() if ".insert(" in l and ".select(" in l]
        assert bad == [], f"Found insert().select() on same line: {bad}"

    def test_register_endpoint_not_500(self, app_client):
        client, db = app_client
        no_profile = MagicMock()
        no_profile.data = []
        account_result = MagicMock()
        account_result.data = [{"id": TEST_ACCOUNT_ID, "name": "Test Co"}]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = no_profile
        db.table.return_value.insert.return_value.execute.return_value = account_result
        resp = client.post("/api/v1/auth/register", json={
            "email": "newuser@example.com", "password": "password123",
            "full_name": "New User", "account_name": "New Co",
        })
        assert resp.status_code != 500, f"Register returned 500: {resp.text}"


# ── J3: Auth source audit ─────────────────────────────────────────────────────

class TestAuthSourceAudit:
    def _src(self):
        return (ROOT / "backend" / "app" / "api" / "v1" / "auth.py").read_text(encoding="utf-8")

    def test_no_insert_select_same_line(self):
        bad = [l.strip() for l in self._src().splitlines() if ".insert(" in l and ".select(" in l]
        assert bad == [], f"insert().select() on same line: {bad}"

    def test_tokenresponse_has_field_validator(self):
        assert "field_validator" in self._src() or 'or ""' in self._src()

    def test_no_bare_select_id_after_insert(self):
        src = self._src()
        assert '}).select("id").execute()' not in src

    def test_login_returns_tokenresponse(self):
        assert "return TokenResponse(" in self._src()

    def test_google_auth_has_email_verified_check(self):
        assert "email_verified" in self._src()

    def test_otp_verify_uses_hash_comparison(self):
        src = self._src()
        assert "verify_otp_hash" in src
        assert "code_hash" in src


# ── J4: Broadcast atomicity ───────────────────────────────────────────────────

class TestBroadcastAtomicity:
    def _src(self):
        return (ROOT / "backend" / "app" / "services" / "broadcast_service.py").read_text(encoding="utf-8")

    def test_db_status_guard_present(self):
        assert 'broadcast.get("status") == "sending"' in self._src()

    def test_in_memory_lock_present(self):
        assert "_ACTIVE_BROADCAST_LOCKS" in self._src()

    def test_lock_released_in_finally(self):
        src = self._src()
        assert "finally:" in src
        assert "_ACTIVE_BROADCAST_LOCKS.discard" in src


# ── J5: Realtime hook ─────────────────────────────────────────────────────────

class TestRealtimeHook:
    def _src(self):
        return (ROOT / "src" / "hooks" / "use-inbox-realtime.ts").read_text(encoding="utf-8")

    def test_channel_error_handled(self):
        assert "CHANNEL_ERROR" in self._src()

    def test_timed_out_handled(self):
        assert "TIMED_OUT" in self._src()

    def test_auth_probe_present(self):
        assert "/api/v3/profile" in self._src()

    def test_redirect_on_401(self):
        src = self._src()
        assert "401" in src
        assert "/login" in src

    def test_no_resubscribe_in_error_handler(self):
        src = self._src()
        lines = src.splitlines()
        in_error = False
        for line in lines:
            if "CHANNEL_ERROR" in line or "TIMED_OUT" in line:
                in_error = True
            if in_error and ".subscribe(" in line:
                pytest.fail("CHANNEL_ERROR handler calls .subscribe() — infinite loop risk")
            if in_error and line.strip() == "}":
                break


# ── J6: Playwright infrastructure ────────────────────────────────────────────

class TestPlaywrightInfrastructure:
    def test_playwright_config_exists(self):
        assert (ROOT / "playwright.config.ts").exists()

    def test_e2e_spec_exists(self):
        assert (ROOT / "e2e" / "crm.spec.ts").exists()

    def test_global_setup_exists(self):
        assert (ROOT / "e2e" / "global-setup.ts").exists()

    def test_playwright_config_references_global_setup(self):
        content = (ROOT / "playwright.config.ts").read_text(encoding="utf-8")
        assert "globalSetup" in content

    def test_e2e_spec_has_sufficient_tests(self):
        content = (ROOT / "e2e" / "crm.spec.ts").read_text(encoding="utf-8")
        tests = re.findall(r'\btest\(', content)
        assert len(tests) >= 30, f"Expected >=30 tests, found {len(tests)}"

    def test_e2e_spec_covers_all_routes(self):
        content = (ROOT / "e2e" / "crm.spec.ts").read_text(encoding="utf-8")
        for route in [
            "/dashboard", "/contacts", "/inbox", "/knowledge", "/media",
            "/experiments", "/settings/billing", "/broadcasts",
            "/automations", "/agents", "/inbox/instagram", "/inbox/telegram",
        ]:
            assert route in content, f"E2E spec missing route: {route}"
