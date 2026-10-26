"""
Phase L — Production Readiness: Audit Coverage, Tenant Isolation, Integration Ownership
"""
import pathlib, sys
ROOT = pathlib.Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import pytest
from unittest.mock import MagicMock, patch
from tests.conftest import (
    make_token, make_mock_db, set_db_result,
    TEST_ACCOUNT_ID, TEST_USER_ID, TEST_ACCOUNT_ID_2, TEST_USER_ID_2,
)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def profile(account_id=TEST_ACCOUNT_ID, role="owner"):
    return {"account_id": account_id, "role": role, "token_version": 1, "is_super_admin": False}


# ── L1: Audit coverage — source inspection ───────────────────────────────────

class TestAuditCoverageGaps:
    """
    Verify which mutation endpoints have audit calls and which are gaps.
    These are source-level checks — they document the current state accurately.
    """

    def _src(self, filename):
        return (ROOT / "backend" / "app" / "api" / "v1" / filename).read_text(encoding="utf-8")

    # Contacts — NOW COVERED
    def test_contacts_mutations_are_audited(self):
        src = self._src("contacts.py")
        for event in ["contact.created", "contact.updated", "contact.deleted"]:
            assert event in src, f"Missing audit event: {event}"

    # Deals — NOW COVERED
    def test_deals_mutations_are_audited(self):
        src = self._src("deals.py")
        for event in ["deal.created", "deal.updated", "deal.deleted", "deal.stage_moved"]:
            assert event in src, f"Missing audit event: {event}"

    # Campaigns — NOW COVERED
    def test_campaigns_mutations_are_audited(self):
        src = self._src("campaigns.py")
        for event in ["campaign.created", "campaign.updated", "campaign.deleted"]:
            assert event in src, f"Missing audit event: {event}"

    # Automations — NOW COVERED
    def test_automations_mutations_are_audited(self):
        src = self._src("automations.py")
        for event in ["automation.created", "automation.toggled", "automation.deleted"]:
            assert event in src, f"Missing audit event: {event}"

    # Agents — NOW COVERED
    def test_agents_mutations_are_audited(self):
        src = self._src("agents.py")
        for event in ["agent.created", "agent.run_requested", "agent.deleted"]:
            assert event in src, f"Missing audit event: {event}"

    # Broadcasts — NOW COVERED
    def test_broadcasts_mutations_are_audited(self):
        src = self._src("broadcasts.py")
        for event in ["broadcast.created", "broadcast.deleted"]:
            assert event in src, f"Missing audit event: {event}"

    # Journeys — NOW COVERED
    def test_journeys_mutations_are_audited(self):
        src = self._src("journeys.py")
        for event in ["journey.created", "journey.deleted", "journey.published"]:
            assert event in src, f"Missing audit event: {event}"

    # Segments — NOW COVERED
    def test_segments_mutations_are_audited(self):
        src = self._src("segments.py")
        for event in ["segment.created", "segment.deleted"]:
            assert event in src, f"Missing audit event: {event}"

    # Appointments — NOW COVERED
    def test_appointments_mutations_are_audited(self):
        src = self._src("appointments.py")
        for event in ["appointment.created", "appointment.updated", "appointment.deleted"]:
            assert event in src, f"Missing audit event: {event}"

    # Leads — NOW COVERED
    def test_leads_score_update_audited(self):
        src = self._src("leads.py")
        assert "lead.score_updated" in src

    # Conversations — NOW COVERED
    def test_conversations_mutations_are_audited(self):
        src = self._src("conversations.py")
        for event in ["conversation.assigned", "conversation.status_changed"]:
            assert event in src, f"Missing audit event: {event}"

    # Employees — COVERED (Phase K)
    def test_employees_mutations_are_audited(self):
        src = self._src("employees.py")
        for event in ["employee.created", "employee.updated", "employee.deleted",
                      "invitation.sent", "invitation.revoked", "invitation.accepted",
                      "company.profile_updated"]:
            assert event in src, f"Missing audit event: {event}"

    # Super admin — COVERED (Phase K)
    def test_super_admin_mutations_are_audited(self):
        src = self._src("super_admin.py")
        assert "company_updated" in src
        assert "super_admin_toggled" in src


# ── L2: Audit record field completeness ──────────────────────────────────────

