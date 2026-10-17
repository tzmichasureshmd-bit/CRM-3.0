"""
Endpoint Test Runner for Meta Campaigns API Routes
Tests /api/v1/campaigns/sync-meta, /api/v1/campaigns/meta, and /api/v1/campaigns/meta/sync-status
"""
import sys
import os
import unittest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.middleware.auth import get_current_user

# Mock authenticated user
mock_user = {
    "user_id": "f7c0a5c4-9841-4aa4-9626-326a60f87445",
    "account_id": "e8044875-ceae-4988-9f93-2dde36f0294e",
    "email": "test@crm.com",
    "role": "admin",
}

app.dependency_overrides[get_current_user] = lambda: mock_user
client = TestClient(app)


class TestMetaCampaignsEndpoints(unittest.TestCase):

    def test_sync_status_endpoint(self):
        with patch("app.services.meta_campaign_service.MetaCampaignService.get_latest_sync_status") as mock_status:
            mock_status.return_value = {
                "ad_account_id": "act_2505907436503788",
                "app_id": "1354004176287129",
                "api_version": "v26.0",
                "token_configured": True,
                "last_sync": {
                    "status": "success",
                    "fetched_count": 5,
                    "created_count": 3,
                    "updated_count": 2,
                },
            }
            res = client.get("/api/v1/campaigns/meta/sync-status")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["ad_account_id"], "act_2505907436503788")
            self.assertEqual(data["api_version"], "v26.0")
            self.assertTrue(data["token_configured"])

    def test_list_meta_campaigns_endpoint(self):
        mock_db = MagicMock()
        table_mock = MagicMock()
        mock_db.table.return_value = table_mock
        query_mock = MagicMock()
        query_mock.select.return_value = query_mock
        query_mock.eq.return_value = query_mock
        query_mock.order.return_value = query_mock
        query_mock.range.return_value = query_mock
        query_mock.execute.return_value = MagicMock(
            data=[
                {
                    "id": "c1",
                    "name": "Meta Brand Campaign",
                    "platform": "facebook",
                    "status": "active",
                    "meta_campaign_id": "12020588234850321",
                }
            ],
            count=1,
        )
        table_mock.select = query_mock.select

        from app.db.supabase import get_db
        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            res = client.get("/api/v1/campaigns/meta")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(len(data["data"]), 1)
            self.assertEqual(data["data"][0]["platform"], "facebook")
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_sync_meta_campaigns_success(self):
        mock_result = {
            "success": True,
            "ad_account_id": "act_2505907436503788",
            "api_version": "v26.0",
            "fetched_count": 3,
            "created_count": 2,
            "updated_count": 1,
            "skipped_count": 0,
            "failed_count": 0,
            "duration_ms": 350,
            "last_synced_at": "2026-10-15T12:00:00Z",
            "records": [],
        }

        with patch("app.services.meta_campaign_service.MetaCampaignService.sync_campaigns", new_callable=AsyncMock) as mock_sync:
            mock_sync.return_value = mock_result
            res = client.post("/api/v1/campaigns/sync-meta", json={})
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["created_count"], 2)
            self.assertEqual(data["updated_count"], 1)

    def test_sync_meta_campaigns_permission_error(self):
        with patch("app.services.meta_campaign_service.MetaCampaignService.sync_campaigns", new_callable=AsyncMock) as mock_sync:
            mock_sync.side_effect = PermissionError("Meta access token is invalid or expired")
            res = client.post("/api/v1/campaigns/sync-meta", json={})
            self.assertEqual(res.status_code, 403)
            self.assertIn("invalid or expired", res.json()["detail"])

    def test_get_and_save_credentials_endpoints(self):
        # 1. Test GET /credentials
        res_get = client.get("/api/v1/campaigns/meta/credentials")
        self.assertEqual(res_get.status_code, 200)
        data = res_get.json()
        self.assertIn("ad_account_id", data)
        self.assertIn("app_id", data)
        self.assertIn("has_token", data)

        # 2. Test POST /credentials with mocked save_credentials
        with patch("app.services.meta_campaign_service.MetaCampaignService.save_credentials") as mock_save:
            mock_save.return_value = {
                "success": True,
                "message": "Saved",
                "ad_account_id": "act_2505907436503788",
                "app_id": "1354004176287129",
                "api_version": "v26.0",
                "has_token": True,
            }
            res_save = client.post(
                "/api/v1/campaigns/meta/credentials",
                json={
                    "ad_account_id": "2505907436503788",
                    "app_id": "1354004176287129",
                    "api_version": "v26.0",
                    "access_token": "EAATZ_mock_token_12345",
                },
            )
            self.assertEqual(res_save.status_code, 200)
            save_data = res_save.json()
            self.assertTrue(save_data["success"])
            self.assertEqual(save_data["ad_account_id"], "act_2505907436503788")

    def test_test_connection_endpoint(self):
        with patch("app.services.meta_campaign_service.MetaCampaignService.test_connection", new_callable=AsyncMock) as mock_test:
            mock_test.return_value = {
                "success": True,
                "ad_account_id": "act_2505907436503788",
                "account_name": "TZmicha Ad Account",
                "account_status": "ACTIVE",
                "currency": "USD",
                "timezone": "UTC",
                "message": "Successfully verified connection",
            }
            res = client.post("/api/v1/campaigns/meta/test-connection", json={"ad_account_id": "2505907436503788"})
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["account_status"], "ACTIVE")


if __name__ == "__main__":
    unittest.main(verbosity=2)

