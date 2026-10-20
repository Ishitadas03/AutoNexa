"""API route definitions and aggregated router."""

from fastapi import APIRouter
from app.api.routes import benchmarks, datasets, experiments, health, model_registry, monitoring, serving

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(datasets.router)
api_router.include_router(experiments.router)
api_router.include_router(model_registry.router)
api_router.include_router(serving.router)
api_router.include_router(monitoring.router)
api_router.include_router(benchmarks.router)

__all__ = ["api_router"]
