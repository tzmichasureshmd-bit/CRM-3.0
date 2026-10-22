from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.db.supabase import get_db
from app.middleware.auth import get_current_user

router = APIRouter()

VALID_STATUSES = {"draft", "published", "archived"}
VALID_CATEGORIES = {"faq", "guide", "policy", "product", "support", "general"}


class KnowledgeDocCreate(BaseModel):
    title: str
    content: str
    category: str = "general"
    status: str = "draft"
    tags: List[str] = []


class KnowledgeDocUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None


@router.get("/knowledge")
async def list_knowledge(
    search: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if status and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(VALID_STATUSES)}")
    if category and category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of: {', '.join(VALID_CATEGORIES)}")

    q = (
        db.table("knowledge_documents")
        .select("id, title, content, category, status, tags, created_by, created_at, updated_at", count="exact")
        .eq("account_id", user["account_id"])
    )
    if status:
        q = q.eq("status", status)
    if category:
        q = q.eq("category", category)
    if search:
        q = q.or_(f"title.ilike.%{search}%,content.ilike.%{search}%")

    res = q.order("updated_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"data": res.data or [], "total": res.count or 0}


@router.get("/knowledge/{doc_id}")
async def get_knowledge_doc(
    doc_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    res = (
        db.table("knowledge_documents")
        .select("*")
        .eq("id", doc_id)
        .eq("account_id", user["account_id"])
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return res.data


@router.post("/knowledge", status_code=201)
async def create_knowledge_doc(
    body: KnowledgeDocCreate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="title is required")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="content is required")
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of: {', '.join(VALID_CATEGORIES)}")
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(VALID_STATUSES)}")

    data = body.model_dump()
    data["account_id"] = user["account_id"]
    data["created_by"] = user["user_id"]
    res = db.table("knowledge_documents").insert(data).execute()
    return res.data[0] if res.data else {}


@router.patch("/knowledge/{doc_id}")
async def update_knowledge_doc(
    doc_id: str,
    body: KnowledgeDocUpdate,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "category" in data and data["category"] not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of: {', '.join(VALID_CATEGORIES)}")
    if "status" in data and data["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(VALID_STATUSES)}")

    res = (
        db.table("knowledge_documents")
        .update(data)
        .eq("id", doc_id)
        .eq("account_id", user["account_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return res.data[0]


@router.delete("/knowledge/{doc_id}", status_code=204)
async def delete_knowledge_doc(
    doc_id: str,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    db.table("knowledge_documents").delete().eq("id", doc_id).eq("account_id", user["account_id"]).execute()
