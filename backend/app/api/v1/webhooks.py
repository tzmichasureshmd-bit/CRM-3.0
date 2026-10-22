import hmac
import hashlib
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Query
from app.core.config import get_settings
from app.db.supabase import get_supabase

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


# ── Tenant routing ────────────────────────────────────────────

def _get_account_id_for_platform(platform: str) -> "str | None":
    """
    Resolve account_id by looking up the platform-specific integration key.
    Returns None if no matching integration is found.
    Never falls back to the first row in the table.
    """
    PLATFORM_KEY_MAP = {
        "whatsapp":  "WHATSAPP_PHONE_NUMBER_ID",
        "instagram": "INSTAGRAM_PAGE_ID",
        "facebook":  "FACEBOOK_PAGE_ID",
        "telegram":  "TELEGRAM_BOT_TOKEN",
        "email":     "EMAIL_SMTP_USER",
    }
    key = PLATFORM_KEY_MAP.get(platform)
    if not key:
        logger.warning("_get_account_id_for_platform: unknown platform '%s' — rejecting", platform)
        return None
    try:
        supabase = get_supabase()
        res = (
            supabase.table("account_settings")
            .select("account_id")
            .eq("key", key)
            .neq("value", "")
            .limit(2)
            .execute()
        )
        rows = res.data or []
        if len(rows) == 1:
            return rows[0]["account_id"]
        if len(rows) > 1:
            logger.error(
                "_get_account_id_for_platform: ambiguous — multiple accounts have %s configured. "
                "Cannot safely route webhook for platform '%s'. Rejecting.",
                key, platform,
            )
            return None
        logger.warning(
            "_get_account_id_for_platform: no account has %s configured for platform '%s'. Rejecting.",
            key, platform,
        )
        return None
    except Exception as exc:
        logger.error("_get_account_id_for_platform: DB error for platform '%s': %s", platform, exc)
        return None


def _get_account_id_for_page(page_id: str) -> "str | None":
    """
    Resolve account_id by matching a Facebook/Instagram Page ID stored in account_settings.
    Used by Lead Ads webhook where the page_id is the routing key.
    """
    if not page_id:
        return None
    try:
        supabase = get_supabase()
        res = (
            supabase.table("account_settings")
            .select("account_id")
            .in_("key", ["FACEBOOK_PAGE_ID", "INSTAGRAM_PAGE_ID"])
            .eq("value", page_id)
            .limit(2)
            .execute()
        )
        rows = res.data or []
        if len(rows) == 1:
            return rows[0]["account_id"]
        if len(rows) > 1:
            logger.error(
                "_get_account_id_for_page: ambiguous — multiple accounts share page_id '%s'. Rejecting.",
                page_id,
            )
            return None
        logger.warning("_get_account_id_for_page: no account found for page_id '%s'.", page_id)
        return None
    except Exception as exc:
        logger.error("_get_account_id_for_page: DB error for page_id '%s': %s", page_id, exc)
        return None


# ── DM inbox upsert ───────────────────────────────────────────

