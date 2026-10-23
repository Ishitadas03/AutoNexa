"""In-memory operational metrics collection for AutoNexa.

Provides thread-safe counters, gauges, and timing summaries with bounded labels.
Metrics are stored in memory and reset upon application restart (suitable for single-worker deployments).
"""

from collections import defaultdict
import threading
import time
from typing import Any, Dict, Optional


class MetricsCollector:
    """Thread-safe in-memory operational metrics collector.

    Guards all metric state updates with a re-entrant lock.
    Enforces strict label bounding to prevent cardinality explosion.
    """

    # Bounded label sets
    ALLOWED_METHODS = {"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"}
    ALLOWED_STATUS_FAMILIES = {"1xx", "2xx", "3xx", "4xx", "5xx", "unknown"}
    ALLOWED_TASK_TYPES = {
        "tabular_classification",
        "tabular_regression",
        "classification",
        "regression",
        "clustering",
        "time_series",
        "unknown",
    }
    ALLOWED_RUN_STATUSES = {
        "started",
        "running",
        "completed",
        "failed",
        "cancelled",
        "retried",
        "unknown",
    }
    ALLOWED_STAGES = {"staging", "production", "archived", "unknown"}
    ALLOWED_RETRAIN_OUTCOMES = {
        "triggered",
        "skipped_threshold",
        "skipped_busy",
        "failed",
        "unknown",
    }

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.reset()

    def reset(self) -> None:
        """Reset all metrics to initial state."""
        with self._lock:
            self._start_time = time.time()

            # HTTP Requests
            self._http_requests_total = 0
            self._http_requests_by_method: Dict[str, int] = defaultdict(int)
            self._http_requests_by_family: Dict[str, int] = defaultdict(int)
            self._http_duration_total_ms = 0.0
            self._http_duration_count = 0
            self._http_duration_min_ms: Optional[float] = None
            self._http_duration_max_ms: Optional[float] = None

            # Training Lifecycle
            self._training_runs_total = 0
            self._training_runs_by_status: Dict[str, int] = defaultdict(int)
            self._training_runs_by_task: Dict[str, int] = defaultdict(int)
            self._training_duration_total_sec = 0.0
            self._training_duration_count = 0
            self._training_duration_min_sec: Optional[float] = None
            self._training_duration_max_sec: Optional[float] = None

            # Pipeline Lifecycle
            self._pipeline_runs_total = 0
            self._pipeline_runs_by_status: Dict[str, int] = defaultdict(int)
            self._pipeline_duration_total_sec = 0.0
            self._pipeline_duration_count = 0
            self._pipeline_duration_min_sec: Optional[float] = None
            self._pipeline_duration_max_sec: Optional[float] = None
            self._pipeline_active_gauge = 0
            self._pipeline_queued_gauge = 0

            # Database & Metadata Reconciliation
            self._db_operations_total = 0
            self._db_errors_total = 0
            self._reconciliation_runs_total = 0
            self._reconciled_items_total = 0
            self._reconciliation_errors_total = 0

            # Model Registry & Retraining
            self._stage_transitions_total = 0
            self._stage_transitions_by_stage: Dict[str, int] = defaultdict(int)
            self._retraining_triggers_total = 0
            self._retraining_triggers_by_outcome: Dict[str, int] = defaultdict(int)

    # -------------------------------------------------------------------------
    # HTTP Instrumentation
    # -------------------------------------------------------------------------

    def record_http_request(
        self,
        method: str,
        status_code: int,
        duration_ms: float,
    ) -> None:
        """Record an inbound HTTP request, its status family, and execution duration."""
        bounded_method = method.upper() if method.upper() in self.ALLOWED_METHODS else "OTHER"
        if 100 <= status_code < 200:
            family = "1xx"
        elif 200 <= status_code < 300:
            family = "2xx"
        elif 300 <= status_code < 400:
            family = "3xx"
        elif 400 <= status_code < 500:
            family = "4xx"
        elif 500 <= status_code < 600:
            family = "5xx"
        else:
            family = "unknown"

        safe_duration = max(0.0, float(duration_ms))

        with self._lock:
            self._http_requests_total += 1
            self._http_requests_by_method[bounded_method] += 1
            self._http_requests_by_family[family] += 1

            self._http_duration_total_ms += safe_duration
            self._http_duration_count += 1
            if self._http_duration_min_ms is None or safe_duration < self._http_duration_min_ms:
                self._http_duration_min_ms = safe_duration
            if self._http_duration_max_ms is None or safe_duration > self._http_duration_max_ms:
                self._http_duration_max_ms = safe_duration

    # -------------------------------------------------------------------------
    # Training Instrumentation
    # -------------------------------------------------------------------------

    def record_training_event(
        self,
        status: str,
        task_type: Optional[str] = None,
        duration_seconds: Optional[float] = None,
    ) -> None:
        """Record a training lifecycle event (started, completed, failed, cancelled)."""
        bounded_status = status.lower() if status.lower() in self.ALLOWED_RUN_STATUSES else "unknown"
        bounded_task = (
            task_type.lower()
            if task_type and task_type.lower() in self.ALLOWED_TASK_TYPES
            else "unknown"
        )

        with self._lock:
            if bounded_status == "started":
                self._training_runs_total += 1
            self._training_runs_by_status[bounded_status] += 1
            if task_type:
                self._training_runs_by_task[bounded_task] += 1

            if duration_seconds is not None:
                safe_sec = max(0.0, float(duration_seconds))
                self._training_duration_total_sec += safe_sec
                self._training_duration_count += 1
                if self._training_duration_min_sec is None or safe_sec < self._training_duration_min_sec:
                    self._training_duration_min_sec = safe_sec
                if self._training_duration_max_sec is None or safe_sec > self._training_duration_max_sec:
                    self._training_duration_max_sec = safe_sec

    # -------------------------------------------------------------------------
    # Pipeline Instrumentation
    # -------------------------------------------------------------------------

    def record_pipeline_event(
        self,
        status: str,
        duration_seconds: Optional[float] = None,
    ) -> None:
        """Record a pipeline execution event."""
        bounded_status = status.lower() if status.lower() in self.ALLOWED_RUN_STATUSES else "unknown"

        with self._lock:
            if bounded_status == "started":
                self._pipeline_runs_total += 1
            self._pipeline_runs_by_status[bounded_status] += 1

            if duration_seconds is not None:
                safe_sec = max(0.0, float(duration_seconds))
                self._pipeline_duration_total_sec += safe_sec
                self._pipeline_duration_count += 1
                if self._pipeline_duration_min_sec is None or safe_sec < self._pipeline_duration_min_sec:
                    self._pipeline_duration_min_sec = safe_sec
                if self._pipeline_duration_max_sec is None or safe_sec > self._pipeline_duration_max_sec:
                    self._pipeline_duration_max_sec = safe_sec

    def set_pipeline_gauges(self, active: int, queued: int = 0) -> None:
        """Update active and queued pipeline gauges."""
        with self._lock:
            self._pipeline_active_gauge = max(0, int(active))
            self._pipeline_queued_gauge = max(0, int(queued))

    # -------------------------------------------------------------------------
    # Database & Metadata Reconciliation
    # -------------------------------------------------------------------------

    def record_db_operation(self, error: bool = False) -> None:
        """Record a database query execution or error."""
        with self._lock:
            self._db_operations_total += 1
            if error:
                self._db_errors_total += 1

    def record_reconciliation(self, reconciled_count: int, error: bool = False) -> None:
        """Record a metadata reconciliation cycle outcome."""
        with self._lock:
            self._reconciliation_runs_total += 1
            self._reconciled_items_total += max(0, int(reconciled_count))
            if error:
                self._reconciliation_errors_total += 1

    # -------------------------------------------------------------------------
    # Model Registry & Retraining
    # -------------------------------------------------------------------------

    def record_stage_transition(self, target_stage: str) -> None:
        """Record a model promotion/transition event."""
        bounded_stage = target_stage.lower() if target_stage.lower() in self.ALLOWED_STAGES else "unknown"
        with self._lock:
            self._stage_transitions_total += 1
            self._stage_transitions_by_stage[bounded_stage] += 1

    def record_retraining_trigger(self, outcome: str) -> None:
        """Record a drift monitoring retraining trigger evaluation."""
        bounded_outcome = (
            outcome.lower() if outcome.lower() in self.ALLOWED_RETRAIN_OUTCOMES else "unknown"
        )
        with self._lock:
            self._retraining_triggers_total += 1
            self._retraining_triggers_by_outcome[bounded_outcome] += 1

    # -------------------------------------------------------------------------
    # Snapshot Export
    # -------------------------------------------------------------------------

    def get_snapshot(self) -> Dict[str, Any]:
        """Export an immutable dictionary snapshot of current metrics."""
        with self._lock:
            uptime_sec = max(0.0, time.time() - self._start_time)

            http_avg = (
                round(self._http_duration_total_ms / self._http_duration_count, 2)
                if self._http_duration_count > 0
                else 0.0
            )
            training_avg = (
                round(self._training_duration_total_sec / self._training_duration_count, 2)
                if self._training_duration_count > 0
                else 0.0
            )
            pipeline_avg = (
                round(self._pipeline_duration_total_sec / self._pipeline_duration_count, 2)
                if self._pipeline_duration_count > 0
                else 0.0
            )

            return {
                "uptime_seconds": round(uptime_sec, 2),
                "durable": False,
                "storage": "in_memory",
                "http": {
                    "requests_total": self._http_requests_total,
                    "by_method": dict(self._http_requests_by_method),
                    "by_status_family": dict(self._http_requests_by_family),
                    "duration_ms": {
                        "count": self._http_duration_count,
                        "avg": http_avg,
                        "min": self._http_duration_min_ms,
                        "max": self._http_duration_max_ms,
                    },
                },
                "training": {
                    "runs_total": self._training_runs_total,
                    "by_status": dict(self._training_runs_by_status),
                    "by_task_type": dict(self._training_runs_by_task),
                    "duration_seconds": {
                        "count": self._training_duration_count,
                        "avg": training_avg,
                        "min": self._training_duration_min_sec,
                        "max": self._training_duration_max_sec,
                    },
                },
                "pipelines": {
                    "runs_total": self._pipeline_runs_total,
                    "by_status": dict(self._pipeline_runs_by_status),
                    "active_gauge": self._pipeline_active_gauge,
                    "queued_gauge": self._pipeline_queued_gauge,
                    "duration_seconds": {
                        "count": self._pipeline_duration_count,
                        "avg": pipeline_avg,
                        "min": self._pipeline_duration_min_sec,
                        "max": self._pipeline_duration_max_sec,
                    },
                },
                "metadata_db": {
                    "operations_total": self._db_operations_total,
                    "errors_total": self._db_errors_total,
                    "reconciliation_runs_total": self._reconciliation_runs_total,
                    "reconciled_items_total": self._reconciled_items_total,
                    "reconciliation_errors_total": self._reconciliation_errors_total,
                },
                "governance": {
                    "stage_transitions_total": self._stage_transitions_total,
                    "stage_transitions_by_stage": dict(self._stage_transitions_by_stage),
                    "retraining_triggers_total": self._retraining_triggers_total,
                    "retraining_triggers_by_outcome": dict(self._retraining_triggers_by_outcome),
                },
            }


# Singleton instance
_COLLECTOR: Optional[MetricsCollector] = None
_COLLECTOR_LOCK = threading.Lock()


def get_metrics_collector() -> MetricsCollector:
    """Retrieve or initialize the global MetricsCollector singleton."""
    global _COLLECTOR
    if _COLLECTOR is None:
        with _COLLECTOR_LOCK:
            if _COLLECTOR is None:
                _COLLECTOR = MetricsCollector()
    return _COLLECTOR


def reset_metrics_collector() -> None:
    """Reset the metrics collector for testing."""
    global _COLLECTOR
    with _COLLECTOR_LOCK:
        if _COLLECTOR is not None:
            _COLLECTOR.reset()


from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint


class MetricsMiddleware(BaseHTTPMiddleware):
    """ASGI Middleware to measure request latency and record HTTP metrics."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start_time = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        get_metrics_collector().record_http_request(
            method=request.method,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response

