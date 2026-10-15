from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from app.core.config import get_settings
from jose import jwt
from datetime import datetime, timedelta
from passlib.context import CryptContext
import pyotp, qrcode
from io import BytesIO
import base64, httpx, logging, secrets
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

router   = APIRouter()
settings = get_settings()
logger   = logging.getLogger(__name__)
pwd_ctx  = CryptContext(schemes=["bcrypt"], deprecated="auto")

FIREBASE_PROJECT_ID = settings.firebase_project_id


# ── Models ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    account_name: str

class GoogleAuthRequest(BaseModel):
    id_token: str

class TotpVerifyLoginRequest(BaseModel):
    partial_token: str
    code: str

class TotpEnableRequest(BaseModel):
    code: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user_id:      str
    account_id:   str
    role:         str
    full_name:    str
    email:        str
    avatar_url:   str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def create_token(user_id: str, account_id: str, role: str, partial: bool = False) -> str:
    expire = datetime.utcnow() + timedelta(minutes=5 if partial else settings.jwt_expire_minutes)
    payload = {"sub": user_id, "account_id": account_id, "role": role, "exp": expire}
    if partial:
        payload["partial"] = True
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


FIREBASE_CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

async def verify_firebase_token(id_token: str) -> dict:
    """Verify Firebase ID token using google-auth library."""
    import asyncio
    try:
        # Fetch Firebase public certs
        async with httpx.AsyncClient() as client:
            certs_resp = await client.get(FIREBASE_CERT_URL)
        certs = certs_resp.json()

        # Verify token in thread (google-auth is sync)
        def _verify():
            request = google_requests.Request()
            return google_id_token.verify_firebase_token(
                id_token,
                request,
                audience=settings.firebase_project_id,
            )

        payload = await asyncio.to_thread(_verify)
        logger.info(f"[firebase] verified sub={payload.get('sub')} email={payload.get('email')}")
        return payload
    except Exception as e:
        logger.error(f"[firebase] verification failed: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)[:100]}")


def get_profile(db, user_id: str) -> dict:
    res = db.table("profiles").select("user_id,account_id,role,full_name,email,avatar_url,totp_secret,totp_enabled") \
            .eq("user_id", user_id).maybe_single().execute()
    return res.data or {}


# ── Email / Password ──────────────────────────────────────────────────────────

