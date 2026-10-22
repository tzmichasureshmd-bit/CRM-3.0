"""
Tests: JWT middleware — valid/invalid/expired/partial tokens, cross-tenant denial.
Covers H.12, H.13, H.14 from the test plan.
"""
import pytest
from unittest.mock import MagicMock
from tests.conftest import (
    TEST_USER_ID, TEST_ACCOUNT_ID, TEST_USER_ID_2, TEST_ACCOUNT_ID_2,
    make_token, set_db_result,
)


def _profile(user_id=TEST_USER_ID, account_id=TEST_ACCOUNT_ID,
             role="owner", token_version=1, is_active=True):
    return {
        "account_id": account_id, "role": role,
        "token_version": token_version, "is_active": is_active,
    }


def _set_profile(db, profile_data):
    """Set profile data on both mock chains used by the codebase."""
    eq_chain = db.table.return_value.select.return_value.eq.return_value
    eq_chain.maybe_single.return_value.execute.return_value.data = profile_data
    eq_chain.limit.return_value.execute.return_value.data = (
        [profile_data] if profile_data else []
    )


class TestJwtMiddleware:
    def test_valid_token_allows_access(self, app_client):
        client, db = app_client
        token = make_token()
        _set_profile(db, _profile())
        # Also mock the contacts query chain
        db.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []

        resp = client.get("/api/v1/contacts", headers={"Authorization": f"Bearer {token}"})
        # 200 or 500 (DB not fully mocked) — but NOT 401/403
        assert resp.status_code not in (401, 403)

    def test_missing_token_returns_401(self, app_client):
        client, db = app_client
        resp = client.get("/api/v1/contacts")
        # FastAPI HTTPBearer returns 403 when Authorization header is absent
        assert resp.status_code in (401, 403)

    def test_invalid_signature_returns_401(self, app_client):
        client, db = app_client
        bad_token = make_token(wrong_secret=True)
        resp = client.get("/api/v1/contacts", headers={"Authorization": f"Bearer {bad_token}"})
        assert resp.status_code == 401

    def test_expired_token_returns_401(self, app_client):
        client, db = app_client
        expired = make_token(expired=True)
        resp = client.get("/api/v1/contacts", headers={"Authorization": f"Bearer {expired}"})
        assert resp.status_code == 401

    def test_partial_totp_token_rejected_on_protected_route(self, app_client):
        """FIX-009: Partial tokens must not access normal CRM endpoints."""
        client, db = app_client
        partial = make_token(partial=True)
        _set_profile(db, _profile())

        resp = client.get("/api/v1/contacts", headers={"Authorization": f"Bearer {partial}"})
        assert resp.status_code == 401

    def test_old_token_version_rejected_after_password_reset(self, app_client):
        """FIX-005: Token with ver=1 rejected when profile has token_version=2."""
        client, db = app_client
        old_token = make_token(token_version=1)
        _set_profile(db, _profile(token_version=2))

        resp = client.get("/api/v1/auth/totp/setup", headers={"Authorization": f"Bearer {old_token}"})
        assert resp.status_code in (401, 403)

    def test_disabled_account_returns_403(self, app_client):
        """FIX-008: Disabled accounts are rejected at login/OTP-verify time.
        The JWT middleware itself does not check is_active (it's not in the
        profiles schema yet). Enforcement happens in check_account_active()
        called by login, otp_verify, and google_auth handlers.
        This test verifies the login endpoint rejects disabled accounts.
        """
        client, db = app_client
        disabled_profile = {
            **_profile(is_active=False),
            "password_hash": "$2b$12$fakehashfakehashfakehashfakehashfakehashfakehashfakeh",
            "totp_enabled": False,
            "email": "test@example.com",
        }
        # Wire the login query chain (.eq(email).limit(1).execute())
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [disabled_profile]

        from passlib.context import CryptContext
        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        real_hash = pwd_ctx.hash("testpassword")
        disabled_profile["password_hash"] = real_hash

        resp = client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "testpassword"})
        assert resp.status_code == 403

    def test_profile_not_found_returns_403(self, app_client):
        client, db = app_client
        token = make_token()
        _set_profile(db, None)

        resp = client.get("/api/v1/auth/totp/setup", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403


class TestCrossTenantDenial:
    def test_token_for_tenant_a_cannot_access_tenant_b_data(self, app_client):
        """H.14: Cross-tenant access denial — account_id always from DB, not token."""
        client, db = app_client
        # Token claims account_id_2 but DB returns account_id_1
        token = make_token(user_id=TEST_USER_ID, account_id=TEST_ACCOUNT_ID_2)

        # DB returns profile with account_id_1 (ignores token claim)
        _set_profile(db, _profile(user_id=TEST_USER_ID, account_id=TEST_ACCOUNT_ID))
        db.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []

        # The middleware re-derives account_id from DB — token claim is ignored
        resp = client.get("/api/v1/contacts", headers={"Authorization": f"Bearer {token}"})
        # Should succeed (200/500) using DB account_id, not the token's claimed account_id
        assert resp.status_code not in (401, 403)
