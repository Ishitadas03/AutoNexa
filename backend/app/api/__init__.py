"""API route definitions and aggregated router."""

from fastapi import APIRouter
from app.api.routes import datasets, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(datasets.router)

__all__ = ["api_router"]
