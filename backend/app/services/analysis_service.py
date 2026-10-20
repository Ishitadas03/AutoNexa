"""Dataset intelligence, data quality auditing, and ML task detection service."""

import logging
from pathlib import Path
import re
from typing import Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
import numpy as np
import pandas as pd

from app.core.config import Settings, get_settings
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

logger = logging.getLogger(__name__)

# Heuristic keyword matchers for candidate target detection
TARGET_KEYWORD_PATTERNS = [
    re.compile(r"^(target|label|class|outcome|response|churn|price|salary|status|y)$", re.IGNORECASE),
    re.compile(r"(is_|has_|was_|will_)", re.IGNORECASE),
    re.compile(r"(_label|_target|_class|_outcome)$", re.IGNORECASE),
]

IDENTIFIER_KEYWORD_PATTERNS = [
    re.compile(r"^(id|uuid|guid|index|row_id|id_num)$", re.IGNORECASE),
    re.compile(r"(_id|_uuid|_guid|_key|_index)$", re.IGNORECASE),
    re.compile(r"^(id_|uuid_|guid_)", re.IGNORECASE),
]


class AnalysisService:
    """Service providing dataset intelligence, data quality checks, and ML task detection."""

    def __init__(self, upload_dir: Optional[Path] = None) -> None:
        settings: Settings = get_settings()
        self.upload_dir: Path = upload_dir or settings.resolved_upload_dir

    def resolve_dataset_file(self, dataset_id: str) -> Path:
        """Validate dataset ID and return the safe file path.

        Raises:
            HTTPException: 400 if ID is malformed or invalid; 404 if file does not exist.
        """
        # Ensure dataset_id is a non-empty, safe string without path traversal characters
        if not dataset_id or not isinstance(dataset_id, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid dataset identifier must be provided.",
            )

        sanitized_id = Path(dataset_id).name
        # Check for traversal attempt or invalid characters
        if sanitized_id != dataset_id or ".." in dataset_id or "/" in dataset_id or "\\" in dataset_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid dataset identifier format.",
            )

        file_path = (self.upload_dir / f"{sanitized_id}.csv").resolve()

        # Guard against path traversal escaping the upload directory
        if not file_path.is_relative_to(self.upload_dir.resolve()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsafe dataset path resolution.",
            )

        if not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset '{dataset_id}' not found.",
            )

        return file_path

    def load_dataset(self, file_path: Path) -> pd.DataFrame:
        """Safely load tabular data into a Pandas DataFrame."""
        try:
            return pd.read_csv(file_path, encoding="utf-8")
        except UnicodeDecodeError:
            return pd.read_csv(file_path, encoding="latin1")
        except Exception as exc:
            logger.error("Failed to load dataset: %s", type(exc).__name__)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to read the dataset file.",
            ) from exc

    def analyze_columns(
        self, df: pd.DataFrame
    ) -> Tuple[List[ColumnSummary], List[str], List[str], List[QualityWarning]]:
        """Compute per-column diagnostics, inferred roles, and data-quality warnings."""
        total_rows = len(df)
        column_summaries: List[ColumnSummary] = []
        numeric_columns: List[str] = []
        categorical_columns: List[str] = []
        quality_warnings: List[QualityWarning] = []

        for col in df.columns:
            series = df[col]
            valid_series = series.dropna()
            missing_count = int(series.isna().sum())
            missing_percentage = round((missing_count / total_rows) * 100.0, 2) if total_rows > 0 else 0.0
            unique_count = int(valid_series.nunique())

            is_constant = (unique_count <= 1)
            is_near_constant = False

            if unique_count > 1 and len(valid_series) > 0:
                top_freq = valid_series.value_counts().iloc[0]
                if (top_freq / len(valid_series)) >= 0.95:
                    is_near_constant = True

            # Determine structural role
            is_numeric_type = pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series)
            is_id_name = any(p.search(str(col)) for p in IDENTIFIER_KEYWORD_PATTERNS)

            if is_id_name:
                role = ColumnRole.IDENTIFIER
            elif is_numeric_type and pd.api.types.is_integer_dtype(series) and (unique_count == total_rows and total_rows > 10):
                role = ColumnRole.IDENTIFIER
            elif pd.api.types.is_datetime64_any_dtype(series):
                role = ColumnRole.DATETIME
            elif is_numeric_type:
                role = ColumnRole.NUMERIC
            elif pd.api.types.is_bool_dtype(series):
                role = ColumnRole.CATEGORICAL
            else:
                role = ColumnRole.CATEGORICAL

            # Categorize into numeric or categorical lists
            if is_numeric_type:
                numeric_columns.append(str(col))
            else:
                categorical_columns.append(str(col))

            # Check high cardinality for categorical columns
            is_high_cardinality = False
            if role == ColumnRole.CATEGORICAL:
                if unique_count > 50 or (total_rows > 20 and (unique_count / total_rows) > 0.3):
                    is_high_cardinality = True

            summary = ColumnSummary(
                name=str(col),
                inferred_type=str(series.dtype),
                role=role,
                missing_count=missing_count,
                missing_percentage=missing_percentage,
                unique_count=unique_count,
                is_constant=is_constant,
                is_near_constant=is_near_constant,
                is_high_cardinality=is_high_cardinality,
            )
            column_summaries.append(summary)

            # Generate column-level quality warnings
            if missing_percentage >= 50.0:
                quality_warnings.append(QualityWarning(
                    code="CRITICAL_MISSINGNESS",
                    category="quality",
                    severity=WarningSeverity.CRITICAL,
                    column=str(col),
                    message=f"Column '{col}' has {missing_percentage:.1f}% missing values (exceeds 50%).",
                ))
            elif missing_percentage >= 20.0:
                quality_warnings.append(QualityWarning(
                    code="HIGH_MISSINGNESS",
                    category="quality",
                    severity=WarningSeverity.WARNING,
                    column=str(col),
                    message=f"Column '{col}' has {missing_percentage:.1f}% missing values.",
                ))

            if is_constant:
                quality_warnings.append(QualityWarning(
                    code="CONSTANT_COLUMN",
                    category="quality",
                    severity=WarningSeverity.WARNING,
                    column=str(col),
                    message=f"Column '{col}' is constant (has only {unique_count} distinct value) and provides no predictive signal.",
                ))
            elif is_near_constant:
                quality_warnings.append(QualityWarning(
                    code="NEAR_CONSTANT_COLUMN",
                    category="distribution",
                    severity=WarningSeverity.INFO,
                    column=str(col),
                    message=f"Column '{col}' is near-constant (dominant value frequency >= 95%).",
                ))

            if is_high_cardinality:
                quality_warnings.append(QualityWarning(
                    code="HIGH_CARDINALITY",
                    category="quality",
                    severity=WarningSeverity.WARNING,
                    column=str(col),
                    message=f"Categorical column '{col}' has high cardinality ({unique_count} distinct categories).",
                ))

        # Check for duplicate rows across dataset
        duplicate_count = int(df.duplicated().sum())
        if duplicate_count > 0:
            dup_pct = round((duplicate_count / total_rows) * 100.0, 2)
            quality_warnings.append(QualityWarning(
                code="DUPLICATE_ROWS",
                category="quality",
                severity=WarningSeverity.WARNING,
                column=None,
                message=f"Dataset contains {duplicate_count} ({dup_pct:.1f}%) identical duplicate rows.",
            ))

        return column_summaries, numeric_columns, categorical_columns, quality_warnings

    def identify_candidate_targets(
        self, df: pd.DataFrame, summaries: List[ColumnSummary]
    ) -> List[TargetCandidate]:
        """Heuristically identify plausible prediction targets from column names and properties."""
        candidates: List[TargetCandidate] = []
        cols = list(df.columns)
        if not cols:
            return candidates

        for summary in summaries:
            col = summary.name
            # Skip invalid targets: identifiers, constants, or heavily missing columns
            if summary.role == ColumnRole.IDENTIFIER or summary.is_constant or summary.missing_percentage > 60.0:
                continue

            # Check keyword match
            is_keyword = any(p.search(col) for p in TARGET_KEYWORD_PATTERNS)
            is_last_col = (col == cols[-1])

            suggested_task = TaskType.REGRESSION if summary.role == ColumnRole.NUMERIC and summary.unique_count > 10 else (
                TaskType.BINARY_CLASSIFICATION if summary.unique_count == 2 else TaskType.MULTICLASS_CLASSIFICATION
            )

            if is_keyword:
                candidates.append(TargetCandidate(
                    column_name=col,
                    reason=f"Column name '{col}' matches common target naming conventions.",
                    suggested_task=suggested_task,
                ))
            elif is_last_col:
                candidates.append(TargetCandidate(
                    column_name=col,
                    reason="Standard tabular convention (final column in dataset).",
                    suggested_task=suggested_task,
                ))

        return candidates

    def detect_task_for_target(
        self,
        df: pd.DataFrame,
        target_column: str,
        task_override: Optional[str] = None,
    ) -> Tuple[TaskRecommendation, List[QualityWarning]]:
        """Validate target column, infer ML task type, and detect class imbalance and data leakage."""
        additional_warnings: List[QualityWarning] = []

        if target_column not in df.columns:
            available = list(df.columns)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_column}' does not exist in dataset. Available columns: {available}",
            )

        series = df[target_column]
        valid_series = series.dropna()

        # Check for all-null target
        if len(valid_series) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_column}' contains only missing (null) values and cannot be modeled.",
            )

        unique_count = int(valid_series.nunique())

        # Check for constant target
        if unique_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_column}' is constant ({unique_count} distinct value) and cannot be modeled.",
            )

        is_numeric = pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series)

        # 1. Automated Heuristic Recommendation
        if not is_numeric:
            if unique_count == 2:
                inferred_task = TaskType.BINARY_CLASSIFICATION
                confidence = "high"
                rationale = "Target is non-numeric with exactly 2 distinct classes."
            else:
                inferred_task = TaskType.MULTICLASS_CLASSIFICATION
                confidence = "high"
                rationale = f"Target is non-numeric with {unique_count} distinct categories."
        else:
            # Numeric target
            if unique_count == 2:
                inferred_task = TaskType.BINARY_CLASSIFICATION
                confidence = "medium"
                rationale = (
                    f"Target is numeric with exactly 2 distinct values ({list(valid_series.unique())[:2]}). "
                    "Recommending binary classification. If continuous bounded modeling is desired, set task_override='regression'."
                )
            elif unique_count <= 10 and pd.api.types.is_integer_dtype(series):
                inferred_task = TaskType.MULTICLASS_CLASSIFICATION
                confidence = "medium"
                rationale = f"Target has discrete integer type with small cardinality ({unique_count} distinct values)."
            else:
                inferred_task = TaskType.REGRESSION
                confidence = "high"
                rationale = f"Target is continuous or high-cardinality numeric ({unique_count} distinct values)."

        # 2. Process Explicit User Task Override
        if task_override:
            override_clean = task_override.lower().strip()
            if override_clean == "regression":
                # Ensure target can be converted to float
                try:
                    pd.to_numeric(valid_series)
                except Exception as exc:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Task override 'regression' is incompatible with non-numeric target '{target_column}'.",
                    ) from exc
                final_task = TaskType.REGRESSION
                confidence = "overridden"
                rationale = f"User explicitly specified task_override='regression'. (Heuristic suggested {inferred_task.value})."
            elif override_clean == "classification":
                if unique_count > 100 and pd.api.types.is_float_dtype(series):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Task override 'classification' is incompatible with continuous floating-point target '{target_column}' containing {unique_count} unique values.",
                    )
                final_task = TaskType.BINARY_CLASSIFICATION if unique_count == 2 else TaskType.MULTICLASS_CLASSIFICATION
                confidence = "overridden"
                rationale = f"User explicitly specified task_override='classification'. (Heuristic suggested {inferred_task.value})."
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid task_override '{task_override}'. Allowed values: 'classification', 'regression'.",
                )
        else:
            final_task = inferred_task

        # 3. Class Imbalance Analysis for Classification Tasks
        class_distribution: Optional[Dict[str, int]] = None
        is_imbalanced: Optional[bool] = None
        minority_pct: Optional[float] = None

        if final_task in (TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION):
            value_counts = valid_series.value_counts()
            total_valid = len(valid_series)
            minority_class = value_counts.index[-1]
            minority_count = int(value_counts.iloc[-1])
            minority_pct = round((minority_count / total_valid) * 100.0, 2)
            majority_count = int(value_counts.iloc[0])
            imbalance_ratio = round(majority_count / max(minority_count, 1), 2)

            is_imbalanced = (minority_pct < 10.0 or imbalance_ratio > 4.0)
            if is_imbalanced:
                additional_warnings.append(QualityWarning(
                    code="CLASS_IMBALANCE",
                    category="distribution",
                    severity=WarningSeverity.WARNING,
                    column=target_column,
                    message=(
                        f"Target column '{target_column}' exhibits significant class imbalance. "
                        f"Minority class '{minority_class}' represents {minority_pct:.1f}% ({minority_count}/{total_valid}) "
                        f"of observations (majority-to-minority ratio {imbalance_ratio}:1)."
                    ),
                ))

            # Include class counts for top classes
            class_distribution = {str(k): int(v) for k, v in value_counts.head(25).items()}

        # 4. Target Leakage Diagnostics
        # Check Pearson correlation with other numeric features
        if is_numeric:
            target_clean = pd.to_numeric(series, errors="coerce")
            for other_col in df.columns:
                if other_col == target_column:
                    continue
                if pd.api.types.is_numeric_dtype(df[other_col]):
                    other_clean = pd.to_numeric(df[other_col], errors="coerce")
                    valid_mask = target_clean.notna() & other_clean.notna()
                    if valid_mask.sum() > 5:
                        s_other = other_clean[valid_mask].std(ddof=1)
                        s_target = target_clean[valid_mask].std(ddof=1)
                        if s_other > 1e-4 and s_target > 1e-4:
                            corr_matrix = np.corrcoef(other_clean[valid_mask], target_clean[valid_mask])
                            corr = abs(corr_matrix[0, 1])
                            if not np.isnan(corr) and corr >= 0.98:
                                additional_warnings.append(QualityWarning(
                                    code="POTENTIAL_TARGET_LEAKAGE",
                                    category="leakage",
                                    severity=WarningSeverity.WARNING,
                                    column=str(other_col),
                                    message=(
                                        f"Column '{other_col}' exhibits near-perfect linear correlation (|r|={corr:.3f}) "
                                        f"with target '{target_column}'. This is a heuristic warning for potential target leakage or proxy variable."
                                    ),
                                ))

        recommendation = TaskRecommendation(
            target_column=target_column,
            task_type=final_task,
            confidence=confidence,
            rationale=rationale,
            class_distribution=class_distribution,
            is_class_imbalanced=is_imbalanced,
            minority_class_percentage=minority_pct,
        )

        return recommendation, additional_warnings

    def analyze(self, dataset_id: str, request: Optional[AnalysisRequest] = None) -> AnalysisResponse:
        """Run full dataset intelligence audit, quality diagnostics, and ML task detection."""
        file_path = self.resolve_dataset_file(dataset_id)
        df = self.load_dataset(file_path)

        rows = int(len(df))
        cols = int(len(df.columns))

        if rows == 0 or cols == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset contains no usable data rows or columns.",
            )

        # 1. Structural column analysis
        summaries, numeric_cols, categorical_cols, quality_warnings = self.analyze_columns(df)

        # 2. Candidate target identification
        candidate_targets = self.identify_candidate_targets(df, summaries)

        # 3. Target task recommendation if target requested
        task_recommendation: Optional[TaskRecommendation] = None
        target_col = request.target_column if request else None
        task_override = request.task_override if request else None

        if target_col:
            task_recommendation, target_warnings = self.detect_task_for_target(
                df, target_col, task_override=task_override
            )
            quality_warnings.extend(target_warnings)

        duplicate_count = int(df.duplicated().sum())
        duplicate_pct = round((duplicate_count / rows) * 100.0, 2) if rows > 0 else 0.0

        logger.info(
            "Dataset %s intelligence analysis completed (rows=%d, cols=%d, target=%s)",
            dataset_id,
            rows,
            cols,
            target_col,
        )

        return AnalysisResponse(
            dataset_id=dataset_id,
            rows=rows,
            columns=cols,
            column_summaries=summaries,
            numeric_columns=numeric_cols,
            categorical_columns=categorical_cols,
            duplicate_rows_count=duplicate_count,
            duplicate_rows_percentage=duplicate_pct,
            candidate_targets=candidate_targets,
            quality_warnings=quality_warnings,
            task_recommendation=task_recommendation,
        )


def get_analysis_service() -> AnalysisService:
    """FastAPI dependency provider for AnalysisService."""
    return AnalysisService()
