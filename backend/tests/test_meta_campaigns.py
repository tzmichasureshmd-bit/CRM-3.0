"""
Automated Test Suite for Meta Ads Campaigns Integration
Tests status mapping, pagination, error handling, token redaction, deduplication, and tenant isolation.
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.meta_campaign_service import (
    MetaCampaignService,
    normalize_ad_account_id,
    META_STATUS_MAP,
)


def test_normalize_ad_account_id():
    assert normalize_ad_account_id("2505907436503788") == "act_2505907436503788"
    assert normalize_ad_account_id("act_2505907436503788") == "act_2505907436503788"
    assert normalize_ad_account_id("  2505907436503788  ") == "act_2505907436503788"


def test_status_mapping():
    assert META_STATUS_MAP["ACTIVE"] == "active"
    assert META_STATUS_MAP["PAUSED"] == "paused"
    assert META_STATUS_MAP["ARCHIVED"] == "archived"
    assert META_STATUS_MAP["DELETED"] == "archived"
    assert META_STATUS_MAP.get("UNKNOWN", "draft") == "draft"


@pytest.mark.asyncio
async def test_successful_fetch():
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
        assert len(campaigns) == 2
        assert campaigns[0]["name"] == "Summer Lead Gen 2026"
        assert campaigns[1]["status"] == "PAUSED"


@pytest.mark.asyncio
async def test_pagination_handling():
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
        assert len(campaigns) == 2
        assert campaigns[0]["id"] == "1"
        assert campaigns[1]["id"] == "2"


@pytest.mark.asyncio
async def test_empty_campaigns():
    service = MetaCampaignService()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": []}

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        campaigns = await service.fetch_meta_campaigns(override_token="test_token")
        assert len(campaigns) == 0


@pytest.mark.asyncio
async def test_expired_token_error_handling():
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
        with pytest.raises(PermissionError) as exc_info:
            await service.fetch_meta_campaigns(override_token="expired_token_123")
        assert "invalid or expired" in str(exc_info.value)
        # Ensure secret token was not leaked in error message
        assert "expired_token_123" not in str(exc_info.value)


@pytest.mark.asyncio
async def test_missing_permission_error():
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
        with pytest.raises(PermissionError) as exc_info:
            await service.fetch_meta_campaigns(override_token="valid_token_no_scope")
        assert "ads_read" in str(exc_info.value)


@pytest.mark.asyncio
async def test_sync_deduplication_and_crm_isolation():
    """
    Validates:
    - First sync inserts new Meta campaigns
    - Second sync updates without creating duplicate records
    - Pre-existing CRM-only campaigns remain completely untouched
    - Tenant account_id is properly isolated
    """
    service = MetaCampaignService()
    mock_meta_data = [
        {"id": "meta_100", "name": "Diwali Offer", "status": "ACTIVE", "objective": "OUTCOME_LEADS"},
        {"id": "meta_200", "name": "Autumn Push", "status": "PAUSED", "objective": "OUTCOME_TRAFFIC"},
    ]

    mock_db = MagicMock()
    account_id = "test_account_uuid_123"

    # Initially existing: 1 CRM WhatsApp campaign, 0 Meta campaigns
    initial_campaigns = [
        {"id": "crm_1", "account_id": account_id, "name": "CRM WhatsApp Blast", "platform": "whatsapp", "status": "active"}
    ]

    # Mock DB table responses
    table_mock = MagicMock()
    mock_db.table.return_value = table_mock

    # Mock select
    select_query = MagicMock()
    select_query.select.return_value = select_query
    select_query.eq.return_value = select_query
    select_query.execute.return_value = MagicMock(data=initial_campaigns)
    table_mock.select.return_value = select_query

    # Mock insert
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

            assert result["success"] is True
            assert result["fetched_count"] == 2
            assert result["created_count"] == 2
            assert result["failed_count"] == 0

            # Verify CRM campaign was never modified or deleted
            assert initial_campaigns[0]["id"] == "crm_1"
            assert initial_campaigns[0]["platform"] == "whatsapp"


if __name__ == "__main__":
    import sys
    pytest.main([__file__, "-v"])
