"""
Phase G — New Module Regression Tests
Tests for: knowledge base, media/DAM, A/B experiments, billing.
All use the conftest app_client fixture pattern.
"""
import pathlib, sys
ROOT = pathlib.Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import pytest
from unittest.mock import MagicMock
from tests.conftest import make_token, set_db_result, TEST_ACCOUNT_ID, TEST_USER_ID


# ── helpers ──────────────────────────────────────────────────────────────────

def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def make_profile():
    return {"account_id": TEST_ACCOUNT_ID, "role": "owner", "token_version": 1}


def mock_list(db, rows):
    """Make db.table().select().eq()...execute() return rows with count."""
    result = MagicMock()
    result.data = rows
    result.count = len(rows)
    chain = db.table.return_value.select.return_value
    chain.eq.return_value.order.return_value.range.return_value.execute.return_value = result
    chain.eq.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = result
    chain.eq.return_value.eq.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = result


def mock_single(db, row):
    """Make .single().execute() return a row."""
    result = MagicMock()
    result.data = row
    chain = db.table.return_value.select.return_value.eq.return_value.eq.return_value
    chain.single.return_value.execute.return_value = result
    chain.eq.return_value.single.return_value.execute.return_value = result


def mock_insert(db, row):
    result = MagicMock()
    result.data = [row]
    db.table.return_value.insert.return_value.execute.return_value = result


def mock_update(db, row):
    result = MagicMock()
    result.data = [row]
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = result


# ── Knowledge Base ────────────────────────────────────────────────────────────

