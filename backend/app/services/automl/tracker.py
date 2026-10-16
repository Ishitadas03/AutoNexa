"""Modular MLflow experiment tracking service for AutoNexa AutoML training."""

import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import sklearn
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


def compute_dataset_fingerprint(file_path: Path) -> str:
    """Compute cryptographic SHA-256 hash of the stored CSV file.

    Distinguishes dataset content changes without logging raw data rows or PII.
    """
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


class MLflowTracker:
    """Manages experiment tracking lifecycle using local or remote MLflow."""

    def __init__(
        self,
        tracking_uri: Optional[str] = None,
        enabled: bool = True,
        experiments_dir: Optional[Path] = None,
    ) -> None:
        self.enabled = enabled
        self._mlflow = None
        self.tracking_uri = tracking_uri
        self.experiments_dir = experiments_dir

        if not self.enabled:
            logger.info("MLflow tracking is explicitly disabled in settings.")
            return

        try:
            import os
            os.environ["MLFLOW_ALLOW_FILE_STORE"] = "true"
            import mlflow
            self._mlflow = mlflow

            # Resolve tracking URI
            if self.tracking_uri:
                resolved_uri = self.tracking_uri
            elif self.experiments_dir:
                mlruns_dir = (self.experiments_dir / "mlruns").resolve()
                mlruns_dir.mkdir(parents=True, exist_ok=True)
                resolved_uri = str(mlruns_dir)
            else:
                resolved_uri = "./experiments/mlruns"

            self._mlflow.set_tracking_uri(resolved_uri)
            self.tracking_uri = resolved_uri
            logger.info("MLflow tracking initialized at URI: %s", self.tracking_uri)
        except Exception as exc:
            logger.warning("Failed to initialize MLflow: %s. Tracking disabled for this session.", exc)
            self.enabled = False
            self._mlflow = None

    def start_parent_run(
        self,
        experiment_id: str,
        dataset_id: str,
        dataset_fingerprint: str,
        target_column: str,
        task_type: str,
        evaluation_strategy: str,
        cv_folds: Optional[int],
        test_size: float,
        random_state: int,
        primary_metric: str,
        time_budget_seconds: int,
    ) -> Tuple[Optional[str], Optional[str], str, Optional[str]]:
        """Initialize the parent experiment run in MLflow.

        Returns:
            Tuple of (parent_run_id, mlflow_experiment_id, tracking_status, tracking_warning)
        """
        if not self.enabled or self._mlflow is None:
            return None, None, "disabled", None

        try:
            exp_name = f"AutoNexa-{dataset_id[:8]}"
            experiment = self._mlflow.get_experiment_by_name(exp_name)
            if experiment is None:
                mlflow_exp_id = self._mlflow.create_experiment(exp_name)
            else:
                mlflow_exp_id = experiment.experiment_id

            parent_run = self._mlflow.start_run(
                experiment_id=mlflow_exp_id,
                run_name=f"AutoML-{experiment_id[:8]}",
            )
            parent_run_id = parent_run.info.run_id

            # Log experiment parameters
            params: Dict[str, Any] = {
                "autonexa_experiment_id": experiment_id,
                "dataset_id": dataset_id,
                "dataset_fingerprint": dataset_fingerprint,
                "target_column": target_column,
                "task_type": task_type,
                "evaluation_strategy": evaluation_strategy,
                "test_size": test_size,
                "random_state": random_state,
                "primary_metric": primary_metric,
                "time_budget_seconds": time_budget_seconds,
            }
            if cv_folds is not None:
                params["cv_folds"] = cv_folds

            self._mlflow.log_params(params)

            # Log library version tags
            self._mlflow.set_tags({
                "autonexa.version": "0.1.0",
                "scikit-learn.version": sklearn.__version__,
                "pandas.version": pd.__version__,
                "numpy.version": np.__version__,
                "mlflow.version": getattr(self._mlflow, "__version__", "unknown"),
            })

            return parent_run_id, mlflow_exp_id, "completed", None
        except Exception as exc:
            logger.warning("MLflow parent run creation failed: %s", exc)
            return None, None, "failed", f"MLflow start failed: {type(exc).__name__}"

    def log_candidate_child_run(
        self,
        model_id: str,
        model_name: str,
        status: str,
        duration_seconds: float,
        metrics: Dict[str, Any],
        cv_scores: Optional[List[float]] = None,
        cv_mean: Optional[float] = None,
        cv_std: Optional[float] = None,
        valid_folds_count: Optional[int] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Log a candidate estimator run as a nested child run under the active parent run."""
        if not self.enabled or self._mlflow is None or self._mlflow.active_run() is None:
            return

        try:
            with self._mlflow.start_run(run_name=model_id, nested=True):
                self._mlflow.log_params({
                    "model_id": model_id,
                    "model_name": model_name,
                })
                self._mlflow.set_tag("status", status)
                if error_message:
                    self._mlflow.set_tag("error_message", error_message)

                # Log duration metric
                self._mlflow.log_metric("duration_seconds", duration_seconds)

                # Log CV aggregates
                if cv_mean is not None:
                    self._mlflow.log_metric("cv_mean", cv_mean)
                if cv_std is not None:
                    self._mlflow.log_metric("cv_std", cv_std)
                if valid_folds_count is not None:
                    self._mlflow.log_metric("valid_folds_count", float(valid_folds_count))

                # Log scalar metrics
                for k, v in metrics.items():
                    if isinstance(v, (int, float)) and not isinstance(v, bool):
                        self._mlflow.log_metric(k, float(v))
        except Exception as exc:
            logger.warning("Failed to log candidate child run '%s' to MLflow: %s", model_id, exc)

    def finalize_parent_run(
        self,
        best_model: Optional[str],
        best_score: Optional[float],
        test_metrics: Optional[Dict[str, Any]],
        total_duration_seconds: float,
        metadata_file: Optional[Path] = None,
    ) -> None:
        """Log final experiment outcomes, attach metadata artifact, and close the parent run."""
        if not self.enabled or self._mlflow is None or self._mlflow.active_run() is None:
            return

        try:
            if best_model:
                self._mlflow.set_tag("best_model", best_model)
            if best_score is not None:
                self._mlflow.log_metric("best_score", best_score)
            self._mlflow.log_metric("total_duration_seconds", total_duration_seconds)

            # Log final independent test metrics if available
            if test_metrics:
                for k, v in test_metrics.items():
                    if isinstance(v, (int, float)) and not isinstance(v, bool):
                        self._mlflow.log_metric(f"test_{k}", float(v))

            # Attach metadata artifact if available
            if metadata_file and metadata_file.is_file():
                self._mlflow.log_artifact(str(metadata_file), artifact_path="experiment_metadata")

            self._mlflow.end_run()
        except Exception as exc:
            logger.warning("Failed to finalize MLflow parent run: %s", exc)
            try:
                self._mlflow.end_run(status="FAILED")
            except Exception:
                pass
