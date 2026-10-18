from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import get_ai_settings
from app.api import copilot, lead_intelligence, content_gen, agents, rag

settings = get_ai_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🤖 {settings.app_name} starting on port {settings.port}")
    yield
    print("👋 AI Service shutting down")


app = FastAPI(
    title=settings.app_name,
    version="3.0.0",
    description="Tzmicha CRM 3.0 — AI Intelligence Layer",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://crm3.tzmicha.com", "http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api"
app.include_router(copilot.router,           prefix=PREFIX, tags=["Copilot"])
app.include_router(lead_intelligence.router, prefix=PREFIX, tags=["Lead Intelligence"])
app.include_router(content_gen.router,       prefix=PREFIX, tags=["Content Generation"])
app.include_router(agents.router,            prefix=PREFIX, tags=["AI Agents"])
app.include_router(rag.router,               prefix=PREFIX, tags=["RAG / Knowledge"])


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.app_name}
