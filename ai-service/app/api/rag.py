"""
CRM 3.0 — RAG Knowledge Base
Answers from organization-approved knowledge only.
Never hallucinate company policies.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.llm.provider import call_llm
from app.core.config import get_ai_settings
from supabase import create_client

router = APIRouter()
settings = get_ai_settings()


class KnowledgeQuery(BaseModel):
    query: str
    account_id: str
    top_k: int = 5


@router.post("/knowledge/query")
async def query_knowledge(body: KnowledgeQuery):
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return {
            "answer": "Knowledge base not configured.",
            "sources": [],
            "confidence": "unknown",
        }

    db = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # Full-text search (pgvector semantic search when embeddings key is set)
    res = (
        db.table("knowledge_documents")
        .select("id, title, content, category")
        .eq("account_id", body.account_id)
        .text_search("content", body.query)
        .limit(body.top_k)
        .execute()
    )
    docs = res.data or []

    if not docs:
        return {
            "answer": "No relevant knowledge found for your query.",
            "sources": [],
            "confidence": "low",
        }

    context = "\n\n".join([f"[{d['title']}]: {d['content'][:500]}" for d in docs])
    sources = [{"id": d["id"], "title": d["title"], "category": d.get("category")} for d in docs]

    if not settings.openai_api_key and not settings.anthropic_api_key:
        return {
            "answer": f"Found {len(docs)} relevant document(s). Configure AI key for natural language answers.",
            "sources": sources,
            "confidence": "medium",
        }

    try:
        answer = await call_llm(
            system_prompt="""You are a knowledge base assistant. Answer ONLY using the provided documents.
If the answer is not in the documents, say "I don't have that information in the knowledge base."
Never invent company policies, pricing, or procedures.
Always cite which document you used.""",
            user_message=f"Question: {body.query}\n\nDocuments:\n{context}",
            temperature=0.1,
            max_tokens=400,
        )
        return {"answer": answer, "sources": sources, "confidence": "high"}
    except Exception:
        return {
            "answer": f"Found {len(docs)} relevant document(s) but AI summarization failed.",
            "sources": sources,
            "confidence": "medium",
        }
