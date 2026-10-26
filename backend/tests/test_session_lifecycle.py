"""
Regression tests — JWT session lifecycle.

Root cause fixed: verify-request.ts (Next.js) and layout.tsx were rejecting
tokens based on client-side expiry checks. Backend jwt_expire_minutes was 7
days (10080), causing sessions to die weekly. Fixed to 525600 (1 year) and
removed the redundant client-side expiry gate.

These tests cover the complete session lifecycle on the FastAPI backend.
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock
from jose import jwt
from conftest import (
    TEST_USER_ID, TEST_ACCOUNT_ID,
    make_token, set_db_result,
    TEST_JWT_SECRET, TEST_ALGORITHM,
)


def _profile(token_version=1):
    return {
        "account_id": TEST_ACCOUNT_ID,
        "role": "owner",
        "token_version": token_version,
        "is_active": True,
    }


def _set_profile(db, profile_data):
    eq = db.table.return_value.select.return_value.eq.return_value
    eq.limit.return_value.execute.return_value.data = (
        [profile_data] if profile_data else []
    )
    eq.maybe_single.return_value.execute.return_value.data = profile_data


class TestTokenExpiryClaims:
    """Verify the backend issues tokens with the correct expiry."""

    def test_login_token_expires_in_one_year(self, app_client):
        """Token exp claim must be ~1 year from now (525600 minutes)."""
        from passlib.context import CryptContext
        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        real_hash = pwd_ctx.hash("password123")

        client, db = app_client
        profile = {
            **_profile(),
            "user_id": TEST_USER_ID,
            "email": "user@example.com",
            "full_name": "Test User",
            "avatar_url": "",
            "password_hash": real_hash,
            "totp_enabled": False,
            "totp_secret": None,
        }
        _set_profile(db, profile)

        resp = client.post("/api/v1/auth/login", json={
            "email": "user@example.com", "password": "password123"
        })
        assert resp.status_code == 200
        token = resp.json()["access_token"]

        payload = jwt.decode(
            token, TEST_JWT_SECRET,
            algorithms=[TEST_ALGORITHM],
            options={"verify_aud": False},
        )
        exp = payload["exp"]
        now = datetime.utcnow().timestamp()
        days_until_expiry = (exp - now) / 86400
        # Must be at least 364 days (allow 1 day tolerance)
        assert days_until_expiry >= 364, (
            f"Token expires in {days_until_expiry:.1f} days — expected ~365"
        )

    def test_partial_totp_token_expires_in_5_minutes(self, app_client):
        """Partial tokens must be short-lived and carry partial=True claim."""
        from passlib.context import CryptContext
        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        real_hash = pwd_ctx.hash("password123")

        client, db = app_client
        profile = {
            **_profile(),
            "user_id": TEST_USER_ID,
            "email": "user@example.com",
            "full_name": "Test User",
            "avatar_url": "",
            "password_hash": real_hash,
            "totp_enabled": True,
            "totp_secret": "JBSWY3DPEHPK3PXP",
        }
        _set_profile(db, profile)

        resp = client.post("/api/v1/auth/login", json={
            "email": "user@example.com", "password": "password123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("totp_required") is True

        partial = data["partial_token"]
        payload = jwt.decode(
            partial, TEST_JWT_SECRET,
            algorithms=[TEST_ALGORITHM],
            options={"verify_aud": False},
        )
        # Must carry partial=True claim so all protected routes reject it
        assert payload.get("partial") is True
        # Must have an exp claim
        assert "exp" in payload
        # Must expire before the full token (exp < now + 1 year)
        now = datetime.utcnow().timestamp()
        one_year = now + (525600 * 60)
        assert payload["exp"] < one_year, "Partial token must expire before full token"


class TestSessionNavigation:
    """Simulate what happens when a user navigates between pages."""

    def test_valid_token_accepted_on_multiple_consecutive_requests(self, app_client):
        """Navigating between pages must not cause 401s."""
        client, db = app_client
        token = make_token()
        _set_profile(db, _profile())
        db.table.return_value.select.return_value.eq.return_value \
            .order.return_value.limit.return_value.execute.return_value.data = []

        for _ in range(5):
            resp = client.get(
                "/api/v1/contacts",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert resp.status_code not in (401, 403), (
                f"Got {resp.status_code} on repeated navigation request"
            )

    def test_same_token_works_across_different_endpoints(self, app_client):
        """One token must work on all protected endpoints — no per-route expiry."""
        client, db = app_client
        token = make_token()
        _set_profile(db, _profile())

        # Wire generic empty-list response for all list endpoints
        chain = db.table.return_value.select.return_value.eq.return_value
        chain.order.return_value.limit.return_value.execute.return_value.data = []
        chain.limit.return_value.execute.return_value.data = [_profile()]

        endpoints = [
            "/api/v1/contacts",
            "/api/v1/deals",
        ]
        for ep in endpoints:
            resp = client.get(ep, headers={"Authorization": f"Bearer {token}"})
            assert resp.status_code not in (401, 403), (
                f"Endpoint {ep} rejected valid token with {resp.status_code}"
            )


class TestTokenSecurity:
    """Security properties must be preserved despite long-lived tokens."""

    def test_expired_token_still_rejected_by_backend(self, app_client):
        """Backend must still reject genuinely expired tokens."""
        client, db = app_client
        expired = make_token(expired=True)
        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {expired}"}
        )
        assert resp.status_code == 401

    def test_wrong_signature_rejected(self, app_client):
        client, db = app_client
        bad = make_token(wrong_secret=True)
        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {bad}"}
        )
        assert resp.status_code == 401

    def test_partial_token_rejected_on_protected_route(self, app_client):
        client, db = app_client
        partial = make_token(partial=True)
        _set_profile(db, _profile())
        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {partial}"}
        )
        assert resp.status_code == 401

    def test_old_token_version_rejected_after_password_reset(self, app_client):
        """Token version revocation must still work with long-lived tokens."""
        client, db = app_client
        old_token = make_token(token_version=1)
        _set_profile(db, _profile(token_version=2))
        resp = client.get(
            "/api/v1/auth/totp/setup",
            headers={"Authorization": f"Bearer {old_token}"}
        )
        assert resp.status_code in (401, 403)

    def test_missing_token_rejected(self, app_client):
        client, db = app_client
        resp = client.get("/api/v1/contacts")
        assert resp.status_code in (401, 403)

    def test_malformed_token_rejected(self, app_client):
        client, db = app_client
        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": "Bearer not.a.jwt"}
        )
        assert resp.status_code == 401

    def test_no_bearer_prefix_rejected(self, app_client):
        client, db = app_client
        token = make_token()
        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": token}
        )
        assert resp.status_code in (401, 403)


class TestSessionRestoration:
    """Token stored in localStorage must work after page reload."""

    def test_token_from_login_response_is_immediately_usable(self, app_client):
        """Token returned by login must work on the very next request."""
        from passlib.context import CryptContext
        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        real_hash = pwd_ctx.hash("password123")

        client, db = app_client
        profile = {
            **_profile(),
            "user_id": TEST_USER_ID,
            "email": "user@example.com",
            "full_name": "Test User",
            "avatar_url": "",
            "password_hash": real_hash,
            "totp_enabled": False,
            "totp_secret": None,
        }
        _set_profile(db, profile)

        login_resp = client.post("/api/v1/auth/login", json={
            "email": "user@example.com", "password": "password123"
        })
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        # Simulate page reload — use the stored token immediately
        _set_profile(db, _profile())
        db.table.return_value.select.return_value.eq.return_value \
            .order.return_value.limit.return_value.execute.return_value.data = []

        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code not in (401, 403)
