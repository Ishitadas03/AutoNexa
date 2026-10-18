"""Reproducible research benchmarking and multi-experiment comparison endpoints."""

from fastapi import APIRouter, Depends, status

from app.schemas.benchmark import (
    BenchmarkCompareRequest,
    BenchmarkComparisonResponse,
)
from app.services.automl.benchmark_service import (
    BenchmarkService,
    get_benchmark_service,
)

router = APIRouter(prefix="/benchmarks", tags=["Benchmarks"])


@router.post(
    "/compare",
    response_model=BenchmarkComparisonResponse,
    status_code=status.HTTP_200_OK,
    summary="Benchmark and Compare AutoML Experiments",
    description=(
        "Performs comparative research benchmarking across multiple previously trained AutoML experiments. "
        "Conducts a scientific comparability audit checking for dataset fingerprint alignment, target column identity, "
        "data split equivalence, and random seed consistency. Synthesizes a ranked performance leaderboard, "
        "calculates relative deltas against an optional designated baseline, and outputs a complete reproducibility manifest."
    ),
)
def compare_benchmarks(
    request: BenchmarkCompareRequest,
    service: BenchmarkService = Depends(get_benchmark_service),
) -> BenchmarkComparisonResponse:
    """Benchmark and compare two or more completed AutoML experiments."""
    return service.compare_experiments(request=request)
