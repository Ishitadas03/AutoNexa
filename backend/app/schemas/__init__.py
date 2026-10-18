"""Pydantic data models and schemas."""

from app.schemas.analysis import (
    AnalysisRequest,
    AnalysisResponse,
    ColumnRole,
    ColumnSummary,
    QualityWarning,
    TargetCandidate,
    TaskRecommendation,
    TaskType,
    WarningSeverity,
)
from app.schemas.benchmark import (
    BenchmarkCompareRequest,
    BenchmarkComparisonResponse,
    ComparabilityWarning,
    ModelBenchmarkEntry,
)
from app.schemas.dataset import DatasetProfileResponse
from app.schemas.error_analysis import (
    CategoryErrorSlice,
    ClassErrorSummary,
    ClassificationErrorAnalysis,
    ConfidenceBucket,
    ErrorAnalysisRequest,
    ErrorAnalysisResponse,
    FeatureErrorCorrelation,
    MisclassifiedInstance,
    RegressionErrorAnalysis,
    RegressionOutlierInstance,
    RegressionResidualSummary,
)
from app.schemas.explainability import (
    FeatureContribution,
    FeatureImportanceItem,
    GlobalFeatureImportanceResponse,
    InstanceExplanation,
    PredictionExplanationRequest,
    PredictionExplanationResponse,
    TransformedFeatureImportanceItem,
)
from app.schemas.health import HealthResponse
from app.schemas.prediction import (
    ArtifactAvailability,
    ExperimentInspectionResponse,
    PredictionRequest,
    PredictionResponse,
)
from app.schemas.training import (
    ModelEvaluationResult,
    ModelStatus,
    TrainingRequest,
    TrainingResponse,
)

__all__ = [
    "AnalysisRequest",
    "AnalysisResponse",
    "ArtifactAvailability",
    "BenchmarkCompareRequest",
    "BenchmarkComparisonResponse",
    "CategoryErrorSlice",
    "ClassErrorSummary",
    "ClassificationErrorAnalysis",
    "ColumnRole",
    "ColumnSummary",
    "ComparabilityWarning",
    "ConfidenceBucket",
    "DatasetProfileResponse",
    "ErrorAnalysisRequest",
    "ErrorAnalysisResponse",
    "ExperimentInspectionResponse",
    "FeatureContribution",
    "FeatureErrorCorrelation",
    "FeatureImportanceItem",
    "GlobalFeatureImportanceResponse",
    "HealthResponse",
    "InstanceExplanation",
    "MisclassifiedInstance",
    "ModelBenchmarkEntry",
    "ModelEvaluationResult",
    "ModelStatus",
    "PredictionExplanationRequest",
    "PredictionExplanationResponse",
    "PredictionRequest",
    "PredictionResponse",
    "QualityWarning",
    "RegressionErrorAnalysis",
    "RegressionOutlierInstance",
    "RegressionResidualSummary",
    "TargetCandidate",
    "TaskRecommendation",
    "TaskType",
    "TrainingRequest",
    "TrainingResponse",
    "TransformedFeatureImportanceItem",
    "WarningSeverity",
]
