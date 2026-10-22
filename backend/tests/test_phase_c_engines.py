"""
Phase C — Execution Engine Tests
Tests cover: automation engine, agent engine, journey engine,
scheduler idempotency, cross-tenant isolation, approval gating,
retry/backoff, and provider fallback.

All tests use mocked Supabase — no live DB or external API calls.
"""

import pytest
from unittest.mock import patch


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_agent(overrides=None):
    base = {
        "id": "agent-1",
        "account_id": "acct-1",
        "name": "Test Agent",
        "type": "sales_assistant",
        "enabled": True,
        "instructions": "Test instructions",
        "allowed_tools": ["get_hot_leads", "create_followup"],
        "requires_approval": False,
        "max_actions_per_run": 5,
        "provider": "openai",
        "model": "gpt-4o-mini",
        "temperature": 0.3,
        "execution_count": 0,
        "success_count": 0,
        "failure_count": 0,
    }
    if overrides:
        base.update(overrides)
    return base


def _make_automation(overrides=None):
    base = {
        "id": "auto-1",
        "account_id": "acct-1",
        "name": "Test Automation",
        "trigger_type": "contact_created",
        "trigger_config": {},
        "is_active": True,
        "status": "active",
        "execution_count": 0,
        "success_count": 0,
        "failure_count": 0,
        "workflow_version": 1,
    }
    if overrides:
        base.update(overrides)
    return base


# ── C1: Automation Engine ─────────────────────────────────────────────────────

class TestAutomationEngine:

    def test_validate_steps_rejects_unknown_action(self):
        from app.api.v1.automations import validate_automation_steps
        steps = [{"step_type": "action", "config": {"action": "nonexistent_action"}}]
        result = validate_automation_steps(steps)
        assert result is not None
        assert "nonexistent_action" in result.lower() or "unknown" in result.lower()

    def test_validate_steps_rejects_wait_missing_unit(self):
        from app.api.v1.automations import validate_automation_steps
        steps = [{"step_type": "wait", "config": {"amount": 5}}]
        result = validate_automation_steps(steps)
        assert result is not None

    def test_validate_steps_accepts_valid_condition(self):
        from app.api.v1.automations import validate_automation_steps
        steps = [{"step_type": "condition", "config": {"field": "lead_score", "operator": "gte", "value": 70}}]
        result = validate_automation_steps(steps)
        assert result is None

    def test_duplicate_trigger_is_idempotent(self):
        from app.api.v1.automations import handle_duplicate_event_key
        result = handle_duplicate_event_key("23505")
        assert result["duplicate"] is True
        assert result["executions"] == 0

    def test_condition_eq_passes(self):
        from app.api.v1.automations import evaluate_condition
        assert evaluate_condition("qualified", "eq", "qualified") is True
        assert evaluate_condition("new", "eq", "qualified") is False

    def test_condition_gte_passes(self):
        from app.api.v1.automations import evaluate_condition
        assert evaluate_condition(75, "gte", 70) is True
        assert evaluate_condition(60, "gte", 70) is False

    def test_condition_contains_passes(self):
        from app.api.v1.automations import evaluate_condition
        assert evaluate_condition("hello world", "contains", "world") is True
        assert evaluate_condition("hello world", "contains", "xyz") is False

    def test_ssrf_blocked_private_ip(self):
        from app.api.v1.automations import is_safe_webhook_url
        assert is_safe_webhook_url("http://192.168.1.1/hook") is False
        assert is_safe_webhook_url("http://10.0.0.1/hook") is False
        assert is_safe_webhook_url("http://localhost/hook") is False
        assert is_safe_webhook_url("http://169.254.169.254/latest/meta-data") is False

    def test_ssrf_allows_public_https(self):
        from app.api.v1.automations import is_safe_webhook_url
        assert is_safe_webhook_url("https://hooks.example.com/webhook") is True

    def test_wait_step_persists_scheduled_job(self):
        from app.api.v1.automations import build_wait_job_payload
        payload = build_wait_job_payload(
            automation_id="auto-1",
            execution_id="exec-1",
            contact_id="contact-1",
            next_step_index=2,
            amount=1,
            unit="hours",
        )
        assert payload["job_type"] == "resume_automation"
        assert payload["next_step_index"] == 2
        assert "run_at" in payload
        assert payload["status"] == "pending"

    def test_scheduler_backoff_increases(self):
        from app.api.v1.automations import compute_backoff_minutes
        assert compute_backoff_minutes(0) == 1
        assert compute_backoff_minutes(1) == 2
        assert compute_backoff_minutes(2) == 4
        assert compute_backoff_minutes(3) == 8

    def test_cross_tenant_automation_blocked(self):
        from app.api.v1.automations import check_automation_ownership
        assert check_automation_ownership("acct-2", "acct-1") is False

    def test_disabled_automation_skipped(self):
        from app.api.v1.automations import should_execute_automation
        auto = _make_automation({"status": "paused", "is_active": False})
        assert should_execute_automation(auto) is False

    def test_active_automation_executes(self):
        from app.api.v1.automations import should_execute_automation
        auto = _make_automation()
        assert should_execute_automation(auto) is True


