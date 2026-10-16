from fastapi import APIRouter, Request, HTTPException, Query
from app.core.config import get_settings
from app.db.supabase import get_supabase as get_supabase_client
import hmac, hashlib, json

router = APIRouter()
settings = get_settings()

# ── Shared HMAC verifier ─────────────────────────────────────
def _verify_signature(body: bytes, signature: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


# ── Shared message processor ─────────────────────────────────
# Default account_id — first account in DB (single-tenant CRM)
_DEFAULT_ACCOUNT_ID = None

def _get_default_account_id(supabase) -> str:
    global _DEFAULT_ACCOUNT_ID
    if not _DEFAULT_ACCOUNT_ID:
        res = supabase.table("accounts").select("id").limit(1).execute()
        if res.data:
            _DEFAULT_ACCOUNT_ID = res.data[0]["id"]
    return _DEFAULT_ACCOUNT_ID


def _save_message(platform: str, sender_id: str, sender_name: str, text: str, raw: dict):
    supabase = get_supabase_client()
    account_id = _get_default_account_id(supabase)

    # Find or create contact — use correct column per platform
    if platform == "instagram":
        res = supabase.table("contacts").select("id, account_id").eq("instagram_user_id", sender_id).eq("account_id", account_id).limit(1).execute()
        new_contact = {"name": sender_name or f"Instagram {sender_id[:8]}", "instagram_user_id": sender_id, "source": "instagram", "account_id": account_id}
    elif platform == "whatsapp":
        res = supabase.table("contacts").select("id, account_id").eq("phone", sender_id).eq("account_id", account_id).limit(1).execute()
        new_contact = {"name": sender_name or f"WA {sender_id}", "phone": sender_id, "source": "whatsapp", "account_id": account_id}
    else:  # facebook
        res = supabase.table("contacts").select("id, account_id").eq("instagram_user_id", sender_id).eq("account_id", account_id).limit(1).execute()
        new_contact = {"name": sender_name or f"FB {sender_id[:8]}", "instagram_user_id": sender_id, "source": "facebook", "account_id": account_id}

    if res.data:
        contact = res.data[0]
    else:
        res = supabase.table("contacts").insert(new_contact).execute()
        contact = res.data[0]

    # Find open conversation or create
    conv_res = supabase.table("conversations").select("id").eq("contact_id", contact["id"]).eq("platform", platform).eq("status", "open").limit(1).execute()
    if conv_res.data:
        conv_id = conv_res.data[0]["id"]
    else:
        conv_res = supabase.table("conversations").insert({
            "contact_id": contact["id"],
            "account_id": account_id,
            "platform": platform,
            "status": "open",
            "priority": "normal",
            "last_message_text": text[:200] if text else "",
            "last_message_at": "now()",
            "unread_count": 1,
        }).execute()
        conv_id = conv_res.data[0]["id"]

    # Save message — use correct column names from schema
    supabase.table("messages").insert({
        "conversation_id": conv_id,
        "account_id": account_id,
        "content": text or "[media]",
        "content_type": "text",
        "sender_type": "contact",
        "status": "received",
        "metadata": {"raw": raw},
    }).execute()

    # Update conversation
    supabase.table("conversations").update({
        "last_message_text": text[:200] if text else "[media]",
    }).eq("id", conv_id).execute()


# ══════════════════════════════════════════════════════════════
# WHATSAPP
# ══════════════════════════════════════════════════════════════
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
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")
    if not _verify_signature(body, sig, settings.whatsapp_app_secret):
        raise HTTPException(status_code=403, detail="Invalid signature")

    payload = json.loads(body)
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                sender_id = msg.get("from", "")
                text = msg.get("text", {}).get("body", "")
                contacts_info = value.get("contacts", [{}])
                name = contacts_info[0].get("profile", {}).get("name", "") if contacts_info else ""
                _save_message("whatsapp", sender_id, name, text, msg)

    return {"status": "ok"}


# ══════════════════════════════════════════════════════════════
# INSTAGRAM
# ══════════════════════════════════════════════════════════════
@router.get("/webhooks/instagram")
async def instagram_verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.instagram_verify_token:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhooks/instagram")
async def instagram_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")
    if not _verify_signature(body, sig, settings.instagram_app_secret):
        raise HTTPException(status_code=403, detail="Invalid signature")

    payload = json.loads(body)
    supabase = get_supabase_client()

    for entry in payload.get("entry", []):
        # ── DMs ──────────────────────────────────────────────
        for msg_event in entry.get("messaging", []):
            sender_id = msg_event.get("sender", {}).get("id", "")
            msg       = msg_event.get("message", {})
            text      = msg.get("text", "")

            # Story reply — tag it
            story_ref = msg.get("reply_to", {}).get("story", {})
            if story_ref:
                text = f"[Story Reply] {text}"

            _save_message("instagram", sender_id, "", text, msg_event)

        # ── Comments / Mentions ───────────────────────────────
        for change in entry.get("changes", []):
            field = change.get("field", "")
            val   = change.get("value", {})

            if field == "comments":
                try:
                    supabase.table("instagram_comments").upsert({
                        "comment_id":  val.get("id"),
                        "media_id":    val.get("media", {}).get("id"),
                        "from_id":     val.get("from", {}).get("id"),
                        "from_name":   val.get("from", {}).get("name", ""),
                        "text":        val.get("text", ""),
                        "timestamp":   val.get("timestamp"),
                        "raw":         json.dumps(val),
                    }, on_conflict="comment_id").execute()
                except Exception:
                    pass  # table may not exist yet

            elif field == "mentions":
                try:
                    supabase.table("instagram_mentions").upsert({
                        "mention_id":  val.get("comment_id") or val.get("media_id"),
                        "media_id":    val.get("media_id"),
                        "comment_id":  val.get("comment_id"),
                        "raw":         json.dumps(val),
                    }, on_conflict="mention_id").execute()
                except Exception:
                    pass  # table may not exist yet

    return {"status": "ok"}


# ══════════════════════════════════════════════════════════════
# FACEBOOK MESSENGER
# ══════════════════════════════════════════════════════════════
@router.get("/webhooks/facebook")
async def facebook_verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.facebook_verify_token:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhooks/facebook")
async def facebook_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")
    if not _verify_signature(body, sig, settings.facebook_app_secret):
        raise HTTPException(status_code=403, detail="Invalid signature")

    payload = json.loads(body)
    for entry in payload.get("entry", []):
        for msg_event in entry.get("messaging", []):
            sender_id = msg_event.get("sender", {}).get("id", "")
            text = msg_event.get("message", {}).get("text", "")
            _save_message("facebook", sender_id, "", text, msg_event)

    return {"status": "ok"}


# ══════════════════════════════════════════════════════════════
# SEND MESSAGE (outbound)
# ══════════════════════════════════════════════════════════════
import httpx

@router.post("/meta/send")
async def send_meta_message(request: Request):
    data = await request.json()
    platform: str = data.get("platform")   # whatsapp | instagram | facebook
    recipient_id: str = data.get("recipient_id")
    text: str = data.get("text", "")

    if platform == "whatsapp":
        url = f"https://graph.facebook.com/v19.0/{settings.whatsapp_phone_number_id}/messages"
        token = settings.whatsapp_access_token
        body = {
            "messaging_product": "whatsapp",
            "to": recipient_id,
            "type": "text",
            "text": {"body": text},
        }
    elif platform in ("instagram", "facebook"):
        page_id = settings.instagram_page_id if platform == "instagram" else settings.facebook_page_id
        token = settings.facebook_page_access_token
        url = f"https://graph.facebook.com/v19.0/{page_id}/messages"
        body = {
            "recipient": {"id": recipient_id},
            "message": {"text": text},
        }
    else:
        raise HTTPException(status_code=400, detail="Unknown platform")

    async with httpx.AsyncClient() as client:
        res = await client.post(url, json=body, headers={"Authorization": f"Bearer {token}"})
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)

    return {"status": "sent"}
