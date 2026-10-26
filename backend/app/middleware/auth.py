from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.db.supabase import get_supabase
from app.core.config import get_settings

settings = get_settings()
bearer   = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer),
) -> dict:
    db    = get_supabase()
    token = credentials.credentials
    try:
        # CRM JWTs are HS256 tokens issued by FastAPI (NOT Supabase Auth tokens).
        # The jwt_secret is the CRM application secret, not the Supabase JWT secret.
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Reject partial TOTP tokens on all protected routes
        if payload.get("partial"):
            raise HTTPException(status_code=401, detail="Incomplete authentication")

        # Derive account_id, role, is_active, and token_version from DB (never trust token claims)
        profile_res = (
            db.table("profiles")
            .select("account_id, role, token_version, is_active")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not profile_res or not profile_res.data:
            raise HTTPException(status_code=403, detail="Profile not found")

        p = profile_res.data[0]

        # Reject suspended accounts on every request, not just at login
        if p.get("is_active") is False:
            raise HTTPException(status_code=403, detail="Account is suspended. Contact support.")

        # FIX-005: Validate token version — rejects sessions issued before password reset
        token_ver   = payload.get("ver", 1) or 1
        profile_ver = p.get("token_version", 1) or 1
        if token_ver < profile_ver:
            raise HTTPException(status_code=401, detail="Session invalidated. Please sign in again.")

        return {
            "user_id":    user_id,
            "account_id": p["account_id"],
            "role":       p.get("role", "agent"),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_role(*roles: str):
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker
