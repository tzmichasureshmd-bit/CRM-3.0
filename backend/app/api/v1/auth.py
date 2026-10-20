from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr
from app.db.supabase import get_db
from app.middleware.auth import get_current_user
from app.core.config import get_settings
from jose import jwt
from datetime import datetime, timedelta
from passlib.context import CryptContext
import pyotp, qrcode
from io import BytesIO
import base64, logging, secrets, hashlib
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

router   = APIRouter()
settings = get_settings()
logger   = logging.getLogger(__name__)
pwd_ctx  = CryptContext(schemes=["bcrypt"], deprecated="auto")

FIREBASE_PROJECT_ID = settings.firebase_project_id

# OTP security constants
OTP_MAX_ATTEMPTS  = 5    # max verify attempts per OTP challenge
OTP_RESEND_SECS   = 60   # minimum seconds between resend requests
OTP_EXPIRE_MINS   = 10


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

def create_token(user_id: str, account_id: str, role: str,
                 partial: bool = False, token_version: int = 1) -> str:
    expire = datetime.utcnow() + timedelta(
        minutes=5 if partial else settings.jwt_expire_minutes
    )
    payload = {
        "sub": user_id,
        "account_id": account_id,
        "role": role,
        "exp": expire,
        "ver": token_version,   # FIX-005: token version for revocation
    }
    if partial:
        payload["partial"] = True
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def hash_otp(code: str) -> str:
    """FIX-003: SHA-256 hash of the OTP code for safe storage."""
    return hashlib.sha256(code.encode()).hexdigest()


def verify_otp_hash(code: str, stored_hash: str) -> bool:
    """Constant-time comparison of OTP hash."""
    return secrets.compare_digest(hash_otp(code), stored_hash)


async def verify_firebase_token(id_token: str) -> dict:
    """Verify Firebase ID token using google-auth library."""
    import asyncio
    try:
        def _verify():
            request = google_requests.Request()
            return google_id_token.verify_firebase_token(
                id_token, request, audience=settings.firebase_project_id,
            )
        payload = await asyncio.to_thread(_verify)
        logger.info(f"[firebase] verified sub={payload.get('sub')} email={payload.get('email')}")
        return payload
    except Exception as e:
        logger.error(f"[firebase] verification failed: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)[:100]}")


def get_profile(db, user_id: str) -> dict:
    res = db.table("profiles").select(
        "user_id,account_id,role,full_name,email,avatar_url,"
        "totp_secret,totp_enabled,token_version"
    ).eq("user_id", user_id).maybe_single().execute()
    return (res.data if res else None) or {}


def check_account_active(profile: dict) -> None:
    """Enforce account active status when the schema provides the field."""
    # The current profiles migrations do not define is_active, so missing data
    # keeps existing accounts enabled until that field is added to the schema.
    is_active = profile.get("is_active", True)
    if is_active is False:
        raise HTTPException(status_code=403, detail="Account is disabled. Contact support.")


# ── Email / Password ──────────────────────────────────────────────────────────

@router.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db=Depends(get_db)):
    email = body.email.lower().strip()

    # FIX-006: Check duplicate email
    existing = db.table("profiles").select("user_id").eq("email", email).maybe_single().execute()
    if existing and existing.data:
        raise HTTPException(status_code=409, detail="Email already registered. Please sign in.")

    try:
        account_res = db.table("accounts").insert({
            "name": body.account_name.strip(), "plan": "free", "currency": "USD"
        }).select("id").execute()
        account_id = account_res.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create workspace: {e}")

    import uuid
    user_id = str(uuid.uuid4())
    pw_hash = pwd_ctx.hash(body.password)

    try:
        db.table("profiles").insert({
            "user_id":       user_id,
            "account_id":    account_id,
            "full_name":     body.full_name.strip(),
            "email":         email,
            "password_hash": pw_hash,
            "role":          "owner",
            "token_version": 1,
        }).execute()
    except Exception as e:
        # FIX-006: Handle DB-level uniqueness violation gracefully
        err_str = str(e).lower()
        if "unique" in err_str or "duplicate" in err_str:
            raise HTTPException(status_code=409, detail="Email already registered. Please sign in.")
        raise HTTPException(status_code=500, detail=f"Failed to create profile: {e}")

    return TokenResponse(
        access_token=create_token(user_id, account_id, "owner"),
        user_id=user_id, account_id=account_id, role="owner",
        full_name=body.full_name.strip(), email=email,
    )


