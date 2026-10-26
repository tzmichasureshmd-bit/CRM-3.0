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
    ai_settings, integrations, notifications, analytics,
    knowledge, media, experiments, billing, employees,
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
    # FIX-013: Use configured origin list instead of wildcard.
    # In production, set ALLOWED_ORIGINS env var to comma-separated list.
    # Default includes localhost for development.
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

PREFIX = "/api/v1"
PREFIX_V3 = "/api/v3"

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
app.include_router(knowledge.router,             prefix=PREFIX, tags=["Knowledge Base"])
app.include_router(media.router,                 prefix=PREFIX, tags=["Media"])
app.include_router(experiments.router,           prefix=PREFIX, tags=["A/B Testing"])
app.include_router(billing.router,               prefix=PREFIX, tags=["Billing"])

# v3 aliases — frontend calls /api/v3/instagram/* and /api/v3/instagram/settings/*
# Traefik routes all /api/* directly to this backend, bypassing the Next.js proxy.
app.include_router(instagram_routes.router,      prefix=PREFIX_V3, tags=["Instagram v3"])
app.include_router(integrations.router,          prefix=PREFIX_V3, tags=["Integrations v3"])
app.include_router(content.router,               prefix=PREFIX_V3, tags=["Content v3"])
app.include_router(agents.router,                prefix=PREFIX_V3, tags=["AI Agents v3"])
app.include_router(automations.router,           prefix=PREFIX_V3, tags=["Automations v3"])
app.include_router(revenue_intelligence.router,  prefix=PREFIX_V3, tags=["Revenue Intelligence v3"])
app.include_router(reports.router,               prefix=PREFIX_V3, tags=["Reports v3"])
app.include_router(segments.router,              prefix=PREFIX_V3, tags=["Segments v3"])
app.include_router(journeys.router,              prefix=PREFIX_V3, tags=["Journeys v3"])
app.include_router(contacts.router,              prefix=PREFIX_V3, tags=["Contacts v3"])
app.include_router(conversations.router,         prefix=PREFIX_V3, tags=["Conversations v3"])
app.include_router(ai_routes.router,             prefix=PREFIX_V3, tags=["AI v3"])
app.include_router(copilot.router,               prefix=PREFIX_V3, tags=["Copilot v3"])
app.include_router(notifications.router,         prefix=PREFIX_V3, tags=["Notifications v3"])
app.include_router(analytics.router,             prefix=PREFIX_V3, tags=["Analytics v3"])
app.include_router(knowledge.router,             prefix=PREFIX_V3, tags=["Knowledge Base v3"])
app.include_router(media.router,                 prefix=PREFIX_V3, tags=["Media v3"])
app.include_router(experiments.router,           prefix=PREFIX_V3, tags=["A/B Testing v3"])
app.include_router(billing.router,               prefix=PREFIX_V3, tags=["Billing v3"])
app.include_router(employees.router,             prefix=PREFIX,    tags=["Employees"])
app.include_router(employees.router,             prefix=PREFIX_V3, tags=["Employees v3"])


@app.get("/")
async def root():
    return {"name": settings.app_name, "version": "3.0.0", "status": "running"}