@router.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db=Depends(get_db)):
    # Check duplicate
    existing = db.table("profiles").select("user_id").eq("email", body.email.lower()).maybe_single().execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Email already registered. Please sign in.")

    try:
        account_res = db.table("accounts").insert({"name": body.account_name.strip(), "plan": "free", "currency": "USD"}).execute()
        account_id  = account_res.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create workspace: {e}")

    import uuid
    user_id = str(uuid.uuid4())
    pw_hash = pwd_ctx.hash(body.password)

    try:
        db.table("profiles").insert({
            "user_id":    user_id,
            "account_id": account_id,
            "full_name":  body.full_name.strip(),
            "email":      body.email.lower(),
            "password_hash": pw_hash,
            "role":       "owner",
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create profile: {e}")

    return TokenResponse(
        access_token=create_token(user_id, account_id, "owner"),
        user_id=user_id, account_id=account_id, role="owner",
        full_name=body.full_name.strip(), email=body.email.lower(),
    )


@router.post("/auth/login")
async def login(body: LoginRequest, db=Depends(get_db)):
    profile = db.table("profiles").select("user_id,account_id,role,full_name,email,avatar_url,password_hash,totp_secret,totp_enabled") \
                .eq("email", body.email.lower()).maybe_single().execute()
    p = profile.data
    if not p or not p.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not pwd_ctx.verify(body.password, p["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if p.get("totp_enabled"):
        partial = create_token(p["user_id"], p["account_id"], p["role"], partial=True)
        return {"totp_required": True, "partial_token": partial}

    return TokenResponse(
        access_token=create_token(p["user_id"], p["account_id"], p["role"]),
        user_id=p["user_id"], account_id=p["account_id"], role=p["role"],
        full_name=p.get("full_name", ""), email=p.get("email", ""), avatar_url=p.get("avatar_url", ""),
    )


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.post("/auth/google", response_model=TokenResponse)
async def google_auth(body: GoogleAuthRequest, db=Depends(get_db)):
    payload    = await verify_firebase_token(body.id_token)
    google_id  = payload["sub"]
    email      = payload.get("email", "")
    full_name  = payload.get("name", email.split("@")[0])
    avatar_url = payload.get("picture", "")

    existing = db.table("profiles").select("user_id,account_id,role").eq("google_id", google_id).maybe_single().execute()
    if existing.data:
        p = existing.data
        return TokenResponse(
            access_token=create_token(p["user_id"], p["account_id"], p["role"]),
            user_id=p["user_id"], account_id=p["account_id"], role=p["role"],
            full_name=full_name, email=email, avatar_url=avatar_url,
        )

    try:
        account_res = db.table("accounts").insert({"name": full_name, "plan": "free", "currency": "USD"}).execute()
        account_id  = account_res.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create workspace: {e}")

    try:
        db.table("profiles").insert({
            "user_id": google_id, "account_id": account_id, "full_name": full_name,
            "email": email, "avatar_url": avatar_url, "google_id": google_id, "role": "owner",
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create profile: {e}")

    return TokenResponse(
        access_token=create_token(google_id, account_id, "owner"),
        user_id=google_id, account_id=account_id, role="owner",
        full_name=full_name, email=email, avatar_url=avatar_url,
    )


# ── TOTP / Google Authenticator ───────────────────────────────────────────────

@router.get("/auth/totp/setup")
async def totp_setup(user: dict = Depends(get_current_user), db=Depends(get_db)):
    """Generate a TOTP secret + QR code for the user to scan."""
    profile = get_profile(db, user["user_id"])
    secret  = profile.get("totp_secret") or pyotp.random_base32()

    # Save secret if new
    if not profile.get("totp_secret"):
        db.table("profiles").update({"totp_secret": secret}).eq("user_id", user["user_id"]).execute()

    email   = profile.get("email", user["user_id"])
    uri     = pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name="TZMICHA CRM")

    # Generate QR as base64 PNG
    img     = qrcode.make(uri)
    buf     = BytesIO()
    img.save(buf, format="PNG")
    qr_b64  = base64.b64encode(buf.getvalue()).decode()

    return {"qr_url": f"data:image/png;base64,{qr_b64}", "secret": secret}


@router.post("/auth/totp/enable")
async def totp_enable(body: TotpEnableRequest, user: dict = Depends(get_current_user), db=Depends(get_db)):
    """Verify code and mark TOTP as enabled."""
    profile = get_profile(db, user["user_id"])
    secret  = profile.get("totp_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="Run /auth/totp/setup first")

    totp = pyotp.TOTP(secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code. Try again.")

    db.table("profiles").update({"totp_enabled": True}).eq("user_id", user["user_id"]).execute()
    return {"message": "Google Authenticator enabled"}


@router.post("/auth/totp/verify-login", response_model=TokenResponse)
async def totp_verify_login(body: TotpVerifyLoginRequest, db=Depends(get_db)):
    """After email/password login, verify TOTP code using partial token."""
    try:
        payload = jwt.decode(body.partial_token, settings.jwt_secret,
                             algorithms=[settings.jwt_algorithm], options={"verify_aud": False})
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    if not payload.get("partial"):
        raise HTTPException(status_code=400, detail="Not a partial token")

    user_id = payload["sub"]
    profile = get_profile(db, user_id)
    secret  = profile.get("totp_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="TOTP not configured")

    if not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code. Try again.")

    return TokenResponse(
        access_token=create_token(user_id, profile["account_id"], profile["role"]),
        user_id=user_id, account_id=profile["account_id"], role=profile["role"],
        full_name=profile.get("full_name", ""), email=profile.get("email", ""), avatar_url=profile.get("avatar_url", ""),
    )


@router.post("/auth/totp/disable")
async def totp_disable(body: TotpEnableRequest, user: dict = Depends(get_current_user), db=Depends(get_db)):
    """Disable TOTP — requires current code to confirm."""
    profile = get_profile(db, user["user_id"])
    secret  = profile.get("totp_secret")
    if not secret or not profile.get("totp_enabled"):
        raise HTTPException(status_code=400, detail="TOTP is not enabled")
    if not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")
    db.table("profiles").update({"totp_enabled": False, "totp_secret": None}).eq("user_id", user["user_id"]).execute()
    return {"message": "Google Authenticator disabled"}


# ── Email OTP ─────────────────────────────────────────────────────────────────

class OtpSendRequest(BaseModel):
    email: EmailStr

class OtpVerifyRequest(BaseModel):
    email: EmailStr
    code: str


@router.post("/auth/otp/send")
async def otp_send(body: OtpSendRequest, db=Depends(get_db)):
    """Generate a 6-digit OTP, store it, and email it to the user."""
    from app.services.email_service import get_email_service

    code       = "".join([str(secrets.randbelow(10)) for _ in range(6)])
    expires_at = (datetime.utcnow() + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%S")

    # Upsert OTP record (one row per email)
    db.table("email_otps").upsert({
        "email":      body.email.lower(),
        "code":       code,
        "expires_at": expires_at,
        "used":       False,
    }, on_conflict="email").execute()

    svc = get_email_service()
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8f9ff;border-radius:16px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="display:inline-flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#4f6df5,#8b5cf6);display:flex;align-items:center;justify-content:center">
            <span style="color:white;font-size:18px">⚡</span>
          </div>
          <span style="font-size:18px;font-weight:700;color:#0f1117">TZMICHA CRM</span>
        </div>
      </div>
      <h2 style="text-align:center;color:#0f1117;margin:0 0 8px">Your sign-in code</h2>
      <p style="text-align:center;color:#8790aa;margin:0 0 28px;font-size:14px">Use this code to sign in. It expires in 10 minutes.</p>
      <div style="background:white;border-radius:14px;padding:28px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
        <div style="font-size:42px;font-weight:800;letter-spacing:0.25em;color:#4f6df5;font-family:monospace">{code}</div>
      </div>
      <p style="text-align:center;color:#8790aa;font-size:12px;margin-top:20px">If you didn't request this, ignore this email.</p>
    </div>
    """
    await svc.send_email(
        to=body.email,
        subject="Your TZMICHA CRM sign-in code",
        body=f"Your sign-in code is: {code}  (expires in 10 minutes)",
        html=html,
    )
    return {"message": "OTP sent"}


@router.post("/auth/otp/verify", response_model=TokenResponse)
async def otp_verify(body: OtpVerifyRequest, db=Depends(get_db)):
    """Verify OTP, auto-create account if new user, return CRM JWT."""
    row = db.table("email_otps").select("*").eq("email", body.email.lower()).maybe_single().execute()
    r = row.data
    if not r:
        raise HTTPException(status_code=400, detail="No OTP found for this email. Request a new code.")
    if r.get("used"):
        raise HTTPException(status_code=400, detail="Code already used. Request a new one.")
    if datetime.utcnow() > datetime.strptime(r["expires_at"][:19], "%Y-%m-%dT%H:%M:%S"):
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")
    if r["code"] != body.code.strip():
        raise HTTPException(status_code=400, detail="Invalid code. Try again.")

    # Mark used
    db.table("email_otps").update({"used": True}).eq("email", body.email.lower()).execute()

    # Check existing profile
    existing = db.table("profiles").select("user_id,account_id,role,full_name,email,avatar_url") \
                 .eq("email", body.email.lower()).maybe_single().execute()

    if existing.data:
        p = existing.data
        return TokenResponse(
            access_token=create_token(p["user_id"], p["account_id"], p["role"]),
            user_id=p["user_id"], account_id=p["account_id"], role=p["role"],
            full_name=p.get("full_name", ""), email=p.get("email", ""), avatar_url=p.get("avatar_url", ""),
        )

    # New user — auto-create
    import uuid
    user_id = str(uuid.uuid4())
    name    = body.email.split("@")[0]

    account_res = db.table("accounts").insert({"name": name, "plan": "free", "currency": "USD"}).execute()
    account_id  = account_res.data[0]["id"]

    db.table("profiles").insert({
        "user_id": user_id, "account_id": account_id,
        "full_name": name, "email": body.email.lower(), "role": "owner",
    }).execute()

    return TokenResponse(
        access_token=create_token(user_id, account_id, "owner"),
        user_id=user_id, account_id=account_id, role="owner",
        full_name=name, email=body.email.lower(),
    )


@router.post("/auth/logout")
async def logout():
    return {"message": "Logged out"}
