"""
Standalone Test Runner for Multi-Channel Broadcasts & Send All (CRM 3.0)
Tests:
- All 4 channels: WhatsApp, Instagram, Facebook Messenger, Email
- Opt-out compliance safeguard (never messaging opted-out contacts)
- Destination address syntax validation
- Batching & Rate-Limiting delay
- Server-side concurrency guard / duplicate send prevention
- Tenant isolation (account_id partitioning)
- Partial failure tracking & audit logs
- Retry Failed Only isolation (zero duplicate messages to successful contacts)
- Individual 1-to-1 send workflow

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

from app.services.broadcast_service import BroadcastService, _BROADCAST_RESULTS_CACHE, _ACTIVE_BROADCAST_LOCKS


class TestBroadcastSendAll(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.service = BroadcastService()
        self.tenant_a = "tenant-uuid-1111"
        self.tenant_b = "tenant-uuid-2222"
        _BROADCAST_RESULTS_CACHE.clear()
        _ACTIVE_BROADCAST_LOCKS.clear()

    # ─────────────────────────────────────────────────────────────
    # 1. DESTINATION SYNTAX & RECIPIENT RESOLUTION
    # ─────────────────────────────────────────────────────────────

    def test_destination_extraction_whatsapp(self):
        """Validates phone cleaning and international length bounds."""
        valid_contact = {"phone": "+1 (555) 234-5678"}
        dest, is_valid, err = self.service._extract_destination(valid_contact, "whatsapp")
        self.assertTrue(is_valid)
        self.assertEqual(dest, "+15552345678")

        # Invalid short phone
        short_contact = {"phone": "123"}
        dest, is_valid, err = self.service._extract_destination(short_contact, "whatsapp")
        self.assertFalse(is_valid)
        self.assertIn("Invalid phone length", err)

        # Missing phone
        empty_contact = {"phone": ""}
        dest, is_valid, err = self.service._extract_destination(empty_contact, "whatsapp")
        self.assertFalse(is_valid)
        self.assertIn("No phone number", err)

    def test_destination_extraction_email(self):
        """Validates RFC-compliant email address regex."""
        valid_contact = {"email": "user@example.com"}
        dest, is_valid, err = self.service._extract_destination(valid_contact, "email")
        self.assertTrue(is_valid)
        self.assertEqual(dest, "user@example.com")

        # Malformed email
        bad_contact = {"email": "not-an-email"}
        dest, is_valid, err = self.service._extract_destination(bad_contact, "email")
        self.assertFalse(is_valid)
        self.assertIn("Malformed email", err)

        # Missing email
        empty_contact = {"email": None}
        dest, is_valid, err = self.service._extract_destination(empty_contact, "email")
        self.assertFalse(is_valid)

    def test_destination_extraction_instagram(self):
        """Validates Instagram user ID / platform ID extraction."""
        contact = {"instagram_user_id": "ig_user_9988"}
        dest, is_valid, err = self.service._extract_destination(contact, "instagram")
        self.assertTrue(is_valid)
        self.assertEqual(dest, "ig_user_9988")

        contact_fallback = {"platform_id": "ig_platform_1122"}
        dest, is_valid, err = self.service._extract_destination(contact_fallback, "instagram")
        self.assertTrue(is_valid)
        self.assertEqual(dest, "ig_platform_1122")

    def test_destination_extraction_facebook(self):
        """Validates Facebook recipient ID extraction."""
        contact = {"platform_id": "fb_psid_4455"}
        dest, is_valid, err = self.service._extract_destination(contact, "facebook")
        self.assertTrue(is_valid)
        self.assertEqual(dest, "fb_psid_4455")

    # ─────────────────────────────────────────────────────────────
    # 2. TENANT ISOLATION & OPT-OUT SAFEGUARDS
    # ─────────────────────────────────────────────────────────────

    @patch("app.services.broadcast_service.get_supabase_client")
    def test_tenant_isolation_and_opt_out_filtering(self, mock_get_supabase):
        """
        Confirms contacts are strictly partitioned by account_id and that
        opt_out=True contacts are excluded from eligible recipients.
        """
        mock_db = MagicMock()
        mock_get_supabase.return_value = mock_db

        # Mock database response: 3 contacts under tenant_a (1 opted out, 1 invalid phone, 1 valid)
        mock_contacts = [
            {"id": "c1", "name": "Alice Valid", "phone": "+15551112222", "opt_out": False, "account_id": self.tenant_a},
            {"id": "c2", "name": "Bob OptOut", "phone": "+15553334444", "opt_out": True, "account_id": self.tenant_a},
            {"id": "c3", "name": "Charlie BadNum", "phone": "99", "opt_out": False, "account_id": self.tenant_a},
        ]

        query_mock = MagicMock()
        query_mock.select.return_value = query_mock
        query_mock.eq.return_value = query_mock
        query_mock.execute.return_value = MagicMock(data=mock_contacts)
        mock_db.table.return_value = query_mock

        res = self.service.get_recipients_for_channel(
            account_id=self.tenant_a,
            platform="whatsapp",
        )

        # Verify tenant query was called with account_id
        mock_db.table.assert_called_with("contacts")
        query_mock.eq.assert_called_with("account_id", self.tenant_a)

        self.assertEqual(res["total_contacts"], 3)
        self.assertEqual(res["eligible_count"], 1)
        self.assertEqual(res["skipped_opt_out_count"], 1)
        self.assertEqual(res["skipped_no_address_count"], 1)

        self.assertEqual(res["eligible"][0]["contact_id"], "c1")
        self.assertEqual(res["skipped_opt_out"][0]["contact_id"], "c2")
        self.assertEqual(res["skipped_no_address"][0]["contact_id"], "c3")

    # ─────────────────────────────────────────────────────────────
    # 3. CHANNEL-SPECIFIC DISPATCH TESTS
    # ─────────────────────────────────────────────────────────────

    @patch("httpx.AsyncClient.post")
    async def test_send_single_whatsapp_success(self, mock_post):
        """Tests WhatsApp Meta Cloud API message dispatch."""
        self.service.settings.whatsapp_phone_number_id = "phone_12345"
        self.service.settings.whatsapp_access_token = "token_abc"

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"messages": [{"id": "wamid.HBgLMTE="}]}
        mock_post.return_value = mock_resp

        res = await self.service.send_single_message(
            platform="whatsapp",
            destination="+15551112222",
            text="Hello from CRM 3.0",
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "submitted")
        self.assertEqual(res["provider_message_id"], "wamid.HBgLMTE=")

    @patch("httpx.AsyncClient.post")
    async def test_send_single_whatsapp_24hr_window_error(self, mock_post):
        """Tests Meta 24-hr customer messaging window expiration detection."""
        self.service.settings.whatsapp_phone_number_id = "phone_12345"
        self.service.settings.whatsapp_access_token = "token_abc"

        mock_resp = MagicMock()
        mock_resp.status_code = 400
        mock_resp.json.return_value = {
            "error": {
                "message": "(#131047) Re-engagement message",
                "code": 131047,
                "error_subcode": 2534018,
            }
        }
        mock_post.return_value = mock_resp

        res = await self.service.send_single_message(
            platform="whatsapp",
            destination="+15551112222",
            text="Hello from CRM 3.0",
        )

        self.assertFalse(res["success"])
        self.assertIn("24-hour", res["error"])

    @patch("httpx.AsyncClient.post")
    async def test_send_single_instagram_success(self, mock_post):
        """Tests Instagram Meta Graph API message dispatch."""
        self.service.settings.instagram_page_id = "ig_page_123"
        self.service.settings.facebook_page_access_token = "token_page_abc"

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"message_id": "mid.ig.123456"}
        mock_post.return_value = mock_resp

        res = await self.service.send_single_message(
            platform="instagram",
            destination="ig_user_4455",
            text="Hi via Instagram",
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["provider_message_id"], "mid.ig.123456")

    @patch("httpx.AsyncClient.post")
    async def test_send_single_facebook_success(self, mock_post):
        """Tests Facebook Messenger Meta Graph API message dispatch."""
        self.service.settings.facebook_page_id = "fb_page_789"
        self.service.settings.facebook_page_access_token = "token_page_abc"

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"message_id": "mid.fb.789101"}
        mock_post.return_value = mock_resp

        res = await self.service.send_single_message(
            platform="facebook",
            destination="fb_user_1122",
            text="Hi via Facebook Messenger",
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["provider_message_id"], "mid.fb.789101")

    @patch("app.services.broadcast_service.get_email_service")
    async def test_send_single_email_success(self, mock_get_email_svc):
        """Tests Email SMTP message dispatch."""
        mock_email_svc = MagicMock()
        mock_email_svc.smtp_user = "crm@company.com"
        mock_email_svc.send_email = AsyncMock(return_value={"status": "sent", "message_id": "<smtp_msg_123@mail>"})
        mock_get_email_svc.return_value = mock_email_svc

        res = await self.service.send_single_message(
            platform="email",
            destination="recipient@example.com",
            text="Important announcement",
            subject="Exclusive Offer",
        )

        self.assertTrue(res["success"])
        self.assertEqual(res["provider_message_id"], "<smtp_msg_123@mail>")

    # ─────────────────────────────────────────────────────────────
    # 4. BULK SEND ALL WORKFLOW & RATE LIMITING
    # ─────────────────────────────────────────────────────────────

    @patch.object(BroadcastService, "send_single_message")
    @patch("app.services.broadcast_service.get_supabase_client")
    async def test_send_all_batching_and_rate_limiting(self, mock_get_supabase, mock_send_single):
        """
        Tests Send All processing in batches with rate-limiting pauses
        and accurate count aggregation.
        """
        mock_db = MagicMock()
        mock_get_supabase.return_value = mock_db

        # Mock broadcast lookup
        b_lookup = MagicMock()
        b_lookup.data = [{
            "id": "b-101",
            "account_id": self.tenant_a,
            "platform": "whatsapp",
            "name": "Sale Broadcast",
            "message": "Big 50% discount!",
        }]
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = b_lookup

        # Create 5 contacts (batch size 2)
        contacts = [
            {"id": f"c_{i}", "name": f"User {i}", "phone": f"+155500000{i}", "opt_out": False, "account_id": self.tenant_a}
            for i in range(5)
        ]
        # Contacts table query
        c_lookup = MagicMock(data=contacts)
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = c_lookup

        # Mock single message send response
        mock_send_single.return_value = {"success": True, "provider_message_id": "msg_ok"}

        start_time = asyncio.get_event_loop().time()
        summary = await self.service.send_all(
            broadcast_id="b-101",
            account_id=self.tenant_a,
            batch_size=2,
            delay_ms=20,  # 20ms pause between batches
        )
        elapsed = asyncio.get_event_loop().time() - start_time

        self.assertEqual(summary["total_recipients"], 5)
        self.assertEqual(summary["sent_count"], 5)
        self.assertEqual(summary["failed_count"], 0)
        self.assertEqual(summary["status"], "sent")
        # 5 items with batch_size 2 = 3 batches, meaning at least 2 delay sleeps (> 35ms)
        self.assertGreaterEqual(elapsed, 0.035)

    # ─────────────────────────────────────────────────────────────
    # 5. SERVER-SIDE CONCURRENCY GUARD (DUPLICATE SEND PREVENTION)
    # ─────────────────────────────────────────────────────────────

    async def test_concurrency_lock_prevents_duplicate_send(self):
        """Tests that simultaneous send requests on the same broadcast are locked out."""
        lock_key = f"{self.tenant_a}:b-duplicate-test"
        _ACTIVE_BROADCAST_LOCKS.add(lock_key)

        with self.assertRaises(ValueError) as ctx:
            await self.service.send_all(
                broadcast_id="b-duplicate-test",
                account_id=self.tenant_a,
            )

        self.assertIn("currently sending", str(ctx.exception))

    # ─────────────────────────────────────────────────────────────
    # 6. PARTIAL FAILURES & RETRY FAILED ONLY ISOLATION
    # ─────────────────────────────────────────────────────────────

    @patch.object(BroadcastService, "send_single_message")
    @patch("app.services.broadcast_service.get_supabase_client")
    async def test_partial_failure_tracking_and_retry_isolation(self, mock_get_supabase, mock_send_single):
        """
        1. Executes Send All where 2 recipients succeed and 1 fails.
        2. Executes Retry Failed Only.
        3. Verifies ONLY the single failed recipient is retried, avoiding duplicate sends to the 2 successful contacts.
        """
        mock_db = MagicMock()
        mock_get_supabase.return_value = mock_db

        b_lookup = MagicMock()
        b_lookup.data = [{
            "id": "b-partial-1",
            "account_id": self.tenant_a,
            "platform": "whatsapp",
            "name": "Partial Test",
            "message": "Checking retry",
        }]
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = b_lookup

        contacts = [
            {"id": "c_success_1", "name": "Success 1", "phone": "+15551111111", "opt_out": False, "account_id": self.tenant_a},
            {"id": "c_success_2", "name": "Success 2", "phone": "+15552222222", "opt_out": False, "account_id": self.tenant_a},
            {"id": "c_fail", "name": "Fail Contact", "phone": "+15553333333", "opt_out": False, "account_id": self.tenant_a},
        ]
        c_lookup = MagicMock(data=contacts)
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = c_lookup

        # Setup send_single_message behavior
        async def mock_send(platform, destination, text, subject=None, attachments=None):
            if "3333333" in destination:
                return {"success": False, "status": "failed", "error": "Provider network timeout"}
            return {"success": True, "status": "submitted", "provider_message_id": f"msg_{destination}"}

        mock_send_single.side_effect = mock_send

        # Step 1: Initial Send All
        summary = await self.service.send_all(
            broadcast_id="b-partial-1",
            account_id=self.tenant_a,
        )

        self.assertEqual(summary["sent_count"], 2)
        self.assertEqual(summary["failed_count"], 1)

        # Step 2: Retry Failed Only
        # Change mock so c_fail succeeds on retry
        async def mock_retry_send(platform, destination, text, subject=None, attachments=None):
            return {"success": True, "status": "submitted", "provider_message_id": "msg_recovered"}

        mock_send_single.side_effect = mock_retry_send

        retry_res = await self.service.retry_failed(
            broadcast_id="b-partial-1",
            account_id=self.tenant_a,
        )

        # Confirm ONLY the 1 failed recipient was retried
        self.assertEqual(retry_res["retried_count"], 1)
        self.assertEqual(retry_res["newly_sent"], 1)
        self.assertEqual(retry_res["still_failed"], 0)
        self.assertEqual(mock_send_single.call_count, 4)  # 3 in initial send + exactly 1 in retry

    # ─────────────────────────────────────────────────────────────
    # 7. INDIVIDUAL 1-TO-1 SEND
    # ─────────────────────────────────────────────────────────────

    @patch.object(BroadcastService, "send_single_message")
    @patch("app.services.broadcast_service.get_supabase_client")
    async def test_send_individual_respects_opt_out(self, mock_get_supabase, mock_send_single):
        """Confirms send_individual strictly rejects opted-out contacts."""
        mock_db = MagicMock()
        mock_get_supabase.return_value = mock_db

        opt_out_contact = {"id": "c_opt", "name": "No Promo", "phone": "+15559998888", "opt_out": True, "account_id": self.tenant_a}
        c_lookup = MagicMock(data=[opt_out_contact])
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = c_lookup

        res = await self.service.send_individual(
            account_id=self.tenant_a,
            contact_id="c_opt",
            platform="whatsapp",
            message="Test",
        )

        self.assertFalse(res["success"])
        self.assertEqual(res["status"], "skipped")
        self.assertIn("opted out", res["error"])
        mock_send_single.assert_not_called()

    @patch.object(BroadcastService, "send_single_message")
    @patch("app.services.broadcast_service.get_supabase_client")
    async def test_send_all_with_selected_contact_ids(self, mock_get_supabase, mock_send_single):
        """Tests that passing selected_contact_ids dispatches exclusively to selected contacts."""
        mock_db = MagicMock()
        mock_get_supabase.return_value = mock_db

        b_lookup = MagicMock()
        b_lookup.data = [{
            "id": "b-custom-sel",
            "account_id": self.tenant_a,
            "platform": "whatsapp",
            "name": "Custom Selection Test",
            "message": "Custom offer",
        }]
        mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = b_lookup

        contacts = [
            {"id": "c_sel_1", "name": "Selected 1", "phone": "+15551111111", "opt_out": False, "account_id": self.tenant_a},
            {"id": "c_unselected", "name": "Unselected", "phone": "+15552222222", "opt_out": False, "account_id": self.tenant_a},
            {"id": "c_sel_2", "name": "Selected 2", "phone": "+15553333333", "opt_out": False, "account_id": self.tenant_a},
        ]
        c_lookup = MagicMock(data=contacts)
        mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value = c_lookup
        mock_send_single.return_value = {"success": True, "provider_message_id": "msg_ok"}

        summary = await self.service.send_all(
            broadcast_id="b-custom-sel",
            account_id=self.tenant_a,
            selected_contact_ids=["c_sel_1", "c_sel_2"],
        )

        self.assertEqual(summary["sent_count"], 2)
        self.assertEqual(mock_send_single.call_count, 2)


if __name__ == "__main__":
    unittest.main()