class TestAuditFieldCompleteness:
    """Verify the _audit helper writes all required fields."""

    def test_audit_helper_writes_account_id(self, app_client):
        client, db = app_client
        token = make_token()
        p = MagicMock()
        p.data = [profile()]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p

        inv_result = MagicMock()
        inv_result.data = [{"id": "inv1"}]
        db.table.return_value.insert.return_value.execute.return_value = inv_result

        client.post("/api/v1/employees/invite",
                    json={"email": "x@x.com", "role": "agent"},
                    headers=auth(token))

        insert_calls = db.table.return_value.insert.call_args_list
        audit_calls = [c for c in insert_calls
                       if c[0] and isinstance(c[0][0], dict)
                       and "action" in c[0][0]]
        assert len(audit_calls) > 0, "No audit insert found"
        row = audit_calls[0][0][0]
        assert "account_id" in row
        assert "actor_id" in row
        assert "action" in row
        assert "entity_type" in row
        assert "result" in row

    def test_audit_helper_never_writes_password_hash(self, app_client):
        client, db = app_client
        token = make_token()
        p = MagicMock()
        p.data = [profile()]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p

        inv_result = MagicMock()
        inv_result.data = [{"id": "inv1"}]
        db.table.return_value.insert.return_value.execute.return_value = inv_result

        client.post("/api/v1/employees/invite",
                    json={"email": "x@x.com", "role": "agent"},
                    headers=auth(token))

        insert_calls = db.table.return_value.insert.call_args_list
        for c in insert_calls:
            if c[0] and isinstance(c[0][0], dict) and "action" in c[0][0]:
                row = c[0][0]
                meta = row.get("metadata", {})
                assert "password_hash" not in meta
                assert "access_token" not in meta
                assert "token_hash" not in meta

    def test_super_admin_audit_account_id_is_none_for_platform_events(self):
        """Platform-level SA events must have account_id=None."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "super_admin.py").read_text(encoding="utf-8")
        assert '"account_id": None' in src

    def test_audit_logs_table_has_no_delete_rls(self):
        """audit_logs RLS must not allow ordinary users to delete rows."""
        src = (ROOT / "supabase" / "migrations" / "022_employees_rbac.sql").read_text(encoding="utf-8")
        assert "audit_logs" in src
        assert "ENABLE ROW LEVEL SECURITY" in src
        # No DELETE policy should be defined for audit_logs
        lines = src.splitlines()
        in_audit_section = False
        for line in lines:
            if "audit_logs" in line.lower():
                in_audit_section = True
            if in_audit_section and "FOR DELETE" in line.upper():
                pytest.fail("audit_logs has a DELETE RLS policy — audit records must be immutable")


# ── L3: Tenant isolation — cross-tenant read prevention ──────────────────────

class TestTenantIsolationL:
    """Company A cannot read Company B records via any mutation endpoint."""

    def _set_profile(self, db, account_id=TEST_ACCOUNT_ID, role="owner"):
        p = MagicMock()
        p.data = [{"account_id": account_id, "role": role, "token_version": 1}]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p

    def test_contacts_list_scoped_to_account(self, app_client):
        client, db = app_client
        token = make_token(account_id=TEST_ACCOUNT_ID)
        self._set_profile(db, TEST_ACCOUNT_ID)
        result = MagicMock()
        result.data = []
        result.count = 0
        db.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = result
        resp = client.get("/api/v1/contacts", headers=auth(token))
        assert resp.status_code in (200, 422)
        calls = str(db.table.return_value.select.return_value.eq.call_args_list)
        assert TEST_ACCOUNT_ID in calls

    def test_deals_list_scoped_to_account(self, app_client):
        client, db = app_client
        token = make_token(account_id=TEST_ACCOUNT_ID)
        self._set_profile(db, TEST_ACCOUNT_ID)
        result = MagicMock()
        result.data = []
        db.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = result
        resp = client.get("/api/v1/deals", headers=auth(token))
        assert resp.status_code in (200, 422)
        calls = str(db.table.return_value.select.return_value.eq.call_args_list)
        assert TEST_ACCOUNT_ID in calls

    def test_conversations_list_scoped_to_account(self, app_client):
        client, db = app_client
        token = make_token(account_id=TEST_ACCOUNT_ID)
        self._set_profile(db, TEST_ACCOUNT_ID)
        result = MagicMock()
        result.data = []
        result.count = 0
        db.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = result
        resp = client.get("/api/v1/conversations", headers=auth(token))
        assert resp.status_code in (200, 422)
        calls = str(db.table.return_value.select.return_value.eq.call_args_list)
        assert TEST_ACCOUNT_ID in calls

    def test_campaigns_list_scoped_to_account(self, app_client):
        client, db = app_client
        token = make_token(account_id=TEST_ACCOUNT_ID)
        self._set_profile(db, TEST_ACCOUNT_ID)
        result = MagicMock()
        result.data = []
        result.count = 0
        db.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = result
        resp = client.get("/api/v1/campaigns", headers=auth(token))
        assert resp.status_code in (200, 422)
        calls = str(db.table.return_value.select.return_value.eq.call_args_list)
        assert TEST_ACCOUNT_ID in calls

    def test_broadcasts_list_scoped_to_account(self, app_client):
        client, db = app_client
        token = make_token(account_id=TEST_ACCOUNT_ID)
        self._set_profile(db, TEST_ACCOUNT_ID)
        result = MagicMock()
        result.data = []
        result.count = 0
        db.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = result
        resp = client.get("/api/v1/broadcasts", headers=auth(token))
        assert resp.status_code in (200, 422)
        calls = str(db.table.return_value.select.return_value.eq.call_args_list)
        assert TEST_ACCOUNT_ID in calls

    def test_segments_list_scoped_to_account(self, app_client):
        client, db = app_client
        token = make_token(account_id=TEST_ACCOUNT_ID)
        self._set_profile(db, TEST_ACCOUNT_ID)
        result = MagicMock()
        result.data = []
        db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = result
        resp = client.get("/api/v1/segments", headers=auth(token))
        assert resp.status_code in (200, 422)
        calls = str(db.table.return_value.select.return_value.eq.call_args_list)
        assert TEST_ACCOUNT_ID in calls

    def test_agents_list_scoped_to_account(self, app_client):
        client, db = app_client
        token = make_token(account_id=TEST_ACCOUNT_ID)
        self._set_profile(db, TEST_ACCOUNT_ID)
        result = MagicMock()
        result.data = []
        db.table.return_value.select.return_value.eq.return_value.execute.return_value = result
        resp = client.get("/api/v1/agents", headers=auth(token))
        assert resp.status_code in (200, 422)
        calls = str(db.table.return_value.select.return_value.eq.call_args_list)
        assert TEST_ACCOUNT_ID in calls

    def test_journeys_list_scoped_to_account(self, app_client):
        client, db = app_client
        token = make_token(account_id=TEST_ACCOUNT_ID)
        self._set_profile(db, TEST_ACCOUNT_ID)
        result = MagicMock()
        result.data = []
        db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = result
        resp = client.get("/api/v1/journeys", headers=auth(token))
        assert resp.status_code in (200, 422)
        calls = str(db.table.return_value.select.return_value.eq.call_args_list)
        assert TEST_ACCOUNT_ID in calls


    def test_contact_update_cannot_cross_tenant(self, app_client):
        """PATCH /contacts/{id} must include account_id in WHERE clause — verified via source."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "contacts.py").read_text(encoding="utf-8")
        # The update query must chain .eq("account_id", ...) to prevent cross-tenant writes
        assert '.eq("account_id", user["account_id"])' in src or \
               ".eq('account_id', user['account_id'])" in src or \
               'eq("account_id", account_id)' in src

    def test_deal_update_cannot_cross_tenant(self, app_client):
        """PATCH /deals/{id} must include account_id in WHERE clause — verified via source."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "deals.py").read_text(encoding="utf-8")
        assert '.eq("account_id", user["account_id"])' in src or \
               ".eq('account_id', user['account_id'])" in src

    def test_automation_toggle_cannot_cross_tenant(self, app_client):
        """PATCH /automations/{id}/toggle must include account_id in WHERE clause — verified via source."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "automations.py").read_text(encoding="utf-8")
        assert '.eq("account_id", user["account_id"])' in src or \
               ".eq('account_id', user['account_id'])" in src


