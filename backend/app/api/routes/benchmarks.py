"""Reproducible research benchmarking, repeated-run experimental series, and multi-experiment comparison endpoints."""

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import PlainTextResponse

from app.schemas.benchmark import (
    BenchmarkCompareRequest,
    BenchmarkComparisonResponse,
)
from app.schemas.hpo_experiment import (
    HPOExperimentRequest,
    HPOExperimentResponse,
    HyperparameterSpace,
)
from app.schemas.multi_objective import (
    MultiObjectiveExperimentRequest,
    MultiObjectiveExperimentResponse,
    MultiObjectiveSelectionRequest,
    MultiObjectiveSelectionResult,
    ParetoCandidateResult,
)
from app.schemas.research_benchmark import (
    BaselineComparisonRequest,
    BaselineComparisonResult,
    RepeatedRunGroupResponse,
    RepeatedRunRequest,
)
from app.services.automl.benchmark_service import (
    BenchmarkService,
    get_benchmark_service,
)
from app.services.automl.hpo_service import (
    HPOService,
    get_hpo_service,
)
from app.services.automl.hpo_spaces import list_available_search_spaces
from app.services.automl.multi_objective_service import (
    MultiObjectiveService,
    get_multi_objective_service,
)
from app.services.automl.research_benchmarking_service import (
    ResearchBenchmarkingService,
    get_research_benchmark_service,
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


@router.post(
    "/repeated-runs",
    response_model=RepeatedRunGroupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Execute Repeated-Seed Experimental Series",
    description=(
        "Runs an AutoML training and evaluation series across 2 to 10 configured random seeds. "
        "Computes sample statistics (mean, std with ddof=1, median, range), Student-t and non-parametric bootstrap "
        "confidence intervals, compares outcomes against canonical dummy and linear baselines, and benchmarks real prediction latency."
    ),
)
def run_repeated_benchmarks(
    request: RepeatedRunRequest,
    service: ResearchBenchmarkingService = Depends(get_research_benchmark_service),
) -> RepeatedRunGroupResponse:
    """Run repeated-seed experiments, compute statistical summaries, and profile resource efficiency."""
    return service.run_repeated_experiments(request=request)


@router.get(
    "/repeated-runs/{run_group_id}",
    response_model=RepeatedRunGroupResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Repeated-Run Group Report",
    description="Loads a previously executed repeated-seed experimental group, including all run records, statistical summaries, and baseline comparisons.",
)
def get_repeated_run_group(
    run_group_id: str,
    service: ResearchBenchmarkingService = Depends(get_research_benchmark_service),
) -> RepeatedRunGroupResponse:
    """Retrieve stored repeated experiment group results and statistical summaries."""
    return service.get_repeated_run_group(run_group_id=run_group_id)


@router.post(
    "/baseline-comparison",
    response_model=List[BaselineComparisonResult],
    status_code=status.HTTP_200_OK,
    summary="Compare Experiment Against Canonical Baselines",
    description=(
        "Evaluates heuristic DummyClassifier / DummyRegressor and simple linear models on identical preprocessed holdout splits "
        "to establish selection quality (outperformed, tied, or underperformed) against the AutoML champion model."
    ),
)
def compare_to_baselines(
    request: BaselineComparisonRequest,
    service: ResearchBenchmarkingService = Depends(get_research_benchmark_service),
) -> List[BaselineComparisonResult]:
    """Evaluate canonical baselines under identical data partitions for an existing experiment."""
    return service.compare_existing_experiment_to_baselines(request=request)


@router.get(
    "/repeated-runs/{run_group_id}/export-csv",
    status_code=status.HTTP_200_OK,
    summary="Download Replicate Results as CSV",
    description="Generates and streams a CSV of all run seeds, statuses, durations, memory footprints, and evaluation metrics.",
)
def export_repeated_runs_csv(
    run_group_id: str,
    service: ResearchBenchmarkingService = Depends(get_research_benchmark_service),
) -> Response:
    """Download repeated run results as a comma-separated values (CSV) file."""
    csv_content = service.export_csv(run_group_id=run_group_id)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="repeated_runs_{run_group_id}.csv"'},
    )


@router.get(
    "/repeated-runs/{run_group_id}/latex",
    status_code=status.HTTP_200_OK,
    summary="Generate Publication-Grade LaTeX Table",
    description="Generates academic LaTeX table code formatted with primary metric Mean ± Std, 95% bootstrap confidence intervals, and selection quality verdicts.",
)
def export_repeated_runs_latex(
    run_group_id: str,
    service: ResearchBenchmarkingService = Depends(get_research_benchmark_service),
) -> Dict[str, Any]:
    """Generate publication-ready LaTeX table code for repeated experimental benchmarks."""
    latex_code = service.generate_latex_table(run_group_id=run_group_id)
    return {
        "run_group_id": run_group_id,
        "latex": latex_code,
    }


# ============================================================================
# Phase 10A: Controlled HPO Experiment (Random Search vs Bayesian Optimization)
# ============================================================================


@router.get(
    "/hpo-spaces",
    response_model=List[HyperparameterSpace],
    status_code=status.HTTP_200_OK,
    summary="List Tunable Hyperparameter Search Spaces",
    description="Returns all supported model families and their defined tunable hyperparameter domains.",
)
def get_hpo_search_spaces() -> List[HyperparameterSpace]:
    """Retrieve all defined model hyperparameter spaces."""
    return list_available_search_spaces()


