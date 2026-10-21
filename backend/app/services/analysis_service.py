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
    TargetCandidat# AutoNexa — Phase 16A: Production Readiness & Scalability Architecture Audit

## Project Information

- Project: AutoNexa — AI-Powered AutoML Platform
- Repository: `C:\Users\ishit\AutoNexa`
- GitHub: `https://github.com/Ishitadas03/AutoNexa.git`
- Current branch: `main`
- Current phase: Phase 15 — End-to-End Pipeline Orchestration, Integration & Reproducibility
- Phase 16A objective: Architecture audit, production-readiness assessment, and implementation roadmap.

## Mission

Perform a rigorous, evidence-based architecture and production-readiness audit of the existing AutoNexa repository.

Do not assume historical reports accurately represent the current code. Inspect the actual implementation, current Git state, configuration, API routes, tests, and deployment setup.

Phase 15 introduced pipeline orchestration across dataset validation, training, evaluation, experiment tracking, model registration, candidate promotion, and monitoring.

Previous reports describe these architectural boundaries:
- Pipeline execution uses an in-process `ThreadPoolExecutor`.
- Concurrency locks and active-job tracking are process-local.
- Pipeline state and events are persisted on the local filesystem.
- Monitoring and model artifacts use existing local persistence mechanisms.
- Backend and frontend test/build suites have previously passed.

Treat these statements as investigation starting points, not independently verified facts.

The goal is to determine what AutoNexa actually needs before introducing distributed workers, Redis, a database, object storage, containers, or other infrastructure.

# Absolute Safety Rules

1. Do not modify application code, tests, configuration, dependencies, or existing documentation.
2. Do not install packages or upgrade dependencies.
3. Do not stage, commit, push, deploy, or switch branches.
4. Do not run destructive Git commands such as `git reset --hard`, `git clean`, or destructive restore operations.
5. Preserve every existing user change, including uncommitted and untracked files.
6. Do not expose API keys, passwords, tokens, raw dataset rows, or sensitive configuration values.
7. Do not invent test results, infrastructure requirements, performance numbers, or security guarantees.
8. Distinguish confirmed defects from potential risks and future scalability concerns.
9. Do not assume production deployment, cloud infrastructure, multi-tenancy, or a particular workload unless repository evidence supports it.
10. Stop after producing the audit report and wait for explicit approval.

The only permitted file creation is the new audit report specified at the end of this prompt. Do not edit other files.

# Stage 1 — Git State and Repository Inventory

Inspect and record:

