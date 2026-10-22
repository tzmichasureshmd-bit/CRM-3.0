"""
Phase A — Webhook Tenant Routing Tests

Tests:
6. Unknown webhook integration routing is rejected (returns None, not a random account).
7. Ambiguous routing (multiple accounts with same key) is rejected.
8. Correctly mapped single-tenant webhook resolves the right account.

No live DB — all Supabase calls are mocked.
"""
import pytest
from unittest.mock import MagicMock, patch


ACCOUNT_A = "aaaaaaaa-0000-0000-0000-000000000001"
ACCOUNT_B = "bbbbbbbb-0000-0000-0000-000000000002"


def _make_supabase_mock(rows: list[dict]):
    """Build a minimal mock that returns `rows` from .execute()."""
    mock = MagicMock()
    (
        mock.table.return_value
        .select.return_value
        .eq.return_value
        .neq.return_value
        .limit.return_value
        .execute.return_value
    ).data = rows
    return mock


class TestWebhookTenantRouting:

    def _call(self, platform: str, db_rows: list[dict]) -> str | None:
        """Call _get_account_id_for_platform with a mocked Supabase client."""
        with patch("app.api.v1.webhooks.get_supabase", return_value=_make_supabase_mock(db_rows)):
            from app.api.v1.webhooks import _get_account_id_for_platform
            return _get_account_id_for_platform(platform)

    def test_unknown_platform_returns_none(self):
        """Unknown platform must return None — never fall back to first row."""
        result = self._call("unknown_platform", [{"account_id": ACCOUNT_A}])
        assert result is None

    def test_no_matching_integration_returns_none(self):
        """No account has the platform key configured → return None."""
        result = self._call("whatsapp", [])
        assert result is None

    def test_ambiguous_multi_tenant_returns_none(self):
        """Two accounts both have WHATSAPP_PHONE_NUMBER_ID → ambiguous → return None."""
        rows = [{"account_id": ACCOUNT_A}, {"account_id": ACCOUNT_B}]
        result = self._call("whatsapp", rows)
        assert result is None

    def test_single_tenant_whatsapp_resolves_correctly(self):
        """Exactly one account has WHATSAPP_PHONE_NUMBER_ID → return that account."""
        result = self._call("whatsapp", [{"account_id": ACCOUNT_A}])
        assert result == ACCOUNT_A

    def test_single_tenant_instagram_resolves_correctly(self):
        result = self._call("instagram", [{"account_id": ACCOUNT_A}])
        assert result == ACCOUNT_A

    def test_single_tenant_facebook_resolves_correctly(self):
        result = self._call("facebook", [{"account_id": ACCOUNT_A}])
        assert result == ACCOUNT_A

    def test_single_tenant_telegram_resolves_correctly(self):
        result = self._call("telegram", [{"account_id": ACCOUNT_A}])
        assert result == ACCOUNT_A

    def test_empty_string_platform_returns_none(self):
        result = self._call("", [{"account_id": ACCOUNT_A}])
        assert result is None
