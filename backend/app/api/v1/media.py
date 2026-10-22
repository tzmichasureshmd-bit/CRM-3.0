from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()

VALID_FILE_TYPES = {"image", "video", "document", "audio", "other"}
MAX_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


class MediaAssetCreate(BaseModel):
    name: str
    file_type: str = "other"
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    storage_url: str
    thumbnail_url: Optional[str] = None
    alt_text: Optional[str] = None
    tags: List[str] = []


class MediaAssetUpdate(BaseModel):
    name: Optional[str] = None
    alt_text: Optional[str] = None
    tags: Optional[List[str]] = None
    thumbnail_url: Optional[str] = None


@router.get("/media")
async def list_media(
    search: Optional[str] = None,
    file_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if file_type and file_type not in VALID_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"file_type must be one of: {', '.join(VALID_FILE_TYPES)}")

    q = (
        db.table("media_assets")
        .select("id, name, file_type, mime_type, size_bytes, storage_url, thumbnail_url, alt_text, tags, created_by, created_at", count="exact")
        .eq("account_id", user["account_id"])
    )
    if file_type:
        q = q.eq("file_type", file_type)
    if search:
        q = q.or_(f"name.ilike.%{search}%,alt_text.ilike.%{search}%")

    res = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"data": res.data or [], "total": res.count or 0}


@router.get("/media/{asset_id}")
async def get_media_asset(
    asset_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("media_assets")
        .select("*")
        .eq("id", asset_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Asset not found")
    return res.data


@router.post("/media", status_code=201)
async def create_media_asset(
    body: MediaAssetCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    if not body.storage_url.strip():
        raise HTTPException(status_code=400, detail="storage_url is required")
    if body.file_type not in VALID_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"file_type must be one of: {', '.join(VALID_FILE_TYPES)}")
    if body.size_bytes is not None and body.size_bytes > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File size exceeds 50 MB limit")

    data = body.model_dump(exclude_none=True)
    data["account_id"] = user["account_id"]
    data["created_by"] = user["user_id"]
    res = db.table("media_assets").insert(data).execute()
    return res.data[0] if res.data else {}


@router.patch("/media/{asset_id}")
async def update_media_asset(
    asset_id: str,
    body: MediaAssetUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "name" in data and not data["name"].strip():
        raise HTTPException(status_code=400, detail="name cannot be empty")

    res = (
        db.table("media_assets")
        .update(data)
        .eq("id", asset_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Asset not found")
    return res.data[0]


@router.delete("/media/{asset_id}", status_code=204)
async def delete_media_asset(
    asset_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("media_assets").delete().eq("id", asset_id).eq("account_id", user["account_id"]).execute()