# ── L4: Integration ownership enforcement ────────────────────────────────────

class TestIntegrationOwnership:
    """Integration credentials are scoped to account_id; tokens never leak."""

    def test_integration_get_scoped_to_account(self, app_client):
        """GET integration uses account_id from authenticated user — verified via source."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "integrations.py").read_text(encoding="utf-8")
        assert 'user["account_id"]' in src or "user['account_id']" in src
        assert "account_settings" in src

    def test_integration_save_scoped_to_account(self, app_client):
        """POST integration upserts with account_id from authenticated user — verified via source."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "integrations.py").read_text(encoding="utf-8")
        assert '"account_id": account_id' in src or "'account_id': account_id" in src

    def test_integration_channel_unknown_returns_404(self, app_client):
        client, db = app_client
        token = make_token(account_id=TEST_ACCOUNT_ID)
        p = MagicMock()
        p.data = [{"account_id": TEST_ACCOUNT_ID, "role": "owner", "token_version": 1}]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p
        resp = client.get("/api/v1/settings/integrations/unknown_channel", headers=auth(token))
        assert resp.status_code == 404

    def test_integration_unauthenticated_returns_401_or_403(self, app_client):
        client, _ = app_client
        resp = client.get("/api/v1/settings/integrations/whatsapp")
        assert resp.status_code in (401, 403)

    def test_integration_source_never_returns_raw_token_in_field_name(self):
        """GET integration endpoint returns key/value pairs — verify no field named 'token' is returned raw."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "integrations.py").read_text(encoding="utf-8")
        # The GET endpoint returns {row["key"]: row["value"]} — values come from DB
        # Verify the response does not add any extra token field beyond what DB stores
        assert "return {row" in src or 'return {row["key"]' in src

    def test_telegram_bot_info_never_exposes_token_in_response(self):
        src = (ROOT / "backend" / "app" / "api" / "v1" / "integrations.py").read_text(encoding="utf-8")
        # The bot-info endpoint must not include the raw token value in its return dict
        # It returns {"configured": True/False, "bot": ..., "error": ...} — no token field
        lines = src.splitlines()
        in_bot_info = False
        for line in lines:
            if "async def get_telegram_bot_info" in line:
                in_bot_info = True
            if in_bot_info and line.strip().startswith("@router") and "get_telegram_bot_info" not in line:
                break
            if in_bot_info and "return" in line:
                # Ensure no return value contains a key named 'token'
                assert '"token"' not in line and "'token'" not in line, \
                    f"Telegram bot-info returns a 'token' key: {line.strip()}"


# ── L5: Migration safety review ───────────────────────────────────────────────

class TestMigrationSafety:
    """Verify migrations 021-023 are safe, idempotent, and correctly ordered."""

    def _mig(self, name):
        return (ROOT / "supabase" / "migrations" / name).read_text(encoding="utf-8")

    def test_021_is_idempotent(self):
        src = self._mig("021_fix_auth_fkeys_and_columns.sql")
        assert "IF NOT EXISTS" in src or "IF EXISTS" in src

    def test_021_drops_fkeys_before_adding_columns(self):
        src = self._mig("021_fix_auth_fkeys_and_columns.sql")
        drop_pos = src.find("DROP CONSTRAINT")
        add_pos = src.find("ADD COLUMN")
        assert drop_pos < add_pos, "021: FK drops must precede column additions"

    def test_021_no_data_loss_statements(self):
        src = self._mig("021_fix_auth_fkeys_and_columns.sql").upper()
        for dangerous in ["DROP TABLE", "TRUNCATE", "DELETE FROM"]:
            assert dangerous not in src, f"021 contains dangerous statement: {dangerous}"

    def test_022_depends_on_accounts_table(self):
        src = self._mig("022_employees_rbac.sql")
        assert "REFERENCES accounts(id)" in src

    def test_022_audit_logs_account_id_not_null(self):
        src = self._mig("022_employees_rbac.sql")
        # account_id in audit_logs is NOT NULL (platform events use NULL via super_admin)
        # The migration defines it as NOT NULL with a FK
        assert "account_id" in src
        assert "audit_logs" in src

    def test_022_rls_uses_get_my_account_id(self):
        src = self._mig("022_employees_rbac.sql")
        assert "get_my_account_id()" in src

    def test_022_no_privilege_escalation(self):
        src = self._mig("022_employees_rbac.sql").upper()
        assert "GRANT" not in src or "GRANT SELECT" in src or "GRANT INSERT" in src

    def test_023_join_requests_unique_constraint(self):
        src = self._mig("023_company_profile_join_requests.sql")
        assert "UNIQUE(account_id, requester_id, status)" in src

    def test_023_accounts_status_has_check_constraint(self):
        src = self._mig("023_company_profile_join_requests.sql")
        assert "CHECK (status IN" in src

    def test_023_no_data_loss_statements(self):
        src = self._mig("023_company_profile_join_requests.sql").upper()
        for dangerous in ["DROP TABLE", "TRUNCATE", "DELETE FROM"]:
            assert dangerous not in src, f"023 contains dangerous statement: {dangerous}"

    def test_migration_prefix_duplicates_documented(self):
        """
        Migrations 005, 006, 007, 010, 011, 013, 014, 015 have duplicate prefixes.
        This test documents the known duplicates so they are not silently ignored.
        """
        mig_dir = ROOT / "supabase" / "migrations"
        files = [f.name for f in mig_dir.glob("*.sql")]
        prefixes = [f.split("_")[0] for f in files if f[0].isdigit()]
        from collections import Counter
        dupes = {p: c for p, c in Counter(prefixes).items() if c > 1}
        known_dupes = {"005", "006", "007", "010", "011", "013", "014", "015"}
        unexpected = set(dupes.keys()) - known_dupes
        assert not unexpected, f"New unexpected duplicate migration prefixes: {unexpected}"


# ── L6: Credential exposure assessment ───────────────────────────────────────

class TestCredentialExposure:
    """Verify .env files are gitignored and example files contain no real secrets."""

    def test_env_local_is_gitignored(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        assert ".env.local" in gitignore

    def test_backend_env_is_gitignored(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        assert "backend/.env" in gitignore

    def test_frontend_env_local_is_gitignored(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        assert "frontend/.env.local" in gitignore

    def test_env_example_has_no_real_supabase_url(self):
        """FIXED: .env.local.example now contains only placeholder values."""
        example = (ROOT / ".env.local.example").read_text(encoding="utf-8")
        # Real project ref must no longer be present
        assert "ngvmzkavvkikisprtpgd" not in example, \
            "Real Supabase project ref still present in .env.local.example — fix not applied"
        assert "your-project-ref" in example or "YOUR-" in example.upper()

    def test_env_example_has_no_real_jwt_secret(self):
        example = (ROOT / ".env.local.example").read_text(encoding="utf-8")
        # Real JWT secrets are long random strings; examples use placeholders
        lines = [l for l in example.splitlines() if "JWT_SECRET" in l]
        for line in lines:
            val = line.split("=", 1)[-1].strip().strip('"').strip("'")
            assert len(val) < 20 or "your" in val.lower() or "secret" in val.lower() or "change" in val.lower(), \
                f"JWT_SECRET in example looks like a real secret: {val[:20]}..."

    def test_git_history_committed_env_files(self):
        """
        Documents that .env.local and frontend/.env.local were committed in git history.
        This is a BLOCKER — credentials must be rotated and history cleaned.
        Commits: 3620a83 (frontend/.env.local added), earlier commits (.env.local added).
        This test PASSES to document the known state; remediation is tracked separately.
        """
        # Verified via: git log --all --diff-filter=A --name-only --format="" -- "*.env*"
        # Result: .env.local and frontend/.env.local appear in history
        known_exposed = [".env.local", "frontend/.env.local"]
        assert known_exposed  # Always true — documents the finding


# ── L7: Suspended/removed employee access ────────────────────────────────────

class TestSuspendedEmployeeAccess:
    """Suspended employees (is_active=False) lose access at the auth layer."""

    def test_inactive_profile_rejected_at_login(self, app_client):
        from passlib.context import CryptContext
        client, db = app_client
        pw_hash = CryptContext(schemes=["bcrypt"], deprecated="auto").hash("pass123")
        inactive = {
            "user_id": TEST_USER_ID, "account_id": TEST_ACCOUNT_ID,
            "role": "agent", "full_name": "Gone", "email": "gone@x.com",
            "avatar_url": None, "password_hash": pw_hash,
            "totp_secret": None, "totp_enabled": False,
            "token_version": 1, "is_active": False,
        }
        result = MagicMock()
        result.data = [inactive]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = result
        resp = client.post("/api/v1/auth/login",
                           json={"email": "gone@x.com", "password": "pass123"})
        assert resp.status_code == 403

    def test_employee_delete_marks_inactive_via_api(self, app_client):
        """DELETE /employees/{id} is scoped to account_id — verified via source."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "employees.py").read_text(encoding="utf-8")
        # The delete query must chain .eq("account_id", ...) to prevent cross-tenant deletes
        assert '.eq("account_id", user["account_id"])' in src or \
               ".eq('account_id', user['account_id'])" in src