# ── C2: AI Agent Engine ───────────────────────────────────────────────────────

class TestAgentEngine:

    def test_disabled_agent_rejected(self):
        from app.api.v1.agents import check_agent_runnable
        agent = _make_agent({"enabled": False})
        ok, err = check_agent_runnable(agent)
        assert ok is False
        assert "disabled" in err.lower()

    def test_tool_not_in_allowlist_rejected(self):
        from app.api.v1.agents import is_tool_permitted
        agent = _make_agent({"allowed_tools": ["get_hot_leads"]})
        assert is_tool_permitted(agent, "update_deal_stage") is False
        assert is_tool_permitted(agent, "get_hot_leads") is True

    def test_approval_required_tool_creates_approval_record(self):
        from app.api.v1.agents import requires_approval_gate
        assert requires_approval_gate("update_lead_status", agent_requires_approval=True) is True
        assert requires_approval_gate("get_hot_leads", agent_requires_approval=True) is False

    def test_rejected_approval_cannot_execute(self):
        from app.api.v1.agents import can_execute_approval
        approval = {"status": "rejected", "expires_at": "2099-01-01T00:00:00Z"}
        assert can_execute_approval(approval) is False

    def test_expired_approval_cannot_execute(self):
        from app.api.v1.agents import can_execute_approval
        approval = {"status": "pending", "expires_at": "2000-01-01T00:00:00Z"}
        assert can_execute_approval(approval) is False

    def test_valid_approval_can_execute(self):
        from app.api.v1.agents import can_execute_approval
        approval = {"status": "approved", "expires_at": "2099-01-01T00:00:00Z"}
        assert can_execute_approval(approval) is True

    def test_max_tool_calls_enforced(self):
        from app.api.v1.agents import cap_tool_plan
        plan = [{"tool": f"tool_{i}"} for i in range(15)]
        capped = cap_tool_plan(plan, max_actions=10)
        assert len(capped) == 10

    def test_cross_tenant_agent_blocked(self):
        from app.api.v1.agents import check_agent_ownership
        assert check_agent_ownership("acct-2", "acct-1") is False
        assert check_agent_ownership("acct-1", "acct-1") is True

    def test_unknown_tool_rejected_at_validation(self):
        from app.api.v1.agents import validate_tool_name
        assert validate_tool_name("nonexistent_tool") is False
        assert validate_tool_name("get_hot_leads") is True

    def test_write_tool_requires_verification(self):
        from app.api.v1.agents import is_write_tool
        assert is_write_tool("update_lead_status") is True
        assert is_write_tool("get_hot_leads") is False
        assert is_write_tool("create_followup") is True

    def test_provider_fallback_when_no_key(self):
        from app.api.v1.agents import detect_provider
        with patch.dict("os.environ", {}, clear=True):
            info = detect_provider(None)
        assert info["provider"] == "rule_based"
        assert info["configured"] is False

    def test_execution_log_does_not_contain_api_key(self):
        from app.api.v1.agents import sanitize_execution_log
        log = {"summary": "Used key sk-abc123xyz456789012345", "steps": []}
        sanitized = sanitize_execution_log(log)
        assert "sk-abc123xyz456789012345" not in str(sanitized)

    def test_idempotency_key_reuses_prior_run(self):
        from app.api.v1.agents import check_idempotency
        prior_run = {"id": "run-1", "status": "completed", "result_summary": "done"}
        result = check_idempotency(prior_run)
        assert result["reused"] is True
        assert result["run_id"] == "run-1"


# ── C3: Journey Engine ────────────────────────────────────────────────────────

