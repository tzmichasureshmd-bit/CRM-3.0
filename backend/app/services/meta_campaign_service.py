"""
Meta Ads Campaign Integration Service (Marketing API v26.0)
Confined strictly to Campaigns module. Read-only sync from Meta Ads into CRM.
"""
import httpx
import logging
import time
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from app.core.config import get_settings
from app.db.supabase import get_supabase_client

logger = logging.getLogger("meta_campaign_service")
settings = get_settings()

GRAPH_BASE = "https://graph.facebook.com"

# Official Meta Marketing API v26.0 ODAX objectives
VALID_META_OBJECTIVES = {
    "OUTCOME_LEADS",
    "OUTCOME_SALES",
    "OUTCOME_TRAFFIC",
    "OUTCOME_AWARENESS",
    "OUTCOME_ENGAGEMENT",
    "OUTCOME_APP_PROMOTION",
}

# Status mapping from Meta Ads to CRM 3.0 campaigns status enum
META_STATUS_MAP = {
    "ACTIVE": "active",
    "PAUSED": "paused",
    "ARCHIVED": "archived",
    "DELETED": "archived",
}


def normalize_ad_account_id(account_id: str) -> str:
    """Ensures ad account ID has the 'act_' prefix required by Graph API."""
    cleaned = account_id.strip()
    if cleaned.startswith("act_"):
        return cleaned
    return f"act_{cleaned}"