async def _upsert_dm_to_inbox(
    platform: str, sender_id: str, sender_name: str, message_text: str, external_msg_id: str
):
    """Find-or-create contact → conversation → message for an incoming DM."""
    supabase = get_supabase()
    account_id = _get_account_id_for_platform(platform)
    now = datetime.now(timezone.utc).isoformat()

    if not account_id:
        logger.warning(
            "_upsert_dm_to_inbox: no account resolved for platform '%s' — dropping event", platform
        )
        return

    contact_res = (
        supabase.table("contacts")
        .select("id, account_id")
        .eq("external_id", sender_id)
        .limit(1)
        .execute()
    )
    if contact_res.data:
        contact = contact_res.data[0]
    else:
        contact_res = supabase.table("contacts").insert({
            "account_id": account_id,
            "name": sender_name or sender_id,
            "source": platform,
            "external_id": sender_id,
        }).execute()
        contact = contact_res.data[0]

    conv_res = (
        supabase.table("conversations")
        .select("id")
        .eq("contact_id", contact["id"])
        .eq("platform", platform)
        .eq("status", "open")
        .limit(1)
        .execute()
    )
    if conv_res.data:
        conv_id = conv_res.data[0]["id"]
        try:
            supabase.table("conversations").update({
                "last_message_at": now,
                "last_message_text": message_text[:200],
            }).eq("id", conv_id).execute()
        except Exception:
            pass
    else:
        conv_res = supabase.table("conversations").insert({
            "account_id": account_id,
            "contact_id": contact["id"],
            "platform": platform,
            "status": "open",
            "priority": "normal",
            "last_message_at": now,
            "last_message_text": message_text[:200],
            "unread_count": 1,
        }).execute()
        conv_id = conv_res.data[0]["id"]

    if external_msg_id:
        dup = (
            supabase.table("messages")
            .select("id")
            .eq("external_id", external_msg_id)
            .limit(1)
            .execute()
        )
        if dup.data:
            return

    supabase.table("messages").insert({
        "account_id": account_id,
        "conversation_id": conv_id,
        "content": message_text,
        "sender_type": "contact",
        "status": "sent",
        "external_id": external_msg_id or None,
        "created_at": now,
    }).execute()


# ── Meta Lead Ads upsert ──────────────────────────────────────

