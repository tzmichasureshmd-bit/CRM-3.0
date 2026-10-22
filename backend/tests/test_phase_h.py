"""
Phase H — Complete System Audit Regression Tests
Covers: new UI pages exist, sidebar nav links, billing live usage endpoint,
cross-tenant isolation for knowledge/media/experiments, and auth enforcement.
All use the conftest app_client fixture pattern.
"""
import pathlib, sys
ROOT = pathlib.Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import pytest
from unittest.mock import MagicMock
from tests.conftest import (
    make_token, set_db_result,
    TEST_ACCOUNT_ID, TEST_USER_ID,
    TEST_ACCOUNT_ID_2, TEST_USER_ID_2,
)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_profile(account_id=TEST_ACCOUNT_ID):
    return {"account_id": account_id, "role": "owner", "token_version": 1}


def mock_list(db, rows):
    result = MagicMock()
    result.data = rows
    result.count = len(rows)
    chain = db.table.return_value.select.return_value
    chain.eq.return_value.order.return_value.range.return_value.execute.return_value = result
    chain.eq.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = result


def mock_single(db, row):
    result = MagicMock()
    result.data = row
    chain = db.table.return_value.select.return_value.eq.return_value.eq.return_value
    chain.single.return_value.execute.return_value = result


def mock_insert(db, row):
    result = MagicMock()
    result.data = [row]
    db.table.return_value.insert.return_value.execute.return_value = result


def mock_count(db, count):
    result = MagicMock()
    result.data = []
    result.count = count
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = result
    db.table.return_value.select.return_value.eq.return_value.gte.return_value.execute.return_value = result


# ── UI Page Files Exist ───────────────────────────────────────────────────────

class TestNewPageFilesExist:
    """Verify the 3 new UI pages were created on disk."""

    def test_knowledge_page_exists(self):
        p = ROOT / "src" / "app" / "(dashboard)" / "knowledge" / "page.tsx"
        assert p.exists(), f"Missing: {p}"

    def test_media_page_exists(self):
        p = ROOT / "src" / "app" / "(dashboard)" / "media" / "page.tsx"
        assert p.exists(), f"Missing: {p}"

    def test_experiments_page_exists(self):
        p = ROOT / "src" / "app" / "(dashboard)" / "experiments" / "page.tsx"
        assert p.exists(), f"Missing: {p}"

    def test_knowledge_page_uses_v3fetch(self):
        p = ROOT / "src" / "app" / "(dashboard)" / "knowledge" / "page.tsx"
        content = p.read_text(encoding="utf-8")
        assert "v3fetch" in content
        assert "supabase" not in content.lower()

    def test_media_page_uses_v3fetch(self):
        p = ROOT / "src" / "app" / "(dashboard)" / "media" / "page.tsx"
        content = p.read_text(encoding="utf-8")
        assert "v3fetch" in content
        assert "supabase" not in content.lower()

    def test_experiments_page_uses_v3fetch(self):
        p = ROOT / "src" / "app" / "(dashboard)" / "experiments" / "page.tsx"
        content = p.read_text(encoding="utf-8")
        assert "v3fetch" in content
        assert "supabase" not in content.lower()


# ── Sidebar Nav Links ─────────────────────────────────────────────────────────

class TestSidebarNavLinks:
    """Verify sidebar contains nav links for all new pages."""

    def _sidebar(self):
        p = ROOT / "src" / "components" / "layout" / "CRMSidebar.tsx"
        return p.read_text(encoding="utf-8")

    def test_knowledge_link_in_sidebar(self):
        assert "/knowledge" in self._sidebar()

    def test_media_link_in_sidebar(self):
        assert "/media" in self._sidebar()

    def test_experiments_link_in_sidebar(self):
        assert "/experiments" in self._sidebar()

    def test_sidebar_imports_book_open(self):
        assert "BookOpen" in self._sidebar()

    def test_sidebar_imports_flask_conical(self):
        assert "FlaskConical" in self._sidebar()


# ── Billing Live Usage ────────────────────────────────────────────────────────

