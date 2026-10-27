#!/usr/bin/env python3
"""
Quick test to verify OpenAI API key is valid and working
"""
import os
import sys

try:
    from openai import OpenAI
except ImportError:
    print("❌ ERROR: openai package not installed")
    print("Run: pip install openai")
    sys.exit(1)

# Get API key from environment or .env.local
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    # Try to read from .env.local
    try:
        with open(".env.local", "r") as f:
            for line in f:
                if line.startswith("OPENAI_API_KEY="):
                    api_key = line.split("=", 1)[1].strip()
                    break
    except:
        pass

if not api_key or api_key == "sk-..." or len(api_key) < 20:
    print("❌ ERROR: No valid OpenAI API key found")
    print("Set OPENAI_API_KEY in .env.local")
    sys.exit(1)

print(f"🔑 API Key found: {api_key[:15]}...{api_key[-4:]}")
print(f"📏 Length: {len(api_key)} characters")
print()

# Test the key with a simple API call
print("🧪 Testing OpenAI API key...")
try:
    client = OpenAI(api_key=api_key)
    
    # Make a simple completion request
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Say 'API key is working!' in one short sentence."}
        ],
        max_tokens=50,
        temperature=0.3
    )
    
    result = response.choices[0].message.content
    tokens_used = response.usage.total_tokens
    
    print("✅ SUCCESS! OpenAI API key is VALID and WORKING!")
    print(f"🤖 Response: {result}")
    print(f"🎟️  Tokens used: {tokens_used}")
    print()
    print("✨ Your CRM 3.0 AI features are ready to use!")
    
except Exception as e:
    print(f"❌ ERROR: API key test failed")
    print(f"Error: {str(e)}")
    print()
    if "auth" in str(e).lower() or "invalid" in str(e).lower():
        print("🔍 This looks like an authentication error.")
        print("Your API key might be:")
        print("  - Expired")
        print("  - Invalid")
        print("  - Revoked")
        print()
        print("Get a new key from: https://platform.openai.com/api-keys")
    sys.exit(1)