def _upsert_lead_ads_contact(
    account_id: str,
    form_id: str,
    lead_id: str,
    campaign_id: "str | None",
    fields: dict,
) -> "str | None":
    """
    Idempotently create or update a contact from a Meta Lead Ads submission.
    Returns the contact_id or None on failure.

    Deduplication: checks external_id = lead_id first, then email.
    Never creates a duplicate contact for the same lead_id.
    """
    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    # Normalise field names from Meta's leadgen form (varies by form config)
    name = (
        fields.get("full_name")
        or f"{fields.get('first_name', '')} {fields.get('last_name', '')}".strip()
        or fields.get("name")
        or ""
    )
    email = fields.get("email") or fields.get("email_address") or ""
    phone = fields.get("phone_number") or fields.get("phone") or ""

    # 1. Dedup by lead_id (external_id)
    existing = (
        supabase.table("contacts")
        .select("id")
        .eq("account_id", account_id)
        .eq("external_id", lead_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        logger.info("Lead Ads: duplicate lead_id '%s' — skipping insert", lead_id)
        return existing.data[0]["id"]

    # 2. Dedup by email within the same account
    if email:
        email_check = (
            supabase.table("contacts")
            .select("id")
            .eq("account_id", account_id)
            .eq("email", email)
            .limit(1)
            .execute()
        )
        if email_check.data:
            contact_id = email_check.data[0]["id"]
            # Update with lead_id so future dedup works
            try:
                supabase.table("contacts").update({
                    "external_id": lead_id,
                    "source": "meta_lead_ads",
                    "campaign_id": campaign_id,
                    "updated_at": now,
                }).eq("id", contact_id).execute()
            except Exception as e:
                logger.warning("Lead Ads: could not update existing contact %s: %s", contact_id, e)
            return contact_id

    # 3. Create new contact
    insert_data: dict = {
        "account_id": account_id,
        "external_id": lead_id,
        "source": "meta_lead_ads",
        "lead_status": "new",
        "created_at": now,
    }
    if name:
        insert_data["name"] = name
    if email:
        insert_data["email"] = email
    if phone:
        insert_data["phone"] = phone
    if campaign_id:
        insert_data["campaign_id"] = campaign_id

    # Store raw form fields in custom_fields for auditability
    insert_data["custom_fields"] = {
        "meta_lead_id": lead_id,
        "meta_form_id": form_id,
        "raw_fields": fields,
    }

    try:
        res = supabase.table("contacts").insert(insert_data).execute()
        if res.data:
            return res.data[0]["id"]
    except Exception as e:
        logger.error("Lead Ads: failed to insert contact for lead_id '%s': %s", lead_id, e)
    return None


# ── WhatsApp ──────────────────────────────────────────────────

@router.get("/webhooks/whatsapp")
async def whatsapp_verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhooks/whatsapp")
async def whatsapp_webhook(request: Request):
    signature = request.headers.get("X-Hub-Signature-256", "")
    body = await request.body()

    if settings.whatsapp_app_secret:
        expected = "sha256=" + hmac.new(
            settings.whatsapp_app_secret.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        return {"status": "ok"}

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                sender_id = msg.get("from", "")
                text = msg.get("text", {}).get("body", "")
                mid = msg.get("id", "")
                contacts_info = value.get("contacts", [{}])
                name = contacts_info[0].get("profile", {}).get("name", "") if contacts_info else ""
                if sender_id and text:
                    try:
                        await _upsert_dm_to_inbox("whatsapp", sender_id, name, text, mid)
                    except Exception:
                        pass
    return {"status": "ok"}


# ── Email ─────────────────────────────────────────────────────

@router.post("/webhooks/email")
async def email_webhook(request: Request):
    """Manual email sync endpoint — called by frontend or scheduled job."""
    from app.services.email_service import get_email_service
    supabase = get_supabase()
    account_id = _get_account_id_for_platform("email")
    try:
        email_service = get_email_service()
        emails = await email_service.fetch_unread_emails(limit=50)
        if not emails:
            return {"status": "no_new_emails", "count": 0}
        created_count = 0
        for email_data in emails:
            try:
                contact_res = supabase.table("contacts").select("id").eq("email", email_data["from"]).limit(1).execute()
                if not contact_res.data:
                    contact_res = supabase.table("contacts").insert({
                        "email": email_data["from"],
                        "name": email_data["from"].split("@")[0],
                        "source": "email",
                        "account_id": account_id,
                    }).execute()
                contact_id = contact_res.data[0]["id"]
                conv_res = supabase.table("conversations").insert({
                    "contact_id": contact_id,
                    "account_id": account_id,
                    "platform": "email",
                    "status": "open",
                    "priority": "normal",
                    "last_message_at": email_data.get("date"),
                    "last_message_text": email_data.get("subject", "(no subject)"),
                    "unread_count": 1,
                }).execute()
                conv_id = conv_res.data[0]["id"]
                supabase.table("messages").insert({
                    "conversation_id": conv_id,
                    "account_id": account_id,
                    "content": email_data.get("body", "") or email_data.get("subject", ""),
                    "sender_type": "contact",
                    "status": "sent",
                }).execute()
                if email_data.get("message_id"):
                    await email_service.mark_as_read(email_data["message_id"])
                created_count += 1
            except Exception:
                continue
        return {"status": "success", "emails_processed": created_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email sync failed: {str(e)}")


# ── Instagram ─────────────────────────────────────────────────

@router.get("/webhooks/instagram")
async def instagram_verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    token = settings.instagram_verify_token
    if hub_mode == "subscribe" and hub_verify_token == token:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhooks/instagram")
async def instagram_webhook(request: Request):
    body = await request.body()

    secret = settings.instagram_app_secret
    if secret:
        sig = request.headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        return {"status": "ok"}

    for entry in payload.get("entry", []):
        for event in entry.get("messaging", []):
            msg = event.get("message", {})
            text = msg.get("text", "")
            mid = msg.get("mid", "")
            sender_id = event.get("sender", {}).get("id", "")
            if not text or not sender_id:
                continue
            try:
                await _upsert_dm_to_inbox(
                    platform="instagram",
                    sender_id=sender_id,
                    sender_name=f"ig_{sender_id}",
                    message_text=text,
                    external_msg_id=mid,
                )
            except Exception:
                pass

    return {"status": "ok"}


# ── Facebook Messenger ────────────────────────────────────────

@router.get("/webhooks/facebook")
async def facebook_verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    token = settings.facebook_verify_token
    if hub_mode == "subscribe" and hub_verify_token == token:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhooks/facebook")
async def facebook_webhook(request: Request):
    body = await request.body()

    secret = settings.facebook_app_secret
    if secret:
        sig = request.headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        return {"status": "ok"}

    for entry in payload.get("entry", []):
        for event in entry.get("messaging", []):
            msg = event.get("message", {})
            text = msg.get("text", "")
            mid = msg.get("mid", "")
            sender_id = event.get("sender", {}).get("id", "")
            if not text or not sender_id:
                continue
            try:
                await _upsert_dm_to_inbox(
                    platform="facebook",
                    sender_id=sender_id,
                    sender_name=f"fb_{sender_id}",
                    message_text=text,
                    external_msg_id=mid,
                )
            except Exception:
                pass

    return {"status": "ok"}


# ── Telegram ──────────────────────────────────────────────────

@router.post("/webhooks/telegram")
async def telegram_webhook(request: Request):
    secret = settings.telegram_webhook_secret
    if secret:
        token_header = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if token_header != secret:
            raise HTTPException(status_code=403, detail="Invalid secret token")

    try:
        payload = await request.json()
    except Exception:
        return {"status": "ok"}

    msg = payload.get("message") or payload.get("edited_message")
    if not msg:
        return {"status": "ok"}

    text = msg.get("text", "")
    mid = str(msg.get("message_id", ""))
    sender = msg.get("from", {})
    sender_id = str(sender.get("id", ""))
    first = sender.get("first_name", "")
    last = sender.get("last_name", "")
    username = sender.get("username", "")
    sender_name = f"{first} {last}".strip() or username or sender_id

    if sender_id and text:
        try:
            await _upsert_dm_to_inbox(
                platform="telegram",
                sender_id=sender_id,
                sender_name=sender_name,
                message_text=text,
                external_msg_id=mid,
            )
        except Exception:
            pass

    return {"status": "ok"}


# ── Meta Lead Ads ─────────────────────────────────────────────

@router.get("/webhooks/meta-leads")
async def meta_leads_verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    """
    Verification endpoint for Meta Lead Ads webhook subscription.
    Meta sends a GET with hub.mode=subscribe and hub.verify_token.
    We must echo hub.challenge if the token matches.
    """
    # Use the facebook_verify_token (same app) or a dedicated lead ads token
    expected_token = settings.facebook_verify_token or settings.whatsapp_verify_token
    if hub_mode == "subscribe" and hub_verify_token == expected_token:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhooks/meta-leads")
async def meta_leads_webhook(request: Request):
    """
    Receives Meta Lead Ads form submissions (leadgen change type).

    Security:
    - HMAC-SHA256 signature verified using meta_app_secret when configured.
    - Tenant routed by page_id → account_settings lookup (never first-row fallback).
    - lead_id deduplicated: same lead_id never creates a duplicate contact.
    - Returns 200 immediately to Meta regardless of processing outcome
      (Meta retries on non-200 which would cause duplicate processing).

    Payload shape (Meta Lead Ads):
    {
      "object": "page",
      "entry": [{
        "id": "<page_id>",
        "changes": [{
          "field": "leadgen",
          "value": {
            "leadgen_id": "<lead_id>",
            "form_id": "<form_id>",
            "page_id": "<page_id>",
            "ad_id": "<ad_id>",
            "campaign_id": "<campaign_id>",
            "created_time": 1234567890
          }
        }]
      }]
    }
    """
    body = await request.body()

    # Verify HMAC signature when app secret is configured
    app_secret = settings.meta_app_secret or settings.facebook_app_secret
    if app_secret:
        sig = request.headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            # Log but still return 200 to prevent Meta retry storms on misconfiguration
            logger.error("meta_leads_webhook: invalid HMAC signature — dropping payload")
            return {"status": "ok"}

    try:
        payload = await request.json()
    except Exception:
        return {"status": "ok"}

    if payload.get("object") != "page":
        return {"status": "ok"}

    processed = 0
    skipped = 0

    for entry in payload.get("entry", []):
        page_id = str(entry.get("id", ""))

        # Route to tenant by page_id
        account_id = _get_account_id_for_page(page_id)
        if not account_id:
            logger.warning(
                "meta_leads_webhook: no account found for page_id '%s' — dropping entry", page_id
            )
            skipped += 1
            continue

        for change in entry.get("changes", []):
            if change.get("field") != "leadgen":
                continue

            value = change.get("value", {})
            lead_id = str(value.get("leadgen_id", ""))
            form_id = str(value.get("form_id", ""))
            campaign_id = str(value.get("campaign_id", "")) or None
            ad_id = str(value.get("ad_id", "")) or None

            if not lead_id:
                logger.warning("meta_leads_webhook: missing leadgen_id in change value")
                skipped += 1
                continue

            # Fetch full lead field data from Meta Graph API
            lead_fields = _fetch_lead_fields(lead_id)

            contact_id = _upsert_lead_ads_contact(
                account_id=account_id,
                form_id=form_id,
                lead_id=lead_id,
                campaign_id=campaign_id,
                fields=lead_fields,
            )

            if contact_id:
                # Record attribution: link contact to campaign
                if campaign_id:
                    _record_lead_attribution(
                        account_id=account_id,
                        contact_id=contact_id,
                        campaign_id=campaign_id,
                        ad_id=ad_id,
                        form_id=form_id,
                        lead_id=lead_id,
                    )
                processed += 1
            else:
                skipped += 1

    logger.info("meta_leads_webhook: processed=%d skipped=%d", processed, skipped)
    return {"status": "ok"}


def _fetch_lead_fields(lead_id: str) -> dict:
    """
    Fetch lead form field values from Meta Graph API.
    Returns empty dict if not configured or on error — the contact is still
    created with the lead_id so it can be enriched later.
    Never raises — Meta webhook must always return 200.
    """
    import httpx

    token = settings.meta_access_token
    if not token:
        logger.warning("_fetch_lead_fields: META_ACCESS_TOKEN not configured — returning empty fields")
        return {}

    version = settings.meta_api_version or "v26.0"
    url = f"https://graph.facebook.com/{version}/{lead_id}"

    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.get(
                url,
                params={"fields": "field_data,created_time,ad_id,form_id,campaign_id"},
                headers={"Authorization": f"Bearer {token}"},
            )
        if res.status_code != 200:
            logger.warning("_fetch_lead_fields: Meta API returned %d for lead %s", res.status_code, lead_id)
            return {}

        data = res.json()
        # field_data is a list of {"name": "...", "values": ["..."]}
        fields: dict = {}
        for fd in data.get("field_data", []):
            name = fd.get("name", "")
            values = fd.get("values", [])
            if name and values:
                fields[name] = values[0]  # take first value
        return fields
    except Exception as e:
        logger.warning("_fetch_lead_fields: error fetching lead %s: %s", lead_id, e)
        return {}


def _record_lead_attribution(
    account_id: str,
    contact_id: str,
    campaign_id: str,
    ad_id: "str | None",
    form_id: str,
    lead_id: str,
):
    """
    Write an attribution record linking the new contact to the Meta campaign.
    Idempotent: skips if a record for this lead_id already exists.
    """
    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    # Dedup: check if attribution already recorded for this lead
    try:
        existing = (
            supabase.table("crm3_attribution")
            .select("id")
            .eq("account_id", account_id)
            .eq("contact_id", contact_id)
            .eq("campaign_id", campaign_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            return  # already attributed
    except Exception:
        pass

    try:
        supabase.table("crm3_attribution").insert({
            "account_id": account_id,
            "contact_id": contact_id,
            "campaign_id": campaign_id,
            "source": "meta_lead_ads",
            "channel": "facebook",
            "attribution_method": "direct",
            "attribution_confidence": "high",
            "lead_created_at": now,
            "is_won": False,
            "utm_source": "facebook",
            "utm_medium": "paid",
            "utm_campaign": campaign_id,
        }).execute()
    except Exception as e:
        logger.warning("_record_lead_attribution: failed for contact %s: %s", contact_id, e)
