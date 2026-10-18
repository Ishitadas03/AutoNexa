"""Prediction error analysis service for classification and regression tasks."""

import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    median_absolute_error,
    r2_score,
    root_mean_squared_error,
)
from sklearn.model_selection import train_test_split

from app.core.config import Settings, get_settings
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
from app.services.analysis_service import AnalysisService
from app.services.automl.prediction_service import PredictionService, sanitize_scalar

logger = logging.getLogger(__name__)


def sanitize_num(val: Any, default: Optional[float] = None) -> Optional[float]:
    """Ensure floating-point value is finite and JSON compliant."""
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return round(f, 4)
    except (TypeError, ValueError):
        return default


class ErrorAnalysisService:
    """Computes comprehensive error diagnostics and residual analyses for trained models."""

    def __init__(
        self,
        upload_dir: Optional[Path] = None,
        experiments_dir: Optional[Path] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        self.prediction_service = PredictionService(experiments_dir=experiments_dir)
        self.analysis_service = AnalysisService(upload_dir=upload_dir)

    def _resolve_evaluation_data(
        self,
        metadata: Dict[str, Any],
        request: ErrorAnalysisRequest,
    ) -> Tuple[pd.DataFrame, pd.Series, str, bool]:
        """Resolve dataset partition for error analysis respecting data leakage boundaries."""
        target_col = metadata.get("target_column")
        feature_names = metadata.get("feature_names", [])

        # 1. Custom uploaded records
        if request.custom_records:
            if len(request.custom_records) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Custom records list cannot be empty.",
                )
            # Validate presence of target column
            for idx, rec in enumerate(request.custom_records):
                if target_col not in rec:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Custom record {idx} is missing required target column '{target_col}'.",
                    )
            df_custom = pd.DataFrame(request.custom_records)
            y_eval = df_custom[target_col]
            X_eval = df_custom.drop(columns=[target_col])
            X_eval = self.prediction_service.validate_and_prepare_records(
                X_eval.to_dict(orient="records"), feature_names
            )
            return X_eval, y_eval, "custom", True

        # 2. Existing experiment dataset
        dataset_id = metadata.get("dataset_id")
        if not dataset_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Experiment metadata does not record original dataset_id.",
            )

        file_path = self.analysis_service.resolve_dataset_file(dataset_id)
        df = self.analysis_service.load_dataset(file_path)

        if target_col not in df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' not found in dataset '{dataset_id}'.",
            )

        valid_df = df.dropna(subset=[target_col])
        if len(valid_df) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset contains no non-null target rows.",
            )

        X = valid_df[feature_names]
        y = valid_df[target_col]

        task_type = metadata.get("task_type", "")
        if task_type == "regression":
            y = pd.to_numeric(y, errors="coerce")
            mask = y.notna()
            X = X[mask]
            y = y[mask]

        test_size = float(metadata.get("test_size", 0.2))
        seed = int(metadata.get("random_state", 42))

        can_stratify = False
        if "classification" in task_type:
            can_stratify = y.value_counts().min() >= 2

        try:
            if can_stratify:
                X_tr, X_te, y_tr, y_te = train_test_split(
                    X, y, test_size=test_size, random_state=seed, stratify=y
                )
            else:
                X_tr, X_te, y_tr, y_te = train_test_split(
                    X, y, test_size=test_size, random_state=seed
                )
        except Exception:
            X_tr, X_te, y_tr, y_te = train_test_split(
                X, y, test_size=test_size, random_state=seed
            )

        split_req = request.split.lower().strip()
        if split_req == "test":
            if len(X_te) == 0:
                return X_tr, y_tr, "train", False
            return X_te, y_te, "test", True
        elif split_req == "train":
            return X_tr, y_tr, "train", False
        elif split_req == "full":
            return X, y, "full", False
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported split '{request.split}'. Allowed: 'test', 'train', 'full'.",
            )

    def analyze_errors(
        self,
        experiment_id: str,
        request: ErrorAnalysisRequest,
    ) -> ErrorAnalysisResponse:
        """Execute task-specific error analysis on model predictions."""
        pipeline, metadata = self.prediction_service.load_pipeline(experiment_id)

        task_type = metadata.get("task_type", "unknown")
        target_column = metadata.get("target_column", "unknown")
        model_id = metadata.get("best_model", "unknown")
        numeric_features = metadata.get("numeric_features") or []
        categorical_features = metadata.get("categorical_features") or []

        X_eval, y_eval, split_name, is_independent = self._resolve_evaluation_data(metadata, request)
        sample_size = len(X_eval)

        # Run model inference
        y_pred = pipeline.predict(X_eval)

        # Build notice regarding data leakage / test independence
        if is_independent:
            notice = (
                f"Evaluation executed strictly on the independent {split_name} partition ({sample_size} samples). "
                "This partition was held out during model selection, providing an unbiased estimate of generalization error."
            )
        else:
            notice = (
                f"CAUTION: Evaluation executed on the {split_name} partition ({sample_size} samples). "
                "Evaluating models on training data results in overly optimistic performance metrics and does not reflect true generalization."
            )

        if "classification" in task_type:
            # Classification error analysis
            y_eval_str = [str(val) for val in y_eval]
            y_pred_str = [str(val) for val in y_pred]

            estimator = pipeline.named_steps.get("estimator", pipeline)
            raw_classes = getattr(pipeline, "classes_", getattr(estimator, "classes_", None))
            if raw_classes is not None:
                class_labels = [str(c) for c in raw_classes]
            else:
                class_labels = sorted(list(set(y_eval_str).union(set(y_pred_str))))

            acc = float(accuracy_score(y_eval_str, y_pred_str))
            try:
                bal_acc = sanitize_num(balanced_accuracy_score(y_eval_str, y_pred_str))
            except Exception:
                bal_acc = None

            f1_w = sanitize_num(f1_score(y_eval_str, y_pred_str, average="weighted", zero_division=0))
            f1_m = sanitize_num(f1_score(y_eval_str, y_pred_str, average="macro", zero_division=0))

            # Confusion matrix
            cm = confusion_matrix(y_eval_str, y_pred_str, labels=class_labels)
            cm_list = cm.tolist()

            # Per-class metrics
            class_metrics: List[ClassErrorSummary] = []
            for idx, label in enumerate(class_labels):
                tp = int(cm[idx, idx])
                fn = int(np.sum(cm[idx, :]) - tp)
                fp = int(np.sum(cm[:, idx]) - tp)
                tn = int(np.sum(cm) - tp - fn - fp)
                support = tp + fn

                prec = sanitize_num(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
                rec = sanitize_num(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
                f1_cls = sanitize_num(2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0

                class_metrics.append(
                    ClassErrorSummary(
                        class_label=label,
                        precision=prec,
                        recall=rec,
                        f1_score=f1_cls,
                        support=support,
                        true_positives=tp,
                        false_positives=fp,
                        false_negatives=fn,
                        true_negatives=tn,
                    )
                )

            # Class imbalance ratio
            supports = [c.support for c in class_metrics if c.support > 0]
            if len(supports) >= 2 and min(supports) > 0:
                imbalance_ratio = sanitize_num(max(supports) / min(supports))
            else:
                imbalance_ratio = 1.0

            # Probabilities and calibration
            brier_loss = None
            conf_buckets: Optional[List[ConfidenceBucket]] = None
            probabilities = None
            confidences = None

            if hasattr(pipeline, "predict_proba"):
                try:
                    prob_arr = pipeline.predict_proba(X_eval)
                    confidences = np.max(prob_arr, axis=1)

                    # Brier score loss
                    if len(class_labels) == 2:
                        y_binary = np.array([1.0 if s == class_labels[-1] else 0.0 for s in y_eval_str])
                        pos_probs = prob_arr[:, -1]
                        brier_loss = sanitize_num(np.mean((pos_probs - y_binary) ** 2))
                    else:
                        # Multiclass Brier score
                        one_hot = np.zeros_like(prob_arr)
                        for row_i, true_lbl in enumerate(y_eval_str):
                            if true_lbl in class_labels:
                                one_hot[row_i, class_labels.index(true_lbl)] = 1.0
                        brier_loss = sanitize_num(np.mean(np.sum((prob_arr - one_hot) ** 2, axis=1)))

                    # Calibration buckets (5 bins: 0.5-0.6, 0.6-0.7, 0.7-0.8, 0.8-0.9, 0.9-1.0)
                    bin_edges = [0.0, 0.6, 0.7, 0.8, 0.9, 1.01]
                    conf_buckets = []
                    is_correct_arr = np.array([y_eval_str[k] == y_pred_str[k] for k in range(sample_size)])

                    for b_idx in range(len(bin_edges) - 1):
                        low = bin_edges[b_idx]
                        high = bin_edges[b_idx + 1]
                        in_bin = (confidences >= low) & (confidences < high)
                        bin_count = int(np.sum(in_bin))
                        if bin_count > 0:
                            m_conf = float(np.mean(confidences[in_bin]))
                            obs_acc = float(np.mean(is_correct_arr[in_bin]))
                            conf_buckets.append(
                                ConfidenceBucket(
                                    bin_range=f"{low:.2f} - {min(high, 1.0):.2f}",
                                    mean_confidence=round(m_conf, 4),
                                    observed_accuracy=round(obs_acc, 4),
                                    sample_count=bin_count,
                                )
                            )
                except Exception as prob_exc:
                    logger.warning("Probability evaluation in error analysis failed: %s", prob_exc)

            # Misclassified instances
            misclassified_items: List[MisclassifiedInstance] = []
            for k in range(sample_size):
                if y_eval_str[k] != y_pred_str[k]:
                    inst_probs = None
                    inst_conf = None
                    if confidences is not None:
                        inst_conf = sanitize_num(confidences[k])
                        inst_probs = {
                            class_labels[c]: sanitize_num(prob_arr[k, c], 0.0)
                            for c in range(len(class_labels))
                        }
                    misclassified_items.append(
                        MisclassifiedInstance(
                            record_index=k,
                            true_label=y_eval_str[k],
                            predicted_label=y_pred_str[k],
                            confidence=inst_conf,
                            probabilities=inst_probs,
                            input_features=X_eval.iloc[k].to_dict(),
                        )
                    )

            # Sort misclassified instances by confidence descending (highest confidence mistakes first)
            misclassified_items.sort(
                key=lambda m: (m.confidence if m.confidence is not None else 0.0),
                reverse=True,
            )
            top_misclassified = misclassified_items[: request.max_error_examples]

            cls_analysis = ClassificationErrorAnalysis(
                accuracy=round(acc, 4),
                balanced_accuracy=bal_acc,
                f1_weighted=f1_w,
                f1_macro=f1_m,
                brier_score_loss=brier_loss,
                confusion_matrix=cm_list,
                class_labels=class_labels,
                class_metrics=class_metrics,
                total_samples=sample_size,
                misclassified_count=len(misclassified_items),
                error_rate=round(1.0 - acc, 4),
                class_imbalance_ratio=imbalance_ratio,
                confidence_buckets=conf_buckets,
                top_misclassified_examples=top_misclassified,
            )

            return ErrorAnalysisResponse(
                experiment_id=experiment_id,
                model_id=model_id,
                task_type=task_type,
                target_column=target_column,
                evaluation_split=split_name,
                sample_size=sample_size,
                is_independent_test_evaluation=is_independent,
                classification_analysis=cls_analysis,
                regression_analysis=None,
                evaluation_notice=notice,
            )

        else:
            # Regression error analysis
            y_eval_num = pd.to_numeric(y_eval, errors="coerce").to_numpy(dtype=float)
            y_pred_num = pd.to_numeric(pd.Series(y_pred), errors="coerce").to_numpy(dtype=float)

            residuals = y_eval_num - y_pred_num
            abs_errors = np.abs(residuals)

            mae_val = float(mean_absolute_error(y_eval_num, y_pred_num))
            rmse_val = float(root_mean_squared_error(y_eval_num, y_pred_num))
            med_ae = float(median_absolute_error(y_eval_num, y_pred_num))
            try:
                r2_val = sanitize_num(r2_score(y_eval_num, y_pred_num))
            except Exception:
                r2_val = None

            res_summary = RegressionResidualSummary(
                mean_residual=sanitize_num(np.mean(residuals), 0.0),
                std_residual=sanitize_num(np.std(residuals), 0.0),
                min_residual=sanitize_num(np.min(residuals), 0.0),
                p25_residual=sanitize_num(np.percentile(residuals, 25), 0.0),
                median_residual=sanitize_num(np.median(residuals), 0.0),
                p75_residual=sanitize_num(np.percentile(residuals, 75), 0.0),
                max_residual=sanitize_num(np.max(residuals), 0.0),
                mae=sanitize_num(mae_val, 0.0),
                rmse=sanitize_num(rmse_val, 0.0),
                median_absolute_error=sanitize_num(med_ae, 0.0),
                r2_score=r2_val,
                max_absolute_error=sanitize_num(np.max(abs_errors), 0.0),
            )

            # Feature-error correlation
            correlations: List[FeatureErrorCorrelation] = []
            for num_feat in numeric_features:
                if num_feat in X_eval.columns:
                    feat_series = pd.to_numeric(X_eval[num_feat], errors="coerce")
                    if feat_series.nunique() > 1 and feat_series.std() > 0:
                        corr_val = float(feat_series.corr(pd.Series(abs_errors, index=X_eval.index)))
                        if not math.isnan(corr_val):
                            if corr_val > 0.15:
                                interp = f"Higher {num_feat} values moderately correlate with higher prediction error."
                            elif corr_val < -0.15:
                                interp = f"Lower {num_feat} values moderately correlate with higher prediction error."
                            else:
                                interp = f"Prediction error is relatively uniform across {num_feat} range."
                            correlations.append(
                                FeatureErrorCorrelation(
                                    feature_name=num_feat,
                                    correlation_with_absolute_error=round(corr_val, 4),
                                    interpretation=interp,
                                )
                            )

            correlations.sort(key=lambda c: abs(c.correlation_with_absolute_error), reverse=True)

            # Categorical slices
            slices: List[CategoryErrorSlice] = []
            for cat_feat in categorical_features:
                if cat_feat in X_eval.columns:
                    cat_series = X_eval[cat_feat].astype(str)
                    for cat_level, group_indices in cat_series.groupby(cat_series).groups.items():
                        slice_errors = abs_errors[X_eval.index.isin(group_indices)]
                        if len(slice_errors) >= 1:
                            slices.append(
                                CategoryErrorSlice(
                                    feature_name=cat_feat,
                                    category_value=str(cat_level),
                                    mae=round(float(np.mean(slice_errors)), 4),
                                    sample_count=len(slice_errors),
                                )
                            )

            slices.sort(key=lambda s: s.mae, reverse=True)

            # Outlier residual instances
            outlier_instances: List[RegressionOutlierInstance] = []
            for k in range(sample_size):
                outlier_instances.append(
                    RegressionOutlierInstance(
                        record_index=k,
                        true_value=sanitize_num(y_eval_num[k], 0.0),
                        predicted_value=sanitize_num(y_pred_num[k], 0.0),
                        residual=sanitize_num(residuals[k], 0.0),
                        absolute_error=sanitize_num(abs_errors[k], 0.0),
                        input_features=X_eval.iloc[k].to_dict(),
                    )
                )

            outlier_instances.sort(key=lambda inst: inst.absolute_error, reverse=True)
            top_outliers = outlier_instances[: request.max_error_examples]

            reg_analysis = RegressionErrorAnalysis(
                total_samples=sample_size,
                residual_summary=res_summary,
                feature_error_correlations=correlations,
                categorical_slices=slices if slices else None,
                top_error_examples=top_outliers,
            )

            return ErrorAnalysisResponse(
                experiment_id=experiment_id,
                model_id=model_id,
                task_type=task_type,
                target_column=target_column,
                evaluation_split=split_name,
                sample_size=sample_size,
                is_independent_test_evaluation=is_independent,
                classification_analysis=None,
                regression_analysis=reg_analysis,
                evaluation_notice=notice,
            )


def get_error_analysis_service() -> ErrorAnalysisService:
    """Dependency injection provider for ErrorAnalysisService."""
    return ErrorAnalysisService()