class TestKnowledge:
    def test_list_requires_auth(self, app_client):
        client, _ = app_client
        resp = client.get("/api/v1/knowledge")
        assert resp.status_code in (401, 403)

    def test_list_returns_data(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        mock_list(db, [{"id": "doc-1", "title": "FAQ", "status": "published"}])
        resp = client.get("/api/v1/knowledge", headers=auth_headers(token))
        assert resp.status_code == 200

    def test_create_requires_title(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/knowledge",
                           json={"content": "some content"},
                           headers=auth_headers(token))
        assert resp.status_code == 422  # Pydantic validation

    def test_create_requires_content(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/knowledge",
                           json={"title": "My Doc"},
                           headers=auth_headers(token))
        assert resp.status_code == 422

    def test_create_rejects_invalid_category(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        mock_insert(db, {})
        resp = client.post("/api/v1/knowledge",
                           json={"title": "T", "content": "C", "category": "invalid_cat"},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_create_rejects_invalid_status(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/knowledge",
                           json={"title": "T", "content": "C", "status": "live"},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_create_valid_doc(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        mock_insert(db, {"id": "doc-1", "title": "FAQ", "content": "Answer", "status": "draft"})
        resp = client.post("/api/v1/knowledge",
                           json={"title": "FAQ", "content": "Answer", "category": "faq"},
                           headers=auth_headers(token))
        assert resp.status_code == 201

    def test_delete_requires_auth(self, app_client):
        client, _ = app_client
        resp = client.delete("/api/v1/knowledge/doc-1")
        assert resp.status_code in (401, 403)


# ── Media / DAM ───────────────────────────────────────────────────────────────

class TestMedia:
    def test_list_requires_auth(self, app_client):
        client, _ = app_client
        resp = client.get("/api/v1/media")
        assert resp.status_code in (401, 403)

    def test_list_returns_data(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        mock_list(db, [{"id": "asset-1", "name": "logo.png", "file_type": "image"}])
        resp = client.get("/api/v1/media", headers=auth_headers(token))
        assert resp.status_code == 200

    def test_create_requires_name(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/media",
                           json={"storage_url": "https://example.com/file.png"},
                           headers=auth_headers(token))
        assert resp.status_code == 422

    def test_create_requires_storage_url(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/media",
                           json={"name": "logo.png"},
                           headers=auth_headers(token))
        assert resp.status_code == 422

    def test_create_rejects_invalid_file_type(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/media",
                           json={"name": "f.exe", "storage_url": "https://x.com/f.exe", "file_type": "executable"},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_create_rejects_oversized_file(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/media",
                           json={"name": "big.mp4", "storage_url": "https://x.com/big.mp4",
                                 "file_type": "video", "size_bytes": 100 * 1024 * 1024},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_create_valid_asset(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        mock_insert(db, {"id": "asset-1", "name": "logo.png", "file_type": "image"})
        resp = client.post("/api/v1/media",
                           json={"name": "logo.png", "storage_url": "https://cdn.example.com/logo.png",
                                 "file_type": "image"},
                           headers=auth_headers(token))
        assert resp.status_code == 201

    def test_filter_by_invalid_type_rejected(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.get("/api/v1/media?file_type=exe", headers=auth_headers(token))
        assert resp.status_code == 400


# ── A/B Experiments ───────────────────────────────────────────────────────────

class TestExperiments:
    def test_list_requires_auth(self, app_client):
        client, _ = app_client
        resp = client.get("/api/v1/experiments")
        assert resp.status_code in (401, 403)

    def test_create_requires_name(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/experiments",
                           json={"metric": "conversion_rate"},
                           headers=auth_headers(token))
        assert resp.status_code == 422

    def test_create_rejects_invalid_metric(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/experiments",
                           json={"name": "Test", "metric": "fake_metric"},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_create_requires_two_variants(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/experiments",
                           json={"name": "Test", "variants": [{"name": "control"}]},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_create_rejects_too_many_variants(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        variants = [{"name": f"v{i}"} for i in range(6)]
        resp = client.post("/api/v1/experiments",
                           json={"name": "Test", "variants": variants},
                           headers=auth_headers(token))
        assert resp.status_code == 400

    def test_create_valid_experiment(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        mock_insert(db, {"id": "exp-1", "name": "CTA Test", "status": "draft"})
        resp = client.post("/api/v1/experiments",
                           json={"name": "CTA Test", "metric": "click_rate",
                                 "variants": [{"name": "control"}, {"name": "variant_a"}]},
                           headers=auth_headers(token))
        assert resp.status_code == 201

    def test_invalid_status_transition_rejected(self, app_client):
        """Cannot go from draft directly to completed."""
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        # Mock current experiment as draft
        current_result = MagicMock()
        current_result.data = {"status": "draft", "variants": [{"name": "control"}, {"name": "v_a"}]}
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = current_result
        resp = client.patch("/api/v1/experiments/exp-1",
                            json={"status": "completed"},
                            headers=auth_headers(token))
        assert resp.status_code == 400

    def test_delete_only_draft(self, app_client):
        """Cannot delete a running experiment."""
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        current_result = MagicMock()
        current_result.data = {"status": "running"}
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = current_result
        resp = client.delete("/api/v1/experiments/exp-1", headers=auth_headers(token))
        assert resp.status_code == 400

    def test_event_requires_auth(self, app_client):
        client, _ = app_client
        resp = client.post("/api/v1/experiments/exp-1/events",
                           json={"variant": "control", "event_type": "exposure"})
        assert resp.status_code in (401, 403)

    def test_event_rejects_invalid_type(self, app_client):
        client, db = app_client
        token = make_token()
        set_db_result(db, make_profile())
        resp = client.post("/api/v1/experiments/exp-1/events",
                           json={"variant": "control", "event_type": "click"},
                           headers=auth_headers(token))
        assert resp.status_code == 400


# ── Billing ───────────────────────────────────────────────────────────────────

class TestBilling:
    def test_billing_requires_auth(self, app_client):
        client, _ = app_client
        resp = client.get("/api/v1/billing")
        assert resp.status_code in (401, 403)

    def test_billing_unauthenticated_rejected(self, app_client):
        client, _ = app_client
        resp = client.get("/api/v1/billing", headers={"Authorization": "Bearer bad.token"})
        assert resp.status_code in (401, 403)

    def test_billing_plan_definitions_valid(self):
        """All plan keys have required fields — pure logic test, no DB."""
        from app.api.v1.billing import PLANS
        for key, plan in PLANS.items():
            assert "name" in plan
            assert "limits" in plan
            assert "features" in plan
            assert "contacts" in plan["limits"]
            assert "broadcasts_per_month" in plan["limits"]

    def test_billing_enterprise_has_unlimited_limits(self):
        from app.api.v1.billing import PLANS
        enterprise = PLANS["enterprise"]
        for limit_val in enterprise["limits"].values():
            assert limit_val == -1  # -1 means unlimited
