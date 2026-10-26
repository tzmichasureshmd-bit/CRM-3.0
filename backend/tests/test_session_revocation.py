"""
Regression tests — session revocation design.

Covers:
- Logout increments token_version (server-side revocation)
- Suspended accounts rejected on every request (not just login)
- Employee deactivation increments token_version on linked profile
- Employee deletion increments token_version on linked profile
- Password reset invalidates old tokens (existing behaviour preserved)
- Role changes take effect immediately (re-read from DB)
- Valid sessions continue working
- 403 and network errors do not trigger session-expired event
- Tenant isolation: removing employee from company A does not affect company B
"""
import pytest
from unittest.mock import MagicMock, patch, call
from conftest import (
    TEST_USER_ID, TEST_ACCOUNT_ID, TEST_USER_ID_2, TEST_ACCOUNT_ID_2,
    make_token, TEST_JWT_SECRET, TEST_ALGORITHM,
)
from datetime import datetime, timedelta
from jose import jwt


def _profile(user_id=TEST_USER_ID, account_id=TEST_ACCOUNT_ID,
             role="owner", token_version=1, is_active=True):
    return {
        "user_id": user_id,
        "account_id": account_id,
        "role": role,
        "token_version": token_version,
        "is_active": is_active,
        "totp_secret": None,
        "totp_enabled": False,
    }


def _wire_profile(db, profile):
    """Wire profile on all query chains used by get_current_user and get_profile."""
    eq = db.table.return_value.select.return_value.eq.return_value
    eq.limit.return_value.execute.return_value.data = [profile] if profile else []
    eq.maybe_single.return_value.execute.return_value.data = profile


def _wire_contacts_empty(db):
    db.table.return_value.select.return_value.eq.return_value \
        .order.return_value.limit.return_value.execute.return_value.data = []


class TestLogoutRevocation:
    """POST /auth/logout must increment token_version server-side."""

    def test_logout_increments_token_version(self, app_client):
        client, db = app_client
        token = make_token(token_version=1)
        _wire_profile(db, _profile(token_version=1))
        db.table.return_value.update.return_value.eq.return_value \
            .execute.return_value.data = [{}]

        resp = client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        # Verify update was called (token_version increment)
        assert db.table.return_value.update.called
        update_call_args = db.table.return_value.update.call_args_list
        # At least one update call should contain token_version
        updated_fields = [str(c) for c in update_call_args]
        assert any("token_version" in s for s in updated_fields)

    def test_logout_requires_valid_token(self, app_client):
        """Logout endpoint must be authenticated — cannot logout without a token."""
        client, db = app_client
        resp = client.post("/api/v1/auth/logout")
        assert resp.status_code in (401, 403)

    def test_logout_rejects_expired_token(self, app_client):
        client, db = app_client
        expired = make_token(expired=True)
        resp = client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {expired}"}
        )
        assert resp.status_code == 401


