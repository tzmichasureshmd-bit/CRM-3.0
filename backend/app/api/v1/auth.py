from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from app.db.supabase import get_db
from app.core.config import get_settings
from jose import jwt
from datetime import datetime, timedelta
import logging

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    account_name: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    account_id: str
    role: str


def create_token(user_id: str, account_id: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "account_id": account_id, "role": role, "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


@router.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest, db=Depends(get_db)):
    # Step 1: Authenticate with Supabase
    try:
        res = db.auth.sign_in_with_password({"email": body.email, "password": body.password})
        user = res.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[login] Supabase auth error: {e}")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Step 2: Get profile — use maybe_single so missing profile doesn't throw
    try:
        profile_res = (
            db.table("profiles")
            .select("account_id, role")
            .eq("user_id", user.id)
            .maybe_single()
            .execute()
        )
        account_id = profile_res.data.get("account_id", "") if profile_res.data else ""
        role = profile_res.data.get("role", "agent") if profile_res.data else "agent"
    except Exception as e:
        logger.error(f"[login] Profile fetch error for user {user.id}: {e}")
        # Profile missing — still allow login with empty account_id
        account_id = ""
        role = "agent"

    token = create_token(user.id, account_id, role)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        account_id=account_id,
        role=role,
    )


@router.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db=Depends(get_db)):
    # Step 1: Create Supabase Auth user
    try:
        res = db.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
        user = res.user
        if not user:
            raise HTTPException(status_code=400, detail="Failed to create user")
    except HTTPException:
        raise
    except Exception as e:
        err = str(e)
        logger.error(f"[register] Auth create_user error: {err}")
        if "already" in err.lower():
            raise HTTPException(status_code=409, detail="Email already registered. Please sign in.")
        raise HTTPException(status_code=400, detail=f"Could not create user: {err}")

    # Step 2: Create account (workspace)
    try:
        account_res = db.table("accounts").insert({
            "name": body.account_name.strip(),
            "plan": "free",
            "currency": "USD",
        }).execute()
        if not account_res.data:
            raise HTTPException(status_code=500, detail="Failed to create workspace")
        account_id = account_res.data[0]["id"]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[register] Account insert error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create workspace: {e}")

    # Step 3: Create profile
    try:
        db.table("profiles").insert({
            "user_id": user.id,
            "account_id": account_id,
            "full_name": body.full_name.strip(),
            "role": "owner",
        }).execute()
    except Exception as e:
        logger.error(f"[register] Profile insert error: {e}")
        # Non-fatal — token still works, profile can be created later

    token = create_token(user.id, account_id, "owner")
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        account_id=account_id,
        role="owner",
    )


@router.post("/auth/logout")
async def logout():
    return {"message": "Logged out"}


@router.get("/auth/me")
async def me(db=Depends(get_db)):
    """Debug endpoint — check what the DB returns. Remove in production."""
    return {"status": "ok", "debug": settings.debug}
