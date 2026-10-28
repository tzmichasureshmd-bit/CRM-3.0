# 🎯 How to Give Your Team Access to CRM 3.0

## ✅ What's Already Built

Your CRM has a **complete Employee Management System** with:
- 7 role types (Owner, Admin, Manager, Sales, Support, Marketing, Agent)
- Channel permissions (WhatsApp, Instagram, Facebook, Email, Telegram)
- Invitation system with secure tokens
- Join requests
- Audit logs

---

## 🚀 How to Give Access to Your Team

### **Option 1: Invite Employee (Recommended)**

1. **Go to Team Settings:**
   - Login to https://crm3.tzmicha.com
   - Click **Settings** (bottom left)
   - Click **Team Members**

2. **Click "Add Employee" button**

3. **Fill in details:**
   - Full Name: `Ramesh Kumar`
   - Email: `ramesh@company.com`
   - Role: Choose from:
     - **Admin** - Almost full access
     - **Manager** - Manage team, view all conversations
     - **Sales** - Manage leads, deals, contacts
     - **Support** - Reply to conversations, close tickets
     - **Marketing** - Create campaigns, manage segments
     - **Agent** - Basic access (reply to assigned conversations)

4. **Set Channel Access:**
   - Toggle which channels they can use
   - Example: Support team might only need WhatsApp + Email

5. **Set Permissions:**
   - ✅ View Conversations
   - ✅ Reply to Messages
   - ✅ Manage Contacts
   - ✅ Assign Conversations
   - ✅ Access Reports
   - ⬜ Manage Integrations (Admin only usually)
   - ⬜ Invite Employees (Admin only usually)

6. **Click "Add Employee"**

7. **They will show up in your team list immediately!**

---

### **Option 2: Send Invitation Email**

1. **Go to Team Settings → Invitations**

2. **Fill in:**
   - Email address
   - Role
   - Click "Send Invite"

3. **Copy the invitation link** (shown after sending)

4. **Share link with employee via:**
   - WhatsApp
   - Email
   - Telegram
   - SMS

5. **Link expires in 7 days** - employee must accept before expiry

---

### **Option 3: Join Request (Employee-Initiated)**

**Employee can request to join:**

1. **Employee goes to:** https://crm3.tzmicha.com/settings/team-requests

2. **Clicks "Request to Join a Company"**

3. **Enters your Company ID:**
   - You can find your Company ID in Settings → Company Profile
   - Example: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

4. **Employee submits request**

5. **You approve/reject** in Settings → Team Requests → "Incoming Requests"

---

## 📊 Role Permissions Matrix

### **Owner (You)**
- ✅ Everything - Full access

### **Admin**
- ✅ View all conversations
- ✅ Manage employees
- ✅ Change settings
- ✅ Access reports
- ✅ Manage integrations
- ❌ Manage billing (Owner only)

### **Manager**
- ✅ View team conversations
- ✅ Assign conversations
- ✅ Access reports
- ✅ Approve campaigns
- ❌ Add/remove employees
- ❌ Change settings

### **Sales**
- ✅ Manage leads & deals
- ✅ View assigned conversations
- ✅ Reply to messages
- ✅ Manage contacts
- ❌ View all conversations
- ❌ Manage team

### **Support**
- ✅ Reply to conversations
- ✅ Close/reopen tickets
- ✅ View assigned conversations
- ❌ Manage leads/deals
- ❌ Access reports

### **Marketing**
- ✅ Create campaigns
- ✅ Send broadcasts
- ✅ Manage segments
- ✅ View campaign reports
- ❌ Reply to conversations
- ❌ Manage contacts

### **Agent**
- ✅ View assigned conversations
- ✅ Reply to messages
- ❌ Assign conversations
- ❌ Manage contacts
- ❌ Access reports

---

## 🔐 Security Features

### **Deactivate Employee:**
1. Go to Team Members
2. Click **X** button next to employee
3. **Immediately invalidates their JWT token**
4. They are logged out and cannot login again

### **Remove Employee:**
1. Go to Team Members
2. Click **Trash** icon
3. Confirm removal
4. **Permanently removes access**

### **Audit Logs:**
- Every action is logged
- View in Settings → Audit
- Shows:
  - Who did what
  - When it happened
  - What changed
  - IP address

---

## ⚙️ IMPORTANT: Apply Migration 022

**Your employee system is built but needs the database tables created.**

### **Run this in Supabase SQL Editor:**

```sql
-- Go to: https://supabase.com/dashboard/project/ngvmzkavvkikisprtpgd
-- Click: SQL Editor
-- Paste the contents of: supabase/migrations/022_employees_rbac.sql
-- Click: Run
```

**This creates:**
- `employees` table
- `employee_invitations` table
- `audit_logs` table
- `join_requests` table (if not exists)

**After running, your team access system is 100% functional!**

---

## 📱 Mobile Access

Employees can access the CRM from:
- ✅ Desktop browser
- ✅ Mobile browser
- ✅ Android app (if built)
- ✅ iOS app (if built)

Same permissions apply on all devices.

---

## 🎯 Quick Start Example

**Scenario:** You want to add 3 support agents

1. **Go to:** https://crm3.tzmicha.com/settings/team
2. **Click:** Add Employee
3. **Add Agent 1:**
   - Name: Priya Sharma
   - Email: priya@company.com
   - Role: **Support**
   - Channels: WhatsApp, Email
   - Permissions: ✅ View Conversations, ✅ Reply Messages
4. **Repeat for Agent 2 & 3**
5. **Done!** They can login with their email

---

## 🔍 Where to Find Everything

- **Team Members:** Settings → Team Members
- **Send Invitations:** Settings → Invitations & Requests
- **View Permissions:** Settings → Roles & Permissions
- **Audit Logs:** Settings → Audit
- **Company ID:** Settings → Company Profile (copy from URL or page)

---

## ✅ Checklist

- [ ] Apply migration 022 in Supabase
- [ ] Add your first employee
- [ ] Set correct role and permissions
- [ ] Share login details with employee
- [ ] Employee can login and start working
- [ ] Check audit logs to verify access

---

**Need help?** All the UI is already built at https://crm3.tzmicha.com/settings/team

Just need to run the database migration and you're good to go! 🚀
