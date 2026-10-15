from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.db.supabase import get_db
from app.core.config import get_settings

settings = get_settings()
bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer),
    db=Depends(get_db),
) -> dict:
    token = credentials.credentials
    try:
        # Supabase JWTs are signed with the JWT secret (found in Supabase dashboard → Settings → API)
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Derive account_id from profiles table (never trust token claims for account_id)
        profile_res = (
            db.table("profiles")
            .select("account_id, role")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not profile_res.data:
            raise HTTPException(status_code=403, detail="Profile not found")

        return {
            "user_id": user_id,
            "account_id": profile_res.data["account_id"],
            "role": profile_res.data.get("role", "agent"),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_role(*roles: str):
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker
