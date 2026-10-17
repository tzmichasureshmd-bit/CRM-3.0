from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')

from app.core.config import get_settings
from app.api.v1 import (
    auth, contacts, conversations, deals,
    command_center, leads, campaigns, automations,
    content, agents, reports, health, webhooks,
    follow_ups, broadcasts, appointments, segments, journeys,
    revenue_intelligence, attribution, copilot, ai_routes, email_routes, meta, instagram_routes,
    ai_settings, integrations,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[START] {settings.app_name} starting on port {settings.port}")
    yield
    print("[STOP] Shutting down")


app = FastAPI(
    title=settings.app_name,
    version="3.0.0",
    description="Tzmicha CRM 3.0 — Intelligent Customer Growth OS",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug_mode else None,
    redoc_url="/redoc" if settings.debug_mode else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"

app.include_router(health.router,                prefix=PREFIX, tags=["Health"])
app.include_router(auth.router,                  prefix=PREFIX, tags=["Auth"])
app.include_router(contacts.router,              prefix=PREFIX, tags=["Contacts"])
app.include_router(conversations.router,         prefix=PREFIX, tags=["Conversations"])
app.include_router(deals.router,                 prefix=PREFIX, tags=["Deals"])
app.include_router(leads.router,                 prefix=PREFIX, tags=["Leads"])
app.include_router(campaigns.router,             prefix=PREFIX, tags=["Campaigns"])
app.include_router(automations.router,           prefix=PREFIX, tags=["Automations"])
app.include_router(content.router,               prefix=PREFIX, tags=["Content"])
app.include_router(agents.router,                prefix=PREFIX, tags=["AI Agents"])
app.include_router(reports.router,               prefix=PREFIX, tags=["Reports"])
app.include_router(command_center.router,        prefix=PREFIX, tags=["Command Center"])
app.include_router(webhooks.router,              prefix=PREFIX, tags=["Webhooks"])
app.include_router(follow_ups.router,            prefix=PREFIX, tags=["Follow-ups"])
app.include_router(broadcasts.router,            prefix=PREFIX, tags=["Broadcasts"])
app.include_router(appointments.router,          prefix=PREFIX, tags=["Appointments"])
app.include_router(segments.router,              prefix=PREFIX, tags=["Segments"])
app.include_router(journeys.router,              prefix=PREFIX, tags=["Journeys"])
app.include_router(revenue_intelligence.router,  prefix=PREFIX, tags=["Revenue Intelligence"])
app.include_router(attribution.router,           prefix=PREFIX, tags=["Attribution"])
app.include_router(copilot.router,               prefix=PREFIX, tags=["Copilot"])
app.include_router(ai_routes.router,             prefix=PREFIX, tags=["AI"])
app.include_router(email_routes.router,          prefix=PREFIX, tags=["Email"])
app.include_router(meta.router,                  prefix=PREFIX, tags=["Meta"])
app.include_router(instagram_routes.router,      prefix=PREFIX, tags=["Instagram"])
app.include_router(ai_settings.router,           prefix=PREFIX, tags=["AI Settings"])
app.include_router(integrations.router,          prefix=PREFIX, tags=["Integrations"])


@app.get("/")
async def root():
    return {"name": settings.app_name, "version": "3.0.0", "status": "running"}
