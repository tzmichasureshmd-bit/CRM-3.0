"""
Standalone Test Runner for Meta Campaign Integration
Uses standard library unittest and asyncio (no external pytest dependency required).
"""
import sys
import os
import unittest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.meta_campaign_service import (
    MetaCampaignService,
    normalize_ad_account_id,
    META_STATUS_MAP,
)


class TestMetaCampaigns(unittest.IsolatedAsyncioTestCase):

    def test_normalize_ad_account_id(self):
        self.assertEqual(normalize_ad_account_id("2505907436503788"), "act_2505907436503788")
        self.assertEqual(normalize_ad_account_id("act_2505907436503788"), "act_2505907436503788")
        self.assertEqual(normalize_ad_account_id("  2505907436503788  "), "act_2505907436503788")

    def test_status_mapping(self):
        self.assertEqual(META_STATUS_MAP["ACTIVE"], "active")
        self.assertEqual(META_STATUS_MAP["PAUSED"], "paused")
        self.assertEqual(META_STATUS_MAP["ARCHIVED"], "archived")
        self.assertEqual(META_STATUS_MAP["DELETED"], "archived")
        self.assertEqual(META_STATUS_MAP.get("UNKNOWN", "draft"), "draft")

    async def test_successful_fetch(self):
        service = MetaCampaignService()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {
                    "id": "12020588234850321",
                    "name": "Summer Lead Gen 2026",
                    "status": "ACTIVE",
                    "objective": "OUTCOME_LEADS",
                },
                {
                    "id": "12020588234850322",
                    "name": "Brand Awareness Retargeting",
                    "status": "PAUSED",
                    "objective": "OUTCOME_AWARENESS",
                },
            ],
            "paging": {},
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            campaigns = await service.fetch_meta_campaigns(override_token="test_token_secret")
            self.assertEqual(len(campaigns), 2)
            self.assertEqual(campaigns[0]["name"], "Summer Lead Gen 2026")
            self.assertEqual(campaigns[1]["status"], "PAUSED")

    async def test_pagination_handling(self):
        service = MetaCampaignService()

        page1 = MagicMock()
        page1.status_code = 200
        page1.json.return_value = {
            "data": [{"id": "1", "name": "Camp 1", "status": "ACTIVE"}],
            "paging": {
                "cursors": {"after": "cursor_token_123"},
                "next": "https://graph.facebook.com/v26.0/act_123/campaigns?access_token=SHOULD_BE_IGNORED",
            },
        }

        page2 = MagicMock()
        page2.status_code = 200
        page2.json.return_value = {
            "data": [{"id": "2", "name": "Camp 2", "status": "PAUSED"}],
            "paging": {},
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = [page1, page2]
            campaigns = await service.fetch_meta_campaigns(override_token="test_token")
            self.assertEqual(len(campaigns), 2)
            self.assertEqual(campaigns[0]["id"], "1")
            self.assertEqual(campaigns[1]["id"], "2")

    async def test_empty_campaigns(self):
        service = MetaCampaignService()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": []}

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            campaigns = await service.fetch_meta_campaigns(override_token="test_token")
            self.assertEqual(len(campaigns), 0)

    async def test_expired_token_error_handling(self):
        service = MetaCampaignService()
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.json.return_value = {
            "error": {
                "message": "Error validating access token: Session has expired.",
                "type": "OAuthException",
                "code": 190,
                "error_subcode": 463,
            }
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            with self.assertRaises(PermissionError) as ctx:
                await service.fetch_meta_campaigns(override_token="expired_token_123")
            self.assertIn("invalid or expired", str(ctx.exception))
            # Verify secret token was not leaked in error message
            self.assertNotIn("expired_token_123", str(ctx.exception))

    async def test_missing_permission_error(self):
        service = MetaCampaignService()
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.json.return_value = {
            "error": {
                "message": "(#200) Requires ads_read permission",
                "type": "OAuthException",
                "code": 200,
            }
        }

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            with self.assertRaises(PermissionError) as ctx:
                await service.fetch_meta_campaigns(override_token="valid_token_no_scope")
            self.assertIn("ads_read", str(ctx.exception))

    async def test_sync_deduplication_and_crm_isolation(self):
        service = MetaCampaignService()
        mock_meta_data = [
            {"id": "meta_100", "name": "Diwali Offer", "status": "ACTIVE", "objective": "OUTCOME_LEADS"},
            {"id": "meta_200", "name": "Autumn Push", "status": "PAUSED", "objective": "OUTCOME_TRAFFIC"},
        ]

        mock_db = MagicMock()
        account_id = "test_account_uuid_123"

        initial_campaigns = [
            {"id": "crm_1", "account_id": account_id, "name": "CRM WhatsApp Blast", "platform": "whatsapp", "status": "active"}
        ]

        table_mock = MagicMock()
        mock_db.table.return_value = table_mock

        select_query = MagicMock()
        select_query.select.return_value = select_query
        select_query.eq.return_value = select_query
        select_query.execute.return_value = MagicMock(data=initial_campaigns)
        table_mock.select.return_value = select_query

        insert_query = MagicMock()
        insert_query.insert.return_value = insert_query
        insert_query.execute.side_effect = [
            MagicMock(data=[{"id": "new_1", "account_id": account_id, "name": "Diwali Offer", "platform": "facebook", "status": "active"}]),
            MagicMock(data=[{"id": "new_2", "account_id": account_id, "name": "Autumn Push", "platform": "facebook", "status": "paused"}]),
        ]
        table_mock.insert = insert_query.insert

        with patch.object(service, "fetch_meta_campaigns", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = mock_meta_data
            with patch("app.services.meta_campaign_service.get_supabase_client", return_value=mock_db):
                result = await service.sync_campaigns(account_id=account_id, override_token="dummy_token")

                self.assertTrue(result["success"])
                self.assertEqual(result["fetched_count"], 2)
                self.assertEqual(result["created_count"], 2)
                self.assertEqual(result["failed_count"], 0)

                # Verify pre-existing CRM campaign was untouched
                self.assertEqual(initial_campaigns[0]["id"], "crm_1")
                self.assertEqual(initial_campaigns[0]["platform"], "whatsapp")


if __name__ == "__main__":
    unittest.main(verbosity=2)
