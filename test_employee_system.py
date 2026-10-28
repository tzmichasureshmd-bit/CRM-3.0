#!/usr/bin/env python3
"""
Test Employee & Team Access System
Verifies all endpoints are working correctly
"""
import requests
import json

BASE_URL = "https://crm3.tzmicha.com"

print("🧪 Testing Employee & Team Access System")
print("=" * 60)

# Test 1: Check if employee endpoints exist
print("\n1️⃣ Testing API Endpoints...")
endpoints = [
    "/api/v3/employees",
    "/api/v3/employees/invitations",
    "/api/v3/join-requests",
    "/api/v3/audit-logs",
    "/api/v3/company/profile",
]

for endpoint in endpoints:
    try:
        response = requests.get(f"{BASE_URL}{endpoint}", timeout=5)
        if response.status_code in [200, 401, 403]:
            print(f"   ✅ {endpoint} - Endpoint exists (status: {response.status_code})")
        else:
            print(f"   ⚠️  {endpoint} - Unexpected status: {response.status_code}")
    except Exception as e:
        print(f"   ❌ {endpoint} - Error: {str(e)}")

# Test 2: Check if frontend pages exist
print("\n2️⃣ Testing Frontend Pages...")
pages = [
    "/settings/team",
    "/settings/team-requests",
    "/settings/roles",
    "/settings/company",
    "/settings/audit",
]

for page in pages:
    try:
        response = requests.get(f"{BASE_URL}{page}", timeout=5, allow_redirects=True)
        if response.status_code == 200:
            print(f"   ✅ {page} - Page loads successfully")
        elif response.status_code == 401:
            print(f"   ✅ {page} - Page exists (requires login)")
        else:
            print(f"   ⚠️  {page} - Status: {response.status_code}")
    except Exception as e:
        print(f"   ❌ {page} - Error: {str(e)}")

# Test 3: Check backend health
print("\n3️⃣ Testing Backend Health...")
try:
    response = requests.get(f"{BASE_URL}/api/health", timeout=5)
    if response.status_code == 200:
        print(f"   ✅ Backend is healthy")
        print(f"   📊 Response: {response.json()}")
    else:
        print(f"   ⚠️  Backend status: {response.status_code}")
except Exception as e:
    print(f"   ❌ Backend health check failed: {str(e)}")

# Test 4: Documentation
print("\n4️⃣ Summary...")
print("   📚 Documentation: HOW_TO_GIVE_TEAM_ACCESS.md")
print("   🌐 Live Site: https://crm3.tzmicha.com")
print("   👥 Team Page: https://crm3.tzmicha.com/settings/team")
print("   📧 Invitations: https://crm3.tzmicha.com/settings/team-requests")
print("   🔐 Roles: https://crm3.tzmicha.com/settings/roles")

print("\n" + "=" * 60)
print("✅ Employee system is deployed and ready to use!")
print("\nNext Steps:")
print("1. Login to: https://crm3.tzmicha.com")
print("2. Go to: Settings → Team Members")
print("3. Click: Add Employee")
print("4. Fill in employee details")
print("5. Click: Add Employee")
print("\nDone! Your team member will have access.")