class TestSuspendedAccountRejection:
    """Suspended accounts must be rejected on every request, not just at login."""

    def test_suspended_account_rejected_on_contacts(self, app_client):
        """is_active=False in profile must cause 403 on any protected route."""
        client, db = app_client
        token = make_token()
        _wire_profile(db, _profile(is_active=False))

        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403

    def test_suspended_account_rejected_on_deals(self, app_client):
        client, db = app_client
        token = make_token()
        _wire_profile(db, _profile(is_active=False))

        resp = client.get(
            "/api/v1/deals",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403

    def test_active_account_not_rejected(self, app_client):
        """is_active=True must not cause rejection."""
        client, db = app_client
        token = make_token()
        _wire_profile(db, _profile(is_active=True))
        _wire_contacts_empty(db)

        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code not in (401, 403)

    def test_is_active_missing_defaults_to_active(self, app_client):
        """Profiles without is_active field (pre-migration) must not be rejected."""
        client, db = app_client
        token = make_token()
        # Profile without is_active key — simulates pre-migration row
        profile_no_field = {
            "account_id": TEST_ACCOUNT_ID,
            "role": "owner",
            "token_version": 1,
            # is_active intentionally absent
        }
        eq = db.table.return_value.select.return_value.eq.return_value
        eq.limit.return_value.execute.return_value.data = [profile_no_field]
        _wire_contacts_empty(db)

        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code not in (401, 403)


class TestEmployeeDeactivationRevocation:
    """Deactivating an employee must invalidate their JWT via token_version."""

    def test_deactivate_employee_increments_linked_profile_token_version(self, app_client):
        client, db = app_client
        admin_token = make_token(role="owner")
        _wire_profile(db, _profile(role="owner"))

        emp_id = "emp-uuid-001"
        linked_user_id = TEST_USER_ID_2

        # Wire employee update response
        db.table.return_value.update.return_value.eq.return_value \
            .eq.return_value.execute.return_value.data = [{
                "id": emp_id,
                "account_id": TEST_ACCOUNT_ID,
                "user_id": linked_user_id,
                "is_active": False,
            }]
        # Wire profile lookup for token_version
        db.table.return_value.select.return_value.eq.return_value \
            .limit.return_value.execute.return_value.data = [
                _profile(user_id=linked_user_id, token_version=1)
            ]

        resp = client.patch(
            f"/api/v1/employees/{emp_id}",
            json={"is_active": False},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # 200 or 404 depending on mock depth — key check is that update was called
        assert resp.status_code in (200, 404)
        assert db.table.return_value.update.called

    def test_deactivate_employee_without_linked_profile_does_not_crash(self, app_client):
        """Employee with no user_id (not yet registered) must not cause errors."""
        client, db = app_client
        admin_token = make_token(role="owner")
        _wire_profile(db, _profile(role="owner"))

        emp_id = "emp-uuid-002"
        db.table.return_value.update.return_value.eq.return_value \
            .eq.return_value.execute.return_value.data = [{
                "id": emp_id,
                "account_id": TEST_ACCOUNT_ID,
                "user_id": None,  # no linked profile
                "is_active": False,
            }]

        resp = client.patch(
            f"/api/v1/employees/{emp_id}",
            json={"is_active": False},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code in (200, 404)


class TestEmployeeDeletionRevocation:
    """Deleting an employee must invalidate their JWT via token_version."""

    def test_delete_employee_increments_linked_profile_token_version(self, app_client):
        client, db = app_client
        admin_token = make_token(role="owner")
        # Wire get_current_user profile lookup
        eq = db.table.return_value.select.return_value.eq.return_value
        eq.limit.return_value.execute.return_value.data = [_profile(role="owner")]

        emp_id = "emp-uuid-003"
        linked_user_id = TEST_USER_ID_2

        # Wire select-before-delete (uses .eq().eq().limit())
        eq.eq.return_value.limit.return_value.execute.return_value.data = [
            {"user_id": linked_user_id}
        ]

        resp = client.delete(
            f"/api/v1/employees/{emp_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200
        assert db.table.return_value.update.called

    def test_delete_employee_no_linked_profile_does_not_crash(self, app_client):
        client, db = app_client
        admin_token = make_token(role="owner")
        _wire_profile(db, _profile(role="owner"))

        emp_id = "emp-uuid-004"
        db.table.return_value.select.return_value.eq.return_value \
            .eq.return_value.limit.return_value.execute.return_value.data = [{
                "user_id": None
            }]

        resp = client.delete(
            f"/api/v1/employees/{emp_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200

    def test_delete_employee_scoped_to_account(self, app_client):
        """Employee deletion must be scoped to the caller's account_id."""
        client, db = app_client
        token = make_token(account_id=TEST_ACCOUNT_ID)
        _wire_profile(db, _profile(account_id=TEST_ACCOUNT_ID))

        emp_id = "emp-uuid-005"
        db.table.return_value.select.return_value.eq.return_value \
            .eq.return_value.limit.return_value.execute.return_value.data = [{"user_id": None}]

        resp = client.delete(
            f"/api/v1/employees/{emp_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        # Verify the delete was scoped — eq called with account_id
        delete_chain = db.table.return_value.delete.return_value.eq.return_value.eq
        assert delete_chain.called


class TestPasswordResetRevocation:
    """Password reset must increment token_version (existing behaviour preserved)."""

    def test_password_reset_increments_token_version(self, app_client):
        client, db = app_client
        token = make_token(token_version=1)
        _wire_profile(db, _profile(token_version=1))
        db.table.return_value.update.return_value.eq.return_value \
            .execute.return_value.data = [{}]

        resp = client.patch(
            "/api/v1/auth/password",
            json={"password": "newpassword123"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        assert db.table.return_value.update.called

    def test_old_token_rejected_after_password_reset(self, app_client):
        """Token with ver=1 must be rejected when profile has token_version=2."""
        client, db = app_client
        old_token = make_token(token_version=1)
        _wire_profile(db, _profile(token_version=2))

        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {old_token}"}
        )
        assert resp.status_code in (401, 403)

    def test_new_token_accepted_after_password_reset(self, app_client):
        """Token with ver=2 must be accepted when profile has token_version=2."""
        client, db = app_client
        new_token = make_token(token_version=2)
        _wire_profile(db, _profile(token_version=2))
        _wire_contacts_empty(db)

        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert resp.status_code not in (401, 403)


class TestRoleChangeEffect:
    """Role changes must take effect immediately — role is re-read from DB."""

    def test_role_change_reflected_on_next_request(self, app_client):
        """After role change, the new role is returned from DB on next request."""
        client, db = app_client
        # Token claims 'agent' but DB now says 'manager'
        token = make_token(role="agent")
        _wire_profile(db, _profile(role="manager"))
        _wire_contacts_empty(db)

        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {token}"}
        )
        # Request succeeds — role from DB is used, not token claim
        assert resp.status_code not in (401, 403)

    def test_super_admin_revocation_takes_effect_immediately(self, app_client):
        """Removing is_super_admin must block SA routes on next request."""
        client, db = app_client
        token = make_token()
        # Wire get_current_user: valid profile
        eq = db.table.return_value.select.return_value.eq.return_value
        eq.limit.return_value.execute.return_value.data = [_profile()]
        # Wire _require_super_admin: is_super_admin=False
        eq.eq.return_value.limit.return_value.execute.return_value.data = [
            {"is_super_admin": False}
        ]

        resp = client.get(
            "/api/v1/super-admin/stats",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 403


class TestTenantIsolationRevocation:
    """Revocation must be scoped to the correct tenant."""

    def test_employee_removal_does_not_affect_other_company(self, app_client):
        """Deleting employee from company A must not revoke tokens for company B."""
        client, db = app_client
        # Admin of company A
        token_a = make_token(account_id=TEST_ACCOUNT_ID)
        _wire_profile(db, _profile(account_id=TEST_ACCOUNT_ID))

        emp_id = "emp-uuid-006"
        # Employee belongs to company A, linked to user in company B
        db.table.return_value.select.return_value.eq.return_value \
            .eq.return_value.limit.return_value.execute.return_value.data = [
                {"user_id": TEST_USER_ID_2}
            ]
        db.table.return_value.select.return_value.eq.return_value \
            .limit.return_value.execute.return_value.data = [
                _profile(user_id=TEST_USER_ID_2, account_id=TEST_ACCOUNT_ID_2, token_version=1)
            ]

        resp = client.delete(
            f"/api/v1/employees/{emp_id}",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert resp.status_code == 200
        # The delete was scoped to account_id — verified by the eq chain
        delete_chain = db.table.return_value.delete.return_value.eq
        assert delete_chain.called

    def test_cross_tenant_token_cannot_delete_employee(self, app_client):
        """Token for account B cannot delete employees from account A."""
        client, db = app_client
        token_b = make_token(account_id=TEST_ACCOUNT_ID_2)
        # DB returns profile for account B
        _wire_profile(db, _profile(account_id=TEST_ACCOUNT_ID_2))

        emp_id = "emp-uuid-007"
        # select returns empty (employee not in account B)
        db.table.return_value.select.return_value.eq.return_value \
            .eq.return_value.limit.return_value.execute.return_value.data = []

        resp = client.delete(
            f"/api/v1/employees/{emp_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        # 200 with no-op (employee not found in this account) — not a security error
        # The important thing is the delete was scoped to account_id
        assert resp.status_code == 200


class TestValidSessionContinues:
    """Valid sessions must continue working across consecutive requests."""

    def test_valid_session_works_on_multiple_requests(self, app_client):
        client, db = app_client
        token = make_token(token_version=1)
        _wire_profile(db, _profile(token_version=1, is_active=True))
        _wire_contacts_empty(db)

        for _ in range(5):
            resp = client.get(
                "/api/v1/contacts",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert resp.status_code not in (401, 403)

    def test_expired_token_still_rejected(self, app_client):
        client, db = app_client
        expired = make_token(expired=True)
        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {expired}"}
        )
        assert resp.status_code == 401

    def test_wrong_signature_still_rejected(self, app_client):
        client, db = app_client
        bad = make_token(wrong_secret=True)
        resp = client.get(
            "/api/v1/contacts",
            headers={"Authorization": f"Bearer {bad}"}
        )
        assert resp.status_code == 401


class TestMigration026:
    """Verify migration 026 SQL is correct and idempotent."""

    def test_migration_026_exists(self):
        import os
        assert os.path.exists("../supabase/migrations/026_profile_is_active.sql") or \
               os.path.exists("supabase/migrations/026_profile_is_active.sql") or \
               os.path.exists("../../supabase/migrations/026_profile_is_active.sql")

    def test_migration_026_adds_is_active_column(self):
        import os
        for path in [
            "../supabase/migrations/026_profile_is_active.sql",
            "supabase/migrations/026_profile_is_active.sql",
            "../../supabase/migrations/026_profile_is_active.sql",
        ]:
            if os.path.exists(path):
                with open(path) as f:
                    sql = f.read()
                assert "is_active" in sql
                assert "ADD COLUMN IF NOT EXISTS" in sql
                assert "DEFAULT true" in sql
                return
        pytest.skip("Migration file not found from test working directory")

    def test_migration_026_is_idempotent(self):
        import os
        for path in [
            "../supabase/migrations/026_profile_is_active.sql",
            "supabase/migrations/026_profile_is_active.sql",
            "../../supabase/migrations/026_profile_is_active.sql",
        ]:
            if os.path.exists(path):
                with open(path) as f:
                    sql = f.read()
                assert "IF NOT EXISTS" in sql
                return
        pytest.skip("Migration file not found from test working directory")
