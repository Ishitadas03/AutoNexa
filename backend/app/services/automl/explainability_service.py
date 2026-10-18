"""Model explainability service: global feature importance and local instance attributions."""

import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import HTTPException, status
import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from app.core.config import Settings, get_settings
from app.schemas.explainability import (
    FeatureContribution,
    FeatureImportanceItem,
    GlobalFeatureImportanceResponse,
    InstanceExplanation,
    PredictionExplanationRequest,
    PredictionExplanationResponse,
    TransformedFeatureImportanceItem,
)
from app.services.analysis_service import AnalysisService
from app.services.automl.prediction_service import PredictionService, sanitize_scalar

logger = logging.getLogger(__name__)


def sanitize_float_val(value: Any, default: Optional[float] = None) -> Optional[float]:
    """Convert value to JSON-compliant finite float rounded to 4 decimals."""
    if value is None:
        return default
    try:
        val = float(value)
        if math.isnan(val) or math.isinf(val):
            return default
        return round(val, 4)
    except (TypeError, ValueError):
        return default


def parse_transformed_feature_name(
    col_name: str,
    numeric_features: List[str],
    categorical_features: List[str],
) -> Tuple[str, str]:
    """Parse transformed column name into (source_feature_name, human_readable_label)."""
    # 1. Clean pipeline prefixes added by ColumnTransformer
    clean_name = col_name
    if clean_name.startswith("numeric__"):
        clean_name = clean_name[len("numeric__"):]
        return clean_name, clean_name
    if clean_name.startswith("categorical__"):
        clean_name = clean_name[len("categorical__"):]

    # 2. Match against categorical features
    for cat_col in sorted(categorical_features, key=len, reverse=True):
        prefix = f"{cat_col}_"
        if clean_name.startswith(prefix):
            category_val = clean_name[len(prefix):]
            if category_val == "infrequent_sklearn":
                return cat_col, f"{cat_col} (infrequent categories)"
            return cat_col, f"{cat_col} = {category_val}"

    # 3. Match against numeric features
    for num_col in numeric_features:
        if clean_name == num_col:
            return num_col, num_col

    return clean_name, clean_name


