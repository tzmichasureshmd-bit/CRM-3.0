"""
Broadcast Service - CRM 3.0
Handles bulk messaging (Send All), individual sending, recipient resolution,
rate-limited batch processing, idempotency, and retry-failed workflows across:
- WhatsApp (Meta Cloud API)
- Instagram (Meta Graph API)
- Facebook Messenger (Meta Graph API)
- Email (SMTP via EmailService)
"""

import asyncio
import re
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Tuple
import httpx

from app.core.config import get_settings
from app.db.supabase import get_supabase_client
from app.services.email_service import get_email_service

logger = logging.getLogger("crm.broadcast_service")

# In-memory execution store for per-recipient audit logs and retry isolation
# Key: broadcast_id -> Dict of execution data
_BROADCAST_RESULTS_CACHE: Dict[str, Dict[str, Any]] = {}
# NOTE: _ACTIVE_BROADCAST_LOCKS is kept for same-process dedup only.
# Cross-process / post-restart dedup is handled by DB status check in send_all.
_ACTIVE_BROADCAST_LOCKS: set = set()


class BroadcastService:
    def __init__(self):
        self.settings = get_settings()

    # ─────────────────────────────────────────────────────────────
    # RECIPIENT RESOLUTION & VALIDATION
    # ─────────────────────────────────────────────────────────────
    def get_recipients_for_channel(
        self,
        account_id: str,
        platform: str,
        segment_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Retrieves contacts strictly partitioned by account_id (tenant isolation).
        Categorizes contacts into eligible, skipped_opt_out, and skipped_invalid_destination.
        """
        db = get_supabase_client()
        query = (
            db.table("contacts")
            .select("id, name, phone, email, instagram_user_id, opt_out, account_id, custom_fields")
            .eq("account_id", account_id)
        )

        res = query.execute()
        contacts = res.data or []

        eligible: List[Dict[str, Any]] = []
        skipped_opt_out: List[Dict[str, Any]] = []
        skipped_no_address: List[Dict[str, Any]] = []

        norm_platform = (platform or "whatsapp").lower().strip()

        for c in contacts:
            # 1. Opt-out safety check: Never send to opted-out contacts
            if c.get("opt_out") is True:
                skipped_opt_out.append({
                    "contact_id": c["id"],
                    "name": c.get("name") or "Unknown",
                    "reason": "Recipient opted out of marketing communications",
                })
                continue

            # 2. Channel destination validation
            dest, is_valid, err_reason = self._extract_destination(c, norm_platform)
            if not is_valid or not dest:
                skipped_no_address.append({
                    "contact_id": c["id"],
                    "name": c.get("name") or "Unknown",
                    "reason": err_reason or f"Missing or invalid {norm_platform} address",
                })
                continue

            eligible.append({
                "contact_id": c["id"],
                "name": c.get("name") or "Contact",
                "destination": dest,
            })

        return {
            "platform": norm_platform,
            "total_contacts": len(contacts),
            "eligible_count": len(eligible),
            "skipped_opt_out_count": len(skipped_opt_out),
            "skipped_no_address_count": len(skipped_no_address),
            "eligible": eligible,
            "skipped_opt_out": skipped_opt_out,
            "skipped_no_address": skipped_no_address,
        }

    def _extract_destination(self, contact: Dict[str, Any], platform: str) -> Tuple[Optional[str], bool, Optional[str]]:
        """Validates and extracts channel-specific destination address."""
        if platform == "whatsapp":
            raw_phone = contact.get("phone") or ""
            # Strip spaces, dashes, parentheses
            clean_phone = re.sub(r"[^\d+]", "", raw_phone.strip())
            if not clean_phone:
                return None, False, "No phone number configured"
            # Basic length validation (international phone)
            digits_only = re.sub(r"\D", "", clean_phone)
            if len(digits_only) < 7 or len(digits_only) > 15:
                return clean_phone, False, f"Invalid phone length ({len(digits_only)} digits)"
            return clean_phone, True, None

        elif platform == "email":
            raw_email = (contact.get("email") or "").strip()
            if not raw_email:
                return None, False, "No email address configured"
            email_regex = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
            if not re.match(email_regex, raw_email):
                return raw_email, False, "Malformed email address"
            return raw_email, True, None

        elif platform == "instagram":
            custom = contact.get("custom_fields") or {}
            ig_id = (
                contact.get("instagram_user_id")
                or (custom.get("instagram_user_id") if isinstance(custom, dict) else None)
                or contact.get("platform_id")
                or ""
            ).strip()
            if not ig_id:
                return None, False, "No Instagram User ID configured"
            return ig_id, True, None

        elif platform == "facebook":
            custom = contact.get("custom_fields") or {}
            fb_id = (
                (custom.get("facebook_id") if isinstance(custom, dict) else None)
                or (custom.get("fb_id") if isinstance(custom, dict) else None)
                or contact.get("platform_id")
                or contact.get("id")
                or ""
            ).strip()
            if not fb_id:
                return None, False, "No Facebook recipient ID configured"
            return fb_id, True, None

        else:
            return None, False, f"Unsupported channel: {platform}"

    # ─────────────────────────────────────────────────────────────
    # SINGLE MESSAGE DISPATCH (Reuses Existing Channel Integrations)
    # ─────────────────────────────────────────────────────────────
    async def send_single_message(
        self,
        platform: str,
        destination: str,
        text: str,
        subject: Optional[str] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Sends an individual message over the specified channel using the official providers.
        Captures provider acceptance/submission safely without falsely reporting delivered.
        """
        norm_platform = (platform or "whatsapp").lower().strip()

        # ── 1. EMAIL (SMTP via EmailService) ──
        if norm_platform == "email":
            email_svc = get_email_service()
            if not email_svc.smtp_user:
                return {
                    "success": False,
                    "status": "failed",
                    "error": "Email SMTP not configured. Set EMAIL_SMTP_* in backend/.env",
                }
            sub = subject or "CRM 3.0 Broadcast"
            res = await email_svc.send_email(
                to=destination,
                subject=sub,
                body=text,
                attachments=attachments,
            )
            if res.get("status") == "sent":
                return {
                    "success": True,
                    "status": "submitted",
                    "provider_message_id": res.get("message_id"),
                    "provider": "smtp",
                }
            else:
                return {
                    "success": False,
                    "status": "failed",
                    "error": res.get("error") or "SMTP dispatch failed",
                    "provider": "smtp",
                }

        # ── 2. WHATSAPP (Meta Cloud API v19.0) ──
        elif norm_platform == "whatsapp":
            phone_id = self.settings.whatsapp_phone_number_id
            token = self.settings.whatsapp_access_token
            if not phone_id or not token:
                return {
                    "success": False,
                    "status": "failed",
                    "error": "WhatsApp credentials not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)",
                }

            url = f"https://graph.facebook.com/v19.0/{phone_id}/messages"
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": destination,
                "type": "text",
                "text": {"body": text},
            }
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(url, json=payload, headers=headers)
                    if resp.status_code in (200, 201):
                        resp_data = resp.json()
                        msg_id = resp_data.get("messages", [{}])[0].get("id")
                        return {
                            "success": True,
                            "status": "submitted",
                            "provider_message_id": msg_id,
                            "provider": "meta_whatsapp",
                        }
                    else:
                        err_text = self._parse_meta_error(resp)
                        return {
                            "success": False,
                            "status": "failed",
                            "error": err_text,
                            "provider": "meta_whatsapp",
                        }
            except Exception as e:
                return {
                    "success": False,
                    "status": "failed",
                    "error": f"WhatsApp network error: {str(e)}",
                    "provider": "meta_whatsapp",
                }

        # ── 3. INSTAGRAM (Meta Graph API v19.0) ──
        elif norm_platform == "instagram":
            page_id = self.settings.instagram_page_id
            token = self.settings.facebook_page_access_token
            if not page_id or not token:
                return {
                    "success": False,
                    "status": "failed",
                    "error": "Instagram credentials not configured (INSTAGRAM_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN)",
                }

            url = f"https://graph.facebook.com/v19.0/{page_id}/messages"
            payload = {
                "recipient": {"id": destination},
                "message": {"text": text},
            }
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(url, json=payload, headers=headers)
                    if resp.status_code in (200, 201):
                        resp_data = resp.json()
                        msg_id = resp_data.get("message_id")
                        return {
                            "success": True,
                            "status": "submitted",
                            "provider_message_id": msg_id,
                            "provider": "meta_instagram",
                        }
                    else:
                        err_text = self._parse_meta_error(resp)
                        return {
                            "success": False,
                            "status": "failed",
                            "error": err_text,
                            "provider": "meta_instagram",
                        }
            except Exception as e:
                return {
                    "success": False,
                    "status": "failed",
                    "error": f"Instagram network error: {str(e)}",
                    "provider": "meta_instagram",
                }

        # ── 4. FACEBOOK MESSENGER (Meta Graph API v19.0) ──
        elif norm_platform == "facebook":
            page_id = self.settings.facebook_page_id
            token = self.settings.facebook_page_access_token
            if not page_id or not token:
                return {
                    "success": False,
                    "status": "failed",
                    "error": "Facebook credentials not configured (FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN)",
                }

            url = f"https://graph.facebook.com/v19.0/{page_id}/messages"
            payload = {
                "recipient": {"id": destination},
                "message": {"text": text},
            }
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(url, json=payload, headers=headers)
                    if resp.status_code in (200, 201):
                        resp_data = resp.json()
                        msg_id = resp_data.get("message_id")
                        return {
                            "success": True,
                            "status": "submitted",
                            "provider_message_id": msg_id,
                            "provider": "meta_facebook",
                        }
                    else:
                        err_text = self._parse_meta_error(resp)
                        return {
                            "success": False,
                            "status": "failed",
                            "error": err_text,
                            "provider": "meta_facebook",
                        }
            except Exception as e:
                return {
                    "success": False,
                    "status": "failed",
                    "error": f"Facebook network error: {str(e)}",
                    "provider": "meta_facebook",
                }

        else:
            return {"success": False, "status": "failed", "error": f"Unsupported channel: {platform}"}

    def _parse_meta_error(self, resp: httpx.Response) -> str:
        """Parses Meta Graph API error body safely without exposing secrets."""
        try:
            err_json = resp.json().get("error", {})
            msg = err_json.get("message", resp.text)
            code = err_json.get("code")
            subcode = err_json.get("error_subcode")
            if code == 551 or subcode == 2534018:
                return "Meta 24-hour customer messaging window expired. Contact must initiate message."
            if code == 190:
                return "Meta access token has expired or is invalid. Please refresh token."
            if code == 4 or code == 17:
                return "Meta API rate limit reached. Please wait and retry."
            return f"Meta Error ({code}): {msg}"
        except Exception:
            return f"Provider error (HTTP {resp.status_code})"

    # ─────────────────────────────────────────────────────────────
    # BULK SEND ALL WORKFLOW
    # ─────────────────────────────────────────────────────────────
    async def send_all(
        self,
        broadcast_id: str,
        account_id: str,
        batch_size: int = 20,
        delay_ms: int = 50,
        selected_contact_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Executes Send All to all eligible recipients under tenant isolation.
        Processes recipients in controlled batches with rate limiting, server-side locking,
        and per-recipient result tracking for retry safety.
        If selected_contact_ids is provided, sends only to those selected eligible contacts.
        """
        # Same-process concurrency guard
        lock_key = f"{account_id}:{broadcast_id}"
        if lock_key in _ACTIVE_BROADCAST_LOCKS:
            raise ValueError(f"Broadcast {broadcast_id} is currently sending. Duplicate request rejected.")

        _ACTIVE_BROADCAST_LOCKS.add(lock_key)
        db = get_supabase_client()

        try:
            # 1. Look up broadcast under tenant account_id
            b_lookup = (
                db.table("broadcasts")
                .select("*")
                .eq("id", broadcast_id)
                .eq("account_id", account_id)
                .execute()
            )
            # Fallback to campaigns table if stored there
            if not b_lookup.data:
                b_lookup = (
                    db.table("campaigns")
                    .select("*")
                    .eq("id", broadcast_id)
                    .eq("account_id", account_id)
                    .execute()
                )

            if not b_lookup.data:
                raise ValueError(f"Broadcast {broadcast_id} not found in tenant account")

            broadcast = b_lookup.data[0]

            # DB-level duplicate-send guard: reject if already sending (survives restarts)
            if broadcast.get("status") == "sending":
                raise ValueError(
                    f"Broadcast {broadcast_id} is already in 'sending' state. "
                    "If a previous run crashed, reset status to 'draft' before retrying."
                )
            platform = broadcast.get("platform") or "whatsapp"
            message = broadcast.get("message") or ""
            subject = broadcast.get("name") or "CRM 3.0 Broadcast"

            if not str(message or "").strip():
                raise ValueError("Cannot send broadcast with empty message")

            # 2. Transition broadcast status to 'sending'
            self._update_broadcast_status(db, broadcast_id, "sending")

            # 3. Retrieve recipients partitioned by tenant
            recipient_data = self.get_recipients_for_channel(
                account_id=account_id,
                platform=platform,
                segment_id=broadcast.get("segment_id"),
            )

            eligible = recipient_data["eligible"]
            if selected_contact_ids is not None:
                selected_set = set(selected_contact_ids)
                eligible = [c for c in eligible if c["contact_id"] in selected_set]

            skipped_opt_out = recipient_data["skipped_opt_out"]
            skipped_no_address = recipient_data["skipped_no_address"]

            results: List[Dict[str, Any]] = []

            # Mark skipped contacts in the execution record
            for s in skipped_opt_out:
                results.append({
                    "contact_id": s["contact_id"],
                    "name": s["name"],
                    "destination": None,
                    "status": "skipped",
                    "reason": s["reason"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            for s in skipped_no_address:
                results.append({
                    "contact_id": s["contact_id"],
                    "name": s["name"],
                    "destination": None,
                    "status": "skipped",
                    "reason": s["reason"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            sent_count = 0
            failed_count = 0

            # 4. Controlled Batch Processing with Rate Limiting
            batch_chunk_size = max(1, min(batch_size, 50))
            sleep_duration = max(0.01, delay_ms / 1000.0)

            for i in range(0, len(eligible), batch_chunk_size):
                batch = eligible[i : i + batch_chunk_size]
                
                # Process batch concurrently with asyncio.gather
                tasks = [
                    self.send_single_message(
                        platform=platform,
                        destination=item["destination"],
                        text=message,
                        subject=subject,
                    )
                    for item in batch
                ]
                batch_responses = await asyncio.gather(*tasks, return_exceptions=True)

                for item, resp in zip(batch, batch_responses):
                    if isinstance(resp, Exception):
                        failed_count += 1
                        results.append({
                            "contact_id": item["contact_id"],
                            "name": item["name"],
                            "destination": item["destination"],
                            "status": "failed",
                            "error": str(resp),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                    elif resp.get("success"):
                        sent_count += 1
                        results.append({
                            "contact_id": item["contact_id"],
                            "name": item["name"],
                            "destination": item["destination"],
                            "status": "sent",
                            "provider_message_id": resp.get("provider_message_id"),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                    else:
                        failed_count += 1
                        results.append({
                            "contact_id": item["contact_id"],
                            "name": item["name"],
                            "destination": item["destination"],
                            "status": "failed",
                            "error": resp.get("error") or "Provider dispatch error",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

                # Respect channel rate limits between batches
                if i + batch_chunk_size < len(eligible):
                    await asyncio.sleep(sleep_duration)

            # 5. Final state determination
            if sent_count > 0 and failed_count == 0:
                final_status = "sent"
            elif sent_count > 0 and failed_count > 0:
                final_status = "partial"  # partial success
            elif sent_count == 0 and failed_count > 0:
                final_status = "failed"
            else:
                final_status = "sent" if len(eligible) == 0 else "draft"

            total_recipients = len(eligible) + len(skipped_opt_out) + len(skipped_no_address)
            now_iso = datetime.now(timezone.utc).isoformat()

            # 6. Update broadcast counters in database
            self._update_broadcast_counts(
                db=db,
                broadcast_id=broadcast_id,
                status=final_status,
                total_recipients=total_recipients,
                sent_count=sent_count,
                failed_count=failed_count,
                sent_at=now_iso,
            )

            # 7. Store detailed execution audit in cache for retry & review
            summary = {
                "broadcast_id": broadcast_id,
                "account_id": account_id,
                "platform": platform,
                "status": final_status,
                "total_recipients": total_recipients,
                "eligible_count": len(eligible),
                "sent_count": sent_count,
                "failed_count": failed_count,
                "skipped_count": len(skipped_opt_out) + len(skipped_no_address),
                "completed_at": now_iso,
                "results": results,
            }
            _BROADCAST_RESULTS_CACHE[broadcast_id] = summary
            return summary

        finally:
            _ACTIVE_BROADCAST_LOCKS.discard(lock_key)

    # ─────────────────────────────────────────────────────────────
    # RETRY FAILED ONLY WORKFLOW
    # ─────────────────────────────────────────────────────────────
    async def retry_failed(
        self,
        broadcast_id: str,
        account_id: str,
        batch_size: int = 20,
        delay_ms: int = 50,
    ) -> Dict[str, Any]:
        """
        Retries ONLY recipients that failed during the previous broadcast execution.
        Safely avoids duplicate sends to contacts whose messages were already sent.
        """
        lock_key = f"{account_id}:{broadcast_id}"
        if lock_key in _ACTIVE_BROADCAST_LOCKS:
            raise ValueError(f"Broadcast {broadcast_id} is currently busy. Duplicate retry rejected.")

        _ACTIVE_BROADCAST_LOCKS.add(lock_key)
        db = get_supabase_client()

        try:
            # 1. Retrieve cached or recorded results
            exec_record = _BROADCAST_RESULTS_CACHE.get(broadcast_id)
            if not exec_record or not exec_record.get("results"):
                # If cache is empty, reconstruct from database or report
                raise ValueError("No previous failure records found for this broadcast to retry.")

            failed_entries = [r for r in exec_record["results"] if r.get("status") == "failed"]
            if not failed_entries:
                return {
                    "broadcast_id": broadcast_id,
                    "retried_count": 0,
                    "newly_sent": 0,
                    "still_failed": 0,
                    "message": "No failed recipients found to retry. All recipients were already sent or skipped.",
                }

            b_lookup = db.table("broadcasts").select("*").eq("id", broadcast_id).eq("account_id", account_id).execute()
            if not b_lookup.data:
                b_lookup = db.table("campaigns").select("*").eq("id", broadcast_id).eq("account_id", account_id).execute()

            broadcast = b_lookup.data[0] if b_lookup.data else {}
            platform = broadcast.get("platform") or exec_record.get("platform") or "whatsapp"
            message = broadcast.get("message") or ""
            subject = broadcast.get("name") or "CRM 3.0 Broadcast"

            newly_sent = 0
            still_failed = 0
            sleep_duration = max(0.01, delay_ms / 1000.0)

            # 2. Retry only the failed recipients
            for i in range(0, len(failed_entries), batch_size):
                batch = failed_entries[i : i + batch_size]
                tasks = [
                    self.send_single_message(
                        platform=platform,
                        destination=item["destination"],
                        text=message,
                        subject=subject,
                    )
                    for item in batch
                ]
                batch_responses = await asyncio.gather(*tasks, return_exceptions=True)

                for item, resp in zip(batch, batch_responses):
                    if isinstance(resp, Exception) or not resp.get("success"):
                        still_failed += 1
                        item["error"] = str(resp) if isinstance(resp, Exception) else resp.get("error")
                        item["timestamp"] = datetime.now(timezone.utc).isoformat()
                    else:
                        newly_sent += 1
                        item["status"] = "sent"
                        item["error"] = None
                        item["provider_message_id"] = resp.get("provider_message_id")
                        item["timestamp"] = datetime.now(timezone.utc).isoformat()

                if i + batch_size < len(failed_entries):
                    await asyncio.sleep(sleep_duration)

            # 3. Update database counts
            current_sent = exec_record.get("sent_count", 0) + newly_sent
            current_failed = still_failed
            final_status = "sent" if still_failed == 0 else "partial"

            self._update_broadcast_counts(
                db=db,
                broadcast_id=broadcast_id,
                status=final_status,
                total_recipients=exec_record.get("total_recipients", 0),
                sent_count=current_sent,
                failed_count=current_failed,
                sent_at=datetime.now(timezone.utc).isoformat(),
            )

            exec_record["sent_count"] = current_sent
            exec_record["failed_count"] = current_failed
            exec_record["status"] = final_status

            return {
                "broadcast_id": broadcast_id,
                "retried_count": len(failed_entries),
                "newly_sent": newly_sent,
                "still_failed": still_failed,
                "summary": exec_record,
                "message": f"Retried {len(failed_entries)} failed recipients: {newly_sent} succeeded, {still_failed} still failed.",
            }

        finally:
            _ACTIVE_BROADCAST_LOCKS.discard(lock_key)

    def get_results_summary(self, broadcast_id: str, account_id: str) -> Dict[str, Any]:
        """Returns the latest execution report and per-recipient status breakdown."""
        cached = _BROADCAST_RESULTS_CACHE.get(broadcast_id)
        if cached:
            return cached

        # Reconstruct base summary from database row
        db = get_supabase_client()
        res = db.table("broadcasts").select("*").eq("id", broadcast_id).eq("account_id", account_id).execute()
        if not res.data:
            res = db.table("campaigns").select("*").eq("id", broadcast_id).eq("account_id", account_id).execute()

        if not res.data:
            raise ValueError("Broadcast not found")

        b = res.data[0]
        return {
            "broadcast_id": broadcast_id,
            "account_id": account_id,
            "platform": b.get("platform"),
            "status": b.get("status"),
            "total_recipients": b.get("total_recipients", 0),
            "sent_count": b.get("sent_count", 0),
            "failed_count": b.get("failed_count", 0),
            "skipped_count": 0,
            "completed_at": b.get("sent_at") or b.get("updated_at"),
            "results": [],
        }

    async def send_individual(
        self,
        account_id: str,
        contact_id: str,
        platform: str,
        message: str,
        broadcast_id: Optional[str] = None,
        subject: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Sends an individual message to a specific contact, adhering to opt-out rules,
        recording the execution against the broadcast (if provided), and updating counters.
        """
        db = get_supabase_client()
        # 1. Fetch contact with tenant isolation
        c_res = db.table("contacts").select("*").eq("id", contact_id).eq("account_id", account_id).execute()
        if not c_res.data:
            raise ValueError(f"Contact {contact_id} not found in tenant account")
        contact = c_res.data[0]

        # 2. Check opt-out
        if contact.get("opt_out") is True:
            return {
                "success": False,
                "status": "skipped",
                "error": "Contact has opted out of marketing communications",
                "contact_id": contact_id,
            }

        # 3. Validate destination
        dest, is_valid, err_reason = self._extract_destination(contact, platform)
        if not is_valid or not dest:
            return {
                "success": False,
                "status": "failed",
                "error": err_reason or f"Invalid destination address for channel {platform}",
                "contact_id": contact_id,
            }

        # 4. Dispatch
        resp = await self.send_single_message(
            platform=platform,
            destination=dest,
            text=message,
            subject=subject,
        )

        # 5. If associated with a broadcast, update stats and log
        if broadcast_id:
            try:
                b_res = db.table("broadcasts").select("sent_count, total_recipients, failed_count").eq("id", broadcast_id).execute()
                if b_res.data:
                    b_data = b_res.data[0]
                    cur_sent = (b_data.get("sent_count") or 0) + (1 if resp.get("success") else 0)
                    cur_failed = (b_data.get("failed_count") or 0) + (0 if resp.get("success") else 1)
                    cur_total = max((b_data.get("total_recipients") or 0), cur_sent + cur_failed)
                    db.table("broadcasts").update({
                        "sent_count": cur_sent,
                        "failed_count": cur_failed,
                        "total_recipients": cur_total,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id", broadcast_id).execute()
            except Exception as e:
                logger.warning(f"Could not update broadcast counts after individual send: {e}")

        return {
            "success": resp.get("success", False),
            "status": "sent" if resp.get("success") else "failed",
            "provider_message_id": resp.get("provider_message_id"),
            "error": resp.get("error"),
            "contact_id": contact_id,
            "destination": dest,
            "platform": platform,
        }

    # ─────────────────────────────────────────────────────────────
    # DATABASE HELPERS
    # ─────────────────────────────────────────────────────────────
    def _update_broadcast_status(self, db, broadcast_id: str, status: str):
        try:
            db.table("broadcasts").update({"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", broadcast_id).execute()
        except Exception:
            try:
                db.table("campaigns").update({"status": status}).eq("id", broadcast_id).execute()
            except Exception:
                pass

    def _update_broadcast_counts(
        self,
        db,
        broadcast_id: str,
        status: str,
        total_recipients: int,
        sent_count: int,
        failed_count: int,
        sent_at: str,
    ):
        update_data = {
            "status": status,
            "total_recipients": total_recipients,
            "sent_count": sent_count,
            "failed_count": failed_count,
            "sent_at": sent_at,
            "updated_at": sent_at,
        }
        try:
            db.table("broadcasts").update(update_data).eq("id", broadcast_id).execute()
        except Exception:
            try:
                # Campaigns table might not have all columns
                db.table("campaigns").update({"status": status}).eq("id", broadcast_id).execute()
            except Exception:
                pass


_broadcast_service_instance: Optional[BroadcastService] = None


def get_broadcast_service() -> BroadcastService:
    global _broadcast_service_instance
    if _broadcast_service_instance is None:
        _broadcast_service_instance = BroadcastService()
    return _broadcast_service_instance
