"""AutoNexa AutoML Engine Subsystem."""

from app.services.automl.baseline_evaluator import BaselineEvaluator
from app.services.automl.benchmark_service import BenchmarkService, get_benchmark_service
from app.services.automl.error_analysis_service import ErrorAnalysisService, get_error_analysis_service
from app.services.automl.evaluator import ModelEvaluator
from app.services.automl.explainability_service import ExplainabilityService, get_explainability_service
from app.services.automl.preprocessor import build_preprocessor
from app.services.automl.registry import ModelRegistry
from app.services.automl.bayesian_optuna import BayesianOptunaOptimizer
from app.services.automl.hpo_service import HPOService, get_hpo_service
from app.services.automl.multi_objective_service import (
    MultiObjectiveService,
    get_multi_objective_service,
)
from app.services.automl.pareto import ParetoFrontierCalculator
from app.services.automl.random_search import RandomSearchOptimizer
from app.services.automl.research_benchmarking_service import (
    ResearchBenchmarkingService,
    get_research_benchmark_service,
)
from app.services.automl.resource_profiler import ResourceProfiler
from app.services.automl.statistical_engine import StatisticalEngine
from app.services.automl.tracker import MLflowTracker, compute_dataset_fingerprint
from app.services.automl.training_service import TrainingService, get_training_service

__all__ = [
    "BaselineEvaluator",
    "BayesianOptunaOptimizer",
    "BenchmarkService",
    "ErrorAnalysisService",
    "ExplainabilityService",
    "HPOService",
    "MLflowTracker",
    "ModelEvaluator",
    "ModelRegistry",
    "MultiObjectiveService",
    "ParetoFrontierCalculator",
    "RandomSearchOptimizer",
    "ResearchBenchmarkingService",
    "ResourceProfiler",
    "StatisticalEngine",
    "TrainingService",
    "build_preprocessor",
    "compute_dataset_fingerprint",
    "get_benchmark_service",
    "get_error_analysis_service",
    "get_explainability_service",
    "get_hpo_service",
    "get_multi_objective_service",
    "get_research_benchmark_service",
    "get_training_service",
]

