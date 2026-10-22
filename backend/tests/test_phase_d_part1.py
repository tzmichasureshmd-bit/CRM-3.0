"""
Phase D — Marketing, Content, Campaigns, Broadcasts & Attribution Tests
Part 1: Content CRUD, broadcast service helpers, attribution, campaign isolation.
All tests use mocks — no live DB, no real Meta API calls, no real sends.
"""

import pytest
import pathlib
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).parent.parent.parent


# ── helpers ───────────────────────────────────────────────────

def _mock_supabase(data=None, error=None):
    chain = MagicMock()
    result = MagicMock()
    result.data = data if data is not None else []
    result.error = error
    result.count = len(data) if data else 0
    for m in ("select", "insert", "update", "delete", "eq", "neq", "in_",
              "order", "limit", "single", "execute", "gte", "lte", "range",
              "not_", "is_", "maybeSingle", "upsert"):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = result
    chain.single.return_value = result
    return chain, result


# ── C1: Content API validation ────────────────────────────────

class TestContentValidation:

    def test_valid_platforms_defined(self):
        src = ROOT.joinpath("src/app/api/v3/content/route.ts").read_text(encoding="utf-8")
        for p in ("instagram", "facebook", "whatsapp", "telegram", "email"):
            assert p in src

    def test_title_required_in_post(self):
        src = ROOT.joinpath("src/app/api/v3/content/route.ts").read_text(encoding="utf-8")
        assert "title is required" in src

    def test_platform_validated_in_post(self):
        src = ROOT.joinpath("src/app/api/v3/content/route.ts").read_text(encoding="utf-8")
        assert "platform must be one of" in src

    def test_status_filter_validated(self):
        src = ROOT.joinpath("src/app/api/v3/content/route.ts").read_text(encoding="utf-8")
        assert "Invalid status" in src

    def test_platform_filter_validated(self):
        src = ROOT.joinpath("src/app/api/v3/content/route.ts").read_text(encoding="utf-8")
        assert "Invalid platform" in src

    def test_account_id_from_token_not_body(self):
        src = ROOT.joinpath("src/app/api/v3/content/route.ts").read_text(encoding="utf-8")
        assert "user.account_id" in src
        assert "body.account_id" not in src

    def test_scheduled_at_validated(self):
        src = ROOT.joinpath("src/app/api/v3/content/route.ts").read_text(encoding="utf-8")
        assert "scheduled_at" in src
        assert "valid ISO" in src

    def test_uses_verify_request(self):
        src = ROOT.joinpath("src/app/api/v3/content/route.ts").read_text(encoding="utf-8")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_content_id_route_uses_verify_request(self):
        src = ROOT.joinpath("src/app/api/v3/content/[id]/route.ts").read_text(encoding="utf-8")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src


# ── C2: Attribution API ───────────────────────────────────────

class TestAttributionAPI:

    def test_attribution_uses_verify_request(self):
        src = ROOT.joinpath("src/app/api/v3/attribution/route.ts").read_text(encoding="utf-8")
        assert "verifyRequest" in src

    def test_attribution_scoped_to_account(self):
        src = ROOT.joinpath("src/app/api/v3/attribution/route.ts").read_text(encoding="utf-8")
        assert "accountId" in src
        assert "account_id" in src

    def test_attribution_validates_contact_ownership(self):
        src = ROOT.joinpath("src/app/api/v3/attribution/route.ts").read_text(encoding="utf-8")
        assert "Contact not found or access denied" in src

    def test_attribution_validates_deal_ownership(self):
        src = ROOT.joinpath("src/app/api/v3/attribution/route.ts").read_text(encoding="utf-8")
        assert "Deal not found or access denied" in src

    def test_attribution_validates_content_ownership(self):
        src = ROOT.joinpath("src/app/api/v3/attribution/route.ts").read_text(encoding="utf-8")
        assert "Content not found or access denied" in src

    def test_revenue_update_is_awaited(self):
        """The revenue_attributed update must be awaited, not fire-and-forget."""
        src = ROOT.joinpath("src/app/api/v3/attribution/route.ts").read_text(encoding="utf-8")
        # Must NOT use void pattern
        assert "void db.from" not in src
        # Must use await
        assert "await db.from('crm3_content')" in src or 'await db.from("crm3_content")' in src

    def test_attribution_method_validated(self):
        src = ROOT.joinpath("src/app/api/v3/attribution/route.ts").read_text(encoding="utf-8")
        assert "validMethods" in src

    def test_attribution_confidence_validated(self):
        src = ROOT.joinpath("src/app/api/v3/attribution/route.ts").read_text(encoding="utf-8")
        assert "validConfidence" in src

    def test_no_double_counting_in_overview(self):
        """Overview metrics must filter by distinct fields, not count all rows."""
        src = ROOT.joinpath("src/app/api/v3/attribution/route.ts").read_text(encoding="utf-8")
        assert "filter(r => r.contact_id)" in src
        assert "filter(r => r.deal_id)" in src
        assert "filter(r => r.is_won)" in src


# ── C3: Broadcast service helpers ────────────────────────────

