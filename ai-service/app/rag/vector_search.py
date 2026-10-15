"""
CRM 3.0 AI Service — RAG Vector Search
Semantic search using pgvector + OpenAI embeddings.
Falls back to full-text search when no embedding key is set.
"""
from typing import List, Dict, Optional
import httpx


async def get_embedding(text: str, openai_api_key: str) -> Optional[List[float]]:
    """Get text embedding from OpenAI text-embedding-3-small."""
    if not openai_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {openai_api_key}"},
                json={"model": "text-embedding-3-small", "input": text[:8000]},
            )
            if res.status_code == 200:
                return res.json()["data"][0]["embedding"]
    except Exception:
        pass
    return None


async def semantic_search(
    db,
    account_id: str,
    query: str,
    openai_api_key: str,
    top_k: int = 5,
    table: str = "knowledge_documents",
    content_col: str = "content",
    embedding_col: str = "embedding",
) -> List[Dict]:
    """
    Semantic search using pgvector cosine similarity.
    Falls back to full-text search if no embedding available.
    """
    embedding = await get_embedding(query, openai_api_key)

    if embedding:
        # pgvector cosine similarity search
        try:
            res = db.rpc(
                "match_documents",
                {
                    "query_embedding": embedding,
                    "match_account_id": account_id,
                    "match_count": top_k,
                    "match_threshold": 0.7,
                }
            ).execute()
            if res.data:
                return res.data
        except Exception:
            pass

    # Fallback: full-text search
    try:
        res = (
            db.table(table)
            .select(f"id, title, {content_col}, category")
            .eq("account_id", account_id)
            .text_search(content_col, query)
            .limit(top_k)
            .execute()
        )
        return res.data or []
    except Exception:
        return []


async def upsert_document_embedding(
    db,
    document_id: str,
    account_id: str,
    content: str,
    openai_api_key: str,
) -> bool:
    """Generate and store embedding for a knowledge document."""
    embedding = await get_embedding(content, openai_api_key)
    if not embedding:
        return False
    try:
        db.table("knowledge_documents").update({"embedding": embedding}).eq("id", document_id).eq("account_id", account_id).execute()
        return True
    except Exception:
        return False