- `git status`
- `git status --short`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git log -5 --oneline --decorate`
- `git diff --stat`
- `git diff --check`
- Untracked files, without modifying them.

Identify the actual repository structure, including:

- Backend framework and API entry points.
- Training and AutoML services.
- Pipeline orchestration.
- Experiment tracking and provenance.
- Model registry and serving.
- Monitoring and drift detection.
- Authentication and authorization.
- Configuration and environment variables.
- Frontend API client and workspace.
- Backend and frontend test suites.
- Dependency manifests and lockfiles.
- Existing CI/CD workflows, Docker files, deployment configuration, and operational documentation.

Inspect the latest Phase 15 research, validation, independent audit, finalization, and pre-commit review reports if present.

Do not assume Phase 15 has been committed or pushed. Establish the actual Git state.

# Stage 2 — Architecture and Data Flow

Trace the real data flow through the application:

Dataset selection
→ dataset validation
→ training
→ evaluation
→ experiment and provenance recording
→ model registration
→ candidate validation and promotion
→ serving
→ prediction telemetry
→ drift detection
→ retraining
→ candidate validation.

Identify:
- Service boundaries and dependencies.
- Shared mutable state.
- Persistence boundaries.
- Long-running operations.
- Synchronous and asynchronous execution.
- Error propagation and recovery.
- Cross-service consistency requirements.
- Existing duplicate implementations or unnecessary coupling.

For each architectural claim, reference the relevant source files and line numbers.

# Stage 3 — Job Execution and Scalability

Inspect the actual pipeline execution model.

Evaluate:

- In-process thread pools and worker limits.
- Duplicate-job protection and lock scope.
- Thread safety and cross-process behavior.
- Pipeline cancellation, retry, timeout, and restart recovery.
- Orphaned job detection.
- Queue backpressure and overload behavior.
- Idempotency of training, artifact creation, registry registration, and retries.
- Memory and CPU usage risks from concurrent model training.
- Potential data races across multiple Uvicorn/Gunicorn workers.
- Behavior when a worker or application process terminates unexpectedly.

Answer these questions using evidence:

1. Is the current architecture adequate for a single-user local development workflow?
2. Which guarantees stop working if multiple backend worker processes are used?
3. What is the smallest change needed for safe multi-worker execution?
4. Would a durable job queue provide material benefits now, or is it premature?
5. What workload or failure scenario would justify Redis, Celery, a database-backed queue, or a workflow engine?

Do not recommend distributed infrastructure merely because it is common in production systems.

# Stage 4 — Persistence, Artifact Integrity, and Recovery

Inspect the actual storage implementations for:

- Pipeline manifests and event history.
- Experiments and reproducibility manifests.
- Model artifacts and registry metadata.
- Serving telemetry.
- Monitoring profiles, drift reports, alerts, and retraining jobs.

Evaluate:

- Atomic writes and partial-write recovery.
- Concurrent reader/writer safety.
- Storage growth and retention.
- Startup recovery and corrupt-file handling.
- Artifact checksum verification.
- Data consistency across service boundaries.
- Backup and restore capability.
- Behavior when the disk is full or files disappear.
- Compatibility with multiple processes or hosts.
- Whether sensitive information can enter logs or manifests.

Determine whether the next stage should retain local storage, introduce a relational database, use object storage, or separate metadata and artifact storage.

Provide a recommendation based on the actual requirements and implementation—not assumptions.

# Stage 5 — Security and Resource Governance

Review:

- API-key validation and role-based access.
- Authorization for training, pipeline mutation, model promotion, and serving.
- Secret handling and environment configuration.
- Path traversal defenses and artifact access.
- Input validation and upload limits.
- Request size and execution-time limits.
- Training concurrency and memory/CPU exhaustion risks.
- Queue limits and retry storms.
- Logging and telemetry privacy.
- Error response sanitization.
- Existing rate limiting or lack thereof.
- Tenant isolation only if the application claims or implements it.

Identify confirmed vulnerabilities separately from hardening recommendations.

Do not print secret values or sensitive payloads.

# Stage 6 — Observability and Operations

Inspect existing logging, monitoring, and operational support.

Assess the presence and correctness of:

- Liveness and readiness checks.
- Structured application logs.
- Correlation IDs for pipeline and experiment execution.
- Queue depth and worker health metrics.
- Pipeline duration and failure metrics.
- Model-serving latency and error metrics.
- Disk-space and persistence failure visibility.
- Actionable alerts.
- Health checks for external dependencies, if any.
- Startup and shutdown behavior.
- Operational troubleshooting documentation.

Recommend only the observability improvements that address demonstrated gaps.

# Stage 7 — Deployment and Release Readiness

Inspect existing deployment artifacts and configuration.

Determine what is already implemented for:

- Dependency reproducibility.
- Environment-specific configuration.
- Secret injection.
- Production frontend/backend builds.
- Automated tests and CI.
- Containers and deployment manifests.
- Database migrations, if any.
- HTTPS and reverse-proxy assumptions.
- Health checks and graceful shutdown.
- Rollback and recovery.
- Release validation.

Do not create Dockerfiles, CI workflows, deployment manifests, or infrastructure code during this audit.

Document the minimum deployment strategy appropriate to the project's actual current maturity.

# Stage 8 — Verification Evidence

Inspect available tests and their coverage. If safe and practical, execute the existing backend tests and frontend production build without changing application code or dependencies.

Before running commands, verify that tests will not overwrite user data or persistent experiment/model files.

If safe to execute, run:

`backend\.venv\Scripts\python -m pytest backend/tests`

And from `frontend/`:

`npm run build`

Record actual exit codes, pass/fail/skip counts, warnings, and environmental limitations.

If execution is unsafe or impossible, explain why and mark the corresponding checks as unverified.

Do not claim that code is production-ready merely because unit tests pass.

# Stage 9 — Prioritized Phase 16 Roadmap

Based on the evidence, produce a practical implementation roadmap.

Consider these potential workstreams only when justified:

A. Job lifecycle reliability, backpressure, and safe cancellation.
B. Durable queue and distributed worker coordination.
C. Persistent metadata storage and artifact management.
D. Observability, operational health checks, and alerts.
E. Security hardening and resource quotas.
F. Reproducible deployment and CI/CD.
G. Backup, restore, retention, and disaster recovery.

For each recommended workstream, specify:

- Confirmed problem or risk.
- Evidence and relevant file paths.
- Expected benefit.
- Dependencies.
- Implementation complexity: Low, Medium, or High.
- Risk of regression.
- Acceptance criteria.
- Required tests.
- Whether it should be implemented now or deferred.

Separate mandatory fixes from optional infrastructure upgrades.

Propose a staged plan, such as Phase 16A, 16B, 16C, and so on, but adjust the structure based on findings.

Do not commit to a particular technology before justifying why it is needed.

# Required Deliverable

Create:

`docs/research/phase_16_architecture_readiness_audit.md`

The report must include:

1. Executive summary.
2. Actual repository and Git state.
3. Verified architecture and data-flow description.
4. Findings with file paths and line references.
5. Scalability and concurrency analysis.
6. Persistence and artifact-integrity analysis.
7. Security and resource-governance analysis.
8. Observability and deployment-readiness assessment.
9. Actual validation results or clearly documented verification gaps.
10. Prioritized remediation matrix.
11. Recommended Phase 16 implementation sequence.
12. Explicitly deferred work and rationale.
13. Risks and unresolved questions.
14. Final recommendation.

Classify each finding as:
- CRITICAL
- HIGH
- MEDIUM
- LOW
- INFORMATIONAL

Use one overall verdict:

- `READY FOR PHASE 16 IMPLEMENTATION`
- `READY WITH PREREQUISITES`
- `NOT READY`

Support the verdict with concrete evidence.

# Final Response

Summarize:
- The most important confirmed findings.
- Which improvements should happen first and why.
- Whether distributed infrastructure is justified now.
- Actual backend and frontend validation results.
- Remaining risks.
- The audit verdict.
- Exact Git status and confirmation that no existing files were changed.

Do not begin Phase 16B or implement infrastructure.

Do not commit, push, deploy, or modify application code.

Stop after producing the audit report and wait for my approval.e,
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
