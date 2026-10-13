# OpenAI API Key Setup & Pricing

## 🔑 How to Get Your OpenAI API Key

### Step 1: Create OpenAI Account
1. Go to: **https://platform.openai.com/signup**
2. Sign up with email or Google/Microsoft account
3. Verify your email

### Step 2: Add Payment Method
1. Go to: **https://platform.openai.com/settings/organization/billing/overview**
2. Click **"Add payment method"**
3. Enter credit/debit card details
4. Add initial credit (minimum $5 recommended)

### Step 3: Create API Key
1. Go to: **https://platform.openai.com/api-keys**
2. Click **"+ Create new secret key"**
3. Give it a name: "CRM 3.0"
4. Copy the key (starts with `sk-proj-...`)
5. ⚠️ **Save it now!** You can't see it again

### Step 4: Add to Your Project
1. Open `.env.local` file in your CRM project
2. Replace this line:
   ```
   OPENAI_API_KEY=sk-...
   ```
   With your actual key:
   ```
   OPENAI_API_KEY=sk-proj-YOUR-KEY-HERE
   ```
3. Save the file

---

## 💰 Pricing (Pay-as-you-go)

### CRM 3.0 Uses: GPT-4o-mini
This is OpenAI's most cost-effective model!

| Feature | Price |
|---------|-------|
| **Input** | $0.150 per 1M tokens |
| **Output** | $0.600 per 1M tokens |

### What Does This Mean?

**1 token ≈ 4 characters ≈ 0.75 words**

Example costs:
- **Analyze 1 conversation** (~500 words) ≈ $0.0005 (half a cent)
- **Score 1 lead** (~200 words) ≈ $0.0002 (less than a cent)
- **Generate content** (~300 words) ≈ $0.0008
- **AI Copilot query** (~100 words) ≈ $0.0003

### Monthly Estimates

| Usage Level | API Calls/Month | Estimated Cost |
|-------------|-----------------|----------------|
| **Light** | 100-500 calls | $0.50 - $2 |
| **Medium** | 1,000 calls | $5 - $10 |
| **Heavy** | 5,000 calls | $25 - $50 |
| **Enterprise** | 20,000+ calls | $100+ |

### Real-World Example
**Small business with 50 leads/month:**
- Score 50 leads: $0.01
- Analyze 200 conversations: $0.10
- Generate 20 social posts: $0.016
- 100 copilot queries: $0.03
- **Total: ~$0.16/month** 🎉

---

## 🎁 Free Credits

**New accounts get $5 free credits!**
- Expires after 3 months
- Enough for ~5,000+ CRM operations
- Perfect for testing

---

## 🛡️ Spending Limits

### Set a Budget Limit
1. Go to: https://platform.openai.com/settings/organization/limits
2. Set **"Monthly budget"**: e.g., $10/month
3. Set **"Email threshold"**: e.g., 50%
4. You'll get alerts when approaching limit

### Recommended Settings for CRM
- **Monthly Budget:** $20 (safe for most businesses)
- **Email Alert:** 50% ($10 spent)
- **Hard Limit:** Enable to auto-stop if exceeded

---

## 📊 Monitor Usage

### Check Your Usage
1. Go to: **https://platform.openai.com/usage**
2. See daily usage graph
3. Download CSV for detailed breakdown

### CRM 3.0 Built-in Tracking
We log every AI operation in the database:
- Table: `crm3_ai_operations`
- Tracks: tokens used, latency, cost
- Query usage:
  ```sql
  SELECT 
    operation_type,
    COUNT(*) AS calls,
    SUM(input_tokens + output_tokens) AS total_tokens
  FROM crm3_ai_operations
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY operation_type;
  ```

---

## 🔒 Security Best Practices

### 1. Keep Your Key Secret
- ✅ Store in `.env.local` (not committed to git)
- ✅ Never share in screenshots or public repos
- ✅ Use different keys for dev/production

### 2. Rotate Keys Regularly
- Create new key every 3-6 months
- Delete old keys after rotation

### 3. Monitor for Unusual Activity
- Set up email alerts
- Check usage dashboard weekly
- Report suspicious activity to OpenAI immediately

---

## 🚀 Alternative: Use Without OpenAI

**CRM 3.0 works WITHOUT OpenAI API key!**

If you don't add the key, the system uses **rule-based fallbacks**:
- ✅ Lead scoring: Mathematical formula (engagement + recency + status)
- ✅ Intent detection: Keyword matching
- ✅ Sentiment: Text analysis rules
- ✅ Next Best Action: Rule engine
- ❌ AI Content Generation: Requires OpenAI
- ❌ AI Copilot Q&A: Requires OpenAI
- ❌ Conversation Summaries: Basic templates only

**So you can test everything first, then add the key when ready!**

---

## 🆚 Compare AI Providers

| Provider | Model | Input Cost | Output Cost | CRM Support |
|----------|-------|------------|-------------|-------------|
| **OpenAI** | GPT-4o-mini | $0.150/1M | $0.600/1M | ✅ Primary |
| **Anthropic** | Claude 3.5 Haiku | $0.25/1M | $1.25/1M | ✅ Fallback |
| **Google** | Gemini Flash | $0.075/1M | $0.30/1M | ⏳ Planned |

**Recommendation:** Start with OpenAI GPT-4o-mini (best balance of cost/quality)

---

## 📞 Need Help?

### OpenAI Support
- **Documentation:** https://platform.openai.com/docs
- **Help Center:** https://help.openai.com
- **Status Page:** https://status.openai.com
- **Community:** https://community.openai.com

### Billing Questions
- Email: billing@openai.com
- Response time: Usually 24-48 hours

---

## ✅ Quick Setup Checklist

- [ ] Create OpenAI account
- [ ] Add payment method
- [ ] Add $5 initial credit
- [ ] Create API key ("CRM 3.0")
- [ ] Copy key (starts with sk-proj-)
- [ ] Add to .env.local
- [ ] Set monthly budget ($20 recommended)
- [ ] Set email alert (50%)
- [ ] Test in CRM (analyze a lead)
- [ ] Check usage dashboard

---

## 🎯 Bottom Line

**Cost for typical CRM usage: $5-20/month**

This is **significantly cheaper** than:
- Hiring a marketing analyst ($3,000+/month)
- Lead scoring software ($99-499/month)
- Content creation tools ($50-200/month)
- Revenue intelligence platforms ($200-1,000/month)

**OpenAI API gives you ALL of this for ~$10/month!** 🚀

---

## 🔗 Quick Links

- **Sign Up:** https://platform.openai.com/signup
- **API Keys:** https://platform.openai.com/api-keys
- **Billing:** https://platform.openai.com/settings/organization/billing/overview
- **Usage:** https://platform.openai.com/usage
- **Pricing:** https://openai.com/api/pricing/
- **Docs:** https://platform.openai.com/docs

---

**Ready to get started?**

1. Go to: https://platform.openai.com/signup
2. Create account
3. Add payment ($5 minimum)
4. Create API key
5. Add to `.env.local`
6. Run `npm run dev`
7. Test AI features!

**Total time:** 5-10 minutes 🎉