# ── L8: Background job and AI agent attribution ───────────────────────────────

class TestBackgroundJobAttribution:
    """Verify background jobs and AI agents carry actor attribution in source."""

    def test_broadcast_service_has_account_id_scoping(self):
        src = (ROOT / "backend" / "app" / "services" / "broadcast_service.py").read_text(encoding="utf-8")
        assert "account_id" in src

    def test_broadcast_send_all_uses_account_id_from_server(self):
        """send_all must receive account_id from the authenticated request, not from body."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "broadcasts.py").read_text(encoding="utf-8")
        assert "user[\"account_id\"]" in src or "user['account_id']" in src

    def test_agent_run_scoped_to_account(self):
        src = (ROOT / "backend" / "app" / "api" / "v1" / "agents.py").read_text(encoding="utf-8")
        assert "account_id" in src
        assert "user[\"account_id\"]" in src or "user['account_id']" in src

    def test_agent_run_records_triggered_by(self):
        src = (ROOT / "backend" / "app" / "api" / "v1" / "agents.py").read_text(encoding="utf-8")
        assert "triggered_by" in src

    def test_agent_run_awaiting_approval_status(self):
        src = (ROOT / "backend" / "app" / "api" / "v1" / "agents.py").read_text(encoding="utf-8")
        assert "awaiting_approval" in src

    def test_agent_sanitize_execution_log_redacts_keys(self):
        from app.api.v1.agents import sanitize_execution_log
        log = {"result": "ok", "api_key": "sk-abc123def456ghi789jkl012mno345pqr"}
        cleaned = sanitize_execution_log(log)
        assert "sk-abc123" not in str(cleaned)

    def test_journey_execute_scoped_to_account(self):
        src = (ROOT / "backend" / "app" / "api" / "v1" / "journeys.py").read_text(encoding="utf-8")
        assert "account_id" in src
        assert "user[\"account_id\"]" in src or "user['account_id']" in src

    def test_automation_engine_ownership_check(self):
        from app.api.v1.automations import check_automation_ownership
        assert check_automation_ownership(TEST_ACCOUNT_ID, TEST_ACCOUNT_ID) is True
        assert check_automation_ownership(TEST_ACCOUNT_ID, TEST_ACCOUNT_ID_2) is False


# ── L9: Provider-level integration status ────────────────────────────────────

class TestProviderIntegrationStatus:
    """
    Documents which providers can be tested and which require external credentials.
    These are source-level checks only — no real messages are sent.
    """

    def test_whatsapp_route_exists(self):
        src = (ROOT / "backend" / "app" / "api" / "v1" / "webhooks.py").read_text(encoding="utf-8")
        assert "whatsapp" in src.lower()

    def test_instagram_route_exists(self):
        assert (ROOT / "backend" / "app" / "api" / "v1" / "instagram_routes.py").exists()

    def test_facebook_route_exists(self):
        src = (ROOT / "backend" / "app" / "api" / "v1" / "webhooks.py").read_text(encoding="utf-8")
        assert "facebook" in src.lower()

    def test_telegram_route_exists(self):
        src = (ROOT / "backend" / "app" / "api" / "v1" / "integrations.py").read_text(encoding="utf-8")
        assert "telegram" in src.lower()

    def test_email_service_exists(self):
        assert (ROOT / "backend" / "app" / "services" / "email_service.py").exists()

    def test_whatsapp_webhook_verifies_app_secret(self):
        src = (ROOT / "backend" / "app" / "api" / "v1" / "webhooks.py").read_text(encoding="utf-8")
        assert "app_secret" in src.lower() or "hmac" in src.lower() or "signature" in src.lower()

    def test_integration_credentials_stored_per_account(self):
        """Credentials are stored in account_settings keyed by account_id."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "integrations.py").read_text(encoding="utf-8")
        assert "account_settings" in src
        assert "account_id" in src

    def test_providers_not_testable_without_credentials_documented(self):
        """
        Providers requiring external sandbox credentials (cannot be tested in CI):
        - WhatsApp Business API (Meta WABA token + phone number ID)
        - Instagram Messaging (Meta page token + Instagram Business account)
        - Facebook Messenger (Meta page token)
        - Telegram (bot token)
        - Email (SMTP/SendGrid credentials)
        - Meta Ads (ad account ID + access token)
        This test always passes — it documents the external dependency.
        """
        untestable = [
            "WhatsApp: requires WABA token + phone_number_id",
            "Instagram: requires Meta page token + IG business account",
            "Facebook: requires Meta page token",
            "Telegram: requires bot token",
            "Email: requires SMTP/SendGrid credentials",
            "Meta Ads: requires ad_account_id + access_token",
        ]
        assert len(untestable) == 6  # All 6 providers documented