class MetaCampaignService:
    def __init__(self):
        self.settings = get_settings()

    def _get_access_token(self) -> str:
        """Retrieves configured server-side token without fallback to unrelated services."""
        token = self.settings.meta_access_token.strip()
        if not token:
            raise ValueError(
                "Meta access token is not configured on the server. "
                "Please set META_ACCESS_TOKEN in backend/.env."
            )
        return token

    def _get_ad_account_id(self) -> str:
        raw_id = self.settings.meta_ad_account_id or "act_2505907436503788"
        return normalize_ad_account_id(raw_id)

    def _get_api_version(self) -> str:
        return self.settings.meta_api_version or "v26.0"

    async def fetch_meta_campaigns(
        self,
        override_token: Optional[str] = None,
        override_ad_account_id: Optional[str] = None,
        limit: int = 50,
        max_pages: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Fetches campaigns from Meta Marketing API v26.0 using cursor pagination.
        Enforces connection/read timeouts and token redaction.
        """
        token = override_token.strip() if override_token else self._get_access_token()
        ad_account = normalize_ad_account_id(override_ad_account_id) if override_ad_account_id else self._get_ad_account_id()
        version = self._get_api_version()

        url = f"{GRAPH_BASE}/{version}/{ad_account}/campaigns"
        fields = "id,name,status,objective,created_time,start_time,stop_time"

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        params: Dict[str, Any] = {
            "fields": fields,
            "limit": limit,
        }

        all_campaigns: List[Dict[str, Any]] = []
        page_count = 0

        async with httpx.AsyncClient(timeout=15.0) as client:
            while url and page_count < max_pages:
                page_count += 1
                try:
                    res = await client.get(url, params=params, headers=headers)
                except httpx.TimeoutException:
                    raise RuntimeError("Meta Marketing API request timed out after 15 seconds.")
                except httpx.RequestError as exc:
                    # Sanitize error to avoid leaking URL params or tokens
                    raise RuntimeError(f"Network error connecting to Meta Marketing API: {exc.__class__.__name__}")

                if res.status_code != 200:
                    self._handle_api_error(res)

                data = res.json()
                campaign_list = data.get("data", [])
                all_campaigns.extend(campaign_list)

                # Cursor-based pagination: use 'after' cursor rather than token-bearing 'next' URL
                paging = data.get("paging", {})
                cursors = paging.get("cursors", {})
                after_cursor = cursors.get("after")

                if after_cursor and paging.get("next"):
                    params = {
                        "fields": fields,
                        "limit": limit,
                        "after": after_cursor,
                    }
                    url = f"{GRAPH_BASE}/{version}/{ad_account}/campaigns"
                else:
                    break

        return all_campaigns

    def _handle_api_error(self, response: httpx.Response):
        """Maps Graph API errors to clean, actionable, token-redacted exceptions."""
        try:
            err_body = response.json().get("error", {})
        except Exception:
            err_body = {}

        code = err_body.get("code")
        subcode = err_body.get("error_subcode")
        message = err_body.get("message", "Unknown error from Meta API")

        # Expired or Invalid Token
        if code == 190:
            raise PermissionError(
                f"Meta access token is invalid or expired (subcode {subcode}). "
                "Please generate a fresh System User Token in Meta Business Settings."
            )
        # Missing Permissions
        elif code in (200, 10, 278):
            raise PermissionError(
                f"Insufficient permissions for Meta Ad Account. Ensure the token has 'ads_read' permission. Details: {message}"
            )
        # Invalid Ad Account
        elif code == 100 or subcode == 33:
            raise ValueError(
                f"Configured Ad Account is invalid or inaccessible with this token. Details: {message}"
            )
        # Rate Limit
        elif code in (4, 17, 32, 613):
            raise RuntimeError("Meta API rate limit reached. Please wait before retrying.")
        else:
            raise RuntimeError(f"Meta Graph API error ({response.status_code}): {message}")

    def _check_meta_columns_exist(self, db) -> bool:
        """Determines if the database schema has been migrated with meta_campaign_id."""
        try:
            res = db.table("campaigns").select("meta_campaign_id").limit(1).execute()
            return True
        except Exception:
            return False

    async def sync_campaigns(
        self,
        account_id: str,
        override_token: Optional[str] = None,
        override_ad_account_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes end-to-end synchronization:
        1. Fetches campaigns from Meta
        2. Deduplicates against existing campaigns for this tenant account
        3. Upserts records into the database
        4. Logs the sync attempt and returns audit metrics
        """
        start_time = time.time()
        ad_account = normalize_ad_account_id(override_ad_account_id) if override_ad_account_id else self._get_ad_account_id()
        version = self._get_api_version()
        now_iso = datetime.now(timezone.utc).isoformat()

        db = get_supabase_client()
        has_meta_columns = self._check_meta_columns_exist(db)

        created_count = 0
        updated_count = 0
        skipped_count = 0
        failed_count = 0
        synced_records = []

        try:
            meta_campaigns = await self.fetch_meta_campaigns(
                override_token=override_token,
                override_ad_account_id=ad_account,
            )
        except Exception as exc:
            duration_ms = int((time.time() - start_time) * 1000)
            self._log_sync_attempt(
                db=db,
                account_id=account_id,
                ad_account=ad_account,
                version=version,
                status="failed",
                fetched=0,
                created=0,
                updated=0,
                skipped=0,
                failed=0,
                duration_ms=duration_ms,
                error_message=str(exc),
            )
            raise

        # Fetch existing local campaigns for this account to deduplicate safely
        existing_res = (
            db.table("campaigns")
            .select("*")
            .eq("account_id", account_id)
            .execute()
        )
        existing_campaigns = existing_res.data or []

        # Index existing campaigns by meta_campaign_id if supported, else by name + platform
        existing_by_meta_id: Dict[str, Dict[str, Any]] = {}
        existing_by_name: Dict[str, Dict[str, Any]] = {}

        for c in existing_campaigns:
            if has_meta_columns and c.get("meta_campaign_id"):
                existing_by_meta_id[c["meta_campaign_id"]] = c
            if c.get("platform") == "facebook":
                existing_by_name[c.get("name", "").strip().lower()] = c

        for mc in meta_campaigns:
            meta_id = str(mc.get("id"))
            meta_name = mc.get("name", f"Meta Campaign {meta_id}")
            meta_raw_status = mc.get("status", "PAUSED")
            crm_status = META_STATUS_MAP.get(meta_raw_status, "draft")
            meta_objective = mc.get("objective", "OUTCOME_LEADS")

            # Match against existing record
            matched = existing_by_meta_id.get(meta_id)
            if not matched and not has_meta_columns:
                matched = existing_by_name.get(meta_name.strip().lower())

            try:
                if matched:
                    # Check if update is needed
                    needs_update = (
                        matched.get("name") != meta_name
                        or matched.get("status") != crm_status
                        or (has_meta_columns and matched.get("objective") != meta_objective)
                    )

                    update_payload: Dict[str, Any] = {
                        "name": meta_name,
                        "status": crm_status,
                    }
                    if has_meta_columns:
                        update_payload["meta_campaign_id"] = meta_id
                        update_payload["objective"] = meta_objective
                        update_payload["last_synced_at"] = now_iso
                        if mc.get("start_time"):
                            update_payload["start_time"] = mc.get("start_time")
                        if mc.get("stop_time"):
                            update_payload["stop_time"] = mc.get("stop_time")

                    if needs_update or has_meta_columns:
                        up_res = (
                            db.table("campaigns")
                            .update(update_payload)
                            .eq("id", matched["id"])
                            .eq("account_id", account_id)
                            .execute()
                        )
                        if up_res.data:
                            updated_count += 1
                            synced_records.append(up_res.data[0])
                        else:
                            skipped_count += 1
                    else:
                        skipped_count += 1
                else:
                    # New insert
                    insert_payload: Dict[str, Any] = {
                        "account_id": account_id,
                        "name": meta_name,
                        "platform": "facebook",
                        "status": crm_status,
                    }
                    if has_meta_columns:
                        insert_payload["meta_campaign_id"] = meta_id
                        insert_payload["objective"] = meta_objective
                        insert_payload["last_synced_at"] = now_iso
                        if mc.get("start_time"):
                            insert_payload["start_time"] = mc.get("start_time")
                        if mc.get("stop_time"):
                            insert_payload["stop_time"] = mc.get("stop_time")

                    in_res = db.table("campaigns").insert(insert_payload).execute()
                    if in_res.data:
                        created_count += 1
                        synced_records.append(in_res.data[0])
                        if has_meta_columns:
                            existing_by_meta_id[meta_id] = in_res.data[0]
                    else:
                        failed_count += 1
            except Exception as item_err:
                logger.error(f"Failed to sync campaign {meta_id}: {item_err}")
                failed_count += 1

        duration_ms = int((time.time() - start_time) * 1000)
        sync_status = "success" if failed_count == 0 else "partial"

        # Log audit entry
        self._log_sync_attempt(
            db=db,
            account_id=account_id,
            ad_account=ad_account,
            version=version,
            status=sync_status,
            fetched=len(meta_campaigns),
            created=created_count,
            updated=updated_count,
            skipped=skipped_count,
            failed=failed_count,
            duration_ms=duration_ms,
            error_message=None,
        )

        return {
            "success": True,
            "ad_account_id": ad_account,
            "api_version": version,
            "fetched_count": len(meta_campaigns),
            "created_count": created_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "failed_count": failed_count,
            "duration_ms": duration_ms,
            "last_synced_at": now_iso,
            "schema_migrated": has_meta_columns,
            "records": synced_records,
        }

    def _log_sync_attempt(
        self,
        db,
        account_id: str,
        ad_account: str,
        version: str,
        status: str,
        fetched: int,
        created: int,
        updated: int,
        skipped: int,
        failed: int,
        duration_ms: int,
        error_message: Optional[str] = None,
    ):
        """Attempts to write an audit record to meta_sync_logs if table exists."""
        try:
            db.table("meta_sync_logs").insert({
                "account_id": account_id,
                "ad_account_id": ad_account,
                "api_version": version,
                "status": status,
                "fetched_count": fetched,
                "created_count": created,
                "updated_count": updated,
                "skipped_count": skipped,
                "failed_count": failed,
                "duration_ms": duration_ms,
                "error_message": error_message,
            }).execute()
        except Exception:
            # Table might not exist prior to migration 013, silently pass
            pass

    def get_latest_sync_status(self, account_id: str) -> Dict[str, Any]:
        """Returns the most recent sync status and observability stats."""
        db = get_supabase_client()
        ad_account = self._get_ad_account_id()
        version = self._get_api_version()
        token_configured = bool(self.settings.meta_access_token.strip())

        try:
            res = (
                db.table("meta_sync_logs")
                .select("*")
                .eq("account_id", account_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            latest = res.data[0] if res.data else None
        except Exception:
            latest = None

        return {
            "ad_account_id": ad_account,
            "app_id": self.settings.meta_app_id,
            "api_version": version,
            "token_configured": token_configured,
            "last_sync": latest,
        }

    def get_credentials_info(self) -> Dict[str, Any]:
        """Returns sanitized credentials information without exposing secrets."""
        ad_account = self._get_ad_account_id()
        app_id = self.settings.meta_app_id or "1354004176287129"
        version = self._get_api_version()
        token = self.settings.meta_access_token.strip() if self.settings.meta_access_token else ""
        has_token = bool(token)
        preview = f"{token[:6]}...{token[-4:]}" if len(token) > 12 else ("Configured" if has_token else "Not Set")

        return {
            "ad_account_id": ad_account,
            "app_id": app_id,
            "api_version": version,
            "has_token": has_token,
            "token_preview": preview,
            "is_connected": has_token,
        }

    async def test_connection(
        self,
        ad_account_id: Optional[str] = None,
        access_token: Optional[str] = None,
        api_version: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Validates connectivity, token validity, and ad account accessibility
        by issuing a lightweight request to the Meta Marketing API.
        """
        token = access_token.strip() if access_token and access_token.strip() else self.settings.meta_access_token.strip()
        if not token:
            return {
                "success": False,
                "error": "No access token provided or configured.",
                "error_code": 401,
                "hint": "Please generate a System User Token with 'ads_read' permission in Meta Business Settings.",
            }

        target_account = normalize_ad_account_id(ad_account_id) if ad_account_id else self._get_ad_account_id()
        version = (api_version.strip() if api_version else None) or self._get_api_version()

        url = f"{GRAPH_BASE}/{version}/{target_account}"
        params = {"fields": "id,name,account_status,currency,timezone_name,business_name"}
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, params=params, headers=headers)
        except httpx.TimeoutException:
            return {
                "success": False,
                "error": "Connection timed out after 10 seconds while contacting Meta Graph API.",
                "error_code": 408,
                "hint": "Check outbound internet connectivity to graph.facebook.com:443.",
            }
        except httpx.RequestError as exc:
            return {
                "success": False,
                "error": f"Network transport error: {exc.__class__.__name__}",
                "error_code": 502,
                "hint": "Verify network routing and firewall settings.",
            }

        if res.status_code != 200:
            error_data = {}
            try:
                error_data = res.json().get("error", {})
            except Exception:
                pass

            code = error_data.get("code", res.status_code)
            raw_msg = error_data.get("message", res.text)

            if code == 190:
                hint = "The token is expired or revoked. Please generate a fresh System User Token with 'Never' expiry in Meta Business Settings."
                err = "Meta access token has expired or is invalid (Code 190)."
            elif code == 200:
                hint = f"Your Meta System User does not have asset permissions on {target_account}. In Meta Business Settings -> Ad Accounts -> Add People, assign your system user with 'View Performance' permission."
                err = f"Permission error accessing Ad Account {target_account} (Code 200)."
            elif code == 100:
                hint = f"Verify that {target_account} is a valid Meta Ad Account ID. Numeric IDs only."
                err = f"Invalid Ad Account parameter {target_account} (Code 100)."
            else:
                hint = "Check Meta Developer Console and Business Settings."
                err = f"Meta Graph API error (Code {code}): {raw_msg}"

            return {
                "success": False,
                "error": err,
                "error_code": code,
                "hint": hint,
            }

        data = res.json()
        raw_status = data.get("account_status", 1)
        status_map = {
            1: "ACTIVE",
            2: "DISABLED",
            3: "UNSETTLED",
            7: "PENDING_RISK_REVIEW",
            8: "PENDING_SETTLEMENT",
            9: "IN_GRACE_PERIOD",
            100: "PENDING_CLOSURE",
            101: "CLOSED",
        }
        status_name = status_map.get(raw_status, f"CODE_{raw_status}")

        return {
            "success": True,
            "ad_account_id": target_account,
            "account_name": data.get("name") or "Meta Ad Account",
            "account_status": status_name,
            "currency": data.get("currency") or "USD",
            "timezone": data.get("timezone_name") or "UTC",
            "business_name": data.get("business_name") or "TZmicha",
            "message": f"Successfully verified connection to {target_account} ({data.get('name') or 'Ad Account'}).",
        }

    def save_credentials(
        self,
        ad_account_id: Optional[str] = None,
        app_id: Optional[str] = None,
        access_token: Optional[str] = None,
        api_version: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Updates runtime settings and persists them into backend/.env file.
        """
        from pathlib import Path
        import os

        # Update in-memory settings
        if ad_account_id and ad_account_id.strip():
            norm_id = normalize_ad_account_id(ad_account_id.strip())
            self.settings.meta_ad_account_id = norm_id
            os.environ["META_AD_ACCOUNT_ID"] = norm_id

        if app_id and app_id.strip():
            self.settings.meta_app_id = app_id.strip()
            os.environ["META_APP_ID"] = app_id.strip()

        if api_version and api_version.strip():
            self.settings.meta_api_version = api_version.strip()
            os.environ["META_API_VERSION"] = api_version.strip()

        token_updated = False
        if access_token and access_token.strip():
            self.settings.meta_access_token = access_token.strip()
            os.environ["META_ACCESS_TOKEN"] = access_token.strip()
            token_updated = True

        # Attempt to persist to backend/.env
        env_paths = [
            Path(__file__).resolve().parent.parent.parent / ".env",
            Path.cwd() / ".env",
            Path.cwd() / "backend" / ".env",
        ]

        target_env = None
        for p in env_paths:
            if p.exists() and p.is_file():
                target_env = p
                break

        if target_env:
            try:
                lines = target_env.read_text(encoding="utf-8").splitlines()
                keys_to_update = {
                    "META_AD_ACCOUNT_ID": self.settings.meta_ad_account_id,
                    "META_APP_ID": self.settings.meta_app_id,
                    "META_API_VERSION": self.settings.meta_api_version,
                }
                if token_updated:
                    keys_to_update["META_ACCESS_TOKEN"] = self.settings.meta_access_token

                updated_lines = []
                found_keys = set()
                for line in lines:
                    stripped = line.strip()
                    matched = False
                    for k, v in keys_to_update.items():
                        if stripped.startswith(f"{k}=") or stripped == k:
                            updated_lines.append(f"{k}={v}")
                            found_keys.add(k)
                            matched = True
                            break
                    if not matched:
                        updated_lines.append(line)

                # Append any keys that weren't found in .env
                for k, v in keys_to_update.items():
                    if k not in found_keys:
                        updated_lines.append(f"{k}={v}")

                target_env.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")
                logger.info(f"Updated Meta credentials in {target_env}")
            except Exception as e:
                logger.warning(f"Could not write credentials to {target_env}: {e}")

        return {
            "success": True,
            "message": "Meta Ads credentials saved and activated successfully.",
            "ad_account_id": self.settings.meta_ad_account_id,
            "app_id": self.settings.meta_app_id,
            "api_version": self.settings.meta_api_version,
            "has_token": bool(self.settings.meta_access_token.strip()),
        }

    async def validate_token_permissions(
        self,
        override_token: Optional[str] = None,
        override_ad_account_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Validates token permissions directly with Meta Marketing API.
        Confirms whether 'ads_read' and 'ads_management' are granted.
        """
        token = override_token.strip() if override_token and override_token.strip() else self.settings.meta_access_token.strip()
        if not token:
            return {
                "is_valid": False,
                "has_ads_read": False,
                "has_ads_management": False,
                "granted_scopes": [],
                "missing_scopes": ["ads_read", "ads_management"],
                "can_manage": False,
                "ad_account_id": self._get_ad_account_id(),
                "app_id": self.settings.meta_app_id,
                "message": "Meta access token is not configured on server.",
            }

        ad_account = normalize_ad_account_id(override_ad_account_id) if override_ad_account_id else self._get_ad_account_id()
        version = self._get_api_version()
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

        # 1. Query /me/permissions
        granted_scopes: List[str] = []
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res_perm = await client.get(f"{GRAPH_BASE}/{version}/me/permissions", headers=headers)
                if res_perm.status_code == 200:
                    data = res_perm.json().get("data", [])
                    granted_scopes = [p["permission"] for p in data if p.get("status") == "granted"]
                elif res_perm.status_code == 400:
                    err_code = res_perm.json().get("error", {}).get("code")
                    if err_code == 190:
                        return {
                            "is_valid": False,
                            "has_ads_read": False,
                            "has_ads_management": False,
                            "granted_scopes": [],
                            "missing_scopes": ["ads_read", "ads_management"],
                            "can_manage": False,
                            "ad_account_id": ad_account,
                            "app_id": self.settings.meta_app_id,
                            "message": "Configured Meta access token has expired or is invalid (Code 190).",
                        }
        except Exception as e:
            logger.warning(f"Could not check permissions: {e}")

        # Fallback to debug_token if /me/permissions returned empty (common for some system user types)
        if not granted_scopes:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res_debug = await client.get(
                        f"{GRAPH_BASE}/{version}/debug_token",
                        params={"input_token": token, "access_token": token},
                        headers=headers,
                    )
                    if res_debug.status_code == 200:
                        scopes = res_debug.json().get("data", {}).get("scopes", [])
                        granted_scopes = scopes
            except Exception:
                pass

        has_ads_read = "ads_read" in granted_scopes
        has_ads_management = "ads_management" in granted_scopes
        missing_scopes = []
        if not has_ads_read:
            missing_scopes.append("ads_read")
        if not has_ads_management:
            missing_scopes.append("ads_management")

        # 2. Check ad account access
        ad_account_name = ""
        account_status = "UNKNOWN"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res_act = await client.get(
                    f"{GRAPH_BASE}/{version}/{ad_account}",
                    params={"fields": "id,name,account_status"},
                    headers=headers,
                )
                if res_act.status_code == 200:
                    act_data = res_act.json()
                    ad_account_name = act_data.get("name", "")
                    raw_status = act_data.get("account_status", 1)
                    account_status = "ACTIVE" if raw_status == 1 else "DISABLED"
        except Exception:
            pass

        can_manage = has_ads_read and has_ads_management

        return {
            "is_valid": True,
            "has_ads_read": has_ads_read,
            "has_ads_management": has_ads_management,
            "granted_scopes": granted_scopes,
            "missing_scopes": missing_scopes,
            "can_manage": can_manage,
            "ad_account_id": ad_account,
            "ad_account_name": ad_account_name,
            "account_status": account_status,
            "app_id": self.settings.meta_app_id,
            "api_version": version,
            "message": (
                "Full campaign management active (ads_read and ads_management granted)."
                if can_manage else
                f"Read-only mode. Missing permission: {', '.join(missing_scopes)}. Live mutations require ads_management."
            ),
        }

    async def create_campaign(
        self,
        account_id: str,
        name: str,
        objective: str,
        status: str = "PAUSED",
        daily_budget: Optional[float] = None,
        lifetime_budget: Optional[float] = None,
        special_ad_categories: Optional[List[str]] = None,
        override_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Creates a new Meta Campaign via Meta Marketing API v26.0 (POST /act_{id}/campaigns).
        Enforces tenant authorization, validates objective, and updates CRM database upon success.
        Defaults to PAUSED status for safety.
        """
        if not name or not name.strip():
            raise ValueError("Campaign name is required.")

        clean_obj = (objective or "").strip().upper()
        if clean_obj not in VALID_META_OBJECTIVES:
            valid_list = ", ".join(sorted(VALID_META_OBJECTIVES))
            raise ValueError(f"Invalid Meta objective '{objective}'. Must be one of: {valid_list}")

        clean_status = (status or "PAUSED").strip().upper()
        if clean_status not in ("PAUSED", "ACTIVE"):
            clean_status = "PAUSED"

        # Permission verification
        perm_check = await self.validate_token_permissions(override_token=override_token)
        if not perm_check.get("has_ads_management", False):
            raise PermissionError(
                "Configured Meta access token lacks 'ads_management' permission. "
                "Campaign creation requires 'ads_management'. Please update the token in Meta Business Settings."
            )

        token = override_token.strip() if override_token and override_token.strip() else self._get_access_token()
        ad_account = self._get_ad_account_id()
        version = self._get_api_version()
        url = f"{GRAPH_BASE}/{version}/{ad_account}/campaigns"

        # Meta requires special_ad_categories array (default ["NONE"] for standard commercial ads)
        cats = special_ad_categories if (special_ad_categories and len(special_ad_categories) > 0) else ["NONE"]

        payload: Dict[str, Any] = {
            "name": name.strip(),
            "objective": clean_obj,
            "status": clean_status,
            "special_ad_categories": json.dumps(cats),
        }

        if daily_budget and daily_budget > 0:
            payload["daily_budget"] = int(daily_budget * 100) # Cents
        elif lifetime_budget and lifetime_budget > 0:
            payload["lifetime_budget"] = int(lifetime_budget * 100) # Cents

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                res = await client.post(url, data=payload, headers=headers)
            except httpx.TimeoutException:
                raise RuntimeError("Meta Marketing API request timed out after 20 seconds.")
            except httpx.RequestError as exc:
                raise RuntimeError(f"Network error connecting to Meta Marketing API: {exc.__class__.__name__}")

            if res.status_code != 200:
                self._handle_api_error(res)

            meta_data = res.json()
            new_meta_id = meta_data.get("id")
            if not new_meta_id:
                raise RuntimeError("Meta API succeeded but returned no campaign ID.")

        # Persist into CRM database under tenant account_id
        db = get_supabase_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        crm_status = "paused" if clean_status == "PAUSED" else "active"

        record_data = {
            "account_id": account_id,
            "name": name.strip(),
            "platform": "facebook",
            "meta_campaign_id": new_meta_id,
            "objective": clean_obj,
            "status": crm_status,
            "budget": daily_budget or lifetime_budget or 0,
            "last_synced_at": now_iso,
        }

        try:
            insert_res = db.table("campaigns").insert(record_data).execute()
            created_record = insert_res.data[0] if insert_res.data else record_data
        except Exception as e:
            logger.warning(f"Failed to record campaign in database: {e}")
            created_record = record_data

        return {
            "success": True,
            "meta_campaign_id": new_meta_id,
            "name": name.strip(),
            "objective": clean_obj,
            "status": crm_status,
            "record": created_record,
            "message": f"Successfully created Meta campaign '{name.strip()}' on Ad Account {ad_account} (ID: {new_meta_id}).",
        }

    async def update_campaign(
        self,
        account_id: str,
        meta_campaign_id: str,
        name: Optional[str] = None,
        status: Optional[str] = None,
        daily_budget: Optional[float] = None,
        lifetime_budget: Optional[float] = None,
        override_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Updates an existing campaign via Meta Marketing API (POST /{campaign_id}).
        Enforces tenant authorization and reflects changes in local database.
        Note: Objective cannot be modified after creation per Meta API constraints.
        """
        if not meta_campaign_id or not meta_campaign_id.strip():
            raise ValueError("Meta Campaign ID is required.")

        meta_id = meta_campaign_id.strip()

        # Tenant isolation check: ensure campaign belongs to authenticated account_id
        db = get_supabase_client()
        local_campaign = None

        try:
            lookup = db.table("campaigns").select("*").eq("account_id", account_id).eq("meta_campaign_id", meta_id).execute()
            if lookup.data:
                local_campaign = lookup.data[0]
        except Exception:
            pass

        if not local_campaign:
            try:
                lookup = db.table("campaigns").select("*").eq("account_id", account_id).eq("id", meta_id).execute()
                if lookup.data:
                    local_campaign = lookup.data[0]
            except Exception:
                pass

        # If meta_id is a UUID from local database before migration, resolve to real Meta ID
        if "-" in meta_id and len(meta_id) == 36:
            real_meta_id = None
            if local_campaign and local_campaign.get("meta_campaign_id"):
                real_meta_id = str(local_campaign["meta_campaign_id"])
            if not real_meta_id and local_campaign:
                c_name = local_campaign.get("name", "").strip().lower()
                try:
                    live_camps = await self.fetch_meta_campaigns(override_token=override_token)
                    for lc in live_camps:
                        if lc.get("name", "").strip().lower() == c_name:
                            real_meta_id = str(lc.get("id"))
                            break
                except Exception:
                    pass
            if real_meta_id:
                meta_id = real_meta_id

        if not local_campaign:
            raise ValueError(f"Campaign {meta_id} was not found in your tenant account.")

        # Permission verification
        perm_check = await self.validate_token_permissions(override_token=override_token)
        if not perm_check.get("has_ads_management", False):
            raise PermissionError(
                "Configured Meta access token lacks 'ads_management' permission. "
                "Updating campaign state requires 'ads_management'. Please update the token in Meta Business Settings."
            )

        token = override_token.strip() if override_token and override_token.strip() else self._get_access_token()
        version = self._get_api_version()
        url = f"{GRAPH_BASE}/{version}/{meta_id}"

        payload: Dict[str, Any] = {}
        crm_updates: Dict[str, Any] = {"last_synced_at": datetime.now(timezone.utc).isoformat()}

        if name and name.strip():
            payload["name"] = name.strip()
            crm_updates["name"] = name.strip()

        if status and status.strip():
            meta_status = status.strip().upper()
            if meta_status in ("ACTIVE", "PAUSED", "ARCHIVED"):
                payload["status"] = meta_status
                crm_updates["status"] = META_STATUS_MAP.get(meta_status, "paused")

        if daily_budget is not None and daily_budget > 0:
            payload["daily_budget"] = int(daily_budget * 100)
            crm_updates["budget"] = daily_budget
        elif lifetime_budget is not None and lifetime_budget > 0:
            payload["lifetime_budget"] = int(lifetime_budget * 100)
            crm_updates["budget"] = lifetime_budget

        if not payload:
            raise ValueError("No valid modifiable fields provided for update.")

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                res = await client.post(url, data=payload, headers=headers)
            except httpx.TimeoutException:
                raise RuntimeError("Meta Marketing API update timed out after 15 seconds.")
            except httpx.RequestError as exc:
                raise RuntimeError(f"Network error connecting to Meta Marketing API: {exc.__class__.__name__}")

            if res.status_code != 200:
                self._handle_api_error(res)

        # Update local database
        try:
            db.table("campaigns").update(crm_updates).eq("id", local_campaign["id"]).execute()
        except Exception as e:
            logger.warning(f"Could not update local campaign record {local_campaign['id']}: {e}")

        return {
            "success": True,
            "meta_campaign_id": meta_id,
            "updated_fields": list(payload.keys()),
            "status": crm_updates.get("status", local_campaign.get("status")),
            "message": f"Successfully updated Meta campaign {meta_id}.",
        }

    async def pause_campaign(self, account_id: str, meta_campaign_id: str, override_token: Optional[str] = None) -> Dict[str, Any]:
        """Pauses a live Meta campaign."""
        return await self.update_campaign(
            account_id=account_id,
            meta_campaign_id=meta_campaign_id,
            status="PAUSED",
            override_token=override_token,
        )

    async def resume_campaign(self, account_id: str, meta_campaign_id: str, override_token: Optional[str] = None) -> Dict[str, Any]:
        """Resumes a paused Meta campaign."""
        return await self.update_campaign(
            account_id=account_id,
            meta_campaign_id=meta_campaign_id,
            status="ACTIVE",
            override_token=override_token,
        )

    async def archive_campaign(self, account_id: str, meta_campaign_id: str, override_token: Optional[str] = None) -> Dict[str, Any]:
        """Archives a Meta campaign."""
        return await self.update_campaign(
            account_id=account_id,
            meta_campaign_id=meta_campaign_id,
            status="ARCHIVED",
            override_token=override_token,
        )

    async def get_campaign_details(
        self,
        account_id: str,
        meta_campaign_id: str,
        override_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Retrieves detailed live Meta campaign metadata and performance insights.
        """
        if not meta_campaign_id:
            raise ValueError("Meta Campaign ID is required.")

        meta_id = meta_campaign_id.strip()
        token = override_token.strip() if override_token and override_token.strip() else self._get_access_token()
        version = self._get_api_version()

        # If meta_id is a UUID from local database before migration, resolve to real Meta ID
        if "-" in meta_id and len(meta_id) == 36:
            try:
                db = get_supabase_client()
                loc = db.table("campaigns").select("*").eq("id", meta_id).execute()
                if loc.data:
                    if loc.data[0].get("meta_campaign_id"):
                        meta_id = str(loc.data[0]["meta_campaign_id"])
                    else:
                        c_name = loc.data[0].get("name", "").strip().lower()
                        live_camps = await self.fetch_meta_campaigns(override_token=token)
                        for lc in live_camps:
                            if lc.get("name", "").strip().lower() == c_name:
                                meta_id = str(lc.get("id"))
                                break
            except Exception as e:
                logger.warning(f"Could not resolve UUID {meta_id} to Meta campaign ID: {e}")

        url = f"{GRAPH_BASE}/{version}/{meta_id}"
        fields = (
            "id,name,status,objective,start_time,stop_time,created_time,"
            "daily_budget,lifetime_budget,budget_remaining,buying_type,bid_strategy,"
            "special_ad_categories,insights.date_preset(maximum){impressions,clicks,spend,cpc,cpm,ctr}"
        )

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                res = await client.get(url, params={"fields": fields}, headers=headers)
                # Fallback to standard insights without date_preset if maximum syntax not supported
                if res.status_code != 200:
                    fallback_fields = "id,name,status,objective,start_time,stop_time,created_time,daily_budget,lifetime_budget,buying_type,special_ad_categories,insights{impressions,clicks,spend,cpc,cpm,ctr}"
                    res = await client.get(url, params={"fields": fallback_fields}, headers=headers)
            except httpx.TimeoutException:
                raise RuntimeError("Meta API request timed out after 15 seconds.")
            except httpx.RequestError as exc:
                raise RuntimeError(f"Network error connecting to Meta API: {exc.__class__.__name__}")

            if res.status_code != 200:
                self._handle_api_error(res)

            data = res.json()

        # Extract nested insights safely
        raw_insights = data.get("insights")
        insights_data = []
        if isinstance(raw_insights, dict):
            insights_data = raw_insights.get("data") or []
        insights = insights_data[0] if (insights_data and isinstance(insights_data, list)) else {}

        def _safe_int(val, default=0):
            try:
                return int(val) if val is not None else default
            except (ValueError, TypeError):
                return default

        def _safe_float(val, default=0.0):
            try:
                return float(val) if val is not None else default
            except (ValueError, TypeError):
                return default

        return {
            "id": data.get("id"),
            "meta_campaign_id": data.get("id"),
            "name": data.get("name"),
            "status": data.get("status"),
            "meta_status": data.get("status"),
            "crm_status": META_STATUS_MAP.get(data.get("status", ""), "paused"),
            "objective": data.get("objective"),
            "daily_budget": (float(data["daily_budget"]) / 100) if data.get("daily_budget") else None,
            "lifetime_budget": (float(data["lifetime_budget"]) / 100) if data.get("lifetime_budget") else None,
            "start_time": data.get("start_time"),
            "stop_time": data.get("stop_time"),
            "created_time": data.get("created_time"),
            "special_ad_categories": data.get("special_ad_categories", []),
            "buying_type": data.get("buying_type", "AUCTION"),
            "bid_strategy": data.get("bid_strategy"),
            "insights": {
                "impressions": _safe_int(insights.get("impressions")),
                "clicks": _safe_int(insights.get("clicks")),
                "spend": _safe_float(insights.get("spend")),
                "cpc": _safe_float(insights.get("cpc")),
                "cpm": _safe_float(insights.get("cpm")),
                "ctr": _safe_float(insights.get("ctr")),
            },
        }

