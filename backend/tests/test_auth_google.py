"""
Tests: Firebase token verification, Google auth flows, account linking (FIX-007).
Covers H.4, H.5, H.6 from the test plan.
"""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from conftest import TEST_USER_ID, TEST_ACCOUNT_ID, set_db_result


VALID_FIREBASE_PAYLOAD = {
    "sub": "google-uid-123",
    "email": "google@example.com",
    "email_verified": True,
    "name": "Google User",
    "picture": "https://example.com/photo.jpg",
}


def _make_limit_side_effect(db, responses: list):
    """
    Make .limit(1).execute().data return successive values from `responses`.
    google_auth calls .limit(1).execute() twice:
      1st: google_id lookup
      2nd: email lookup (only if google_id not found)
    """
    call_count = [0]
    original_limit = db.table.return_value.select.return_value.eq.return_value.limit

    def limit_side_effect(*args, **kwargs):
        mock = MagicMock()
        idx = call_count[0]
        call_count[0] += 1
        val = responses[idx] if idx < len(responses) else None
        mock.execute.return_value.data = [val] if val is not None else []
        return mock

    db.table.return_value.select.return_value.eq.return_value.limit.side_effect = limit_side_effect


class TestGoogleAuth:
    def test_new_google_user_creates_account(self, app_client):
        client, db = app_client
        # google_id lookup → not found; email lookup → not found
        _make_limit_side_effect(db, [None, None])
        db.table.return_value.insert.return_value.execute.return_value.data = [{"id": TEST_ACCOUNT_ID}]
        db.table.return_value.insert.return_value.select.return_value.execute.return_value.data = [{"id": TEST_ACCOUNT_ID}]

        with patch("app.api.v1.auth.verify_firebase_token", new=AsyncMock(return_value=VALID_FIREBASE_PAYLOAD)):
            resp = client.post("/api/v1/auth/google", json={"id_token": "valid-firebase-token"})

        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["email"] == "google@example.com"

    def test_returning_google_user_gets_existing_profile(self, app_client):
        client, db = app_client
        existing_profile = {
            "user_id": TEST_USER_ID, "account_id": TEST_ACCOUNT_ID,
            "role": "owner", "token_version": 1, "is_active": True,
        }
        # google_id lookup → found (returns existing profile immediately)
        _make_limit_side_effect(db, [existing_profile])

        with patch("app.api.v1.auth.verify_firebase_token", new=AsyncMock(return_value=VALID_FIREBASE_PAYLOAD)):
            resp = client.post("/api/v1/auth/google", json={"id_token": "valid-firebase-token"})

        assert resp.status_code == 200
        assert resp.json()["user_id"] == TEST_USER_ID

    def test_invalid_firebase_token_returns_401(self, app_client):
        client, db = app_client
        from fastapi import HTTPException
        with patch("app.api.v1.auth.verify_firebase_token",
                   new=AsyncMock(side_effect=HTTPException(status_code=401, detail="Invalid Google token"))):
            resp = client.post("/api/v1/auth/google", json={"id_token": "bad-token"})
        assert resp.status_code == 401

    def test_unverified_google_email_returns_400(self, app_client):
        client, db = app_client
        unverified_payload = {**VALID_FIREBASE_PAYLOAD, "email_verified": False}
        set_db_result(db, None)

        with patch("app.api.v1.auth.verify_firebase_token", new=AsyncMock(return_value=unverified_payload)):
            resp = client.post("/api/v1/auth/google", json={"id_token": "unverified-token"})

        assert resp.status_code == 400
        assert "verified" in resp.json()["detail"].lower()

    def test_google_login_with_existing_email_password_account_returns_409(self, app_client):
        """FIX-007: Google login with email matching existing email/password account must not auto-link."""
        client, db = app_client
        existing_email_profile = {
            "user_id": TEST_USER_ID, "account_id": TEST_ACCOUNT_ID,
            "role": "owner", "google_id": None,
            "token_version": 1, "is_active": True,
        }
        # google_id lookup → not found; email lookup → found (no google_id)
        _make_limit_side_effect(db, [None, existing_email_profile])

        with patch("app.api.v1.auth.verify_firebase_token", new=AsyncMock(return_value=VALID_FIREBASE_PAYLOAD)):
            resp = client.post("/api/v1/auth/google", json={"id_token": "valid-firebase-token"})

        assert resp.status_code == 409
        detail = resp.json()["detail"].lower()
        assert "already exists" in detail or "sign in with your password" in detail

    def test_google_login_conflicting_google_id_returns_409(self, app_client):
        """FIX-007: Email linked to a different Google UID must be rejected."""
        client, db = app_client
        conflicting_profile = {
            "user_id": TEST_USER_ID, "account_id": TEST_ACCOUNT_ID,
            "role": "owner", "google_id": "different-google-uid",
            "token_version": 1, "is_active": True,
        }
        # google_id lookup → not found; email lookup → found with different google_id
        _make_limit_side_effect(db, [None, conflicting_profile])

        with patch("app.api.v1.auth.verify_firebase_token", new=AsyncMock(return_value=VALID_FIREBASE_PAYLOAD)):
            resp = client.post("/api/v1/auth/google", json={"id_token": "valid-firebase-token"})

        assert resp.status_code == 409
        assert "different google account" in resp.json()["detail"].lower()
