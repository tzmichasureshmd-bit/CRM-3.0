"""
Endpoint Test Runner for Meta Campaign Management API Routes
Tests:
- GET  /api/v1/campaigns/meta/permissions
- POST /api/v1/campaigns/meta/create
- PATCH /api/v1/campaigns/meta/{meta_campaign_id}
- POST /api/v1/campaigns/meta/{meta_campaign_id}/pause
- POST /api/v1/campaigns/meta/{meta_campaign_id}/resume
- POST /api/v1/campaigns/meta/{meta_campaign_id}/archive
- GET  /api/v1/campaigns/meta/{meta_campaign_id}
"""
import sys
import os
import unittest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
env_path = os.path.join(backend_dir, ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)

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


class TestMetaManagementEndpoints(unittest.TestCase):

    def test_permissions_endpoint(self):
        """GET /api/v1/campaigns/meta/permissions returns token permissions state."""
        with patch("app.services.meta_campaign_service.MetaCampaignService.validate_token_permissions", new_callable=AsyncMock) as mock_perm:
            mock_perm.return_value = {
                "is_valid": True,
                "has_ads_read": True,
                "has_ads_management": True,
                "granted_scopes": ["ads_read", "ads_management"],
                "missing_scopes": [],
                "can_manage": True,
                "ad_account_id": "act_2505907436503788",
                "ad_account_name": "Suresh Pilli",
                "account_status": "ACTIVE",
                "app_id": "1354004176287129",
                "api_version": "v26.0",
                "message": "Full campaign management active.",
            }
            res = client.get("/api/v1/campaigns/meta/permissions")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["can_manage"])
            self.assertTrue(data["has_ads_management"])
            self.assertEqual(data["ad_account_id"], "act_2505907436503788")

    def test_create_campaign_endpoint_success(self):
        """POST /api/v1/campaigns/meta/create creates a campaign on Meta."""
        with patch("app.services.meta_campaign_service.MetaCampaignService.create_campaign", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {
                "success": True,
                "meta_campaign_id": "12020588234850999",
                "name": "Leads Q4 Campaign",
                "status": "paused",
                "objective": "OUTCOME_LEADS",
            }
            res = client.post("/api/v1/campaigns/meta/create", json={
                "name": "Leads Q4 Campaign",
                "objective": "OUTCOME_LEADS",
                "status": "PAUSED",
                "daily_budget": 20.0,
                "special_ad_categories": ["NONE"],
            })
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["meta_campaign_id"], "12020588234850999")
            self.assertEqual(data["status"], "paused")

    def test_pause_campaign_endpoint(self):
        """POST /api/v1/campaigns/meta/{meta_campaign_id}/pause pauses campaign."""
        with patch("app.services.meta_campaign_service.MetaCampaignService.pause_campaign", new_callable=AsyncMock) as mock_pause:
            mock_pause.return_value = {
                "success": True,
                "meta_campaign_id": "12020588234850999",
                "status": "paused",
                "message": "Campaign paused.",
            }
            res = client.post("/api/v1/campaigns/meta/12020588234850999/pause")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["status"], "paused")

    def test_resume_campaign_endpoint(self):
        """POST /api/v1/campaigns/meta/{meta_campaign_id}/resume resumes campaign."""
        with patch("app.services.meta_campaign_service.MetaCampaignService.resume_campaign", new_callable=AsyncMock) as mock_resume:
            mock_resume.return_value = {
                "success": True,
                "meta_campaign_id": "12020588234850999",
                "status": "active",
                "message": "Campaign resumed.",
            }
            res = client.post("/api/v1/campaigns/meta/12020588234850999/resume")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["status"], "active")

    def test_archive_campaign_endpoint(self):
        """POST /api/v1/campaigns/meta/{meta_campaign_id}/archive archives campaign."""
        with patch("app.services.meta_campaign_service.MetaCampaignService.archive_campaign", new_callable=AsyncMock) as mock_archive:
            mock_archive.return_value = {
                "success": True,
                "meta_campaign_id": "12020588234850999",
                "status": "archived",
                "message": "Campaign archived.",
            }
            res = client.post("/api/v1/campaigns/meta/12020588234850999/archive")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["status"], "archived")

    def test_update_campaign_endpoint(self):
        """PATCH /api/v1/campaigns/meta/{meta_campaign_id} updates campaign attributes."""
        with patch("app.services.meta_campaign_service.MetaCampaignService.update_campaign", new_callable=AsyncMock) as mock_update:
            mock_update.return_value = {
                "success": True,
                "meta_campaign_id": "12020588234850999",
                "updated_fields": ["name", "daily_budget"],
                "status": "paused",
                "message": "Campaign updated.",
            }
            res = client.patch("/api/v1/campaigns/meta/12020588234850999", json={
                "name": "Updated Campaign Name",
                "daily_budget": 30.0,
            })
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["updated_fields"], ["name", "daily_budget"])

    def test_get_campaign_details_endpoint(self):
        """GET /api/v1/campaigns/meta/{meta_campaign_id} returns live details and insights."""
        with patch("app.services.meta_campaign_service.MetaCampaignService.get_campaign_details", new_callable=AsyncMock) as mock_details:
            mock_details.return_value = {
                "meta_campaign_id": "12020588234850999",
                "name": "Leads Q4 Campaign",
                "meta_status": "PAUSED",
                "effective_status": "PAUSED",
                "objective": "OUTCOME_LEADS",
                "daily_budget": "2000",
                "insights": {
                    "impressions": "14500",
                    "spend": "42.80",
                    "clicks": "320",
                    "cpc": "0.13",
                    "cpm": "2.95",
                    "ctr": "2.21",
                },
            }
            res = client.get("/api/v1/campaigns/meta/12020588234850999")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["meta_campaign_id"], "12020588234850999")
            self.assertEqual(data["insights"]["impressions"], "14500")
            self.assertEqual(data["insights"]["spend"], "42.80")


def main():
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestMetaManagementEndpoints)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == "__main__":
    main()