class TestBroadcastServiceHelpers:

    def test_opt_out_check_before_send(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert "opt_out" in src
        assert "opted out" in src.lower()

    def test_phone_validation_for_whatsapp(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert "Invalid phone length" in src

    def test_email_regex_validation(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert "email_regex" in src or "Malformed email" in src

    def test_duplicate_send_lock(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert "_ACTIVE_BROADCAST_LOCKS" in src
        assert "Duplicate request rejected" in src or "Duplicate Send Prevention" in src

    def test_retry_failed_status_is_partial_on_failure(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert '"partial"' in src or "'partial'" in src

    def test_batch_size_capped(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert "min(batch_size, 50)" in src or "min(batch_chunk_size" in src or "max(1, min(" in src

    def test_tenant_isolation_in_send_all(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert ".eq(\"account_id\", account_id)" in src or ".eq('account_id', account_id)" in src

    def test_broadcast_not_found_raises(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert "not found in tenant account" in src

    def test_empty_message_rejected(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert "empty message" in src

    def test_meta_error_parsing_does_not_expose_token(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert "_parse_meta_error" in src
        # Token must not appear in error output
        assert "token" not in src.lower().split("_parse_meta_error")[1][:200]

    def test_rate_limit_error_identified(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert "rate limit" in src.lower()

    def test_token_expiry_error_identified(self):
        src = ROOT.joinpath("backend/app/services/broadcast_service.py").read_text(encoding="utf-8")
        assert "expired" in src.lower() or "invalid" in src.lower()


class TestBroadcastRecipientResolution:

    def test_extract_destination_whatsapp_valid(self):
        from app.services.broadcast_service import BroadcastService
        svc = BroadcastService()
        contact = {"phone": "+1234567890", "opt_out": False}
        dest, valid, err = svc._extract_destination(contact, "whatsapp")
        assert valid is True
        assert dest == "+1234567890"
        assert err is None

    def test_extract_destination_whatsapp_no_phone(self):
        from app.services.broadcast_service import BroadcastService
        svc = BroadcastService()
        contact = {"phone": "", "opt_out": False}
        dest, valid, err = svc._extract_destination(contact, "whatsapp")
        assert valid is False
        assert "No phone" in err

    def test_extract_destination_whatsapp_short_number(self):
        from app.services.broadcast_service import BroadcastService
        svc = BroadcastService()
        contact = {"phone": "123", "opt_out": False}
        dest, valid, err = svc._extract_destination(contact, "whatsapp")
        assert valid is False

    def test_extract_destination_email_valid(self):
        from app.services.broadcast_service import BroadcastService
        svc = BroadcastService()
        contact = {"email": "test@example.com", "opt_out": False}
        dest, valid, err = svc._extract_destination(contact, "email")
        assert valid is True
        assert dest == "test@example.com"

    def test_extract_destination_email_malformed(self):
        from app.services.broadcast_service import BroadcastService
        svc = BroadcastService()
        contact = {"email": "not-an-email", "opt_out": False}
        dest, valid, err = svc._extract_destination(contact, "email")
        assert valid is False
        assert "Malformed" in err

    def test_extract_destination_unsupported_channel(self):
        from app.services.broadcast_service import BroadcastService
        svc = BroadcastService()
        contact = {"phone": "+1234567890"}
        dest, valid, err = svc._extract_destination(contact, "sms")
        assert valid is False
        assert "Unsupported" in err

    def test_get_recipients_skips_opted_out(self):
        from app.services.broadcast_service import BroadcastService
        svc = BroadcastService()
        contacts = [
            {"id": "c1", "name": "Alice", "phone": "+1234567890", "opt_out": True, "account_id": "acct-1", "custom_fields": {}},
            {"id": "c2", "name": "Bob",   "phone": "+9876543210", "opt_out": False, "account_id": "acct-1", "custom_fields": {}},
        ]
        mock_db = MagicMock()
        mock_res = MagicMock()
        mock_res.data = contacts
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_res

        with patch("app.services.broadcast_service.get_supabase_client", return_value=mock_db):
            result = svc.get_recipients_for_channel("acct-1", "whatsapp")

        assert result["eligible_count"] == 1
        assert result["skipped_opt_out_count"] == 1
        assert result["eligible"][0]["contact_id"] == "c2"


# ── C4: Campaign isolation ────────────────────────────────────

class TestCampaignIsolation:

    def test_list_campaigns_scoped_to_account(self):
        src = ROOT.joinpath("backend/app/api/v1/campaigns.py").read_text(encoding="utf-8")
        assert '.eq("account_id", user["account_id"])' in src or ".eq('account_id', user['account_id'])" in src

    def test_update_campaign_scoped_to_account(self):
        src = ROOT.joinpath("backend/app/api/v1/campaigns.py").read_text(encoding="utf-8")
        assert "account_id" in src
        # account_id must not be overridable from body
        assert 'body.pop("account_id", None)' in src or "body.pop('account_id', None)" in src

    def test_delete_campaign_scoped_to_account(self):
        src = ROOT.joinpath("backend/app/api/v1/campaigns.py").read_text(encoding="utf-8")
        assert 'eq("account_id", user["account_id"])' in src

    def test_meta_sync_uses_account_id(self):
        src = ROOT.joinpath("backend/app/api/v1/campaigns.py").read_text(encoding="utf-8")
        assert "account_id=account_id" in src or "account_id=user" in src

    def test_hardcoded_ad_account_removed(self):
        src = ROOT.joinpath("backend/app/services/meta_campaign_service.py").read_text(encoding="utf-8")
        # The hardcoded real account ID must be gone
        assert "act_2505907436503788" not in src
        assert "act_2505907236503788" not in src

    def test_missing_ad_account_raises_error(self):
        src = ROOT.joinpath("backend/app/services/meta_campaign_service.py").read_text(encoding="utf-8")
        assert "META_AD_ACCOUNT_ID" in src
        assert "not configured" in src

    def test_campaign_intelligence_scoped_to_account(self):
        src = ROOT.joinpath("backend/app/api/v1/campaigns.py").read_text(encoding="utf-8")
        assert "campaign_intelligence" in src
        assert 'eq("account_id", user["account_id"])' in src
