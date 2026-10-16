from fastapi import APIRouter, Request, HTTPException, Query
from app.core.config import get_settings
from app.db.supabase import get_supabase
import hmac, hashlib
from datetime import datetime, timezone

router = APIRouter()
settings = get_settings()


def _get_account_id() -> str | None:
    """Get first account_id from account_settings (single-tenant fallback)."""
    try:
        supabase = get_supabase()
        res = supabase.table("account_settings").select("account_id").limit(1).execute()
        return res.data[0]["account_id"] if res.data else None
    except Exception:
        return None


async def _upsert_dm_to_inbox(platform: str, sender_id: str, sender_name: str, message_text: str, external_msg_id: str):
    """Find-or-create contact → conversation → message for an incoming DM."""
    supabase = get_supabase()
    account_id = _get_account_id()
    now = datetime.now(timezone.utc).isoformat()

    if not account_id:
        return  # can't insert without account_id (NOT NULL constraint)

    # 1. Find or create contact by external_id (Instagram/Facebook user ID)
    contact_res = supabase.table("contacts").select("id, account_id") \
        .eq("external_id", sender_id).limit(1).execute()

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

    # 2. Find open conversation for this contact+platform, or create one
    conv_res = supabase.table("conversations").select("id") \
        .eq("contact_id", contact["id"]).eq("platform", platform).eq("status", "open").limit(1).execute()

    if conv_res.data:
        conv_id = conv_res.data[0]["id"]
        # Update last message preview (ignore unread_count increment failure)
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

    # 3. Deduplicate: skip if message already stored
    if external_msg_id:
        dup = supabase.table("messages").select("id").eq("external_id", external_msg_id).limit(1).execute()
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


@router.post("/webhooks/email")
async def email_webhook(request: Request):
    """
    Manual email sync endpoint
    Called by frontend or scheduled job to fetch new emails
    """
    from app.services.email_service import get_email_service
    supabase = get_supabase()  # use correct function name
    account_id = _get_account_id()
    try:
        email_service = get_email_service()
        emails = await email_service.fetch_unread_emails(limit=50)
        if not emails:
            return {"status": "no_new_emails", "count": 0}
        created_count = 0
        for email_data in emails:
            try:
                contact_res = supabase.table('contacts').select('id').eq('email', email_data['from']).limit(1).execute()
                if not contact_res.data:
                    contact_res = supabase.table('contacts').insert({
                        'email': email_data['from'],
                        'name': email_data['from'].split('@')[0],
                        'source': 'email',
                        'account_id': account_id,
                    }).execute()
                contact_id = contact_res.data[0]['id']
                conv_res = supabase.table('conversations').insert({
                    'contact_id': contact_id,
                    'account_id': account_id,
                    'platform': 'email',
                    'status': 'open',
                    'priority': 'normal',
                    'last_message_at': email_data.get('date'),
                    'last_message_text': email_data.get('subject', '(no subject)'),
                    'unread_count': 1,
                }).execute()
                conv_id = conv_res.data[0]['id']
                supabase.table('messages').insert({
                    'conversation_id': conv_id,
                    'account_id': account_id,
                    'content': email_data.get('body', '') or email_data.get('subject', ''),
                    'sender_type': 'contact',
                    'status': 'sent',
                }).execute()
                if email_data.get('message_id'):
                    await email_service.mark_as_read(email_data['message_id'])
                created_count += 1
            except Exception:
                continue
        return {"status": "success", "emails_processed": created_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email sync failed: {str(e)}")


# ── Instagram Webhook ─────────────────────────────────────────

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

    # Verify HMAC signature
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

    # Parse Instagram DM events
    # Meta sends: {"object":"instagram","entry":[{"messaging":[{...}]}]}
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
                pass  # never fail Meta's webhook — always return 200

    return {"status": "ok"}


# ── Facebook Messenger Webhook ────────────────────────────────

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


# ── Telegram Webhook ──────────────────────────────────────────

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
