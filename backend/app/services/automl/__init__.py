"""AutoNexa AutoML Engine Subsystem."""

from app.services.automl.benchmark_service import BenchmarkService, get_benchmark_service
from app.services.automl.error_analysis_service import ErrorAnalysisService, get_error_analysis_service
from app.services.automl.evaluator import ModelEvaluator
from app.services.automl.explainability_service import ExplainabilityService, get_explainability_service
from app.services.automl.preprocessor import build_preprocessor
from app.services.automl.registry import ModelRegistry
from app.services.automl.tracker import MLflowTracker, compute_dataset_fingerprint
from app.services.automl.training_service import TrainingService, get_training_service

__all__ = [
    "BenchmarkService",
    "ErrorAnalysisService",
    "ExplainabilityService",
    "MLflowTracker",
    "ModelEvaluator",
    "ModelRegistry",
    "TrainingService",
    "build_preprocessor",
    "compute_dataset_fingerprint",
    "get_benchmark_service",
    "get_error_analysis_service",
    "get_explainability_service",
    "get_training_service",
]