class TestJourneyEngine:

    def test_empty_journey_fails(self):
        from app.api.v1.journeys import validate_journey_nodes
        ok, err = validate_journey_nodes([])
        assert ok is False
        assert err is not None

    def test_wait_node_persists_wait_until(self):
        from app.api.v1.journeys import compute_wait_until
        from datetime import datetime, timezone
        result = compute_wait_until(amount=2, unit="hours")
        assert result is not None
        dt = datetime.fromisoformat(result.replace("Z", "+00:00"))
        assert dt > datetime.now(timezone.utc)

    def test_cancelled_journey_does_not_resume(self):
        from app.api.v1.journeys import should_resume_contact
        state = {"status": "cancelled", "terminal_error": None, "wait_until": "2000-01-01T00:00:00Z"}
        assert should_resume_contact(state) is False

    def test_completed_journey_does_not_resume(self):
        from app.api.v1.journeys import should_resume_contact
        state = {"status": "completed", "terminal_error": None, "wait_until": "2000-01-01T00:00:00Z"}
        assert should_resume_contact(state) is False

    def test_waiting_past_due_resumes(self):
        from app.api.v1.journeys import should_resume_contact
        state = {"status": "waiting", "terminal_error": None, "wait_until": "2000-01-01T00:00:00Z"}
        assert should_resume_contact(state) is True

    def test_terminal_error_blocks_resume(self):
        from app.api.v1.journeys import should_resume_contact
        state = {"status": "waiting", "terminal_error": "Journey not found", "wait_until": "2000-01-01T00:00:00Z"}
        assert should_resume_contact(state) is False

    def test_condition_node_branches_yes(self):
        from app.api.v1.journeys import evaluate_journey_condition
        assert evaluate_journey_condition(field_value=80, operator="gte", value=70) is True

    def test_condition_node_branches_no(self):
        from app.api.v1.journeys import evaluate_journey_condition
        assert evaluate_journey_condition(field_value=50, operator="gte", value=70) is False

    def test_max_nodes_enforced(self):
        from app.api.v1.journeys import MAX_JOURNEY_NODES
        assert MAX_JOURNEY_NODES <= 20

    def test_cross_tenant_journey_blocked(self):
        from app.api.v1.journeys import check_journey_ownership
        assert check_journey_ownership("acct-2", "acct-1") is False
        assert check_journey_ownership("acct-1", "acct-1") is True

    def test_scheduler_backoff_on_failure(self):
        from app.api.v1.journeys import compute_journey_backoff_minutes
        assert compute_journey_backoff_minutes(attempt=0) == 2
        assert compute_journey_backoff_minutes(attempt=1) == 4
        assert compute_journey_backoff_minutes(attempt=2) == 8

    def test_dead_letter_after_max_attempts(self):
        from app.api.v1.journeys import is_dead_letter
        assert is_dead_letter(attempt_count=3, max_attempts=3) is True
        assert is_dead_letter(attempt_count=2, max_attempts=3) is False


# ── C4: Background Jobs ───────────────────────────────────────────────────────

class TestBackgroundJobs:

    def test_scheduler_lock_prevents_double_processing(self):
        from app.api.v1.scheduler import is_job_locked
        from datetime import datetime, timezone, timedelta
        future_lock = (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat()
        assert is_job_locked(future_lock) is True

    def test_expired_lock_allows_processing(self):
        from app.api.v1.scheduler import is_job_locked
        assert is_job_locked("2000-01-01T00:00:00Z") is False

    def test_null_lock_allows_processing(self):
        from app.api.v1.scheduler import is_job_locked
        assert is_job_locked(None) is False

    def test_max_attempts_marks_permanent_failure(self):
        from app.api.v1.scheduler import is_permanently_failed
        assert is_permanently_failed(attempts=5, max_attempts=5) is True
        assert is_permanently_failed(attempts=4, max_attempts=5) is False

    def test_cron_secret_required(self):
        from app.api.v1.scheduler import verify_cron_secret
        assert verify_cron_secret("wrong-secret", "correct-secret") is False
        assert verify_cron_secret("correct-secret", "correct-secret") is True


# ── C5: Realtime ──────────────────────────────────────────────────────────────

class TestRealtime:

    def test_realtime_filter_includes_account_id(self):
        from app.api.v1.realtime import build_realtime_filter
        f = build_realtime_filter(table="messages", account_id="acct-1")
        assert "account_id" in f
        assert "acct-1" in f

    def test_realtime_filter_different_accounts_differ(self):
        from app.api.v1.realtime import build_realtime_filter
        f1 = build_realtime_filter(table="messages", account_id="acct-1")
        f2 = build_realtime_filter(table="messages", account_id="acct-2")
        assert f1 != f2

    def test_channel_name_scoped_to_account(self):
        from app.api.v1.realtime import build_channel_name
        name = build_channel_name("inbox", "acct-1")
        assert "acct-1" in name
        name2 = build_channel_name("inbox", "acct-2")
        assert name != name2
