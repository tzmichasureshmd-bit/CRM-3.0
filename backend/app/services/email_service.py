"""
Email Service - SMTP/IMAP integration for unified inbox
Handles sending and receiving emails via Gmail/Outlook/Custom SMTP
"""
import smtplib
import imaplib
import email
import email.utils
import asyncio
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Dict, Optional, Any
from datetime import datetime
from app.core.config import get_settings

settings = get_settings()


class EmailService:
    """Email service for sending and receiving emails"""
    
    def __init__(self):
        self.smtp_host = settings.email_smtp_host
        self.smtp_port = settings.email_smtp_port
        self.smtp_user = settings.email_smtp_user
        self.smtp_password = settings.email_smtp_password
        self.imap_host = settings.email_imap_host
        self.imap_port = settings.email_imap_port
        self.from_name = settings.email_from_name
        self.from_address = settings.email_from_address
    
    async def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        html: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        try:
            msg = MIMEMultipart('mixed')
            msg['From'] = f"{self.from_name} <{self.from_address}>"
            msg['To'] = to
            msg['Subject'] = subject
            if cc:
                msg['Cc'] = ', '.join(cc)

            # Text/HTML alternative part
            alt = MIMEMultipart('alternative')
            alt.attach(MIMEText(body, 'plain', 'utf-8'))
            if html:
                alt.attach(MIMEText(html, 'html', 'utf-8'))
            msg.attach(alt)

            # Attachments
            for att in (attachments or []):
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(base64.b64decode(att['data']))
                encoders.encode_base64(part)
                part.add_header('Content-Disposition', 'attachment', filename=att['filename'])
                part.add_header('Content-Type', att.get('content_type', 'application/octet-stream'))
                msg.attach(part)

            recipients = [to] + (cc or []) + (bcc or [])

            def _send():
                with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                    server.starttls()
                    server.login(self.smtp_user, self.smtp_password)
                    server.sendmail(self.from_address, recipients, msg.as_string())

            await asyncio.to_thread(_send)
            return {'status': 'sent', 'message_id': msg.get('Message-ID', ''), 'timestamp': datetime.utcnow().isoformat()}
        except Exception as e:
            return {'status': 'failed', 'error': str(e), 'timestamp': datetime.utcnow().isoformat()}
    
    async def fetch_unread_emails(self, limit: int = 50) -> List[Dict[str, any]]:
        """
        Fetch unread emails from IMAP inbox
        
        Args:
            limit: Max number of emails to fetch
        
        Returns:
            List of email dictionaries
        """
        def _fetch():
            results = []
            try:
                mail = imaplib.IMAP4_SSL(self.imap_host, self.imap_port)
                mail.login(self.smtp_user, self.smtp_password)
                mail.select('INBOX')
                _, message_numbers = mail.search(None, 'UNSEEN')
                for num in message_numbers[0].split()[:limit]:
                    _, msg_data = mail.fetch(num, '(RFC822)')
                    email_body = msg_data[0][1]
                    message = email.message_from_bytes(email_body)
                    from_addr = email.utils.parseaddr(message['From'])[1]
                    subject = message.get('Subject', '(no subject)')
                    date = message.get('Date', '')
                    body = ''
                    html_body = ''
                    attachments = []
                    if message.is_multipart():
                        for part in message.walk():
                            ct = part.get_content_type()
                            cd = str(part.get('Content-Disposition', ''))
                            if ct == 'text/plain' and 'attachment' not in cd and not body:
                                body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                            elif ct == 'text/html' and 'attachment' not in cd and not html_body:
                                html_body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                            elif part.get_filename() or 'attachment' in cd:
                                filename = part.get_filename() or 'attachment'
                                payload = part.get_payload(decode=True)
                                if payload:
                                    attachments.append({
                                        'filename': filename,
                                        'content_type': ct,
                                        'size': len(payload),
                                        'data': base64.b64encode(payload).decode('utf-8'),
                                    })
                    else:
                        ct = message.get_content_type()
                        payload = message.get_payload(decode=True)
                        if payload:
                            decoded = payload.decode('utf-8', errors='ignore')
                            if ct == 'text/html':
                                html_body = decoded
                            else:
                                body = decoded
                    results.append({
                        'from': from_addr,
                        'subject': subject,
                        'body': body,
                        'html_body': html_body,
                        'date': date,
                        'message_id': message.get('Message-ID', ''),
                        'attachments': attachments,
                    })
                mail.close()
                mail.logout()
            except Exception as e:
                print(f"Error fetching emails: {e}")
            return results

        return await asyncio.to_thread(_fetch)
    
    async def mark_as_read(self, message_id: str) -> bool:
        """Mark email as read in IMAP"""
        def _mark():
            try:
                mail = imaplib.IMAP4_SSL(self.imap_host, self.imap_port)
                mail.login(self.smtp_user, self.smtp_password)
                mail.select('INBOX')
                _, message_numbers = mail.search(None, f'HEADER Message-ID "{message_id}"')
                for num in message_numbers[0].split():
                    mail.store(num, '+FLAGS', '\\Seen')
                mail.close()
                mail.logout()
                return True
            except Exception as e:
                print(f"Error marking email as read: {e}")
                return False

        return await asyncio.to_thread(_mark)


# Singleton instance
_email_service = None

def get_email_service() -> EmailService:
    """Get or create email service singleton"""
    global _email_service
    if _email_service is None:
        _email_service = EmailService()
    return _email_service