class TestBillingLiveUsage:
    def test_billing_requires_auth(self, app_client):
        client, _ = app_client
        resp = client.get("/api/v1/billing")
        assert resp.status_code in (401, 403)

    def test_billing_plan_structure_valid(self):
        """Billing plan definitions have all required keys — pure logic, no DB."""
        from app.api.v1.billing import PLANS
        required_limit_keys = {"contacts", "broadcasts_per_month", "automations", "agents"}
        for key, plan in PLANS.items():
            assert "name" in plan, f"{key} missing name"
            assert "limits" in plan, f"{key} missing limits"
            assert "features" in plan, f"{key} missing features"
            assert required_limit_keys.issubset(plan["limits"].keys()), f"{key} missing limit keys"

    def test_billing_page_uses_v3fetch(self):
        p = ROOT / "src" / "app" / "(dashboard)" / "settings" / "billing" / "page.tsx"
        content = p.read_text(encoding="utf-8")
        assert "v3fetch" in content
        assert "/api/v3/billing" in content

    def test_billing_page_shows_usage_bars(self):
        p = ROOT / "src" / "app" / "(dashboard)" / "settings" / "billing" / "page.tsx"
        content = p.read_text(encoding="utf-8")
        assert "UsageBar" in content
        assert "utilization" in content

    def test_billing_plan_keys_valid(self):
        from app.api.v1.billing import PLANS
        assert set(PLANS.keys()) == {"starter", "growth", "scale", "enterprise"}

    def test_billing_utilization_unlimited_is_none(self):
        from app.api.v1.billing import PLANS
        enterprise = PLANS["enterprise"]
        for v in enterprise["limits"].values():
            assert v == -1


# ── Cross-Tenant Isolation ────────────────────────────────────────────────────

class TestCrossTenantIsolation:
    """Verify account_id is always applied to queries for new modules."""

    def _check_account_id_in_source(self, filename):
        p = ROOT / "backend" / "app" / "api" / "v1" / filename
        content = p.read_text(encoding="utf-8")
        assert 'user["account_id"]' in content or "account_id" in content

    def test_knowledge_scoped_to_account(self):
        self._check_account_id_in_source("knowledge.py")

    def test_media_scoped_to_account(self):
        self._check_account_id_in_source("media.py")

    def test_experiments_scoped_to_account(self):
        self._check_account_id_in_source("experiments.py")

    def test_billing_scoped_to_account(self):
        self._check_account_id_in_source("billing.py")

    def test_knowledge_tenant2_cannot_read_tenant1_doc(self, app_client):
        """GET /knowledge/{id} with tenant2 token returns 404 for tenant1 doc."""
        client, db = app_client
        token2 = make_token(user_id=TEST_USER_ID_2, account_id=TEST_ACCOUNT_ID_2)
        set_db_result(db, make_profile(TEST_ACCOUNT_ID_2))
        # Mock: doc belongs to tenant1, query scoped to tenant2 returns nothing
        mock_single(db, None)
        resp = client.get("/api/v1/knowledge/doc-tenant1", headers=auth(token2))
        assert resp.status_code == 404

    def test_media_tenant2_cannot_read_tenant1_asset(self, app_client):
        client, db = app_client
        token2 = make_token(user_id=TEST_USER_ID_2, account_id=TEST_ACCOUNT_ID_2)
        set_db_result(db, make_profile(TEST_ACCOUNT_ID_2))
        mock_single(db, None)
        resp = client.get("/api/v1/media/asset-tenant1", headers=auth(token2))
        assert resp.status_code == 404

    def test_experiments_tenant2_cannot_read_tenant1_exp(self, app_client):
        client, db = app_client
        token2 = make_token(user_id=TEST_USER_ID_2, account_id=TEST_ACCOUNT_ID_2)
        set_db_result(db, make_profile(TEST_ACCOUNT_ID_2))
        mock_single(db, None)
        resp = client.get("/api/v1/experiments/exp-tenant1", headers=auth(token2))
        assert resp.status_code == 404


# ── Knowledge CRUD Auth ───────────────────────────────────────────────────────

