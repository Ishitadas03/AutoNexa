"""Pydantic schemas for dataset intelligence, data quality diagnostics, and ML task detection."""

from enum import Enum
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class TaskType(str, Enum):
    """Supported machine learning task types."""
    BINARY_CLASSIFICATION = "binary_classification"
    MULTICLASS_CLASSIFICATION = "multiclass_classification"
    REGRESSION = "regression"


class ColumnRole(str, Enum):
    """Inferred structural or semantic role of a dataset column."""
    NUMERIC = "numeric"
    CATEGORICAL = "categorical"
    IDENTIFIER = "identifier"
    DATETIME = "datetime"
    TEXT = "text"
    TARGET = "target"
    UNKNOWN = "unknown"


class WarningSeverity(str, Enum):
    """Severity classification for dataset quality diagnostics."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AnalysisRequest(BaseModel):
    """Optional request payload for configuring dataset analysis and task detection."""

    target_column: Optional[str] = Field(
        default=None,
        description="Name of the candidate target column to analyze for ML task detection",
        examples=["churn", "price", "label"],
    )
    task_override: Optional[Literal["classification", "regression"]] = Field(
        default=None,
        description="Explicit user override to enforce a classification or regression task",
        examples=["classification", "regression"],
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "target_column": "purchased",
                "task_override": "classification",
            }
        }
    }


class ColumnSummary(BaseModel):
    """Detailed structural and statistical summary for an individual column."""

    name: str = Field(..., description="Column header name")
    inferred_type: str = Field(..., description="Pandas data type string (e.g., int64, float64, object)")
    role: ColumnRole = Field(..., description="Inferred functional role in machine learning workflows")
    missing_count: int = Field(..., ge=0, description="Total missing (null/NaN) entries")
    missing_percentage: float = Field(..., ge=0.0, le=100.0, description="Missingness ratio expressed as percentage")
    unique_count: int = Field(..., ge=0, description="Total distinct non-null values")
    is_constant: bool = Field(..., description="True if column contains exactly one distinct value")
    is_near_constant: bool = Field(..., description="True if a single dominant value exceeds 95% frequency")
    is_high_cardinality: bool = Field(..., description="True if categorical column exceeds cardinality thresholds")


class TargetCandidate(BaseModel):
    """Candidate column identified by heuristic analysis as a plausible prediction target."""

    column_name: str = Field(..., description="Name of the candidate target column")
    reason: str = Field(..., description="Heuristic rationale for identifying this column as candidate target")
    suggested_task: TaskType = Field(..., description="Anticipated ML task if this column is selected as target")


class QualityWarning(BaseModel):
    """Structured data quality diagnostic or risk warning."""

    code: str = Field(..., description="Machine-readable diagnostic code", examples=["HIGH_MISSINGNESS", "CONSTANT_COLUMN", "CLASS_IMBALANCE"])
    category: str = Field(..., description="Category of diagnostic: quality, leakage, schema, distribution", examples=["quality", "leakage"])
    severity: WarningSeverity = Field(..., description="Diagnostic severity level")
    column: Optional[str] = Field(default=None, description="Specific column associated with the warning, if applicable")
    message: str = Field(..., description="Human-readable explanation of the finding and its implications")


class TaskRecommendation(BaseModel):
    """Heuristic ML task detection and diagnostic outcome for a selected target."""

    target_column: str = Field(..., description="The analyzed target column")
    task_type: TaskType = Field(..., description="Recommended or enforced ML task type")
    confidence: str = Field(..., description="Confidence rating: high, medium, low, or overridden", examples=["high", "medium", "overridden"])
    rationale: str = Field(..., description="Detailed explanation of the heuristic rules and thresholds applied")
    class_distribution: Optional[Dict[str, int]] = Field(
        default=None,
        description="Class frequency counts for classification targets (labels anonymized to string counts)",
    )
    is_class_imbalanced: Optional[bool] = Field(
        default=None,
        description="True if minority class ratio drops below 10% or imbalance ratio exceeds 4:1",
    )
    minority_class_percentage: Optional[float] = Field(
        default=None,
        description="Percentage of the least frequent class in classification targets",
    )
    heuristic_disclaimer: str = Field(
        default=(
            "Heuristic task detection provides an automated recommendation based on data types "
            "and cardinality. It does not guarantee task suitability for all research or business objectives. "
            "Use task_override if domain requirements differ."
        ),
        description="Safety and scientific disclaimer regarding heuristic recommendations",
    )


class AnalysisResponse(BaseModel):
    """Comprehensive dataset intelligence, feature diagnostics, and ML task detection response."""

    dataset_id: str = Field(..., description="Server-generated dataset identifier")
    rows: int = Field(..., ge=1, description="Total number of data rows")
    columns: int = Field(..., ge=1, description="Total number of columns")
    column_summaries: List[ColumnSummary] = Field(..., description="Per-column diagnostics and inferred roles")
    numeric_columns: List[str] = Field(..., description="List of columns identified as continuous or discrete numeric")
    categorical_columns: List[str] = Field(..., description="List of columns identified as categorical or discrete factors")
    duplicate_rows_count: int = Field(..., ge=0, description="Total count of identical duplicate rows")
    duplicate_rows_percentage: float = Field(..., ge=0.0, le=100.0, description="Percentage of identical duplicate rows")
    candidate_targets: List[TargetCandidate] = Field(..., description="Potential prediction target columns identified by heuristics")
    quality_warnings: List[QualityWarning] = Field(..., description="List of data quality, cardinality, and leakage warnings")
    task_recommendation: Optional[TaskRecommendation] = Field(
        default=None,
        description="Task recommendation and distribution statistics if a valid target column was specified",
    )