class ExplainabilityService:
    """Provides global and local model explanations for fitted AutoNexa AutoML pipelines."""

    def __init__(
        self,
        upload_dir: Optional[Path] = None,
        experiments_dir: Optional[Path] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        self.prediction_service = PredictionService(experiments_dir=experiments_dir)
        self.analysis_service = AnalysisService(upload_dir=upload_dir)
        self.max_sample_size = self.settings.max_explainability_sample_size
        self.max_records = self.settings.max_explainability_records
        self.n_permutations = self.settings.explainability_n_permutations

    def _load_experiment_dataset(
        self,
        metadata: Dict[str, Any],
        sample_limit: Optional[int] = None,
    ) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series]:
        """Load experiment dataset and reconstruct exact train/test splits without leakage."""
        dataset_id = metadata.get("dataset_id")
        target_column = metadata.get("target_column")
        if not dataset_id or not target_column:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Experiment metadata does not contain required dataset_id or target_column references.",
            )

        file_path = self.analysis_service.resolve_dataset_file(dataset_id)
        df = self.analysis_service.load_dataset(file_path)

        if target_column not in df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_column}' is missing from stored dataset '{dataset_id}'.",
            )

        valid_df = df.dropna(subset=[target_column])
        if len(valid_df) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Dataset '{dataset_id}' contains no valid rows for target '{target_column}'.",
            )

        X = valid_df.drop(columns=[target_column])
        y = valid_df[target_column]

        task_type = metadata.get("task_type", "")
        if task_type == "regression":
            y = pd.to_numeric(y, errors="coerce")
            valid_mask = y.notna()
            X = X[valid_mask]
            y = y[valid_mask]

        test_size = float(metadata.get("test_size", 0.2))
        random_state = int(metadata.get("random_state", 42))

        # Reconstruct holdout split using identical strategy
        can_stratify = False
        if "classification" in task_type:
            min_count = y.value_counts().min()
            can_stratify = min_count >= 2

        try:
            if can_stratify:
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y, test_size=test_size, random_state=random_state, stratify=y
                )
            else:
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y, test_size=test_size, random_state=random_state
                )
        except Exception:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=random_state
            )

        if sample_limit and len(X_test) > sample_limit:
            X_test = X_test.sample(n=sample_limit, random_state=random_state)
            y_test = y.loc[X_test.index]

        return X_train, y_train, X_test, y_test

    def compute_global_importance(
        self,
        experiment_id: str,
        method: Literal["auto", "native", "permutation"] = "auto",
        sample_size: Optional[int] = None,
        random_state: Optional[int] = None,
    ) -> GlobalFeatureImportanceResponse:
        """Compute global feature importances for a trained model pipeline."""
        pipeline, metadata = self.prediction_service.load_pipeline(experiment_id)

        model_id = metadata.get("best_model", "unknown")
        task_type = metadata.get("task_type", "unknown")
        target_column = metadata.get("target_column", "unknown")
        feature_names = metadata.get("feature_names", [])
        numeric_features = metadata.get("numeric_features") or []
        categorical_features = metadata.get("categorical_features") or []
        seed = random_state if random_state is not None else int(metadata.get("random_state", 42))

        estimator = pipeline.named_steps.get("estimator", pipeline)
        preprocessor = pipeline.named_steps.get("preprocessor")

        has_native_importance = hasattr(estimator, "feature_importances_")

        # Resolve computation technique
        chosen_method = method.lower().strip()
        if chosen_method == "auto":
            chosen_method = "native" if has_native_importance else "permutation"

        if chosen_method == "native":
            if not has_native_importance:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"The winning estimator '{model_id}' does not expose native feature_importances_. "
                        "Please use method='permutation' for model-agnostic feature importance."
                    ),
                )

            raw_importances = estimator.feature_importances_
            transformed_feature_items: List[TransformedFeatureImportanceItem] = []

            # Extract transformed feature names from ColumnTransformer
            if preprocessor and hasattr(preprocessor, "get_feature_names_out"):
                try:
                    transformed_names = list(preprocessor.get_feature_names_out())
                except Exception:
                    transformed_names = [f"feature_{i}" for i in range(len(raw_importances))]
            else:
                transformed_names = [f"feature_{i}" for i in range(len(raw_importances))]

            total_importance = float(np.sum(raw_importances))
            feature_agg: Dict[str, float] = {feat: 0.0 for feat in feature_names}

            for t_name, imp in zip(transformed_names, raw_importances):
                imp_val = float(imp)
                norm_val = round(imp_val / total_importance, 4) if total_importance > 0 else 0.0
                src_feat, label = parse_transformed_feature_name(
                    t_name, numeric_features, categorical_features
                )
                transformed_feature_items.append(
                    TransformedFeatureImportanceItem(
                        transformed_feature=t_name,
                        source_feature=src_feat,
                        label=label,
                        importance=round(imp_val, 4),
                        normalized_importance=norm_val,
                    )
                )
                if src_feat in feature_agg:
                    feature_agg[src_feat] += imp_val
                else:
                    feature_agg[src_feat] = imp_val

            # Build original feature ranking
            ranked_items: List[FeatureImportanceItem] = []
            sorted_feats = sorted(feature_agg.items(), key=lambda kv: kv[1], reverse=True)
            for rank_idx, (f_name, agg_imp) in enumerate(sorted_feats, start=1):
                norm_score = round(agg_imp / total_importance, 4) if total_importance > 0 else 0.0
                ranked_items.append(
                    FeatureImportanceItem(
                        feature=f_name,
                        importance=round(agg_imp, 4),
                        importance_std=None,
                        normalized_importance=norm_score,
                        rank=rank_idx,
                    )
                )

            sample_eval_count = metadata.get("train_rows", len(transformed_names))
            method_details = (
                f"Native Gini impurity/variance reduction importance computed from fitted {model_id} estimator. "
                "One-hot encoded categorical indicators are aggregated back to original feature spaces."
            )

            return GlobalFeatureImportanceResponse(
                experiment_id=experiment_id,
                model_id=model_id,
                model_name=metadata.get("best_model_name", model_id),
                task_type=task_type,
                target_column=target_column,
                importance_method="native_tree_importance",
                sample_size=sample_eval_count,
                features_count=len(feature_names),
                feature_importances=ranked_items,
                transformed_feature_importances=transformed_feature_items,
                evaluation_partition="training_partition",
                random_state=seed,
                method_details=method_details,
            )

        elif chosen_method == "permutation":
            limit = sample_size if sample_size and sample_size > 0 else self.max_sample_size
            limit = min(limit, self.max_sample_size)

            X_train, y_train, X_test, y_test = self._load_experiment_dataset(metadata, sample_limit=limit)

            eval_X, eval_y = (X_test, y_test) if len(X_test) >= 5 else (X_train, y_train)
            partition_name = "holdout_test_partition" if len(X_test) >= 5 else "training_partition"

            try:
                perm_res = permutation_importance(
                    estimator=pipeline,
                    X=eval_X,
                    y=eval_y,
                    n_repeats=self.n_permutations,
                    random_state=seed,
                    n_jobs=1,
                )
            except Exception as exc:
                logger.error("Permutation importance failed: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Permutation importance calculation failed: {type(exc).__name__}: {str(exc)}",
                ) from exc

            means = perm_res.importances_mean
            stds = perm_res.importances_std

            # Calculate normalization only over strictly positive degradation values
            pos_sum = float(np.sum(np.maximum(means, 0)))

            ranked_items = []
            indexed_feats = list(enumerate(feature_names))
            sorted_by_mean = sorted(indexed_feats, key=lambda idx_feat: means[idx_feat[0]], reverse=True)

            for rank_idx, (col_idx, f_name) in enumerate(sorted_by_mean, start=1):
                mean_val = float(means[col_idx])
                std_val = float(stds[col_idx])
                norm_score = round(max(mean_val, 0.0) / pos_sum, 4) if pos_sum > 0 else 0.0
                ranked_items.append(
                    FeatureImportanceItem(
                        feature=f_name,
                        importance=round(mean_val, 4),
                        importance_std=round(std_val, 4),
                        normalized_importance=norm_score if mean_val >= 0 else 0.0,
                        rank=rank_idx,
                    )
                )

            method_details = (
                f"Model-agnostic permutation feature importance evaluated over {len(eval_X)} instances "
                f"from {partition_name} with {self.n_permutations} shuffle iterations per feature."
            )

            return GlobalFeatureImportanceResponse(
                experiment_id=experiment_id,
                model_id=model_id,
                model_name=metadata.get("best_model_name", model_id),
                task_type=task_type,
                target_column=target_column,
                importance_method="permutation_importance",
                sample_size=len(eval_X),
                features_count=len(feature_names),
                feature_importances=ranked_items,
                transformed_feature_importances=None,
                evaluation_partition=partition_name,
                random_state=seed,
                method_details=method_details,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported importance method '{method}'. Supported methods: 'auto', 'native', 'permutation'.",
            )

    def _compute_local_perturbation_fallback(
        self,
        pipeline: Pipeline,
        df_records: pd.DataFrame,
        X_bg: pd.DataFrame,
        feature_names: List[str],
        task_type: str,
    ) -> Tuple[List[InstanceExplanation], str, str]:
        """Model-agnostic local feature attribution fallback using marginal feature perturbations."""
        # Baseline expectation
        raw_bg_preds = pipeline.predict(X_bg)
        if "classification" in task_type:
            # Baseline is expected mode or positive probability
            base_val = 0.5
            if hasattr(pipeline, "predict_proba"):
                try:
                    bg_probs = pipeline.predict_proba(X_bg)
                    base_val = float(np.mean(bg_probs[:, 1])) if bg_probs.shape[1] > 1 else 0.5
                except Exception:
                    base_val = 0.5
        else:
            base_val = float(np.mean(pd.to_numeric(raw_bg_preds, errors="coerce").dropna()))

        # Query predictions
        preds = pipeline.predict(df_records)
        query_probs = None
        if "classification" in task_type and hasattr(pipeline, "predict_proba"):
            try:
                query_probs = pipeline.predict_proba(df_records)
            except Exception:
                query_probs = None

        explanations: List[InstanceExplanation] = []

        # Background reference replacement values (median for numeric, mode for categorical)
        ref_values = {}
        for col in feature_names:
            series = X_bg[col]
            if pd.api.types.is_numeric_dtype(series):
                ref_values[col] = float(series.median())
            else:
                mode_vals = series.mode()
                ref_values[col] = mode_vals.iloc[0] if len(mode_vals) > 0 else series.iloc[0]

        for i in range(len(df_records)):
            row_dict = df_records.iloc[i].to_dict()
            pred_scalar = sanitize_scalar(preds[i])

            prob_dict = None
            if query_probs is not None:
                estimator = pipeline.named_steps.get("estimator", pipeline)
                classes = getattr(pipeline, "classes_", getattr(estimator, "classes_", [0, 1]))
                prob_dict = {str(cls_val): sanitize_float_val(query_probs[i, c_idx], 0.0) for c_idx, cls_val in enumerate(classes)}

            pred_val = sanitize_float_val(pred_scalar) if isinstance(pred_scalar, (int, float)) else None
            if prob_dict and len(prob_dict) == 2:
                # Binary classification probability
                pos_key = list(prob_dict.keys())[-1]
                pred_val = prob_dict[pos_key]

            # Leave-one-covariate-out replacement to estimate marginal shift
            contributions: List[FeatureContribution] = []
            for feat in feature_names:
                orig_val = row_dict[feat]
                # Perturb instance by setting this feature to reference background value
                perturbed_row = row_dict.copy()
                perturbed_row[feat] = ref_values[feat]
                pert_df = pd.DataFrame([perturbed_row])[feature_names]

                try:
                    if query_probs is not None and len(prob_dict) == 2:
                        pert_prob = pipeline.predict_proba(pert_df)[0, -1]
                        current_prob = query_probs[i, -1]
                        delta = float(current_prob - pert_prob)
                    elif task_type == "regression":
                        pert_pred = float(pipeline.predict(pert_df)[0])
                        delta = float(pred_scalar - pert_pred)
                    else:
                        pert_pred = pipeline.predict(pert_df)[0]
                        delta = 1.0 if str(pred_scalar) != str(pert_pred) else 0.0
                except Exception:
                    delta = 0.0

                contributions.append(
                    FeatureContribution(
                        feature=feat,
                        value=sanitize_scalar(orig_val),
                        contribution=round(delta, 4),
                        relative_share=None,
                    )
                )

            # Compute relative attribution shares
            total_abs = sum(abs(c.contribution) for c in contributions)
            for c in contributions:
                if total_abs > 0:
                    c.relative_share = round(abs(c.contribution) / total_abs, 4)
                else:
                    c.relative_share = 0.0

            contributions.sort(key=lambda c: abs(c.contribution), reverse=True)

            explanations.append(
                InstanceExplanation(
                    record_index=i,
                    input_features=row_dict,
                    prediction=pred_scalar,
                    prediction_probabilities=prob_dict,
                    base_value=round(base_val, 4),
                    predicted_value=pred_val,
                    feature_contributions=contributions,
                )
            )

        baseline_summary = f"Computed against empirical background reference distribution ({len(X_bg)} samples)."
        return explanations, "local_perturbation_fallback", baseline_summary

    def compute_local_explanations(
        self,
        experiment_id: str,
        request: PredictionExplanationRequest,
    ) -> PredictionExplanationResponse:
        """Compute instance-level prediction explanations using SHAP or robust local fallback."""
        if len(request.records) > self.max_records:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Request batch size ({len(request.records)}) exceeds maximum limit of {self.max_records} records.",
            )

        pipeline, metadata = self.prediction_service.load_pipeline(experiment_id)

        feature_names = metadata.get("feature_names", [])
        numeric_features = metadata.get("numeric_features") or []
        categorical_features = metadata.get("categorical_features") or []
        task_type = metadata.get("task_type", "unknown")
        target_column = metadata.get("target_column", "unknown")
        model_id = metadata.get("best_model", "unknown")

        df_records = self.prediction_service.validate_and_prepare_records(request.records, feature_names)

        # Background reference data for baseline calculation
        X_train, _, X_test, _ = self._load_experiment_dataset(metadata, sample_limit=min(100, self.max_sample_size))
        X_bg = X_train if len(X_train) >= 5 else (X_test if len(X_test) >= 5 else df_records)
        if len(X_bg) > 100:
            X_bg = X_bg.sample(n=100, random_state=int(metadata.get("random_state", 42)))

        preprocessor = pipeline.named_steps.get("preprocessor")
        estimator = pipeline.named_steps.get("estimator", pipeline)

        use_fallback = request.method == "fallback"
        explanation_method = "local_perturbation_fallback"

        if not use_fallback:
            try:
                import shap

                # Transform data through preprocessor
                if preprocessor:
                    X_bg_trans = preprocessor.transform(X_bg)
                    X_query_trans = preprocessor.transform(df_records)
                    try:
                        trans_feature_names = list(preprocessor.get_feature_names_out())
                    except Exception:
                        trans_feature_names = [f"t_feat_{j}" for j in range(X_query_trans.shape[1])]
                else:
                    X_bg_trans = X_bg.to_numpy()
                    X_query_trans = df_records.to_numpy()
                    trans_feature_names = feature_names

                # Choose appropriate SHAP explainer
                explainer = None
                if hasattr(estimator, "feature_importances_") and "HistGradientBoosting" not in type(estimator).__name__:
                    try:
                        explainer = shap.TreeExplainer(estimator)
                        explanation_method = "shap_tree"
                    except Exception as tree_exc:
                        logger.warning("TreeExplainer could not initialize: %s", tree_exc)

                if explainer is None and hasattr(estimator, "coef_"):
                    try:
                        explainer = shap.LinearExplainer(estimator, X_bg_trans)
                        explanation_method = "shap_linear"
                    except Exception as lin_exc:
                        logger.warning("LinearExplainer could not initialize: %s", lin_exc)

                if explainer is None and request.method == "shap":
                    # User explicitly requested SHAP; try generic Explainer
                    try:
                        explainer = shap.Explainer(estimator, X_bg_trans)
                        explanation_method = "shap_generic"
                    except Exception as gen_exc:
                        logger.warning("Generic SHAP explainer failed: %s", gen_exc)

                if explainer is not None:
                    # Execute SHAP explanation
                    raw_shap_output = explainer(X_query_trans)

                    # Determine base value and shap values matrix
                    shap_vals = raw_shap_output.values
                    base_vals = raw_shap_output.base_values

                    # Model prediction outputs
                    preds = pipeline.predict(df_records)
                    query_probs = None
                    classes = None
                    if "classification" in task_type and hasattr(pipeline, "predict_proba"):
                        try:
                            query_probs = pipeline.predict_proba(df_records)
                            raw_classes = getattr(pipeline, "classes_", getattr(estimator, "classes_", None))
                            classes = [str(c) for c in raw_classes] if raw_classes is not None else [f"class_{c}" for c in range(query_probs.shape[1])]
                        except Exception:
                            query_probs = None

                    explanations: List[InstanceExplanation] = []

                    for i in range(len(df_records)):
                        row_dict = df_records.iloc[i].to_dict()
                        pred_scalar = sanitize_scalar(preds[i])

                        prob_dict = None
                        if query_probs is not None:
                            prob_dict = {classes[c]: sanitize_float_val(query_probs[i, c], 0.0) for c in range(len(classes))}

                        # Extract base value for this record
                        if isinstance(base_vals, (np.ndarray, list)):
                            b_val = float(base_vals[i]) if np.ndim(base_vals) == 1 else float(base_vals[i, -1])
                        else:
                            b_val = float(base_vals)

                        # Extract feature SHAP attributions
                        # Shape can be (n_samples, n_features) or (n_samples, n_features, n_classes)
                        if shap_vals.ndim == 3:
                            # Multiclass or binary with 2 class slices
                            is_multiclass = shap_vals.shape[2] > 2
                            # For binary, use positive class slice (last slice)
                            inst_shap = shap_vals[i, :, -1] if not is_multiclass else shap_vals[i, :, :]
                        else:
                            is_multiclass = False
                            inst_shap = shap_vals[i, :]

                        # Aggregate transformed features back to original feature names
                        feat_contrib_agg: Dict[str, float] = {feat: 0.0 for feat in feature_names}
                        feat_details_agg: Dict[str, List[Dict[str, Any]]] = {feat: [] for feat in feature_names}

                        if not is_multiclass:
                            for j, t_name in enumerate(trans_feature_names):
                                s_feat, label = parse_transformed_feature_name(
                                    t_name, numeric_features, categorical_features
                                )
                                c_val = float(inst_shap[j])
                                if s_feat in feat_contrib_agg:
                                    feat_contrib_agg[s_feat] += c_val
                                    feat_details_agg[s_feat].append({"label": label, "attribution": round(c_val, 4)})
                                else:
                                    feat_contrib_agg[s_feat] = c_val
                                    feat_details_agg[s_feat] = [{"label": label, "attribution": round(c_val, 4)}]

                            total_abs = sum(abs(v) for v in feat_contrib_agg.values())
                            contributions = []
                            for feat, val in feat_contrib_agg.items():
                                rel = round(abs(val) / total_abs, 4) if total_abs > 0 else 0.0
                                contributions.append(
                                    FeatureContribution(
                                        feature=feat,
                                        value=sanitize_scalar(row_dict[feat]),
                                        contribution=round(val, 4),
                                        relative_share=rel,
                                        details=feat_details_agg.get(feat),
                                    )
                                )
                            contributions.sort(key=lambda c: abs(c.contribution), reverse=True)

                            explanations.append(
                                InstanceExplanation(
                                    record_index=i,
                                    input_features=row_dict,
                                    prediction=pred_scalar,
                                    prediction_probabilities=prob_dict,
                                    base_value=round(b_val, 4),
                                    predicted_value=round(b_val + sum(c.contribution for c in contributions), 4),
                                    feature_contributions=contributions,
                                )
                            )
                        else:
                            # Multiclass: compute primary class attributions (predicted class) and per-class map
                            pred_class_idx = 0
                            if classes and str(pred_scalar) in classes:
                                pred_class_idx = classes.index(str(pred_scalar))

                            class_attributions_map: Dict[str, List[FeatureContribution]] = {}
                            primary_contributions = []

                            for c_idx, c_name in enumerate(classes):
                                c_agg: Dict[str, float] = {feat: 0.0 for feat in feature_names}
                                for j, t_name in enumerate(trans_feature_names):
                                    s_feat, _ = parse_transformed_feature_name(
                                        t_name, numeric_features, categorical_features
                                    )
                                    val_for_class = float(shap_vals[i, j, c_idx])
                                    c_agg[s_feat] = c_agg.get(s_feat, 0.0) + val_for_class

                                total_c_abs = sum(abs(v) for v in c_agg.values())
                                c_items = [
                                    FeatureContribution(
                                        feature=f,
                                        value=sanitize_scalar(row_dict[f]),
                                        contribution=round(c_agg[f], 4),
                                        relative_share=round(abs(c_agg[f]) / total_c_abs, 4) if total_c_abs > 0 else 0.0,
                                    )
                                    for f in feature_names
                                ]
                                c_items.sort(key=lambda it: abs(it.contribution), reverse=True)
                                class_attributions_map[c_name] = c_items
                                if c_idx == pred_class_idx:
                                    primary_contributions = c_items

                            explanations.append(
                                InstanceExplanation(
                                    record_index=i,
                                    input_features=row_dict,
                                    prediction=pred_scalar,
                                    prediction_probabilities=prob_dict,
                                    base_value=round(b_val, 4),
                                    predicted_value=None,
                                    feature_contributions=primary_contributions,
                                    class_attributions=class_attributions_map,
                                )
                            )

                    baseline_summary = f"SHAP background reference dataset containing {len(X_bg)} samples."
                    return PredictionExplanationResponse(
                        experiment_id=experiment_id,
                        model_id=model_id,
                        task_type=task_type,
                        target_column=target_column,
                        explanation_method=explanation_method,
                        explanation_count=len(explanations),
                        explanations=explanations,
                        baseline_summary=baseline_summary,
                    )

            except Exception as shap_err:
                logger.warning("SHAP explanation pipeline failed: %s. Using local fallback.", shap_err)
                if request.method == "shap":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"SHAP explanation failed for estimator '{model_id}': {type(shap_err).__name__}: {str(shap_err)}",
                    ) from shap_err

        # Execute robust local attribution fallback
        explanations, method_name, baseline_summary = self._compute_local_perturbation_fallback(
            pipeline=pipeline,
            df_records=df_records,
            X_bg=X_bg,
            feature_names=feature_names,
            task_type=task_type,
        )

        return PredictionExplanationResponse(
            experiment_id=experiment_id,
            model_id=model_id,
            task_type=task_type,
            target_column=target_column,
            explanation_method=method_name,
            explanation_count=len(explanations),
            explanations=explanations,
            baseline_summary=baseline_summary,
        )


def get_explainability_service() -> ExplainabilityService:
    """Dependency injection provider for ExplainabilityService."""
    return ExplainabilityService()
