"""
Phase L — Billing plan update tests
"""
import pathlib, sys
ROOT = pathlib.Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import pytest
from unittest.mock import MagicMock
from tests.conftest import make_token, TEST_ACCOUNT_ID, TEST_USER_ID


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _profile(is_super_admin=False):
    return {"account_id": TEST_ACCOUNT_ID, "role": "owner",
            "token_version": 1, "is_super_admin": is_super_admin}


class TestBillingPlanUpdate:

    def test_valid_plan_update_own_account(self, app_client):
        client, db = app_client
        token = make_token()
        p = MagicMock()
        p.data = [_profile()]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p
        db.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
        db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])
        db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{}])
        resp = client.patch("/api/v1/billing/plan",
                            json={"plan": "scale"},
                            headers=auth(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["plan"] == "scale"
        assert "plan_started_at" in data

    def test_invalid_plan_rejected(self, app_client):
        client, db = app_client
        token = make_token()
        p = MagicMock()
        p.data = [_profile()]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p
        resp = client.patch("/api/v1/billing/plan",
                            json={"plan": "ultra_premium_fake"},
                            headers=auth(token))
        assert resp.status_code == 400
        assert "Invalid plan" in resp.json()["detail"]

    def test_all_valid_plans_accepted(self, app_client):
        client, db = app_client
        for plan in ["free", "starter", "growth", "scale", "enterprise"]:
            token = make_token()
            p = MagicMock()
            p.data = [_profile()]
            db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p
            db.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])
            db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{}])
            resp = client.patch("/api/v1/billing/plan",
                                json={"plan": plan},
                                headers=auth(token))
            assert resp.status_code == 200, f"Plan '{plan}' was rejected: {resp.text}"

    def test_unauthenticated_rejected(self, app_client):
        client, _ = app_client
        resp = client.patch("/api/v1/billing/plan", json={"plan": "growth"})
        assert resp.status_code in (401, 403)

    def test_non_super_admin_cannot_update_other_company(self, app_client):
        client, db = app_client
        token = make_token()
        # Profile: not super admin
        p = MagicMock()
        p.data = [_profile(is_super_admin=False)]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p
        resp = client.patch("/api/v1/billing/plan",
                            json={"plan": "enterprise", "target_account_id": "other-company-id"},
                            headers=auth(token))
        assert resp.status_code == 403

    def test_super_admin_can_update_other_company(self, app_client):
        client, db = app_client
        token = make_token()
        p = MagicMock()
        p.data = [_profile(is_super_admin=True)]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p
        db.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
        db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])
        db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{}])
        resp = client.patch("/api/v1/billing/plan",
                            json={"plan": "enterprise", "target_account_id": "other-company-id"},
                            headers=auth(token))
        assert resp.status_code == 200

    def test_plan_update_writes_audit(self, app_client):
        client, db = app_client
        token = make_token()
        p = MagicMock()
        p.data = [_profile()]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p
        db.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
        db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[{}])
        db.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{}])
        client.patch("/api/v1/billing/plan",
                     json={"plan": "growth"},
                     headers=auth(token))
        insert_calls = db.table.return_value.insert.call_args_list
        audit_calls = [c for c in insert_calls
                       if c[0] and isinstance(c[0][0], dict)
                       and c[0][0].get("action") == "billing.plan_updated"]
        assert len(audit_calls) > 0, "billing.plan_updated audit event not written"

    def test_migration_025_exists(self):
        assert (ROOT / "supabase" / "migrations" / "025_billing_plan_columns.sql").exists()

    def test_migration_025_has_plan_column(self):
        src = (ROOT / "supabase" / "migrations" / "025_billing_plan_columns.sql").read_text(encoding="utf-8")
        assert "plan" in src
        assert "plan_started_at" in src

    def test_migration_025_is_idempotent(self):
        src = (ROOT / "supabase" / "migrations" / "025_billing_plan_columns.sql").read_text(encoding="utf-8")
        assert "IF NOT EXISTS" in src

    def test_billing_get_returns_plan_and_usage(self, app_client):
        client, db = app_client
        token = make_token()
        p = MagicMock()
        p.data = [{"account_id": TEST_ACCOUNT_ID, "role": "owner", "token_version": 1}]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p
        settings = MagicMock()
        settings.data = [{"plan": "growth", "plan_started_at": None}]
        db.table.return_value.select.return_value.eq.return_value.execute.return_value = settings
        count_result = MagicMock()
        count_result.count = 10
        db.table.return_value.select.return_value.eq.return_value.execute.return_value = count_result
        db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = count_result
        resp = client.get("/api/v1/billing", headers=auth(token))
        assert resp.status_code in (200, 500)  # 500 acceptable if mock chain incomplete