@router.post(
    "/hpo-experiment",
    response_model=HPOExperimentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Run Controlled Random Search vs Bayesian Optimization Experiment",
    description=(
        "Executes a rigorous controlled experimental comparison between Random Search and Bayesian Optimization (Optuna TPE). "
        "Enforces identical data partitions, matching hyperparameter spaces, strictly leakage-free preprocessing within folds, "
        "replicated evaluation across seeds, untouched holdout test evaluation, paired Student-t inferential statistics, "
        "and step-by-step convergence histories."
    ),
)
def run_hpo_experiment(
    request: HPOExperimentRequest,
    service: HPOService = Depends(get_hpo_service),
) -> HPOExperimentResponse:
    """Execute controlled HPO experiment comparing Random Search and Bayesian Optimization."""
    return service.run_hpo_experiment(request=request)


@router.get(
    "/hpo-experiment/{experiment_id}",
    response_model=HPOExperimentResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Completed HPO Experiment Report",
    description="Loads a previously executed HPO experiment by identifier, returning full trial histories, convergence trajectories, and statistical comparison.",
)
def get_hpo_experiment(
    experiment_id: str,
    service: HPOService = Depends(get_hpo_service),
) -> HPOExperimentResponse:
    """Retrieve stored HPO experiment report."""
    return service.get_hpo_experiment(experiment_id=experiment_id)


@router.get(
    "/hpo-experiment/{experiment_id}/export-csv",
    status_code=status.HTTP_200_OK,
    summary="Export HPO Trial History as CSV",
    description="Streams a comma-separated values (CSV) export containing all attempted trials, hyperparameter settings, validation scores, and elapsed durations.",
)
def export_hpo_csv(
    experiment_id: str,
    service: HPOService = Depends(get_hpo_service),
) -> Response:
    """Download HPO experiment trial history as CSV."""
    csv_content = service.export_csv(experiment_id=experiment_id)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="hpo_experiment_{experiment_id}.csv"'},
    )


# ============================================================================
# Phase 10B: Multi-Objective AutoML Optimization & Resource-Aware Selection
# ============================================================================


@router.post(
    "/multi-objective",
    response_model=MultiObjectiveExperimentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Run Multi-Objective AutoML Optimization & Resource Profiling",
    description=(
        "Executes a multi-objective AutoML experiment measuring predictive performance alongside operational costs "
        "(inference latency, training duration, artifact size, and model complexity). "
        "Strictly isolates the holdout test partition, fits preprocessing fold-by-fold, computes the non-dominated "
        "Pareto frontier for mixed directions, and enforces configurable resource constraints."
    ),
)
def run_multi_objective_experiment(
    request: MultiObjectiveExperimentRequest,
    service: MultiObjectiveService = Depends(get_multi_objective_service),
) -> MultiObjectiveExperimentResponse:
    """Run multi-objective optimization, compute Pareto dominance, and perform resource-aware selection."""
    return service.run_multi_objective_experiment(request=request)


@router.get(
    "/multi-objective/{experiment_id}",
    response_model=MultiObjectiveExperimentResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Multi-Objective Experiment Report",
    description="Loads a previously executed multi-objective AutoML report by identifier, including all candidate profiles, Pareto rankings, and selection details.",
)
def get_multi_objective_experiment(
    experiment_id: str,
    service: MultiObjectiveService = Depends(get_multi_objective_service),
) -> MultiObjectiveExperimentResponse:
    """Retrieve stored multi-objective experiment report."""
    return service.get_multi_objective_experiment(experiment_id=experiment_id)


@router.get(
    "/multi-objective/{experiment_id}/pareto",
    response_model=List[ParetoCandidateResult],
    status_code=status.HTTP_200_OK,
    summary="Retrieve Pareto Frontier Candidates",
    description="Returns the subset of candidate models that form the non-dominated Pareto frontier among feasible candidates.",
)
def get_pareto_frontier(
    experiment_id: str,
    service: MultiObjectiveService = Depends(get_multi_objective_service),
) -> List[ParetoCandidateResult]:
    """Retrieve the non-dominated Pareto-optimal models from an experiment."""
    return service.get_pareto_frontier(experiment_id=experiment_id)


@router.post(
    "/multi-objective/{experiment_id}/select",
    response_model=MultiObjectiveSelectionResult,
    status_code=status.HTTP_200_OK,
    summary="Select Model with Resource Constraints and Policy",
    description=(
        "Applies custom resource constraints and a model selection policy (best performance, lowest latency, lowest size, "
        "or balanced compromise) to an existing multi-objective experiment without re-training."
    ),
)
def select_model_with_constraints(
    experiment_id: str,
    request: MultiObjectiveSelectionRequest,
    service: MultiObjectiveService = Depends(get_multi_objective_service),
) -> MultiObjectiveSelectionResult:
    """Apply updated resource constraints and select the winning candidate model."""
    return service.select_model_for_experiment(experiment_id=experiment_id, request=request)


@router.get(
    "/multi-objective/{experiment_id}/export-csv",
    status_code=status.HTTP_200_OK,
    summary="Download Multi-Objective Candidates as CSV",
    description="Streams a comma-separated values (CSV) export containing all evaluated candidate models, measurements, Pareto flags, and constraint violations.",
)
def export_multi_objective_csv(
    experiment_id: str,
    service: MultiObjectiveService = Depends(get_multi_objective_service),
) -> Response:
    """Download multi-objective candidate evaluations as CSV."""
    csv_content = service.export_csv(experiment_id=experiment_id)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="multi_objective_{experiment_id}.csv"'},
    )