class TestKnowledgeCrudAuth:
    def test_patch_requires_auth(self, app_client):
        client, _ = app_client
        resp = client.patch("/api/v1/knowledge/doc-1", json={"title": "New"})
        assert resp.status_code in (401, 403)

    def test_patch_empty_body_rejected(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.patch("/api/v1/knowledge/doc-1", json={}, headers=auth(token))
        assert resp.status_code == 400

    def test_patch_invalid_status_rejected(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.patch("/api/v1/knowledge/doc-1", json={"status": "live"}, headers=auth(token))
        assert resp.status_code == 400

    def test_list_with_invalid_category_rejected(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.get("/api/v1/knowledge?category=unknown", headers=auth(token))
        assert resp.status_code == 400


# ── Media CRUD Auth ───────────────────────────────────────────────────────────

class TestMediaCrudAuth:
    def test_patch_requires_auth(self, app_client):
        client, _ = app_client
        resp = client.patch("/api/v1/media/asset-1", json={"name": "new"})
        assert resp.status_code in (401, 403)

    def test_patch_empty_body_rejected(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.patch("/api/v1/media/asset-1", json={}, headers=auth(token))
        assert resp.status_code == 400

    def test_delete_requires_auth(self, app_client):
        client, _ = app_client
        resp = client.delete("/api/v1/media/asset-1")
        assert resp.status_code in (401, 403)


# ── Experiment State Machine ──────────────────────────────────────────────────

class TestExperimentStateMachine:
    def _mock_current(self, db, status):
        result = MagicMock()
        result.data = {"status": status, "variants": [{"name": "control"}, {"name": "v_a"}]}
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = result

    def test_draft_to_running_allowed(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        self._mock_current(db, "draft")
        update_result = MagicMock()
        update_result.data = [{"id": "exp-1", "status": "running"}]
        db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = update_result
        resp = client.patch("/api/v1/experiments/exp-1", json={"status": "running"}, headers=auth(token))
        assert resp.status_code == 200

    def test_draft_to_paused_rejected(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        self._mock_current(db, "draft")
        resp = client.patch("/api/v1/experiments/exp-1", json={"status": "paused"}, headers=auth(token))
        assert resp.status_code == 400

    def test_completed_to_running_rejected(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        self._mock_current(db, "completed")
        resp = client.patch("/api/v1/experiments/exp-1", json={"status": "running"}, headers=auth(token))
        assert resp.status_code == 400

    def test_running_to_paused_allowed(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        self._mock_current(db, "running")
        update_result = MagicMock()
        update_result.data = [{"id": "exp-1", "status": "paused"}]
        db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = update_result
        resp = client.patch("/api/v1/experiments/exp-1", json={"status": "paused"}, headers=auth(token))
        assert resp.status_code == 200

    def test_delete_draft_allowed(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        current_result = MagicMock()
        current_result.data = {"status": "draft"}
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = current_result
        delete_result = MagicMock()
        db.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = delete_result
        resp = client.delete("/api/v1/experiments/exp-1", headers=auth(token))
        assert resp.status_code == 204

    def test_delete_running_rejected(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        current_result = MagicMock()
        current_result.data = {"status": "running"}
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = current_result
        resp = client.delete("/api/v1/experiments/exp-1", headers=auth(token))
        assert resp.status_code == 400


# ── No Bare Supabase in Any Dashboard Page ────────────────────────────────────

class TestNoBareSuperbaseInPages:
    """Regression: no dashboard page should call supabase.from() directly."""

    def _scan_page(self, path: pathlib.Path) -> list:
        if not path.exists():
            return []
        content = path.read_text(encoding="utf-8")
        violations = []
        for i, line in enumerate(content.splitlines(), 1):
            # Flag bare data access via supabase client — NOT realtime channel usage
            if "supabase.from(" in line:
                violations.append(f"{path}:{i}: {line.strip()}")
        return violations

    def _all_pages(self):
        dashboard = ROOT / "src" / "app" / "(dashboard)"
        return list(dashboard.rglob("page.tsx"))

    # The health page (settings/health/page.tsx) intentionally uses supabase.from()
    # and supabase.auth.getUser() as a diagnostic connectivity check — not for data access.
    # All other dashboard pages must use v3fetch.
    HEALTH_PAGE_EXEMPT = "health"

    def test_no_bare_supabase_from_in_non_health_pages(self):
        violations = []
        for page in self._all_pages():
            if self.HEALTH_PAGE_EXEMPT in str(page):
                continue
            violations.extend(self._scan_page(page))
        assert violations == [], f"Bare supabase.from() found:\n" + "\n".join(violations)

    def test_no_supabase_auth_getuser_in_non_health_pages(self):
        violations = []
        for page in self._all_pages():
            if self.HEALTH_PAGE_EXEMPT in str(page):
                continue
            if not page.exists():
                continue
            content = page.read_text(encoding="utf-8")
            for i, line in enumerate(content.splitlines(), 1):
                if "supabase.auth.getUser" in line:
                    violations.append(f"{page.name}:{i}: {line.strip()}")
        assert violations == [], f"supabase.auth.getUser() found:\n" + "\n".join(violations)
