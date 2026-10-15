"""
CRM 3.0 AI Service — Shared Pydantic Models
All request/response schemas used across AI service endpoints.
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any


# ── Lead Intelligence ──────────────────────────────────────────

class ScoreFactor(BaseModel):
    factor: str
    weight: int
    reason: str


class LeadAnalysisRequest(BaseModel):
    contact_id: str
    account_id: str
    contact_name: Optional[str] = None
    lead_status: Optional[str] = None
    lead_score: Optional[int] = None
    messages: Optional[List[Dict[str, Any]]] = []
    source: Optional[str] = None
    last_reply_hours_ago: Optional[float] = None


class LeadAnalysisResponse(BaseModel):
    contact_id: str
    score: int
    tier: str
    intent: str
    sentiment: str
    score_factors: List[ScoreFactor]
    next_best_action: Dict[str, str]
    ai_summary: str
    confidence: str
    analyzed_at: str


# ── Content Generation ─────────────────────────────────────────

class ContentGenRequest(BaseModel):
    prompt: str
    platform: str = "instagram"
    tone: str = "professional"
    brand_voice: Optional[str] = None
    target_audience: Optional[str] = None
    language: str = "English"


class ContentVariants(BaseModel):
    instagram: str
    facebook: str
    whatsapp: str
    short: str
    long: str


class ContentGenResponse(BaseModel):
    headline: str
    caption: str
    cta: str
    hashtags: List[str]
    variants: ContentVariants


# ── Copilot ────────────────────────────────────────────────────

class CopilotRequest(BaseModel):
    query: str
    account_id: str
    user_id: str
    session_id: Optional[str] = None


class CopilotResponse(BaseModel):
    answer: str
    data_source: str
    confidence: str
    intent: str


# ── Agent Execution ────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    agent: Dict[str, Any]
    context: Dict[str, Any]
    account_id: str


class AgentRunResponse(BaseModel):
    status: str
    result_summary: str
    actions_taken: List[Dict[str, Any]]
    tokens_used: int
    completed_at: str
    error_message: Optional[str] = None


# ── RAG / Knowledge ────────────────────────────────────────────

class KnowledgeQuery(BaseModel):
    query: str
    account_id: str
    top_k: int = 5


class KnowledgeSource(BaseModel):
    id: str
    title: str
    category: Optional[str] = None


class KnowledgeResponse(BaseModel):
    answer: str
    sources: List[KnowledgeSource]
    confidence: str


# ── Embeddings ─────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    text: str
    account_id: str
    document_id: Optional[str] = None


class EmbedResponse(BaseModel):
    embedding: List[float]
    model: str
    tokens_used: int
