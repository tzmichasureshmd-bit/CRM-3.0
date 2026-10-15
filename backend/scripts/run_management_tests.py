"""
Standalone Test Runner for Meta Campaign Management (v26.0)
Tests Campaign Creation, Update, Pause, Resume, Archive, Insights, and Permission Validation.
Uses standard library unittest and unittest.mock (zero external test runner dependencies).
"""
import sys
import os
import unittest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
env_path = os.path.join(backend_dir, ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)

from app.services.meta_campaign_service import (
    MetaCampaignService,
    normalize_ad_account_id,
    VALID_META_OBJECTIVES,
    META_STATUS_MAP,
)


class TestMetaCampaignManagement(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.service = MetaCampaignService()
        self.test_ad_account = "act_2505907436503788"
        self.test_token = "EAAT_mock_test_token"

    def test_valid_meta_objectives_list(self):
        """Verify all standard Meta ODAX objectives are defined."""
        expected = {
            "OUTCOME_LEADS",
            "OUTCOME_SALES",
            "OUTCOME_TRAFFIC",
            "OUTCOME_AWARENESS",
            "OUTCOME_ENGAGEMENT",
            "OUTCOME_APP_PROMOTION",
        }
        self.assertEqual(VALID_META_OBJECTIVES, expected)

    async def test_permission_validation_ads_management_active(self):
        """When token has ads_read and ads_management, can_manage should be True."""
        perm_response = MagicMock()
        perm_response.status_code = 200
        perm_response.json.return_value = {
            "data": [
                {"permission": "ads_read", "status": "granted"},
                {"permission": "ads_management", "status": "granted"},
                {"permission": "business_management", "status": "granted"},
            ]
        }

        account_response = MagicMock()
        account_response.status_code = 200
        account_response.json.return_value = {
            "id": "act_2505907436503788",
            "name": "TZmicha Production Ads",
            "account_status": 1,
            "currency": "USD",
            "timezone_name": "Asia/Kolkata",
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = [perm_response, account_response]
            info = await self.service.validate_token_permissions(override_token=self.test_token)
            self.assertTrue(info["has_ads_read"])
            self.assertTrue(info["has_ads_management"])
            self.assertTrue(info["can_manage"])
            self.assertEqual(info["ad_account_name"], "TZmicha Production Ads")
            self.assertEqual(info["account_status"], "ACTIVE")

    async def test_permission_validation_read_only_fallback(self):
        """When token only has ads_read, can_manage should be False."""
        perm_response = MagicMock()
        perm_response.status_code = 200
        perm_response.json.return_value = {
            "data": [
                {"permission": "ads_read", "status": "granted"},
            ]
        }

        account_response = MagicMock()
        account_response.status_code = 200
        account_response.json.return_value = {
            "id": "act_2505907436503788",
            "name": "TZmicha Production Ads",
            "account_status": 1,
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = [perm_response, account_response]
            info = await self.service.validate_token_permissions(override_token=self.test_token)
            self.assertTrue(info["has_ads_read"])
            self.assertFalse(info["has_ads_management"])
            self.assertFalse(info["can_manage"])

    async def test_create_campaign_requires_ads_management(self):
        """Creating a campaign without ads_management should raise PermissionError."""
        with patch.object(
            self.service,
            "validate_token_permissions",
            new_callable=AsyncMock,
            return_value={"has_ads_read": True, "has_ads_management": False, "can_manage": False},
        ):
            with self.assertRaises(PermissionError) as ctx:
                await self.service.create_campaign(
                    account_id="acc_123",
                    name="Test Invalid Campaign",
                    objective="OUTCOME_LEADS",
                )
            self.assertIn("ads_management", str(ctx.exception))

    async def test_create_campaign_invalid_objective(self):
        """Passing an unrecognized objective should raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            await self.service.create_campaign(
                account_id="acc_123",
                name="Test Invalid Objective",
                objective="CONVERSIONS_OLD",  # Legacy deprecated objective
            )
        self.assertIn("Invalid Meta objective", str(ctx.exception))

    async def test_create_campaign_success(self):
        """Creating a campaign successfully defaults to PAUSED and attaches special_ad_categories."""
        mock_meta_response = MagicMock()
        mock_meta_response.status_code = 200
        mock_meta_response.json.return_value = {"id": "12020588234850999"}

        mock_supabase = MagicMock()
        mock_table = MagicMock()
        mock_supabase.table.return_value = mock_table
        mock_table.upsert.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{
            "id": "local_uuid_123",
            "name": "Q4 Lead Generation",
            "status": "paused",
            "meta_campaign_id": "12020588234850999",
            "objective": "OUTCOME_LEADS",
            "special_ad_categories": ["NONE"],
        }])

        with patch.object(
            self.service,
            "validate_token_permissions",
            new_callable=AsyncMock,
            return_value={"has_ads_read": True, "has_ads_management": True, "can_manage": True},
        ):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_meta_response
                with patch("app.services.meta_campaign_service.get_supabase_client", return_value=mock_supabase):
                    res = await self.service.create_campaign(
                        account_id="acc_tenant_999",
                        name="Q4 Lead Generation",
                        objective="OUTCOME_LEADS",
                        status="PAUSED",
                        daily_budget=15.50,
                        special_ad_categories=["NONE"],
                    )

                    # Verify Meta API call parameters
                    call_args = mock_post.call_args
                    self.assertIn("act_2505907436503788/campaigns", call_args[0][0])
                    payload = call_args[1]["data"]
                    self.assertEqual(payload["name"], "Q4 Lead Generation")
                    self.assertEqual(payload["objective"], "OUTCOME_LEADS")
                    self.assertEqual(payload["status"], "PAUSED")
                    self.assertEqual(payload["daily_budget"], 1550)  # Cents
                    self.assertEqual(payload["special_ad_categories"], '["NONE"]')
                    self.assertEqual(res["meta_campaign_id"], "12020588234850999")

    async def test_pause_campaign_upstream_mutation(self):
        """Pausing campaign sends status=PAUSED to Meta and updates local DB."""
        mock_meta_response = MagicMock()
        mock_meta_response.status_code = 200
        mock_meta_response.json.return_value = {"success": True}

        mock_supabase = MagicMock()
        mock_table = MagicMock()
        mock_supabase.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{
            "id": "local_123",
            "meta_campaign_id": "12020588234850999",
            "name": "Live Promo",
            "status": "active",
            "account_id": "acc_1",
        }])
        mock_table.update.return_value = mock_table

        with patch.object(
            self.service,
            "validate_token_permissions",
            new_callable=AsyncMock,
            return_value={"has_ads_read": True, "has_ads_management": True, "can_manage": True},
        ):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_meta_response
                with patch("app.services.meta_campaign_service.get_supabase_client", return_value=mock_supabase):
                    res = await self.service.pause_campaign(
                        account_id="acc_1",
                        meta_campaign_id="12020588234850999",
                    )
                    call_args = mock_post.call_args
                    self.assertIn("12020588234850999", call_args[0][0])
                    self.assertEqual(call_args[1]["data"]["status"], "PAUSED")
                    self.assertEqual(res["status"], "paused")

    async def test_resume_campaign_upstream_mutation(self):
        """Resuming campaign sends status=ACTIVE to Meta and updates local DB."""
        mock_meta_response = MagicMock()
        mock_meta_response.status_code = 200
        mock_meta_response.json.return_value = {"success": True}

        mock_supabase = MagicMock()
        mock_table = MagicMock()
        mock_supabase.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{
            "id": "local_123",
            "meta_campaign_id": "12020588234850999",
            "name": "Live Promo",
            "status": "paused",
            "account_id": "acc_1",
        }])
        mock_table.update.return_value = mock_table

        with patch.object(
            self.service,
            "validate_token_permissions",
            new_callable=AsyncMock,
            return_value={"has_ads_read": True, "has_ads_management": True, "can_manage": True},
        ):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_meta_response
                with patch("app.services.meta_campaign_service.get_supabase_client", return_value=mock_supabase):
                    res = await self.service.resume_campaign(
                        account_id="acc_1",
                        meta_campaign_id="12020588234850999",
                    )
                    call_args = mock_post.call_args
                    self.assertIn("12020588234850999", call_args[0][0])
                    self.assertEqual(call_args[1]["data"]["status"], "ACTIVE")
                    self.assertEqual(res["status"], "active")

    async def test_archive_campaign_upstream_mutation(self):
        """Archiving campaign sends status=ARCHIVED to Meta."""
        mock_meta_response = MagicMock()
        mock_meta_response.status_code = 200
        mock_meta_response.json.return_value = {"success": True}

        mock_supabase = MagicMock()
        mock_table = MagicMock()
        mock_supabase.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{
            "id": "local_123",
            "meta_campaign_id": "12020588234850999",
            "name": "Live Promo",
            "status": "paused",
            "account_id": "acc_1",
        }])
        mock_table.update.return_value = mock_table

        with patch.object(
            self.service,
            "validate_token_permissions",
            new_callable=AsyncMock,
            return_value={"has_ads_read": True, "has_ads_management": True, "can_manage": True},
        ):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_meta_response
                with patch("app.services.meta_campaign_service.get_supabase_client", return_value=mock_supabase):
                    res = await self.service.archive_campaign(
                        account_id="acc_1",
                        meta_campaign_id="12020588234850999",
                    )
                    call_args = mock_post.call_args
                    self.assertIn("12020588234850999", call_args[0][0])
                    self.assertEqual(call_args[1]["data"]["status"], "ARCHIVED")
                    self.assertEqual(res["status"], "archived")

    async def test_tenant_isolation_enforcement(self):
        """Updating or pausing a campaign belonging to another tenant raises ValueError."""
        mock_supabase = MagicMock()
        mock_table = MagicMock()
        mock_supabase.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[])  # Empty result for this account_id

        with patch("app.services.meta_campaign_service.get_supabase_client", return_value=mock_supabase):
            with self.assertRaises(ValueError) as ctx:
                await self.service.pause_campaign(
                    account_id="unauthorized_tenant_acc",
                    meta_campaign_id="12020588234850999",
                )
            self.assertIn("not found in your tenant account", str(ctx.exception))


def main():
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestMetaCampaignManagement)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == "__main__":
    main()
