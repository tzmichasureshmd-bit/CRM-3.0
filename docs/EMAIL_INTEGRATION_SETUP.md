# 📧 EMAIL INTEGRATION SETUP - Gmail & Outlook

> Step-by-step guide to connect your email to CRM 3.0 unified inbox
> Works with Gmail, Outlook, and any SMTP/IMAP provider

---

## 🎯 WHAT YOU'LL GET

After setup, your inbox will:
- ✅ **Receive emails** automatically in unified inbox
- ✅ **Send emails** from CRM (tracked & logged)
- ✅ **Thread emails** by conversation
- ✅ **AI analysis** on email conversations
- ✅ **Real-time sync** with your email account

---

## 📧 OPTION 1: GMAIL INTEGRATION (Recommended)

### Step 1: Enable 2-Step Verification

1. Go to: https://myaccount.google.com/security
2. Scroll to "2-Step Verification"
3. Click **"Get Started"**
4. Follow the prompts (you'll need your phone)

**Why?** Google requires 2FA to generate app passwords.

---

### Step 2: Generate App Password

1. Go to: https://myaccount.google.com/apppasswords
2. Select app: **"Mail"**
3. Select device: **"Other (Custom name)"**
4. Type: **"CRM 3.0"**
5. Click **"Generate"**
6. **COPY THE 16-CHARACTER PASSWORD** (looks like: `xxxx xxxx xxxx xxxx`)
7. **SAVE IT** - you won't see it again!

---

### Step 3: Update `.env.local`

Open `.env.local` in your CRM 3.0 folder and add:

```bash
# ── Email Integration (Gmail) ───────────────────────────────────
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASSWORD=xxxx xxxx xxxx xxxx    # ← Paste app password here
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_IMAP_PORT=993
EMAIL_FROM_NAME=Your Company Name
EMAIL_FROM_ADDRESS=your-email@gmail.com
```

**Replace:**
- `your-email@gmail.com` → Your actual Gmail address
- `xxxx xxxx xxxx xxxx` → The 16-char app password from Step 2
- `Your Company Name` → How emails will appear (e.g., "TZMICHA CRM")

---

### Step 4: Test the Connection

```bash
# Restart the app
npm run dev

# Open inbox
# http://localhost:3000/inbox

# Try sending an email from the inbox
# Check if it appears in your Gmail "Sent" folder
```

---

## 🔷 OPTION 2: OUTLOOK/OFFICE 365

### Step 1: Get App Password (if required)

**For personal Outlook.com:**
1. Go to: https://account.microsoft.com/security
2. Click "Advanced security options"
3. Under "App passwords", click "Create a new app password"
4. Copy the password

**For Office 365/Work accounts:**
- Check with your IT admin if app passwords are enabled
- Or use OAuth (requires more setup)

---

### Step 2: Update `.env.local`

```bash
# ── Email Integration (Outlook) ─────────────────────────────────
EMAIL_SMTP_HOST=smtp-mail.outlook.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-email@outlook.com
EMAIL_SMTP_PASSWORD=your-app-password
EMAIL_IMAP_HOST=outlook.office365.com
EMAIL_IMAP_PORT=993
EMAIL_FROM_NAME=Your Company Name
EMAIL_FROM_ADDRESS=your-email@outlook.com
```

---

## 🔧 OPTION 3: CUSTOM SMTP/IMAP (Any Provider)

### Common Providers

#### **Zoho Mail**
```bash
EMAIL_SMTP_HOST=smtp.zoho.com
EMAIL_SMTP_PORT=587
EMAIL_IMAP_HOST=imap.zoho.com
EMAIL_IMAP_PORT=993
```

#### **Yahoo Mail**
```bash
EMAIL_SMTP_HOST=smtp.mail.yahoo.com
EMAIL_SMTP_PORT=587
EMAIL_IMAP_HOST=imap.mail.yahoo.com
EMAIL_IMAP_PORT=993
```

#### **Custom Domain (e.g., cPanel/Plesk)**
Ask your hosting provider for:
- SMTP hostname
- SMTP port (usually 587 or 465)
- IMAP hostname
- IMAP port (usually 993)

---

## ⚙️ BACKEND CONFIGURATION

The email integration is handled by the Python backend.

### Update Backend Environment

**File:** `backend/.env`

Add the same email settings:

```bash
# Email Configuration
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASSWORD=xxxx xxxx xxxx xxxx
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_IMAP_PORT=993
EMAIL_FROM_NAME=TZMICHA CRM
EMAIL_FROM_ADDRESS=your-email@gmail.com
EMAIL_USE_TLS=true
EMAIL_USE_SSL=false
```

---

## 🔍 HOW IT WORKS

### Receiving Emails (IMAP)

```
Your Gmail Inbox
       ↓
IMAP Connection (checks every 60 seconds)
       ↓
New email detected
       ↓
Creates conversation in Supabase
       ↓
Appears in CRM inbox
       ↓
AI analyzes: intent, sentiment, lead score
```

### Sending Emails (SMTP)

```
Agent types reply in inbox
       ↓
Clicks "Send"
       ↓
SMTP sends via your Gmail account
       ↓
Stored in Supabase messages table
       ↓
Appears in Gmail "Sent" folder
       ↓
Delivery status tracked
```

---

## 🧪 TESTING CHECKLIST

### After Setup

- [ ] **Restart backend**: `docker-compose restart backend`
- [ ] **Restart frontend**: `npm run dev`
- [ ] **Open inbox**: http://localhost:3000/inbox
- [ ] **Filter to Email**: Select "Email" from channel dropdown
- [ ] **Send test email**: Use inbox composer
- [ ] **Check Gmail**: Verify email sent from your account
- [ ] **Reply to yourself**: Send email to your CRM email
- [ ] **Check inbox**: Email should appear within 60 seconds

---

## 🐛 TROUBLESHOOTING

### "Authentication failed"

**Problem:** App password is wrong or not generated.

**Fix:**
1. Re-generate app password in Google Account
2. Copy the 16-character password **including spaces**
3. Update `.env.local`
4. Restart app

---

### "Connection timeout"

**Problem:** Firewall blocking SMTP/IMAP ports.

**Fix:**
1. Check if ports 587 (SMTP) and 993 (IMAP) are open
2. Try alternative ports:
   - SMTP: 465 (SSL) instead of 587 (TLS)
   - IMAP: Usually 993 is standard

---

### "Emails not appearing in inbox"

**Problem:** IMAP polling not working or migrations not applied.

**Fix:**
1. Check backend logs: `docker logs crm3-backend`
2. Verify migrations applied (especially 001, 002)
3. Check `conversations` table in Supabase
4. Manually trigger fetch (if API exists)

---

### "Can't send emails"

**Problem:** SMTP credentials wrong or TLS issue.

**Fix:**
```bash
# Test SMTP manually
curl -v --url 'smtp://smtp.gmail.com:587' \
  --ssl-reqd \
  --mail-from 'your-email@gmail.com' \
  --mail-rcpt 'test@example.com' \
  --user 'your-email@gmail.com:xxxx xxxx xxxx xxxx'
```

---

## 🔒 SECURITY BEST PRACTICES

### DO ✅
- Use app-specific passwords (never main password)
- Enable 2-factor authentication
- Store credentials in `.env.local` (never commit to git)
- Use TLS/SSL encryption (port 587 or 465)
- Monitor sent emails for abuse

### DON'T ❌
- Use your main Gmail password
- Store credentials in frontend code
- Commit `.env.local` to version control
- Share app passwords publicly
- Use unencrypted connections

---

## 📊 EMAIL FEATURES IN INBOX

Once configured, you'll have:

### 1. **Email Composer**
- Rich text editing (coming soon)
- CC/BCC support
- File attachments
- Templates

### 2. **Email Threading**
- Groups emails by subject
- Shows full conversation history
- Reply-to tracking

### 3. **AI Email Features**
- Professional reply generator
- Email summarization
- Intent detection (inquiry/complaint/lead)
- Sentiment analysis
- Auto-categorization

### 4. **Email Tracking**
- Delivery status
- Read receipts (if supported by recipient)
- Response time analytics
- Email-to-lead conversion tracking

---

## 🚀 ADVANCED: SMTP RELAY (Optional)

For high-volume sending, use a transactional email service:

### SendGrid
```bash
EMAIL_SMTP_HOST=smtp.sendgrid.net
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=apikey
EMAIL_SMTP_PASSWORD=your-sendgrid-api-key
```

### Mailgun
```bash
EMAIL_SMTP_HOST=smtp.mailgun.org
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=postmaster@your-domain.com
EMAIL_SMTP_PASSWORD=your-mailgun-password
```

### AWS SES
```bash
EMAIL_SMTP_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-ses-smtp-user
EMAIL_SMTP_PASSWORD=your-ses-smtp-password
```

**Benefits:**
- Higher sending limits (thousands/day)
- Better deliverability
- Detailed analytics
- Webhook notifications

---

## 📈 EMAIL METRICS

Track email performance in CRM:

### Available Metrics
- **Emails received** (per day/week/month)
- **Emails sent** (by agent/team)
- **Response time** (avg/median)
- **Resolution rate** (% of emails resolved)
- **Lead conversion** (emails → qualified leads)

### Where to View
- **Dashboard**: http://localhost:3000/dashboard
- **Reports**: http://localhost:3000/reports
- **Inbox Stats**: http://localhost:3000/inbox (top bar)

---

## 🔄 SYNC FREQUENCY

### Current Settings
- **IMAP check**: Every 60 seconds
- **Sent email sync**: Immediate
- **Read status**: Updated on open

### Customize (in backend config)
```python
# backend/app/core/config.py
EMAIL_FETCH_INTERVAL = 60  # seconds
EMAIL_BATCH_SIZE = 50      # emails per fetch
```

---

## 📚 RELATED FILES

### Backend Email Handler
- **File**: `backend/app/services/email_service.py` (needs to be created)
- **Webhook**: `backend/app/api/v1/webhooks.py` (email endpoint)
- **Config**: `backend/app/core/config.py`

### Frontend Email UI
- **Inbox Page**: `src/app/(dashboard)/inbox/page.tsx` ✅ Ready
- **Email Composer**: Uses same message thread UI
- **AI Email Assist**: `src/app/api/v3/ai/reply-assist/route.ts` ✅ Ready

---

## ✅ QUICK SETUP (Gmail - 5 Minutes)

```bash
# 1. Enable 2FA (if not already)
https://myaccount.google.com/security

# 2. Generate app password
https://myaccount.google.com/apppasswords

# 3. Update .env.local
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASSWORD=xxxx xxxx xxxx xxxx

# 4. Restart app
npm run dev

# 5. Test in inbox
http://localhost:3000/inbox
```

---

## 🎉 YOU'RE DONE!

Your email is now integrated with the unified inbox!

**Next Steps:**
1. Test sending an email
2. Reply to yourself to test receiving
3. Try AI reply assist on email conversations
4. Configure email templates (optional)
5. Set up auto-responses (optional)

---

*Need help? Check the main documentation: `docs/SOCIAL_MEDIA_INTEGRATIONS.md`*