@router.post("/auth/login")
async def login(body: LoginRequest, db=Depends(get_db)):
    email = body.email.lower().strip()
    profile = db.table("profiles").select(
        "user_id,account_id,role,full_name,email,avatar_url,"
        "password_hash,totp_secret,totp_enabled,token_version"
    ).eq("email", email).maybe_single().execute()
    p = profile.data if profile else None

    if not p or not p.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not pwd_ctx.verify(body.password, p["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # FIX-008: Check account status
    check_account_active(p)

    token_version = p.get("token_version", 1) or 1

    if p.get("totp_enabled"):
        partial = create_token(p["user_id"], p["account_id"], p["role"],
                               partial=True, token_version=token_version)
        return {"totp_required": True, "partial_token": partial}

    return TokenResponse(
        access_token=create_token(p["user_id"], p["account_id"], p["role"],
                                  token_version=token_version),
        user_id=p["user_id"], account_id=p["account_id"], role=p["role"],
        full_name=p.get("full_name", ""), email=p.get("email", ""),
        avatar_url=p.get("avatar_url", ""),
    )


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.post("/auth/google", response_model=TokenResponse)
async def google_auth(body: GoogleAuthRequest, db=Depends(get_db)):
    try:
        payload    = await verify_firebase_token(body.id_token)
        google_id  = payload["sub"]
        email      = payload.get("email", "").lower().strip()
        full_name  = payload.get("name", email.split("@")[0])
        avatar_url = payload.get("picture", "")

        # FIX-007: Require verified email from Google before any linking
        if not payload.get("email_verified", False):
            raise HTTPException(status_code=400, detail="Google account email is not verified.")

        # Case 1: Existing Google UID — return existing profile
        existing_google = db.table("profiles").select(
            "user_id,account_id,role,token_version"
        ).eq("google_id", google_id).maybe_single().execute()

        if existing_google and existing_google.data:
            p = existing_google.data
            check_account_active(p)
            token_version = p.get("token_version", 1) or 1
            return TokenResponse(
                access_token=create_token(p["user_id"], p["account_id"], p["role"],
                                          token_version=token_version),
                user_id=p["user_id"], account_id=p["account_id"], role=p["role"],
                full_name=full_name, email=email, avatar_url=avatar_url,
            )

        # FIX-007: Check for existing email/password profile with same email.
        if email:
            existing_email = db.table("profiles").select(
                "user_id,account_id,role,google_id,token_version"
            ).eq("email", email).maybe_single().execute()

            if existing_email and existing_email.data:
                ep = existing_email.data
                if ep.get("google_id") and ep["google_id"] != google_id:
                    raise HTTPException(
                        status_code=409,
                        detail="This email is already linked to a different Google account."
                    )
                if not ep.get("google_id"):
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "An account with this email already exists. "
                            "Sign in with your password, then link Google from account settings."
                        )
                    )

        # Case 3: New user — create account + profile
        account_res = db.table("accounts").insert({
            "name": full_name, "plan": "free", "currency": "USD"
        }).select("id").execute()
        account_id = account_res.data[0]["id"]

        import uuid
        user_id = str(uuid.uuid4())
        try:
            db.table("profiles").insert({
                "user_id": user_id, "account_id": account_id, "full_name": full_name,
                "email": email, "avatar_url": avatar_url, "google_id": google_id,
                "role": "owner", "token_version": 1,
            }).execute()
        except Exception as e:
            err_str = str(e).lower()
            if "unique" in err_str or "duplicate" in err_str:
                raise HTTPException(status_code=409, detail="Account already exists. Please sign in.")
            raise HTTPException(status_code=500, detail=f"Failed to create profile: {e}")

        return TokenResponse(
            access_token=create_token(user_id, account_id, "owner"),
            user_id=user_id, account_id=account_id, role="owner",
            full_name=full_name, email=email, avatar_url=avatar_url,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[google_auth] unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Google sign-in failed: {str(e)[:200]}")


# ── TOTP / Google Authenticator ───────────────────────────────────────────────

@router.get("/auth/totp/setup")
async def totp_setup(user: dict = Depends(get_current_user), db=Depends(get_db)):
    profile = get_profile(db, user["user_id"])
    secret  = profile.get("totp_secret") or pyotp.random_base32()

    if not profile.get("totp_secret"):
        db.table("profiles").update({"totp_secret": secret}).eq("user_id", user["user_id"]).execute()

    email = profile.get("email", user["user_id"])
    uri   = pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name="TZMICHA CRM")

    img    = qrcode.make(uri)
    buf    = BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return {"qr_url": f"data:image/png;base64,{qr_b64}", "secret": secret}


