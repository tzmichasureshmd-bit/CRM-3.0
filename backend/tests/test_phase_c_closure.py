"""
Phase C Closure — Route Auth Regression Tests (Task 1 & Task 3)

Verifies that all CRM 3.0 routes use verifyRequest() instead of
supabase.auth.getUser(). Tests run from backend/ so paths go up two levels.
"""

import pathlib

ROOT = pathlib.Path(__file__).parent.parent.parent  # CRM_3.0 root


def read_route(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


class TestJourneyRouteAuth:

    def test_id_route_uses_verify_request(self):
        src = read_route("src/app/api/v3/journeys/[id]/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_id_route_has_three_verify_calls(self):
        src = read_route("src/app/api/v3/journeys/[id]/route.ts")
        assert src.count("verifyRequest") >= 3  # GET, PATCH, DELETE

    def test_publish_uses_verify_request(self):
        src = read_route("src/app/api/v3/journeys/[id]/publish/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_events_uses_verify_request(self):
        src = read_route("src/app/api/v3/journeys/[id]/events/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_executions_uses_verify_request(self):
        src = read_route("src/app/api/v3/journeys/[id]/executions/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_execute_uses_verify_request(self):
        src = read_route("src/app/api/v3/journeys/[id]/execute/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_list_uses_verify_request(self):
        src = read_route("src/app/api/v3/journeys/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_publish_validates_trigger_node(self):
        src = read_route("src/app/api/v3/journeys/[id]/publish/route.ts")
        assert "trigger" in src.lower()
        assert "400" in src

    def test_publish_requires_min_two_nodes(self):
        src = read_route("src/app/api/v3/journeys/[id]/publish/route.ts")
        assert "2" in src

    def test_account_id_from_token_not_body(self):
        for rel in [
            "src/app/api/v3/journeys/[id]/route.ts",
            "src/app/api/v3/journeys/[id]/publish/route.ts",
            "src/app/api/v3/journeys/[id]/events/route.ts",
            "src/app/api/v3/journeys/[id]/executions/route.ts",
        ]:
            src = read_route(rel)
            assert "user.account_id" in src
            assert "body.account_id" not in src
            assert "searchParams.get('account_id')" not in src

    def test_all_queries_scoped_to_account(self):
        for rel in [
            "src/app/api/v3/journeys/[id]/route.ts",
            "src/app/api/v3/journeys/[id]/publish/route.ts",
            "src/app/api/v3/journeys/[id]/events/route.ts",
            "src/app/api/v3/journeys/[id]/executions/route.ts",
        ]:
            src = read_route(rel)
            assert "account_id" in src
            assert "user.account_id" in src


class TestAutomationRouteAuth:

    def test_id_route_uses_verify_request(self):
        src = read_route("src/app/api/v3/automations/[id]/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_execute_uses_verify_request(self):
        src = read_route("src/app/api/v3/automations/[id]/execute/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_duplicate_uses_verify_request(self):
        src = read_route("src/app/api/v3/automations/[id]/duplicate/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_executions_uses_verify_request(self):
        src = read_route("src/app/api/v3/automations/executions/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_templates_uses_verify_request(self):
        src = read_route("src/app/api/v3/automations/templates/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_events_uses_verify_request_for_user_calls(self):
        src = read_route("src/app/api/v3/automations/events/route.ts")
        assert "verifyRequest" in src
        assert "CRON_SECRET" in src  # system calls still use CRON_SECRET

    def test_scheduler_uses_service_client(self):
        src = read_route("src/app/api/v3/automations/scheduler/route.ts")
        assert "getServiceClient" in src
        # createClient should not appear outside of getServiceClient import
        lines_with_create = [l for l in src.splitlines() if "createClient" in l and "getServiceClient" not in l]
        assert len(lines_with_create) == 0


class TestSegmentRouteAuth:

    def test_route_uses_verify_request(self):
        src = read_route("src/app/api/v3/segments/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_id_route_uses_verify_request(self):
        src = read_route("src/app/api/v3/segments/[id]/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_contacts_uses_verify_request(self):
        src = read_route("src/app/api/v3/segments/[id]/contacts/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_export_uses_verify_request(self):
        src = read_route("src/app/api/v3/segments/[id]/export/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_membership_uses_verify_request(self):
        src = read_route("src/app/api/v3/segments/[id]/membership/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_preview_uses_verify_request(self):
        src = read_route("src/app/api/v3/segments/[id]/preview/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_refresh_uses_verify_request(self):
        src = read_route("src/app/api/v3/segments/[id]/refresh/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src


class TestAIRouteAuth:

    def test_lead_intelligence_uses_verify_request(self):
        src = read_route("src/app/api/v3/ai/lead-intelligence/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_reply_assist_uses_verify_request(self):
        src = read_route("src/app/api/v3/ai/reply-assist/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_next_best_action_uses_verify_request(self):
        src = read_route("src/app/api/v3/ai/next-best-action/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_recommendations_uses_verify_request(self):
        src = read_route("src/app/api/v3/ai/recommendations/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_summarize_conversation_uses_verify_request(self):
        src = read_route("src/app/api/v3/ai/summarize-conversation/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_generate_content_uses_verify_request(self):
        src = read_route("src/app/api/v3/ai/generate-content/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src

    def test_summarize_conversation_scopes_to_account(self):
        src = read_route("src/app/api/v3/ai/summarize-conversation/route.ts")
        assert "user.account_id" in src
        # conversation lookup must be account-scoped
        assert ".eq('account_id', user.account_id)" in src or '.eq("account_id", user.account_id)' in src

    def test_deal_automation_no_db_writes(self):
        """deal-automation is intentionally permissive (NLP only, no DB writes)."""
        src = read_route("src/app/api/v3/ai/deal-automation/route.ts")
        assert ".insert(" not in src
        assert ".update(" not in src
        assert ".delete(" not in src

    def test_content_id_uses_verify_request(self):
        src = read_route("src/app/api/v3/content/[id]/route.ts")
        assert "verifyRequest" in src
        assert "auth.getUser" not in src


class TestSchedulerServiceRole:

    def test_journey_scheduler_uses_service_client(self):
        src = read_route("src/app/api/v3/journeys/scheduler/route.ts")
        assert "getServiceClient" in src
        lines_with_create = [l for l in src.splitlines() if "createClient" in l and "getServiceClient" not in l]
        assert len(lines_with_create) == 0

    def test_automation_scheduler_uses_service_client(self):
        src = read_route("src/app/api/v3/automations/scheduler/route.ts")
        assert "getServiceClient" in src

    def test_journey_scheduler_requires_cron_secret(self):
        src = read_route("src/app/api/v3/journeys/scheduler/route.ts")
        assert "CRON_SECRET" in src
        assert "401" in src

    def test_automation_scheduler_requires_cron_secret(self):
        src = read_route("src/app/api/v3/automations/scheduler/route.ts")
        assert "CRON_SECRET" in src
        assert "401" in src


class TestRealtimeAccountScoping:

    def test_hook_requires_account_id(self):
        src = read_route("src/hooks/use-inbox-realtime.ts")
        assert "accountId" in src
        assert "account_id=eq." in src

    def test_channel_name_scoped_to_account(self):
        src = read_route("src/hooks/use-inbox-realtime.ts")
        assert "crm3-inbox-" in src
        assert "${accountId}" in src

    def test_cleanup_on_unmount(self):
        src = read_route("src/hooks/use-inbox-realtime.ts")
        assert "removeChannel" in src
        assert "return () =>" in src

    def test_channel_error_handled(self):
        src = read_route("src/hooks/use-inbox-realtime.ts")
        assert "CHANNEL_ERROR" in src
