from fastapi import APIRouter
from datetime import datetime

router = APIRouter()


@router.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "Tzmicha CRM 3.0 Backend",
        "timestamp": datetime.utcnow().isoformat(),
    }
