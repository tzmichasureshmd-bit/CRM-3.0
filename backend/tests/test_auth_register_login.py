"""
Tests: email registration, password hashing, duplicate email, login success/failure.
Covers H.1, H.2, H.3 from the test plan.
"""
import pytest
from unittest.mock import MagicMock, patch, call
from fastapi.testclient import TestClient
from passlib.context import CryptContext

from conftest import (
    TEST_JWT_SECRET, TEST_ALGORITHM, TEST_USER_ID, TEST_ACCOUNT_ID,
    make_token, hash_otp, set_db_result,
)

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _make_profile(user_id=TEST_USER_ID, account_id=TEST_ACCOUNT_ID,
                  role="owner", email="test@example.com",
                  password="hashed", token_version=1, is_active=True):
    return {
        "user_id": user_id, "account_id": account_id, "role": role,
        "full_name": "Test User", "email": email,
        "password_hash": pwd_ctx.hash(password) if password != "hashed" else pwd_ctx.hash("password123"),
        "avatar_url": "", "totp_enabled": False, "totp_secret": None,
        "token_version": token_version, "is_active": is_active,
    }


class TestRegistration:
    def test_register_success(self, app_client):
        client, db = app_client
        # No existing profile with this email
        set_db_result(db, None)
        db.table.return_value.insert.return_value.execute.return_value.data = [{"id": TEST_ACCOUNT_ID}]
        db.table.return_value.insert.return_value.select.return_value.execute.return_value.data = [{"id": TEST_ACCOUNT_ID}]

        resp = client.post("/api/v1/auth/register", json={
            "email": "new@example.com", "password": "password123",
            "full_name": "New User", "account_name": "New Co",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert data["role"] == "owner"
        assert data["email"] == "new@example.com"

    def test_register_duplicate_email_returns_409(self, app_client):
        client, db = app_client
        # Existing profile found for this email
        set_db_result(db, {"user_id": TEST_USER_ID})

        resp = client.post("/api/v1/auth/register", json={
            "email": "existing@example.com", "password": "password123",
            "full_name": "Dup User", "account_name": "Dup Co",
        })
        assert resp.status_code == 409
        assert "already registered" in resp.json()["detail"].lower()

    def test_register_normalizes_email_to_lowercase(self, app_client):
        client, db = app_client
        set_db_result(db, None)
        db.table.return_value.insert.return_value.execute.return_value.data = [{"id": TEST_ACCOUNT_ID}]
        db.table.return_value.insert.return_value.select.return_value.execute.return_value.data = [{"id": TEST_ACCOUNT_ID}]

        resp = client.post("/api/v1/auth/register", json={
            "email": "UPPER@EXAMPLE.COM", "password": "password123",
            "full_name": "Upper User", "account_name": "Upper Co",
        })
        assert resp.status_code == 201
        assert resp.json()["email"] == "upper@example.com"

    def test_register_password_is_hashed_not_stored_plaintext(self, app_client):
        client, db = app_client
        set_db_result(db, None)
        db.table.return_value.insert.return_value.execute.return_value.data = [{"id": TEST_ACCOUNT_ID}]
        db.table.return_value.insert.return_value.select.return_value.execute.return_value.data = [{"id": TEST_ACCOUNT_ID}]

        resp = client.post("/api/v1/auth/register", json={
            "email": "hash@example.com", "password": "mypassword",
            "full_name": "Hash User", "account_name": "Hash Co",
        })
        assert resp.status_code == 201
        # Verify the insert call stored a bcrypt hash, not plaintext
        insert_calls = db.table.return_value.insert.call_args_list
        inserted_data = None
        for c in insert_calls:
            args = c[0]
            if args and isinstance(args[0], dict) and "password_hash" in args[0]:
                inserted_data = args[0]
                break
        assert inserted_data is not None, "No insert call with password_hash found"
        stored_hash = inserted_data["password_hash"]
        assert stored_hash != "mypassword"
        assert pwd_ctx.verify("mypassword", stored_hash)


class TestLogin:
    def test_login_success(self, app_client):
        client, db = app_client
        profile = _make_profile(password="password123")
        set_db_result(db, profile)

        resp = client.post("/api/v1/auth/login", json={
            "email": "test@example.com", "password": "password123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user_id"] == TEST_USER_ID

    def test_login_wrong_password_returns_401(self, app_client):
        client, db = app_client
        profile = _make_profile(password="correct_password")
        set_db_result(db, profile)

        resp = client.post("/api/v1/auth/login", json={
            "email": "test@example.com", "password": "wrong_password"
        })
        assert resp.status_code == 401
        assert "invalid" in resp.json()["detail"].lower()

    def test_login_nonexistent_email_returns_401(self, app_client):
        client, db = app_client
        set_db_result(db, None)

        resp = client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com", "password": "password123"
        })
        assert resp.status_code == 401

    def test_login_disabled_account_returns_403(self, app_client):
        client, db = app_client
        profile = _make_profile(password="password123", is_active=False)
        set_db_result(db, profile)

        resp = client.post("/api/v1/auth/login", json={
            "email": "test@example.com", "password": "password123"
        })
        assert resp.status_code == 403
        assert "disabled" in resp.json()["detail"].lower()

    def test_login_totp_enabled_returns_partial_token(self, app_client):
        client, db = app_client
        profile = _make_profile(password="password123")
        profile["totp_enabled"] = True
        profile["totp_secret"]  = "JBSWY3DPEHPK3PXP"
        set_db_result(db, profile)

        resp = client.post("/api/v1/auth/login", json={
            "email": "test@example.com", "password": "password123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("totp_required") is True
        assert "partial_token" in data
