"""AutoNexa - FastAPI Application Entry Point."""

from contextlib import asynccontextmanager
import logging
import time
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import api_router
from app.core.config import get_settings, settings
from app.core.correlation import CorrelationIdMiddleware
from app.core.logging import setup_logging
from app.core.metrics import MetricsMiddleware, get_metrics_collector
from app.db import MetadataReconciliationService, close_db, init_db
from app.services.automl.pipeline_service import (
    get_pipeline_service,
    reset_pipeline_service,
)

logger = logging.getLogger("autonexa.lifecycle")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """FastAPI application lifespan manager for deterministic startup, metadata indexing, and bounded graceful shutdown."""
    startup_start = time.perf_counter()
    current_settings = get_settings()
    setup_logging(current_settings.log_level)

    logger.info(
        "AutoNexa backend starting up | app=%s version=%s env=%s max_concurrency=%d",
        current_settings.app_name,
        current_settings.app_version,
        current_settings.environment,
        current_settings.pipeline_max_concurrency,
    )

    # 1. Database schema initialization & legacy metadata reconciliation
    try:
        init_db()
        reconciler = MetadataReconciliationService(current_settings)
        reconciled_stats = reconciler.reconcile_all()
        reconciled_total = sum(v for v in reconciled_stats.values() if isinstance(v, int))
        get_metrics_collector().record_reconciliation(reconciled_total, error=False)
        logger.info("Metadata catalog and indexing reconciliation pass: %s", reconciled_stats)
    except Exception as exc:
        get_metrics_collector().record_reconciliation(0, error=True)
        logger.error("Metadata database initialization/reconciliation warning: %s", exc, exc_info=True)

    # 2. Pipeline startup initialization & orphan reconciliation
    try:
        pipeline_service_getter = app.dependency_overrides.get(get_pipeline_service, get_pipeline_service)
        pipeline_service = pipeline_service_getter()
        reconciled_ids = pipeline_service.reconcile_orphaned_pipelines()
        if reconciled_ids:
            logger.info("Startup recovery reconciled %d orphaned pipelines: %s", len(reconciled_ids), reconciled_ids)
        else:
            logger.info("Startup recovery verified: no dangling pipeline jobs detected.")
    except Exception as exc:
        logger.error("Startup reconciliation failed: %s", exc, exc_info=True)

    startup_elapsed_ms = (time.perf_counter() - startup_start) * 1000.0
    logger.info("AutoNexa backend startup completed in %.2fms.", startup_elapsed_ms)

    yield

    # 3. Bounded graceful shutdown
    shutdown_start = time.perf_counter()
    logger.info("AutoNexa backend shutting down: initiating graceful resource draining...")
    try:
        pipeline_service_getter = app.dependency_overrides.get(get_pipeline_service, get_pipeline_service)
        pipeline_service = pipeline_service_getter()
        pipeline_service.shutdown(wait=True, timeout=10.0)
    except Exception as exc:
        logger.error("Error during pipeline service shutdown: %s", exc, exc_info=True)
    finally:
        reset_pipeline_service()
        try:
            close_db()
        except Exception as exc:
            logger.warning("Error closing database connections during shutdown: %s", exc)

    shutdown_elapsed_ms = (time.perf_counter() - shutdown_start) * 1000.0
    logger.info("AutoNexa backend graceful shutdown completed in %.2fms.", shutdown_elapsed_ms)


def create_application() -> FastAPI:
    """Factory to create and configure the FastAPI application instance."""
    setup_logging(settings.log_level)

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=settings.app_description,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # Cross-Origin Resource Sharing (CORS) Middleware
    if settings.backend_cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=[str(origin) for origin in settings.backend_cors_origins],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Operational metrics and correlation middlewares
    application.add_middleware(MetricsMiddleware)
    application.add_middleware(CorrelationIdMiddleware)

    # Root health probes
    from app.api.routes.health import router as health_router
    application.include_router(health_router)

    # Mount API v1 router
    application.include_router(api_router, prefix=settings.api_v1_prefix)

    return application


app: FastAPI = create_application()