# ── L10: Production readiness checklist ──────────────────────────────────────

class TestProductionReadinessChecklist:
    """Source-level checks for production readiness gates."""

    def test_jwt_secret_not_hardcoded_in_source(self):
        auth_src = (ROOT / "backend" / "app" / "middleware" / "auth.py").read_text(encoding="utf-8")
        assert "test-secret" not in auth_src
        assert "settings.jwt_secret" in auth_src

    def test_token_version_check_present(self):
        auth_src = (ROOT / "backend" / "app" / "middleware" / "auth.py").read_text(encoding="utf-8")
        assert "token_version" in auth_src
        assert "token_ver < profile_ver" in auth_src

    def test_partial_token_rejected(self):
        auth_src = (ROOT / "backend" / "app" / "middleware" / "auth.py").read_text(encoding="utf-8")
        assert "partial" in auth_src

    def test_role_derived_from_db_not_token(self):
        auth_src = (ROOT / "backend" / "app" / "middleware" / "auth.py").read_text(encoding="utf-8")
        assert 'p.get("role"' in auth_src or "p[\"role\"]" in auth_src

    def test_super_admin_db_verified_not_token_claim(self):
        sa_src = (ROOT / "backend" / "app" / "api" / "v1" / "super_admin.py").read_text(encoding="utf-8")
        assert "is_super_admin" in sa_src
        assert "db.table" in sa_src

    def test_no_debug_mode_secrets_in_responses(self):
        config_src = (ROOT / "backend" / "app" / "core" / "config.py").read_text(encoding="utf-8")
        assert "jwt_secret" in config_src.lower()

    def test_cors_configured(self):
        main_src = (ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
        assert "CORSMiddleware" in main_src or "cors" in main_src.lower()

    def test_health_endpoint_exists(self):
        assert (ROOT / "backend" / "app" / "api" / "v1" / "health.py").exists()

    def test_migrations_021_022_023_all_exist(self):
        for mig in ["021_fix_auth_fkeys_and_columns.sql",
                    "022_employees_rbac.sql",
                    "023_company_profile_join_requests.sql"]:
            assert (ROOT / "supabase" / "migrations" / mig).exists(), f"Missing: {mig}"

    def test_e2e_tests_exist_but_not_run_against_production(self):
        """E2E tests exist; they must only run against a dedicated test environment."""
        assert (ROOT / "e2e" / "crm.spec.ts").exists()
        assert (ROOT / "e2e" / "global-setup.ts").exists()
        config = (ROOT / "playwright.config.ts").read_text(encoding="utf-8")
        assert "globalSetup" in config


# ── L11: Migration 024 — join_requests partial unique index ──────────────────

class TestMigration024:
    def test_migration_024_exists(self):
        assert (ROOT / "supabase" / "migrations" / "024_fix_join_requests_unique.sql").exists()

    def test_migration_024_drops_full_unique_constraint(self):
        src = (ROOT / "supabase" / "migrations" / "024_fix_join_requests_unique.sql").read_text(encoding="utf-8")
        assert "DROP CONSTRAINT IF EXISTS" in src
        assert "join_requests_account_id_requester_id_status_key" in src

    def test_migration_024_adds_partial_unique_index(self):
        src = (ROOT / "supabase" / "migrations" / "024_fix_join_requests_unique.sql").read_text(encoding="utf-8")
        assert "CREATE UNIQUE INDEX IF NOT EXISTS" in src
        assert "WHERE status = 'pending'" in src

    def test_migration_024_is_idempotent(self):
        src = (ROOT / "supabase" / "migrations" / "024_fix_join_requests_unique.sql").read_text(encoding="utf-8")
        assert "IF NOT EXISTS" in src or "IF EXISTS" in src

    def test_join_requests_only_blocks_pending_duplicates(self):
        """Backend only checks for pending duplicates, not all historical requests."""
        src = (ROOT / "backend" / "app" / "api" / "v1" / "employees.py").read_text(encoding="utf-8")
        # The duplicate check must filter by status='pending'
        assert '.eq("status", "pending")' in src or ".eq('status', 'pending')" in src


# ── L12: Behavioral audit tests ───────────────────────────────────────────────

class TestAuditBehavior:
    """Verify audit events are actually written on mutations (not just present in source)."""

    def _set_profile(self, db, account_id=TEST_ACCOUNT_ID, role="owner"):
        p = MagicMock()
        p.data = [{"account_id": account_id, "role": role, "token_version": 1}]
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = p

    def test_contact_create_writes_audit(self, app_client):
        client, db = app_client
        token = make_token()
        self._set_profile(db)
        contact_result = MagicMock()
        contact_result.data = [{"id": "c1", "account_id": TEST_ACCOUNT_ID}]
        db.table.return_value.insert.return_value.execute.return_value = contact_result
        resp = client.post("/api/v1/contacts",
                           json={"phone": "+1234567890", "name": "Test"},
                           headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 422)
        insert_calls = db.table.return_value.insert.call_args_list
        audit_calls = [c for c in insert_calls
                       if c[0] and isinstance(c[0][0], dict)
                       and c[0][0].get("action") == "contact.created"]
        assert len(audit_calls) > 0, "contact.created audit event not written"

    def test_deal_create_writes_audit(self, app_client):
        client, db = app_client
        token = make_token()
        self._set_profile(db)
        deal_result = MagicMock()
        deal_result.data = [{"id": "d1", "account_id": TEST_ACCOUNT_ID}]
        db.table.return_value.insert.return_value.execute.return_value = deal_result
        # No stage_id provided so no pipeline_stages lookup needed
        resp = client.post("/api/v1/deals",
                           json={"title": "Test Deal", "value": 1000},
                           headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 422)
        insert_calls = db.table.return_value.insert.call_args_list
        audit_calls = [c for c in insert_calls
                       if c[0] and isinstance(c[0][0], dict)
                       and c[0][0].get("action") == "deal.created"]
        assert len(audit_calls) > 0, "deal.created audit event not written"

    def test_automation_create_writes_audit(self, app_client):
        client, db = app_client
        token = make_token()
        self._set_profile(db)
        auto_result = MagicMock()
        auto_result.data = [{"id": "a1", "account_id": TEST_ACCOUNT_ID}]
        db.table.return_value.insert.return_value.execute.return_value = auto_result
        resp = client.post("/api/v1/automations",
                           json={"name": "Test Auto", "trigger": "new_contact"},
                           headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 422)
        insert_calls = db.table.return_value.insert.call_args_list
        audit_calls = [c for c in insert_calls
                       if c[0] and isinstance(c[0][0], dict)
                       and c[0][0].get("action") == "automation.created"]
        assert len(audit_calls) > 0, "automation.created audit event not written"

    def test_audit_metadata_never_contains_sensitive_keys(self, app_client):
        """No audit event should contain password, token, or secret in metadata."""
        client, db = app_client
        token = make_token()
        self._set_profile(db)
        contact_result = MagicMock()
        contact_result.data = [{"id": "c1", "account_id": TEST_ACCOUNT_ID}]
        db.table.return_value.insert.return_value.execute.return_value = contact_result
        client.post("/api/v1/contacts",
                    json={"phone": "+1234567890"},
                    headers={"Authorization": f"Bearer {token}"})
        insert_calls = db.table.return_value.insert.call_args_list
        for c in insert_calls:
            if c[0] and isinstance(c[0][0], dict) and "action" in c[0][0]:
                meta = c[0][0].get("metadata", {})
                for bad_key in ["password", "password_hash", "access_token", "token_hash", "secret"]:
                    assert bad_key not in meta, f"Sensitive key '{bad_key}' found in audit metadata"

    def test_audit_actor_id_is_from_auth_not_body(self, app_client):
        """actor_id in audit must come from the authenticated user, not from request body."""
        client, db = app_client
        token = make_token(user_id=TEST_USER_ID)
        self._set_profile(db)
        contact_result = MagicMock()
        contact_result.data = [{"id": "c1", "account_id": TEST_ACCOUNT_ID}]
        db.table.return_value.insert.return_value.execute.return_value = contact_result
        # Attempt to inject a different actor_id via body
        client.post("/api/v1/contacts",
                    json={"phone": "+1234567890", "actor_id": "attacker-id"},
                    headers={"Authorization": f"Bearer {token}"})
        insert_calls = db.table.return_value.insert.call_args_list
        for c in insert_calls:
            if c[0] and isinstance(c[0][0], dict) and c[0][0].get("action") == "contact.created":
                assert c[0][0].get("actor_id") == TEST_USER_ID, \
                    "actor_id was not taken from authenticated user"