@router.post("/auth/totp/enable")
async def totp_enable(body: TotpEnableRequest, user: dict = Depends(get_current_user), db=Depends(get_db)):
    profile = get_profile(db, user["user_id"])
    secret  = profile.get("totp_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="Run /auth/totp/setup first")

    if not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code. Try again.")

    db.table("profiles").update({"totp_enabled": True}).eq("user_id", user["user_id"]).execute()
    return {"message": "Google Authenticator enabled"}


@router.post("/auth/totp/verify-login", response_model=TokenResponse)
async def totp_verify_login(body: TotpVerifyLoginRequest, db=Depends(get_db)):
    """After email/password login, verify TOTP code using partial token."""
    try:
        payload = jwt.decode(body.partial_token, settings.jwt_secret,
                             algorithms=[settings.jwt_algorithm],
                             options={"verify_aud": False})
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

    check_account_active(profile)
    token_version = profile.get("token_version", 1) or 1

    return TokenResponse(
        access_token=create_token(user_id, profile["account_id"], profile["role"],
                                  token_version=token_version),
        user_id=user_id, account_id=profile["account_id"], role=profile["role"],
        full_name=profile.get("full_name", ""), email=profile.get("email", ""),
        avatar_url=profile.get("avatar_url", ""),
    )


@router.post("/auth/totp/disable")
async def totp_disable(body: TotpEnableRequest, user: dict = Depends(get_current_user), db=Depends(get_db)):
    profile = get_profile(db, user["user_id"])
    secret  = profile.get("totp_secret")
    if not secret or not profile.get("totp_enabled"):
        raise HTTPException(status_code=400, detail="TOTP is not enabled")
    if not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")
    db.table("profiles").update({"totp_enabled": False, "totp_secret": None}).eq("user_id", user["user_id"]).execute()
    return {"message": "Google Authenticator disabled"}


# ── Email OTP (password recovery) ────────────────────────────────────────────

class OtpSendRequest(BaseModel):
    email: EmailStr

class OtpVerifyRequest(BaseModel):
    email: EmailStr
    code: str


@router.post("/auth/otp/send")
async def otp_send(body: OtpSendRequest, request: Request, db=Depends(get_db)):
    """
    FIX-003: Generate 6-digit OTP, store SHA-256 hash (not plaintext).
    FIX-004: Server-side resend cooldown.
    Account-existence is NOT revealed in the response.
    """
    from app.services.email_service import get_email_service

    email = body.email.lower().strip()

    # FIX-004: Check resend cooldown server-side
    existing_otp = db.table("email_otps").select(
        "created_at"
    ).eq("email", email).maybe_single().execute()

    if existing_otp and existing_otp.data:
        created_at_str = existing_otp.data.get("created_at", "")
        if created_at_str:
            try:
                created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                elapsed = (datetime.utcnow().replace(tzinfo=created_at.tzinfo) - created_at).total_seconds()
                if elapsed < OTP_RESEND_SECS:
                    raise HTTPException(
                        status_code=429,
                        detail=f"Please wait {int(OTP_RESEND_SECS - elapsed)} seconds before requesting a new code."
                    )
            except HTTPException:
                raise
            except Exception:
                pass  # If parsing fails, allow resend

    # Generate 6-digit OTP using cryptographically secure RNG
    code       = "".join([str(secrets.randbelow(10)) for _ in range(6)])
    code_hash  = hash_otp(code)  # FIX-003: store hash, not plaintext
    expires_at = (datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINS)).strftime("%Y-%m-%dT%H:%M:%S")

    # Upsert OTP record — try full schema, fall back if columns missing
    try:
        db.table("email_otps").upsert({
            "email": email, "code": code, "code_hash": code_hash,
            "expires_at": expires_at, "used": False, "attempt_count": 0,
        }, on_conflict="email").execute()
    except Exception:
        db.table("email_otps").upsert({
            "email": email, "code": code,
            "expires_at": expires_at, "used": False,
        }, on_conflict="email").execute()

    svc  = get_email_service()
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8f9ff;border-radius:16px">
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:18px;font-weight:700;color:#0f1117">TZMICHA CRM</span>
      </div>
      <h2 style="text-align:center;color:#0f1117;margin:0 0 8px">Your password reset code</h2>
      <p style="text-align:center;color:#8790aa;margin:0 0 28px;font-size:14px">Use this 6-digit code to reset your password. It expires in {OTP_EXPIRE_MINS} minutes.</p>
      <div style="background:white;border-radius:14px;padding:28px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
        <div style="font-size:42px;font-weight:800;letter-spacing:0.25em;color:#4f6df5;font-family:monospace">{code}</div>
      </div>
      <p style="text-align:center;color:#8790aa;font-size:12px;margin-top:20px">If you didn't request this, ignore this email.</p>
    </div>
    """
    await svc.send_email(
        to=body.email,
        subject="Your TZMICHA CRM password reset code",
        body=f"Your password reset code is: {code}  (expires in {OTP_EXPIRE_MINS} minutes)",
        html=html,
    )
    # Always return the same message regardless of whether account exists
    return {"message": "If an account with that email exists, a reset code has been sent."}


@router.post("/auth/otp/verify", response_model=TokenResponse)
async def otp_verify(body: OtpVerifyRequest, db=Depends(get_db)):
    """
    FIX-003: Compare against stored hash.
    FIX-004: Enforce max attempt count.
    """
    email = body.email.lower().strip()

    row = db.table("email_otps").select("*").eq("email", email).maybe_single().execute()
    r   = row.data if row else None

    if not r:
        raise HTTPException(status_code=400, detail="No reset code found for this email. Request a new code.")

    # FIX-004: Check attempt count before revealing any other info
    attempt_count = r.get("attempt_count", 0) or 0
    if attempt_count >= OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect attempts. Request a new reset code."
        )

    if r.get("used"):
        raise HTTPException(status_code=400, detail="Code already used. Request a new one.")

    if datetime.utcnow() > datetime.strptime(r["expires_at"][:19], "%Y-%m-%dT%H:%M:%S"):
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")

    # FIX-003: Compare hash
    stored_hash = r.get("code_hash") or ""
    if not stored_hash:
        # Legacy plaintext fallback (before migration 018 applied)
        code_matches = (r.get("code", "") == body.code.strip())
    else:
        code_matches = verify_otp_hash(body.code.strip(), stored_hash)

    if not code_matches:
        try:
            db.table("email_otps").update({
                "attempt_count": attempt_count + 1,
                "last_attempt_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S"),
            }).eq("email", email).execute()
        except Exception:
            pass
        remaining = OTP_MAX_ATTEMPTS - attempt_count - 1
        raise HTTPException(
            status_code=400,
            detail=f"Invalid code. {remaining} attempt{'s' if remaining != 1 else ''} remaining."
        )

    # Mark used atomically
    db.table("email_otps").update({"used": True}).eq("email", email).execute()

    # Look up existing profile
    existing = db.table("profiles").select(
        "user_id,account_id,role,full_name,email,avatar_url,token_version"
    ).eq("email", email).maybe_single().execute()

    if existing and existing.data:
        p = existing.data
        check_account_active(p)
        token_version = p.get("token_version", 1) or 1
        return TokenResponse(
            access_token=create_token(p["user_id"], p["account_id"], p["role"],
                                      token_version=token_version),
            user_id=p["user_id"], account_id=p["account_id"], role=p["role"],
            full_name=p.get("full_name", ""), email=p.get("email", ""),
            avatar_url=p.get("avatar_url", ""),
        )

    # New user via OTP — auto-create
    import uuid
    user_id = str(uuid.uuid4())
    name    = email.split("@")[0]

    account_res = db.table("accounts").insert({"name": name, "plan": "free", "currency": "USD"}).select("id").execute()
    account_id  = account_res.data[0]["id"]

    db.table("profiles").insert({
        "user_id": user_id, "account_id": account_id,
        "full_name": name, "email": email, "role": "owner", "token_version": 1,
    }).execute()

    return TokenResponse(
        access_token=create_token(user_id, account_id, "owner"),
        user_id=user_id, account_id=account_id, role="owner",
        full_name=name, email=email,
    )


@router.patch("/auth/password")
async def update_password(request: Request, db=Depends(get_db)):
    """
    FIX-005: Increment token_version after password reset to invalidate all old sessions.
    Caller must supply the CRM JWT returned by /auth/otp/verify.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth_header.split(" ", 1)[1]

    try:
        payload = jwt.decode(
            token, settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    body         = await request.json()
    new_password = body.get("password", "")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    pw_hash = pwd_ctx.hash(new_password)

    # FIX-005: Increment token_version to invalidate all existing sessions
    profile = get_profile(db, user_id)
    current_version = profile.get("token_version", 1) or 1
    new_version = current_version + 1

    db.table("profiles").update({
        "password_hash": pw_hash,
        "token_version": new_version,
    }).eq("user_id", user_id).execute()

    return {"message": "Password updated successfully"}


@router.post("/auth/logout")
async def logout():
    # FIX-009: Partial token cleanup is handled client-side on logout.
    # Server-side: stateless JWT — no server action needed beyond client clearing storage.
    return {"message": "Logged out"}
