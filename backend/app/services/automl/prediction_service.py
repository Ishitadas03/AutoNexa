"""Safe model artifact loading, input schema validation, and inference service for AutoNexa."""

import hashlib
import io
import json
import logging
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, Response, UploadFile, status
import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline

from app.core.config import Settings, get_settings
from app.schemas.prediction import (
    ArtifactAvailability,
    ExperimentInspectionResponse,
    PredictionRequest,
    PredictionResponse,
)

logger = logging.getLogger(__name__)

# Strict identifier validation to prevent path traversal attempts
EXPERIMENT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]+$")


def sanitize_scalar(val: Any) -> Any:
    """Sanitize numpy or non-finite values into JSON-compatible Python primitives."""
    if val is None:
        return None
    if isinstance(val, (bool, str)):
        return val
    if isinstance(val, (int, np.integer)):
        return int(val)
    if isinstance(val, (float, np.floating)):
        if np.isnan(val) or np.isinf(val):
            return None
        return float(val)
    if isinstance(val, np.ndarray):
        return [sanitize_scalar(x) for x in val.tolist()]
    return str(val)


class PredictionService:
    """Provides secure artifact loading, experiment inspection, and tabular model inference.

    Security Notice:
    Scikit-learn / joblib serialization relies on Python pickle mechanisms which can execute
    arbitrary code during deserialization. AutoNexa restricts artifact loading strictly to the
    server-controlled experiments directory, rejects arbitrary user paths, and treats persisted
    joblib files as trusted internal artifacts.
    """

    def __init__(self, experiments_dir: Optional[Path] = None) -> None:
        self.settings: Settings = get_settings()
        self.experiments_dir: Path = experiments_dir or self.settings.resolved_experiments_dir
        self.max_prediction_records = self.settings.max_prediction_records
        self.max_prediction_csv_rows = self.settings.max_prediction_csv_rows
        self.max_prediction_csv_size_bytes = self.settings.max_prediction_csv_size_bytes

    def safe_resolve_experiment_dir(self, experiment_id: str) -> Path:
        """Resolve and validate the experiment directory path, preventing traversal attacks."""
        cleaned_id = experiment_id.strip()
        if not cleaned_id or not EXPERIMENT_ID_PATTERN.match(cleaned_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid experiment identifier. Only alphanumeric characters, hyphens, and underscores are allowed.",
            )

        exp_dir = (self.experiments_dir / cleaned_id).resolve()
        base_dir = self.experiments_dir.resolve()

        if not exp_dir.is_relative_to(base_dir):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security violation: Experiment path escapes root experiments directory.",
            )

        if not exp_dir.is_dir():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Experiment '{cleaned_id}' not found.",
            )

        return exp_dir

    def load_metadata(self, experiment_id: str) -> Dict[str, Any]:
        """Read and validate the persisted experiment metadata JSON."""
        exp_dir = self.safe_resolve_experiment_dir(experiment_id)
        metadata_file = exp_dir / "metadata.json"

        if not metadata_file.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Metadata for experiment '{experiment_id}' not found or experiment did not complete successfully.",
            )

        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                metadata = json.load(f)
        except Exception as exc:
            logger.error("Failed to read metadata for %s: %s", experiment_id, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Metadata file for experiment '{experiment_id}' is corrupted or unreadable.",
            ) from exc

        return metadata

    def inspect_experiment(self, experiment_id: str) -> ExperimentInspectionResponse:
        """Return a validated, sanitized summary of the experiment and its artifact state."""
        metadata = self.load_metadata(experiment_id)
        exp_dir = self.safe_resolve_experiment_dir(experiment_id)
        model_file = exp_dir / "best_model.joblib"

        model_file_exists = model_file.is_file()
        model_size_bytes = None
        model_sha256 = None

        if model_file_exists:
            try:
                model_size_bytes = model_file.stat().st_size
                hasher = hashlib.sha256()
                with open(model_file, "rb") as mf:
                    for chunk in iter(lambda: mf.read(65536), b""):
                        hasher.update(chunk)
                model_sha256 = hasher.hexdigest()
            except Exception as exc:
                logger.warning("Could not calculate checksum for model file: %s", exc)

        artifacts_meta = metadata.get("artifacts") or {}
        if not model_sha256 and "model_sha256" in artifacts_meta:
            model_sha256 = artifacts_meta.get("model_sha256")
        if model_size_bytes is None and "model_size_bytes" in artifacts_meta:
            model_size_bytes = artifacts_meta.get("model_size_bytes")

        status_val = metadata.get("status")
        if not status_val:
            if metadata.get("best_model") and model_file_exists:
                status_val = "completed"
            else:
                status_val = "incomplete"

        feature_names = metadata.get("feature_names")
        if not feature_names:
            # Fallback for backward compatibility with pre-Step-7 runs
            if model_file_exists:
                try:
                    pipeline = joblib.load(model_file)
                    feature_names = self._extract_features_from_pipeline(pipeline)
                except Exception:
                    feature_names = []
            else:
                feature_names = []

        availability = ArtifactAvailability(
            metadata_exists=True,
            model_file_exists=model_file_exists,
            model_format=artifacts_meta.get("model_format", "joblib"),
            model_size_bytes=model_size_bytes,
            model_sha256=model_sha256,
        )

        return ExperimentInspectionResponse(
            experiment_id=experiment_id,
            status=status_val,
            dataset_id=metadata.get("dataset_id", "unknown"),
            dataset_fingerprint=metadata.get("dataset_fingerprint", "unknown"),
            target_column=metadata.get("target_column", "unknown"),
            task_type=metadata.get("task_type", "unknown"),
            evaluation_strategy=metadata.get("evaluation_strategy", "holdout"),
            primary_metric=metadata.get("primary_metric", "unknown"),
            primary_metric_greater_is_better=metadata.get("primary_metric_greater_is_better"),
            best_model=metadata.get("best_model"),
            best_score=metadata.get("best_score"),
            test_metrics=metadata.get("test_metrics"),
            ranked_models=metadata.get("ranked_models", []),
            features_count=metadata.get("features_count", len(feature_names)),
            feature_names=feature_names,
            numeric_features=metadata.get("numeric_features"),
            categorical_features=metadata.get("categorical_features"),
            artifact_availability=availability,
            tracking_status=metadata.get("tracking_status", "disabled"),
            mlflow_run_id=metadata.get("mlflow_run_id"),
            mlflow_experiment_id=metadata.get("mlflow_experiment_id"),
            tracking_warning=metadata.get("tracking_warning"),
            evaluation_protocol=metadata.get("evaluation_protocol"),
            total_duration_seconds=metadata.get("total_duration_seconds"),
            package_versions=metadata.get("package_versions"),
        )

    def load_pipeline(self, experiment_id: str) -> Tuple[Pipeline, Dict[str, Any]]:
        """Safely load the fitted sklearn Pipeline artifact from server storage."""
        metadata = self.load_metadata(experiment_id)

        if not metadata.get("best_model"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Experiment '{experiment_id}' did not successfully select or train a winning model.",
            )

        exp_dir = self.safe_resolve_experiment_dir(experiment_id)
        model_file = exp_dir / "best_model.joblib"

        if not model_file.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Trained model artifact 'best_model.joblib' for experiment '{experiment_id}' not found.",
            )

        try:
            pipeline = joblib.load(model_file)
        except Exception as exc:
            logger.error("Failed to deserialize model artifact for experiment %s: %s", experiment_id, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Model artifact for experiment '{experiment_id}' is corrupted or incompatible with current runtime environment.",
            ) from exc

        if not hasattr(pipeline, "predict"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Loaded pipeline artifact does not implement a 'predict' method.",
            )

        return pipeline, metadata

    def _extract_features_from_pipeline(self, pipeline: Any) -> List[str]:
        """Extract expected input feature names from fitted sklearn Pipeline."""
        if hasattr(pipeline, "feature_names_in_"):
            return list(pipeline.feature_names_in_)

        preprocessor = getattr(pipeline, "named_steps", {}).get("preprocessor")
        if preprocessor and hasattr(preprocessor, "feature_names_in_"):
            return list(preprocessor.feature_names_in_)

        # Inspect ColumnTransformer transformers_
        if preprocessor and hasattr(preprocessor, "transformers_"):
            features: List[str] = []
            for _, _, cols in preprocessor.transformers_:
                if isinstance(cols, list):
                    features.extend(cols)
            if features:
                return features

        return []

    def validate_and_prepare_records(
        self,
        records: List[Dict[str, Any]],
        expected_features: List[str],
    ) -> pd.DataFrame:
        """Validate input records schema, bounds, and preserve training feature ordering."""
        count = len(records)
        if count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Prediction payload must contain at least 1 record.",
            )
        if count > self.max_prediction_records:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Number of records ({count}) exceeds maximum permitted prediction batch size of {self.max_prediction_records}.",
            )

        expected_set = set(expected_features)

        # Validate each record for missing or unexpected columns
        for idx, rec in enumerate(records):
            if not isinstance(rec, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Record {idx} must be a JSON object mapping feature names to values.",
                )
            rec_keys = set(rec.keys())
            missing = expected_set - rec_keys
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Record {idx} is missing required feature column(s): {sorted(list(missing))}. Required features: {expected_features}",
                )
            unexpected = rec_keys - expected_set
            if unexpected:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Record {idx} contains unexpected feature column(s): {sorted(list(unexpected))}. Expected strictly: {expected_features}",
                )

        df = pd.DataFrame(records)
        # Strictly preserve the exact training feature column order
        df = df[expected_features]
        return df

    def predict_records(
        self,
        experiment_id: str,
        request: PredictionRequest,
    ) -> PredictionResponse:
        """Generate predictions for a bounded list of tabular records using the saved winning pipeline."""
        pipeline, metadata = self.load_pipeline(experiment_id)

        feature_names = metadata.get("feature_names")
        if not feature_names:
            feature_names = self._extract_features_from_pipeline(pipeline)

        if not feature_names:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to determine expected feature schema from experiment metadata or model pipeline.",
            )

        df = self.validate_and_prepare_records(request.records, feature_names)

        task_type = metadata.get("task_type", "classification")
        target_column = metadata.get("target_column", "target")
        selected_model = metadata.get("best_model", "pipeline")

        # Execute inference without ever retraining the model
        try:
            raw_predictions = pipeline.predict(df)
        except Exception as exc:
            logger.error("Prediction failed during pipeline execution: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Prediction transformation failed: {type(exc).__name__}: {str(exc)}",
            ) from exc

        predictions = [sanitize_scalar(p) for p in raw_predictions]

        probabilities: Optional[List[Dict[str, float]]] = None
        class_labels: Optional[List[str]] = None

        # Extract probabilities for classification models if estimator supports predict_proba
        is_classification = task_type in ("binary_classification", "multiclass_classification", "classification")
        if is_classification:
            estimator = pipeline.named_steps.get("estimator", pipeline)
            if hasattr(pipeline, "predict_proba") and hasattr(estimator, "predict_proba"):
                try:
                    proba_arr = pipeline.predict_proba(df)
                    raw_classes = getattr(pipeline, "classes_", getattr(estimator, "classes_", None))
                    if raw_classes is not None:
                        class_labels = [str(c) for c in raw_classes]
                    else:
                        class_labels = [f"class_{i}" for i in range(proba_arr.shape[1])]

                    probabilities = []
                    for row in proba_arr:
                        row_dict = {}
                        for idx, cls_name in enumerate(class_labels):
                            val = float(row[idx])
                            row_dict[cls_name] = None if (np.isnan(val) or np.isinf(val)) else round(val, 6)
                        probabilities.append(row_dict)
                except Exception as exc:
                    logger.info("predict_proba not supported or failed for %s: %s", selected_model, exc)
                    probabilities = None

        return PredictionResponse(
            experiment_id=experiment_id,
            task_type=task_type,
            target_column=target_column,
            selected_model=selected_model,
            prediction_count=len(predictions),
            predictions=predictions,
            probabilities=probabilities,
            class_labels=class_labels,
        )

    async def predict_csv(
        self,
        experiment_id: str,
        file: UploadFile,
    ) -> Response:
        """Stream and validate a CSV dataset, compute batch predictions, and return a downloadable CSV."""
        if not file.filename or not file.filename.lower().endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only CSV files (.csv) are accepted for batch prediction.",
            )

        pipeline, metadata = self.load_pipeline(experiment_id)

        feature_names = metadata.get("feature_names")
        if not feature_names:
            feature_names = self._extract_features_from_pipeline(pipeline)

        if not feature_names:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to determine expected feature schema from experiment metadata or model pipeline.",
            )

        target_col = metadata.get("target_column", "target")
        task_type = metadata.get("task_type", "classification")

        # Read CSV with size limit
        bytes_read = 0
        chunks = []
        chunk_size = 64 * 1024

        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            bytes_read += len(chunk)
            if bytes_read > self.max_prediction_csv_size_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Uploaded CSV exceeds maximum allowed batch prediction size of {self.max_prediction_csv_size_bytes} bytes.",
                )
            chunks.append(chunk)

        content = b"".join(chunks)
        if len(content.strip()) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded CSV file is empty.",
            )

        try:
            df = pd.read_csv(io.BytesIO(content))
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to parse CSV file: malformed tabular format.",
            ) from exc

        if len(df) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded CSV contains headers but zero data rows.",
            )

        if len(df) > self.max_prediction_csv_rows:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"CSV row count ({len(df)}) exceeds maximum permitted batch prediction limit of {self.max_prediction_csv_rows} rows.",
            )

        # Feature validation
        expected_set = set(feature_names)
        df_cols_set = set(df.columns)

        missing = expected_set - df_cols_set
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Uploaded CSV is missing required feature column(s): {sorted(list(missing))}. Required features: {feature_names}",
            )

        # Documented policy: target column is not required; if present, it is ignored safely.
        # Any other unexpected column is rejected.
        unexpected = df_cols_set - expected_set
        if target_col in unexpected:
            unexpected.remove(target_col)

        if unexpected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Uploaded CSV contains unexpected column(s): {sorted(list(unexpected))}. Expected features: {feature_names}",
            )

        inference_df = df[feature_names]

        try:
            predictions = pipeline.predict(inference_df)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Batch inference failed: {type(exc).__name__}: {str(exc)}",
            ) from exc

        out_df = df.copy()
        pred_col_name = f"predicted_{target_col}"
        out_df[pred_col_name] = [sanitize_scalar(p) for p in predictions]

        # Add probabilities if classification and estimator supports it
        is_classification = task_type in ("binary_classification", "multiclass_classification", "classification")
        if is_classification:
            estimator = pipeline.named_steps.get("estimator", pipeline)
            if hasattr(pipeline, "predict_proba") and hasattr(estimator, "predict_proba"):
                try:
                    proba_arr = pipeline.predict_proba(inference_df)
                    raw_classes = getattr(pipeline, "classes_", getattr(estimator, "classes_", None))
                    class_labels = [str(c) for c in raw_classes] if raw_classes is not None else [f"class_{i}" for i in range(proba_arr.shape[1])]
                    for idx, c_name in enumerate(class_labels):
                        out_df[f"probability_{c_name}"] = [
                            None if (np.isnan(v) or np.isinf(v)) else round(float(v), 6)
                            for v in proba_arr[:, idx]
                        ]
                except Exception as exc:
                    logger.info("predict_proba omitted in CSV batch output: %s", exc)

        csv_buffer = io.StringIO()
        out_df.to_csv(csv_buffer, index=False)
        csv_bytes = csv_buffer.getvalue().encode("utf-8")

        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="predictions_{experiment_id}.csv"',
            },
        )


def get_prediction_service() -> PredictionService:
    """Dependency provider for PredictionService."""
    return PredictionService()
