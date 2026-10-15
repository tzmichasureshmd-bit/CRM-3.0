"""
Email API routes — send outbound emails, sync inbound via IMAP
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from pydantic import BaseModel
from typing import Optional, List
from app.middleware.auth import get_current_user
from app.db.supabase import get_supabase
from app.services.email_service import get_email_service

router = APIRouter()


class AttachmentIn(BaseModel):
    filename: str
    content_type: str
    data: str  # base64


class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str
    html: Optional[str] = None
    cc: Optional[List[str]] = None
    conversation_id: Optional[str] = None
    attachments: Optional[List[AttachmentIn]] = None


class SyncEmailsRequest(BaseModel):
    limit: int = 50


@router.post("/email/send")
async def send_email(
    payload: SendEmailRequest,
    current_user: dict = Depends(get_current_user),
):
    email_service = get_email_service()
    if not email_service.smtp_user:
        raise HTTPException(status_code=503, detail="Email not configured. Set EMAIL_SMTP_* in .env")

    result = await email_service.send_email(
        to=payload.to,
        subject=payload.subject,
        body=payload.body,
        html=payload.html,
        cc=payload.cc,
        attachments=[a.model_dump() for a in payload.attachments] if payload.attachments else None,
    )
    if result["status"] == "failed":
        raise HTTPException(status_code=500, detail=f"SMTP error: {result.get('error', 'Send failed')}")

    db = get_supabase()
    account_id = current_user.get("account_id")
    conv_id = payload.conversation_id

    try:
        if not conv_id:
            contact_res = db.table("contacts").select("id").eq("email", payload.to).limit(1).execute()
            if contact_res.data:
                contact_id = contact_res.data[0]["id"]
            else:
                c = db.table("contacts").insert({
                    "email": payload.to,
                    "name": payload.to.split("@")[0],
                    "source": "email",
                    "account_id": account_id,
                }).execute()
                contact_id = c.data[0]["id"]

            conv = db.table("conversations").insert({
                "contact_id": contact_id,
                "account_id": account_id,
                "platform": "email",
                "status": "sent",
                "priority": "normal",
                "last_message_at": result["timestamp"],
                "last_message_text": payload.subject,
            }).execute()
            conv_id = conv.data[0]["id"]

        msg = db.table("messages").insert({
            "conversation_id": conv_id,
            "account_id": account_id,
            "content": f"Subject: {payload.subject}\n\n{payload.body}",
            "sender_type": "agent",
            "status": "sent",
            "metadata": {
                "attachments": [a.model_dump() for a in payload.attachments] if payload.attachments else [],
            },
        }).execute()

        db.table("conversations").update({
            "last_message_at": result["timestamp"],
            "last_message_text": payload.subject,
        }).eq("id", conv_id).execute()

        return {
            "status": "sent",
            "conversation_id": conv_id,
            "message": msg.data[0] if msg.data else None,
        }
    except Exception as e:
        return {"status": "sent", "conversation_id": conv_id, "db_error": str(e)}


@router.post("/email/sync")
async def sync_emails(
    payload: SyncEmailsRequest = SyncEmailsRequest(),
    current_user: dict = Depends(get_current_user),
):
    email_service = get_email_service()
    if not email_service.smtp_user:
        raise HTTPException(status_code=503, detail="Email not configured. Set EMAIL_IMAP_* in .env")

    emails = await email_service.fetch_unread_emails(limit=payload.limit)
    if not emails:
        return {"status": "ok", "synced": 0, "message": "No new emails"}

    db = get_supabase()
    account_id = current_user.get("account_id")
    synced = 0

    for em in emails:
        try:
            contact_res = db.table("contacts").select("id").eq("email", em["from"]).limit(1).execute()
            if contact_res.data:
                contact_id = contact_res.data[0]["id"]
            else:
                c = db.table("contacts").insert({
                    "email": em["from"],
                    "name": em["from"].split("@")[0],
                    "source": "email",
                    "account_id": account_id,
                }).execute()
                contact_id = c.data[0]["id"]

            conv = db.table("conversations").insert({
                "contact_id": contact_id,
                "account_id": account_id,
                "platform": "email",
                "status": "open",
                "priority": "normal",
                "last_message_at": em.get("date"),
                "last_message_text": em.get("subject", "(no subject)"),
                "unread_count": 1,
            }).execute()
            conv_id = conv.data[0]["id"]

            db.table("messages").insert({
                "conversation_id": conv_id,
                "account_id": account_id,
                "content": f"Subject: {em.get('subject', '')}\n\n{em.get('body', '') or em.get('html_body', '')}",
                "sender_type": "contact",
                "status": "delivered",
                "metadata": {
                    "attachments": em.get("attachments", []),
                    "html_body": em.get("html_body", ""),
                },
            }).execute()

            if em.get("message_id"):
                await email_service.mark_as_read(em["message_id"])

            synced += 1
        except Exception as e:
            print(f"[email/sync] skip: {e}")
            continue

    return {"status": "ok", "synced": synced}


@router.get("/email/conversations")
async def get_email_conversations(
    folder: str = Query(default="inbox"),
    current_user: dict = Depends(get_current_user),
):
    db = get_supabase()
    account_id = current_user.get("account_id")

    try:
        res = db.table("conversations").select(
            "id, last_message_text, last_message_at, status, unread_count, contacts(name, email)"
        ).eq("account_id", account_id).eq("platform", "email").order("last_message_at", desc=True).limit(200).execute()
        all_convs = res.data or []
    except Exception as e:
        print(f"[email/conversations] DB error: {e}")
        return {"data": [], "counts": {}}

    # Normalise contacts join -> contact field
    for c in all_convs:
        raw = c.pop("contacts", None)
        c["contact"] = raw[0] if isinstance(raw, list) else raw

    # Folder logic uses status field (no metadata column needed):
    # status="sent"     -> Sent folder
    # status="trashed"  -> Trash folder
    # status="archived" -> Archive folder
    # anything else     -> Inbox / All Mail
    def get_folder(c):
        s = c.get("status") or "open"
        if s == "trashed":  return "trash"
        if s == "archived": return "archive"
        if s == "sent":     return "sent"
        return "inbox"

    if folder == "trash":
        convs = [c for c in all_convs if get_folder(c) == "trash"]
    elif folder == "archive":
        convs = [c for c in all_convs if get_folder(c) == "archive"]
    elif folder == "sent":
        convs = [c for c in all_convs if get_folder(c) == "sent"]
    elif folder == "all":
        convs = [c for c in all_convs if get_folder(c) != "trash"]
    else:  # inbox + starred
        convs = [c for c in all_convs if get_folder(c) == "inbox"]

    counts = {
        "inbox":   sum(1 for c in all_convs if get_folder(c) == "inbox"),
        "sent":    sum(1 for c in all_convs if get_folder(c) == "sent"),
        "trash":   sum(1 for c in all_convs if get_folder(c) == "trash"),
        "archive": sum(1 for c in all_convs if get_folder(c) == "archive"),
        "starred": 0,
        "all":     sum(1 for c in all_convs if get_folder(c) != "trash"),
        "unread":  sum(1 for c in all_convs if (c.get("unread_count") or 0) > 0 and get_folder(c) == "inbox"),
    }
    return {"data": convs, "counts": counts}


@router.patch("/email/conversations/{conv_id}")
async def update_email_conversation(
    conv_id: str,
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Move conversation to folder: payload = {"status": "trashed"|"archived"|"open"}"""
    db = get_supabase()
    account_id = current_user.get("account_id")
    # Map folder names to status values
    folder_to_status = {"trash": "trashed", "archive": "archived", "inbox": "open"}
    update = {}
    if "folder" in payload:
        update["status"] = folder_to_status.get(payload["folder"], payload["folder"])
    if update:
        db.table("conversations").update(update).eq("id", conv_id).eq("account_id", account_id).execute()
    return {"status": "ok"}


@router.get("/email/status")
async def email_status(current_user: dict = Depends(get_current_user)):
    email_service = get_email_service()
    configured = bool(email_service.smtp_user and email_service.smtp_password)
    return {
        "configured": configured,
        "smtp_host": email_service.smtp_host if configured else None,
        "smtp_user": email_service.smtp_user if configured else None,
        "from_address": email_service.from_address if configured else None,
    }
