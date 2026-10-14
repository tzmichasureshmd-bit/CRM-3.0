from fastapi import APIRouter, Request, HTTPException, Query
from app.core.config import get_settings
import hmac, hashlib

router = APIRouter()
settings = get_settings()


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

    # HMAC verification
    expected = "sha256=" + hmac.new(
        settings.whatsapp_app_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=403, detail="Invalid signature")

    payload = await request.json()
    # Process webhook asynchronously (Celery task in production)
    return {"status": "received"}


@router.post("/webhooks/email")
async def email_webhook(request: Request):
    """
    Manual email sync endpoint
    Called by frontend or scheduled job to fetch new emails
    """
    from app.services.email_service import get_email_service
    from app.db.supabase import get_supabase_client
    
    try:
        # Fetch unread emails
        email_service = get_email_service()
        emails = await email_service.fetch_unread_emails(limit=50)
        
        if not emails:
            return {"status": "no_new_emails", "count": 0}
        
        # Store in Supabase conversations/messages
        supabase = get_supabase_client()
        created_count = 0
        
        for email_data in emails:
            # Find or create contact by email
            contact_res = supabase.table('contacts').select('id, account_id').eq('email', email_data['from']).limit(1).execute()
            
            if not contact_res.data:
                # Create new contact
                contact_res = supabase.table('contacts').insert({
                    'email': email_data['from'],
                    'name': email_data['from'].split('@')[0],
                    'source': 'email',
                }).execute()
            
            contact = contact_res.data[0]
            
            # Create conversation
            conv_res = supabase.table('conversations').insert({
                'contact_id': contact['id'],
                'account_id': contact['account_id'],
                'platform': 'email',
                'status': 'open',
                'priority': 'normal',
                'last_message_at': email_data['date'],
                'last_message_text': email_data['subject'],
            }).execute()
            
            conversation = conv_res.data[0]
            
            # Create message
            supabase.table('messages').insert({
                'conversation_id': conversation['id'],
                'content_text': email_data['body'],
                'sender_type': 'customer',
                'status': 'received',
            }).execute()
            
            # Mark as read in IMAP
            await email_service.mark_as_read(email_data['message_id'])
            
            created_count += 1
        
        return {
            "status": "success",
            "emails_processed": created_count,
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email sync failed: {str(e)}")
