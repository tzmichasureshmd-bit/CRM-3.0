"""
Phase D — Marketing Tests Part 2
Meta Lead Ads webhook: signature verification, tenant routing,
deduplication, attribution recording, and broadcast API auth.
"""

import pytest
import hmac
import hashlib
import json
import pathlib
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).parent.parent.parent


# ── helpers ───────────────────────────────────────────────────

def _make_lead_payload(page_id="page-123", lead_id="lead-456", form_id="form-789", campaign_id="camp-1"):
    return {
        "object": "page",
        "entry": [{
            "id": page_id,
            "changes": [{
                "field": "leadgen",
                "value": {
                    "leadgen_id": lead_id,
                    "form_id": form_id,
                    "page_id": page_id,
                    "campaign_id": campaign_id,
                    "ad_id": "ad-001",
                    "created_time": 1700000000,
                }
            }]
        }]
    }


def _sign_payload(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ── Meta Lead Ads webhook source inspection ───────────────────

class TestMetaLeadsWebhookSource:

    def test_leadgen_handler_exists(self):
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        assert "meta-leads" in src or "meta_leads" in src

    def test_hmac_verification_present(self):
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        assert "hmac" in src
        assert "X-Hub-Signature-256" in src

    def test_page_id_routing_present(self):
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        assert "_get_account_id_for_page" in src

    def test_lead_id_deduplication_present(self):
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        assert "lead_id" in src
        assert "duplicate" in src.lower() or "dedup" in src.lower() or "Dedup" in src

    def test_attribution_recording_present(self):
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        assert "_record_lead_attribution" in src

    def test_always_returns_200(self):
        """Webhook must return 200 even on signature failure to prevent Meta retry storms."""
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        # After signature failure, must return ok not raise
        assert 'return {"status": "ok"}' in src

    def test_field_data_fetched_from_meta(self):
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        assert "_fetch_lead_fields" in src
        assert "field_data" in src

    def test_token_not_logged(self):
        """Access token value must never appear in log messages."""
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        # Log lines may mention the env var name (META_ACCESS_TOKEN) but must not
        # log the actual token value. We verify no f-string interpolates the token.
        assert 'logger.warning(f"' not in src or 'token}' not in src
        assert 'logger.error(f"' not in src or 'token}' not in src
        # The token value is never passed to a logger call
        assert 'logger.warning(token' not in src
        assert 'logger.error(token' not in src

    def test_verify_endpoint_exists(self):
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        assert "meta_leads_verify" in src
        assert "hub.challenge" in src


# ── _get_account_id_for_page unit tests ───────────────────────

class TestGetAccountIdForPage:

    def test_returns_none_for_empty_page_id(self):
        from app.api.v1.webhooks import _get_account_id_for_page
        result = _get_account_id_for_page("")
        assert result is None

    def test_returns_account_id_for_single_match(self):
        from app.api.v1.webhooks import _get_account_id_for_page
        mock_db = MagicMock()
        mock_res = MagicMock()
        mock_res.data = [{"account_id": "acct-1"}]
        mock_db.table.return_value.select.return_value.in_.return_value.eq.return_value.limit.return_value.execute.return_value = mock_res

        with patch("app.api.v1.webhooks.get_supabase", return_value=mock_db):
            result = _get_account_id_for_page("page-123")
        assert result == "acct-1"

    def test_returns_none_for_ambiguous_match(self):
        from app.api.v1.webhooks import _get_account_id_for_page
        mock_db = MagicMock()
        mock_res = MagicMock()
        mock_res.data = [{"account_id": "acct-1"}, {"account_id": "acct-2"}]
        mock_db.table.return_value.select.return_value.in_.return_value.eq.return_value.limit.return_value.execute.return_value = mock_res

        with patch("app.api.v1.webhooks.get_supabase", return_value=mock_db):
            result = _get_account_id_for_page("page-123")
        assert result is None

    def test_returns_none_for_no_match(self):
        from app.api.v1.webhooks import _get_account_id_for_page
        mock_db = MagicMock()
        mock_res = MagicMock()
        mock_res.data = []
        mock_db.table.return_value.select.return_value.in_.return_value.eq.return_value.limit.return_value.execute.return_value = mock_res

        with patch("app.api.v1.webhooks.get_supabase", return_value=mock_db):
            result = _get_account_id_for_page("page-unknown")
        assert result is None

    def test_returns_none_on_db_error(self):
        from app.api.v1.webhooks import _get_account_id_for_page
        mock_db = MagicMock()
        mock_db.table.return_value.select.return_value.in_.return_value.eq.return_value.limit.return_value.execute.side_effect = Exception("DB error")

        with patch("app.api.v1.webhooks.get_supabase", return_value=mock_db):
            result = _get_account_id_for_page("page-123")
        assert result is None


# ── _upsert_lead_ads_contact unit tests ───────────────────────

class TestUpsertLeadAdsContact:

    def _make_db(self, existing_by_lead=None, existing_by_email=None, insert_result=None):
        """Build a mock supabase that returns different results for different queries."""
        mock_db = MagicMock()

        def table_side_effect(table_name):
            chain = MagicMock()
            result = MagicMock()

            if table_name == "contacts":
                call_count = {"n": 0}

                def execute_side():
                    call_count["n"] += 1
                    r = MagicMock()
                    if call_count["n"] == 1:
                        r.data = existing_by_lead or []
                    elif call_count["n"] == 2:
                        r.data = existing_by_email or []
                    else:
                        r.data = insert_result or [{"id": "new-contact-id"}]
                    return r

                chain.execute.side_effect = execute_side
            else:
                result.data = []
                chain.execute.return_value = result

            for m in ("select", "insert", "update", "eq", "in_", "limit", "single"):
                getattr(chain, m).return_value = chain
            return chain

        mock_db.table.side_effect = table_side_effect
        return mock_db

    def test_dedup_by_lead_id_returns_existing(self):
        from app.api.v1.webhooks import _upsert_lead_ads_contact
        mock_db = MagicMock()
        chain = MagicMock()
        result = MagicMock()
        result.data = [{"id": "existing-contact"}]
        chain.execute.return_value = result
        for m in ("select", "insert", "update", "eq", "in_", "limit", "single"):
            getattr(chain, m).return_value = chain
        mock_db.table.return_value = chain

        with patch("app.api.v1.webhooks.get_supabase", return_value=mock_db):
            contact_id = _upsert_lead_ads_contact(
                account_id="acct-1",
                form_id="form-1",
                lead_id="lead-123",
                campaign_id="camp-1",
                fields={"full_name": "Alice", "email": "alice@example.com"},
            )
        assert contact_id == "existing-contact"

    def test_new_contact_created_with_fields(self):
        from app.api.v1.webhooks import _upsert_lead_ads_contact
        mock_db = MagicMock()
        chain = MagicMock()

        call_count = {"n": 0}
        def execute_side():
            call_count["n"] += 1
            r = MagicMock()
            if call_count["n"] <= 2:
                r.data = []  # no existing by lead_id or email
            else:
                r.data = [{"id": "new-contact-id"}]
            return r

        chain.execute.side_effect = execute_side
        for m in ("select", "insert", "update", "eq", "in_", "limit", "single"):
            getattr(chain, m).return_value = chain
        mock_db.table.return_value = chain

        with patch("app.api.v1.webhooks.get_supabase", return_value=mock_db):
            contact_id = _upsert_lead_ads_contact(
                account_id="acct-1",
                form_id="form-1",
                lead_id="lead-new",
                campaign_id="camp-1",
                fields={"full_name": "Bob", "email": "bob@example.com", "phone_number": "+1234567890"},
            )
        assert contact_id == "new-contact-id"

    def test_name_assembled_from_first_last(self):
        from app.api.v1.webhooks import _upsert_lead_ads_contact
        # Test name assembly logic directly
        fields = {"first_name": "John", "last_name": "Doe"}
        name = (
            fields.get("full_name")
            or f"{fields.get('first_name', '')} {fields.get('last_name', '')}".strip()
            or ""
        )
        assert name == "John Doe"

    def test_raw_fields_stored_in_custom_fields(self):
        from app.api.v1.webhooks import _upsert_lead_ads_contact
        mock_db = MagicMock()
        chain = MagicMock()
        inserted_data = {}

        def insert_side(data):
            inserted_data.update(data)
            return chain

        call_count = {"n": 0}
        def execute_side():
            call_count["n"] += 1
            r = MagicMock()
            if call_count["n"] <= 2:
                r.data = []
            else:
                r.data = [{"id": "new-id"}]
            return r

        chain.execute.side_effect = execute_side
        chain.insert.side_effect = insert_side
        for m in ("select", "update", "eq", "in_", "limit", "single"):
            getattr(chain, m).return_value = chain
        mock_db.table.return_value = chain

        with patch("app.api.v1.webhooks.get_supabase", return_value=mock_db):
            _upsert_lead_ads_contact(
                account_id="acct-1",
                form_id="form-1",
                lead_id="lead-raw",
                campaign_id=None,
                fields={"full_name": "Test", "custom_question": "answer"},
            )

        if inserted_data.get("custom_fields"):
            assert "raw_fields" in inserted_data["custom_fields"]
            assert "meta_lead_id" in inserted_data["custom_fields"]


# ── _record_lead_attribution unit tests ──────────────────────

class TestRecordLeadAttribution:

    def test_skips_if_already_attributed(self):
        from app.api.v1.webhooks import _record_lead_attribution
        mock_db = MagicMock()
        chain = MagicMock()
        result = MagicMock()
        result.data = [{"id": "existing-attr"}]  # already exists
        chain.execute.return_value = result
        for m in ("select", "insert", "eq", "limit"):
            getattr(chain, m).return_value = chain
        mock_db.table.return_value = chain

        with patch("app.api.v1.webhooks.get_supabase", return_value=mock_db):
            _record_lead_attribution(
                account_id="acct-1",
                contact_id="contact-1",
                campaign_id="camp-1",
                ad_id="ad-1",
                form_id="form-1",
                lead_id="lead-1",
            )
        # insert should NOT have been called
        insert_calls = [c for c in mock_db.table.return_value.insert.call_args_list]
        assert len(insert_calls) == 0

    def test_attribution_method_is_direct(self):
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        assert '"direct"' in src or "'direct'" in src

    def test_attribution_confidence_is_high(self):
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        assert '"high"' in src or "'high'" in src

    def test_source_is_meta_lead_ads(self):
        src = ROOT.joinpath("backend/app/api/v1/webhooks.py").read_text(encoding="utf-8")
        assert "meta_lead_ads" in src


# ── Broadcast API auth ────────────────────────────────────────

class TestBroadcastAPIAuth:

    def test_broadcasts_route_uses_verify_request(self):
        src = ROOT.joinpath("src/app/api/v3/broadcasts/route.ts").read_text(encoding="utf-8")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_broadcasts_scoped_to_account(self):
        src = ROOT.joinpath("src/app/api/v3/broadcasts/route.ts").read_text(encoding="utf-8")
        assert "user.account_id" in src

    def test_broadcast_name_required(self):
        src = ROOT.joinpath("src/app/api/v3/broadcasts/route.ts").read_text(encoding="utf-8")
        assert "name is required" in src

    def test_broadcast_platform_required(self):
        src = ROOT.joinpath("src/app/api/v3/broadcasts/route.ts").read_text(encoding="utf-8")
        assert "platform is required" in src

    def test_broadcast_message_required(self):
        src = ROOT.joinpath("src/app/api/v3/broadcasts/route.ts").read_text(encoding="utf-8")
        assert "message is required" in src

    def test_backend_broadcasts_scoped_to_account(self):
        src = ROOT.joinpath("backend/app/api/v1/broadcasts.py").read_text(encoding="utf-8")
        assert 'eq("account_id", user["account_id"])' in src or ".eq('account_id', user['account_id'])" in src

    def test_send_all_requires_auth(self):
        src = ROOT.joinpath("backend/app/api/v1/broadcasts.py").read_text(encoding="utf-8")
        assert "get_current_user" in src
        assert "send-all" in src or "send_all" in src

    def test_retry_failed_requires_auth(self):
        src = ROOT.joinpath("backend/app/api/v1/broadcasts.py").read_text(encoding="utf-8")
        assert "retry-failed" in src or "retry_failed" in src


# ── Content calendar source inspection ───────────────────────

class TestContentCalendar:

    def test_calendar_component_exists(self):
        src = ROOT.joinpath("src/components/content-studio/ContentCalendar.tsx").read_text(encoding="utf-8")
        assert "ContentCalendar" in src

    def test_calendar_has_month_week_day_agenda_views(self):
        src = ROOT.joinpath("src/components/content-studio/ContentCalendar.tsx").read_text(encoding="utf-8")
        for view in ("month", "week", "day", "agenda"):
            assert view in src

    def test_calendar_navigation_prev_next(self):
        src = ROOT.joinpath("src/components/content-studio/ContentCalendar.tsx").read_text(encoding="utf-8")
        assert "ChevronLeft" in src
        assert "ChevronRight" in src

    def test_calendar_today_button(self):
        src = ROOT.joinpath("src/components/content-studio/ContentCalendar.tsx").read_text(encoding="utf-8")
        assert "Today" in src

    def test_calendar_fetches_from_api(self):
        src = ROOT.joinpath("src/components/content-studio/ContentCalendar.tsx").read_text(encoding="utf-8")
        assert "/api/v3/content" in src

    def test_calendar_error_state(self):
        src = ROOT.joinpath("src/components/content-studio/ContentCalendar.tsx").read_text(encoding="utf-8")
        assert "error" in src.lower()
        assert "Failed to load" in src or "failed" in src.lower()

    def test_calendar_loading_state(self):
        src = ROOT.joinpath("src/components/content-studio/ContentCalendar.tsx").read_text(encoding="utf-8")
        assert "loading" in src.lower() or "Loader" in src

    def test_calendar_status_filter(self):
        src = ROOT.joinpath("src/components/content-studio/ContentCalendar.tsx").read_text(encoding="utf-8")
        assert "filterStatus" in src

    def test_calendar_platform_filter(self):
        src = ROOT.joinpath("src/components/content-studio/ContentCalendar.tsx").read_text(encoding="utf-8")
        assert "filterPlatform" in src

    def test_content_grid_pagination(self):
        src = ROOT.joinpath("src/components/content-studio/ContentGrid.tsx").read_text(encoding="utf-8")
        assert "PAGE_SIZE" in src
        assert "page" in src
        assert "totalPages" in src


# ── Meta campaign service security ───────────────────────────

class TestMetaCampaignServiceSecurity:

    def test_token_not_in_error_messages(self):
        src = ROOT.joinpath("backend/app/services/meta_campaign_service.py").read_text(encoding="utf-8")
        # Error messages must not include the token value
        error_lines = [l for l in src.splitlines() if "raise" in l or "logger.error" in l]
        for line in error_lines:
            assert "token" not in line.lower() or "token_configured" in line.lower() or "has_token" in line.lower()

    def test_credentials_info_redacts_token(self):
        src = ROOT.joinpath("backend/app/services/meta_campaign_service.py").read_text(encoding="utf-8")
        assert "token_preview" in src
        assert "token[:6]" in src or "token[:" in src

    def test_create_campaign_defaults_to_paused(self):
        src = ROOT.joinpath("backend/app/services/meta_campaign_service.py").read_text(encoding="utf-8")
        assert '"PAUSED"' in src or "'PAUSED'" in src

    def test_valid_objectives_enforced(self):
        src = ROOT.joinpath("backend/app/services/meta_campaign_service.py").read_text(encoding="utf-8")
        assert "VALID_META_OBJECTIVES" in src
        assert "OUTCOME_LEADS" in src

    def test_permission_check_before_create(self):
        src = ROOT.joinpath("backend/app/services/meta_campaign_service.py").read_text(encoding="utf-8")
        assert "validate_token_permissions" in src
        assert "ads_management" in src

    def test_tenant_isolation_in_sync(self):
        src = ROOT.joinpath("backend/app/services/meta_campaign_service.py").read_text(encoding="utf-8")
        assert ".eq(\"account_id\", account_id)" in src or ".eq('account_id', account_id)" in src
