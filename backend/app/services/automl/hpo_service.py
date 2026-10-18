"""Controlled research experiment orchestrator: Random Search vs Bayesian Optimization."""

from datetime import datetime, timezone
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import platform
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
import numpy as np
import pandas as pd
from scipy import stats
import sklearn
from sklearn.model_selection import KFold, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
import optuna

from app.core.config import Settings, get_settings
from app.schemas.analysis import TaskType
from app.schemas.hpo_experiment import (
    HPOExperimentProtocol,
    HPOExperimentRequest,
    HPOExperimentResponse,
    HPOReplicateComparison,
    HPOStatisticalComparison,
    HPOStrategyAggregateSummary,
    HPOStrategyReplicateResult,
    HPOTrialRecord,
    HyperparameterSpace,
)
from app.services.analysis_service import AnalysisService
from app.services.automl.bayesian_optuna import BayesianOptunaOptimizer
from app.services.automl.evaluator import ModelEvaluator, sanitize_float
from app.services.automl.hpo_spaces import (
    get_search_space,
    instantiate_estimator,
    list_available_search_spaces,
)
from app.services.automl.preprocessor import build_preprocessor
from app.services.automl.random_search import RandomSearchOptimizer
from app.services.automl.statistical_engine import StatisticalEngine
from app.services.automl.tracker import MLflowTracker, compute_dataset_fingerprint

logger = logging.getLogger(__name__)


class HPOService:
    """Orchestrates controlled hyperparameter optimization comparisons between Random Search and Bayesian Optimization."""

    def __init__(
        self,
        upload_dir: Optional[Path] = None,
        experiments_dir: Optional[Path] = None,
        analysis_service: Optional[AnalysisService] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        self.upload_dir: Path = upload_dir or self.settings.resolved_upload_dir
        self.experiments_dir: Path = experiments_dir or self.settings.resolved_experiments_dir
        self.analysis_service = analysis_service or AnalysisService(upload_dir=self.upload_dir)
        self.hpo_experiments_dir = self.experiments_dir / "hpo_experiments"
        self.hpo_experiments_dir.mkdir(parents=True, exist_ok=True)

    def run_hpo_experiment(self, request: HPOExperimentRequest) -> HPOExperimentResponse:
        """Execute a controlled comparison of Random Search vs Bayesian Optimization under matched experimental conditions."""
        start_wall_clock = time.perf_counter()
        experiment_id = str(uuid.uuid4())

        # 1. Resolve dataset file and compute fingerprint
        file_path = self.analysis_service.resolve_dataset_file(request.dataset_id)
        dataset_fingerprint = compute_dataset_fingerprint(file_path)
        df = self.analysis_service.load_dataset(file_path)
        rows, cols = len(df), len(df.columns)

        target_col = request.target_column.strip()
        if target_col not in df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' not found in dataset '{request.dataset_id}'.",
            )

        valid_df = df.dropna(subset=[target_col])
        if len(valid_df) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' has insufficient valid samples ({len(valid_df)} non-null rows). Minimum 10 required.",
            )

        # 2. Detect task type
        rec, _ = self.analysis_service.detect_task_for_target(
            df=valid_df,
            target_column=target_col,
            task_override=request.task_type,
        )
        task_type = rec.task_type

        # 3. Resolve primary metric
        if request.primary_metric:
            primary_metric = request.primary_metric.lower().strip()
            greater_is_better = ModelEvaluator.is_greater_better(primary_metric)
        else:
            primary_metric, greater_is_better = ModelEvaluator.get_default_metric(task_type)

        # 4. Resolve hyperparameter search space
        try:
            search_space = get_search_space(request.model_id, task_type=task_type.value)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        # 5. Extract features and target
        y = valid_df[target_col]
        X = valid_df.drop(columns=[target_col])

        if task_type == TaskType.REGRESSION:
            y = pd.to_numeric(y, errors="coerce")
            if y.isna().any():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Target column '{target_col}' contains non-numeric values incompatible with regression.",
                )

        num_cols = [c for c in X.columns if pd.api.types.is_numeric_dtype(X[c]) and not pd.api.types.is_bool_dtype(X[c])]
        cat_cols = [c for c in X.columns if c not in num_cols]

        if not num_cols and not cat_cols:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset contains no usable feature columns after target extraction.",
            )

        # 6. Execute replicated evaluation across configured random seeds
        replicates: List[HPOReplicateComparison] = []
        is_classification = task_type in (TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION)

        for rep_idx, seed in enumerate(request.seeds):
            logger.info("Executing HPO replicate %s (seed=%s) for model %s", rep_idx + 1, seed, request.model_id)

            # A. Split into train_val and untouched test partitions
            stratify_target = y if is_classification and (y.value_counts().min() >= 2) else None
            X_train_val, X_test, y_train_val, y_test = train_test_split(
                X,
                y,
                test_size=request.test_size,
                random_state=seed,
                stratify=stratify_target,
            )

            # B. Prepare internal cross-validation / validation splits within train_val
            cv_splits: List[Tuple[np.ndarray, np.ndarray]] = []
            if request.evaluation_strategy == "cross_validation":
                folds = request.cv_folds
                if is_classification and (y_train_val.value_counts().min() >= folds):
                    splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=seed)
                    cv_splits = list(splitter.split(X_train_val, y_train_val))
                else:
                    splitter = KFold(n_splits=folds, shuffle=True, random_state=seed)
                    cv_splits = list(splitter.split(X_train_val, y_train_val))
            else:
                # Holdout validation inside train_val (e.g. 75% internal train, 25% internal val)
                strat_holdout = y_train_val if is_classification and (y_train_val.value_counts().min() >= 2) else None
                train_idx, val_idx = train_test_split(
                    np.arange(len(X_train_val)),
                    test_size=0.25,
                    random_state=seed,
                    stratify=strat_holdout,
                )
                cv_splits = [(train_idx, val_idx)]

            # C. Define objective evaluation function that fits preprocessing strictly inside training folds
            def evaluate_configuration(trial_idx: int, params: Dict[str, Any]) -> float:
                fold_scores: List[float] = []
                for train_indices, val_indices in cv_splits:
                    X_f_tr, y_f_tr = X_train_val.iloc[train_indices], y_train_val.iloc[train_indices]
                    X_f_val, y_f_val = X_train_val.iloc[val_indices], y_train_val.iloc[val_indices]

                    # Leakage-free preprocessing: fit preprocessor only on the fold's training split
                    prep = build_preprocessor(numeric_features=num_cols, categorical_features=cat_cols)
                    estimator = instantiate_estimator(request.model_id, params, random_state=seed)
                    pipeline = Pipeline([("prep", prep), ("model", estimator)])

                    pipeline.fit(X_f_tr, y_f_tr)

                    if is_classification:
                        metrics = ModelEvaluator.evaluate_classification(pipeline, X_f_val, y_f_val)
                    else:
                        metrics = ModelEvaluator.evaluate_regression(pipeline, X_f_val, y_f_val)

                    score = metrics.get(primary_metric)
                    if score is not None:
                        fold_scores.append(float(score))

                if not fold_scores:
                    raise RuntimeError(f"All folds produced undefined scores for metric '{primary_metric}'")

                return float(np.mean(fold_scores))

            # D. Evaluate default baseline on the exact same folds
            default_val_score: Optional[float] = None
            try:
                default_params = {p.name: (p.choices[0] if p.param_type == "categorical" else p.low) for p in search_space.parameters}
                default_val_score = round(evaluate_configuration(0, default_params), 4)
            except Exception as exc:
                logger.warning("Could not evaluate default baseline: %s", exc)

            # E. Execute Random Search on this replicate
            random_optimizer = RandomSearchOptimizer(search_space=search_space, seed=seed)
            random_trials = random_optimizer.run_search(
                objective_fn=evaluate_configuration,
                trial_budget=request.trial_budget,
                greater_is_better=greater_is_better,
            )

            # F. Execute Bayesian Optimization on this replicate
            bayesian_optimizer = BayesianOptunaOptimizer(
                search_space=search_space,
                seed=seed,
                n_startup_trials=min(5, max(2, request.trial_budget // 4)),
            )
            bayesian_trials = bayesian_optimizer.run_search(
                objective_fn=evaluate_configuration,
                trial_budget=request.trial_budget,
                greater_is_better=greater_is_better,
            )

            # G. Summarize each strategy on this replicate and evaluate on untouched holdout test partition
            rand_summary = self._summarize_strategy_replicate(
                strategy="random_search",
                seed=seed,
                trials=random_trials,
                greater_is_better=greater_is_better,
                default_val_score=default_val_score,
                model_id=request.model_id,
                num_cols=num_cols,
                cat_cols=cat_cols,
                X_train_val=X_train_val,
                y_train_val=y_train_val,
                X_test=X_test,
                y_test=y_test,
                primary_metric=primary_metric,
                is_classification=is_classification,
            )

            bayes_summary = self._summarize_strategy_replicate(
                strategy="bayesian_optimization",
                seed=seed,
                trials=bayesian_trials,
                greater_is_better=greater_is_better,
                default_val_score=default_val_score,
                model_id=request.model_id,
                num_cols=num_cols,
                cat_cols=cat_cols,
                X_train_val=X_train_val,
                y_train_val=y_train_val,
                X_test=X_test,
                y_test=y_test,
                primary_metric=primary_metric,
                is_classification=is_classification,
            )

            # H. Paired difference calculations
            delta_val = round(bayes_summary.best_validation_score - rand_summary.best_validation_score, 4)
            delta_test = round(bayes_summary.test_score - rand_summary.test_score, 4)

            # Determine winners
            if greater_is_better:
                val_winner = "bayesian" if delta_val > 1e-6 else ("random" if delta_val < -1e-6 else "tied")
                test_winner = "bayesian" if delta_test > 1e-6 else ("random" if delta_test < -1e-6 else "tied")
            else:
                # Lower is better (e.g. RMSE)
                val_winner = "bayesian" if delta_val < -1e-6 else ("random" if delta_val > 1e-6 else "tied")
                test_winner = "bayesian" if delta_test < -1e-6 else ("random" if delta_test > 1e-6 else "tied")

            replicates.append(
                HPOReplicateComparison(
                    replicate_index=rep_idx,
                    seed=seed,
                    random_search=rand_summary,
                    bayesian_optimization=bayes_summary,
                    delta_validation=delta_val,
                    delta_test=delta_test,
                    validation_winner=val_winner,
                    test_winner=test_winner,
                )
            )

        # 7. Aggregate statistical summaries across all seed replicates
        random_agg = self._aggregate_strategy_summary("random_search", [r.random_search for r in replicates])
        bayesian_agg = self._aggregate_strategy_summary("bayesian_optimization", [r.bayesian_optimization for r in replicates])

        # 8. Conduct scientific statistical comparison
        statistical_comp = self._compute_statistical_comparison(
            replicates=replicates,
            primary_metric=primary_metric,
            greater_is_better=greater_is_better,
        )

        # 9. Determine overall winner
        if statistical_comp.bayesian_test_wins > statistical_comp.random_test_wins:
            overall_winner = "bayesian_optimization"
        elif statistical_comp.random_test_wins > statistical_comp.bayesian_test_wins:
            overall_winner = "random_search"
        else:
            # Tied on test set -> look at validation wins or inconclusive
            if statistical_comp.bayesian_validation_wins > statistical_comp.random_validation_wins:
                overall_winner = "bayesian_optimization"
            elif statistical_comp.random_validation_wins > statistical_comp.bayesian_validation_wins:
                overall_winner = "random_search"
            else:
                overall_winner = "inconclusive"

        total_wall_clock = round(time.perf_counter() - start_wall_clock, 2)

        # 10. Construct experimental protocol
        protocol = HPOExperimentProtocol(
            protocol_version="1.0",
            protocol_id=str(uuid.uuid4())[:12],
            dataset_id=request.dataset_id,
            dataset_name=Path(file_path).name,
            dataset_fingerprint=dataset_fingerprint,
            dataset_shape=[rows, cols],
            target_column=target_col,
            task_type=task_type.value,
            model_id=request.model_id,
            model_name=search_space.model_name,
            search_space=search_space,
            trial_budget=request.trial_budget,
            seeds=request.seeds,
            evaluation_strategy=request.evaluation_strategy,
            cv_folds=request.cv_folds if request.evaluation_strategy == "cross_validation" else None,
            test_size=request.test_size,
            primary_metric=primary_metric,
            greater_is_better=greater_is_better,
            bayesian_library="optuna",
            bayesian_surrogate="Tree-structured Parzen Estimator (TPE)",
            n_startup_trials=min(5, max(2, request.trial_budget // 4)),
            software_manifest={
                "python": platform.python_version(),
                "optuna": optuna.__version__,
                "scikit-learn": sklearn.__version__,
                "numpy": np.__version__,
                "pandas": pd.__version__,
            },
            hardware_metadata={
                "system": platform.system(),
                "release": platform.release(),
                "machine": platform.machine(),
                "processor": platform.processor(),
                "cpu_count": os.cpu_count() or 1,
            },
        )

        response = HPOExperimentResponse(
            experiment_id=experiment_id,
            created_at=datetime.now(timezone.utc).isoformat(),
            protocol=protocol,
            replicates=replicates,
            random_search_summary=random_agg,
            bayesian_summary=bayesian_agg,
            statistical_comparison=statistical_comp,
            overall_winner=overall_winner,
            total_wall_clock_seconds=total_wall_clock,
            csv_export_url=f"/api/v1/benchmarks/hpo-experiment/{experiment_id}/export-csv",
        )

        # 11. Persist experiment report to disk
        exp_file = self.hpo_experiments_dir / f"{experiment_id}.json"
        with open(exp_file, "w", encoding="utf-8") as f:
            f.write(response.model_dump_json(indent=2))

        logger.info("Successfully completed and saved HPO experiment %s to %s", experiment_id, exp_file)
        return response

    def _summarize_strategy_replicate(
        self,
        strategy: str,
        seed: int,
        trials: List[HPOTrialRecord],
        greater_is_better: bool,
        default_val_score: Optional[float],
        model_id: str,
        num_cols: List[str],
        cat_cols: List[str],
        X_train_val: pd.DataFrame,
        y_train_val: pd.Series,
        X_test: pd.DataFrame,
        y_test: pd.Series,
        primary_metric: str,
        is_classification: bool,
    ) -> HPOStrategyReplicateResult:
        """Process trials from a search strategy on a single seed replicate, identify winner, and evaluate on untouched test set."""
        completed = [t for t in trials if t.status == "completed" and t.validation_score is not None]
        failed_count = sum(1 for t in trials if t.status == "failed")
        total_duration = round(sum(t.duration_seconds for t in trials), 4)

        if not completed:
            raise RuntimeError(f"Strategy '{strategy}' had no completed trials on seed {seed}")

        # Find best trial
        if greater_is_better:
            best_trial = max(completed, key=lambda t: t.validation_score if t.validation_score is not None else -float("inf"))
        else:
            best_trial = min(completed, key=lambda t: t.validation_score if t.validation_score is not None else float("inf"))

        best_val_score = float(best_trial.validation_score)
        best_params = best_trial.parameters
        trial_to_best = best_trial.trial_number

        # Cumulative elapsed time to reach the best trial
        time_to_best = round(
            sum(t.duration_seconds for t in trials[:best_trial.trial_number]), 4
        )

        # Build convergence history
        convergence_history = [
            t.best_so_far_score if t.best_so_far_score is not None else best_val_score
            for t in trials
        ]

        # Calculate improvements
        initial_val_score = completed[0].validation_score
        improvement_over_initial = round(best_val_score - initial_val_score, 4) if initial_val_score is not None else None
        improvement_over_default = round(best_val_score - default_val_score, 4) if default_val_score is not None else None

        # UNTOUCHED TEST SET EVALUATION:
        # Fit preprocessor and model with best hyperparameters strictly on full train_val
        final_preprocessor = build_preprocessor(numeric_features=num_cols, categorical_features=cat_cols)
        final_estimator = instantiate_estimator(model_id, best_params, random_state=seed)
        final_pipeline = Pipeline([("prep", final_preprocessor), ("model", final_estimator)])

        final_pipeline.fit(X_train_val, y_train_val)

        if is_classification:
            test_metrics = ModelEvaluator.evaluate_classification(final_pipeline, X_test, y_test)
        else:
            test_metrics = ModelEvaluator.evaluate_regression(final_pipeline, X_test, y_test)

        test_score = float(test_metrics.get(primary_metric, 0.0))

        return HPOStrategyReplicateResult(
            strategy=strategy,
            seed=seed,
            total_trials=len(trials),
            completed_trials=len(completed),
            failed_trials=failed_count,
            total_duration_seconds=total_duration,
            time_to_best_seconds=time_to_best,
            trial_to_best=trial_to_best,
            best_trial_number=best_trial.trial_number,
            best_parameters=best_params,
            best_validation_score=round(best_val_score, 4),
            test_score=round(test_score, 4),
            test_metrics=test_metrics,
            baseline_default_validation_score=default_val_score,
            improvement_over_default=improvement_over_default,
            improvement_over_initial=improvement_over_initial,
            trials=trials,
            convergence_history=convergence_history,
        )

    def _aggregate_strategy_summary(
        self,
        strategy: str,
        results: List[HPOStrategyReplicateResult],
    ) -> HPOStrategyAggregateSummary:
        """Compute statistical aggregation across seed replicates for a search strategy."""
        n = len(results)
        val_scores = [r.best_validation_score for r in results]
        test_scores = [r.test_score for r in results]
        durations = [r.total_duration_seconds for r in results]
        times_to_best = [r.time_to_best_seconds for r in results]
        trials_to_best = [r.trial_to_best for r in results]

        val_arr = np.array(val_scores, dtype=np.float64)
        test_arr = np.array(test_scores, dtype=np.float64)

        val_std = float(np.std(val_arr, ddof=1)) if n >= 2 else None
        test_std = float(np.std(test_arr, ddof=1)) if n >= 2 else None

        # Mean convergence trajectory across seeds:
        max_trials = max(len(r.convergence_history) for r in results)
        mean_conv: List[float] = []
        for step_idx in range(max_trials):
            step_vals = [
                r.convergence_history[step_idx]
                for r in results
                if step_idx < len(r.convergence_history)
            ]
            mean_conv.append(round(float(np.mean(step_vals)), 4))

        return HPOStrategyAggregateSummary(
            strategy=strategy,
            n_replicates=n,
            validation_mean=round(float(np.mean(val_arr)), 4),
            validation_std=round(val_std, 4) if val_std is not None else None,
            validation_median=round(float(np.median(val_arr)), 4),
            validation_min=round(float(np.min(val_arr)), 4),
            validation_max=round(float(np.max(val_arr)), 4),
            test_mean=round(float(np.mean(test_arr)), 4),
            test_std=round(test_std, 4) if test_std is not None else None,
            test_median=round(float(np.median(test_arr)), 4),
            test_min=round(float(np.min(test_arr)), 4),
            test_max=round(float(np.max(test_arr)), 4),
            avg_total_duration_seconds=round(float(np.mean(durations)), 2),
            avg_time_to_best_seconds=round(float(np.mean(times_to_best)), 2),
            avg_trial_to_best=round(float(np.mean(trials_to_best)), 1),
            mean_convergence_curve=mean_conv,
        )

    def _compute_statistical_comparison(
        self,
        replicates: List[HPOReplicateComparison],
        primary_metric: str,
        greater_is_better: bool,
    ) -> HPOStatisticalComparison:
        """Compute paired statistical differences, Student-t tests, and evidence-based conclusion."""
        n = len(replicates)
        val_diffs = [r.delta_validation for r in replicates]
        test_diffs = [r.delta_test for r in replicates]

        val_diff_arr = np.array(val_diffs, dtype=np.float64)
        test_diff_arr = np.array(test_diffs, dtype=np.float64)

        mean_val_diff = float(np.mean(val_diff_arr))
        mean_test_diff = float(np.mean(test_diff_arr))

        std_val_diff = float(np.std(val_diff_arr, ddof=1)) if n >= 2 else None
        std_test_diff = float(np.std(test_diff_arr, ddof=1)) if n >= 2 else None

        t_val, p_val = None, None
        t_test, p_test = None, None

        if n >= 2:
            # Paired Student's t-test
            bayes_val = [r.bayesian_optimization.best_validation_score for r in replicates]
            rand_val = [r.random_search.best_validation_score for r in replicates]
            if np.std(val_diff_arr) > 1e-9:
                t_stat_v, p_stat_v = stats.ttest_rel(bayes_val, rand_val)
                t_val = round(float(t_stat_v), 3)
                p_val = round(float(p_stat_v), 4)

            bayes_test = [r.bayesian_optimization.test_score for r in replicates]
            rand_test = [r.random_search.test_score for r in replicates]
            if np.std(test_diff_arr) > 1e-9:
                t_stat_t, p_stat_t = stats.ttest_rel(bayes_test, rand_test)
                t_test = round(float(t_stat_t), 3)
                p_test = round(float(p_stat_t), 4)

        bayes_val_wins = sum(1 for r in replicates if r.validation_winner == "bayesian")
        rand_val_wins = sum(1 for r in replicates if r.validation_winner == "random")
        val_ties = sum(1 for r in replicates if r.validation_winner == "tied")

        bayes_test_wins = sum(1 for r in replicates if r.test_winner == "bayesian")
        rand_test_wins = sum(1 for r in replicates if r.test_winner == "random")
        test_ties = sum(1 for r in replicates if r.test_winner == "tied")

        # Synthesize evidence-based conclusion
        if bayes_test_wins > rand_test_wins:
            conclusion = (
                f"Under the matched budget of {replicates[0].random_search.total_trials} trials, Bayesian Optimization achieved superior generalization "
                f"performance on {bayes_test_wins}/{n} independent holdout test replicates (mean test delta: {mean_test_diff:+.4f} {primary_metric})."
            )
        elif rand_test_wins > bayes_test_wins:
            conclusion = (
                f"Under the matched budget of {replicates[0].random_search.total_trials} trials, Random Search achieved superior generalization "
                f"performance on {rand_test_wins}/{n} independent holdout test replicates (mean test delta: {mean_test_diff:+.4f} {primary_metric}). "
                "Bayesian optimization did not demonstrate an empirical advantage over uniform random exploration within this trial budget."
            )
        else:
            conclusion = (
                f"Under the matched budget of {replicates[0].random_search.total_trials} trials, both search strategies achieved comparable generalization "
                f"performance across {n} independent holdout test replicates (mean test delta: {mean_test_diff:+.4f} {primary_metric})."
            )

        limitations = (
            f"Experimental findings are based on N={n} seed replicates with matched partitions. "
            "Small sample sizes limit inferential statistical power (df={n-1}). "
            "Apparent advantages in sample means must be treated as exploratory evidence rather than a confirmatory proof of asymptotic superiority. "
            "Search performance depends heavily on the dimensionality and structure of the hyperparameter space."
        )

        return HPOStatisticalComparison(
            metric_name=primary_metric,
            greater_is_better=greater_is_better,
            n_replicates=n,
            mean_validation_difference=round(mean_val_diff, 4),
            std_validation_difference=round(std_val_diff, 4) if std_val_diff is not None else None,
            mean_test_difference=round(mean_test_diff, 4),
            std_test_difference=round(std_test_diff, 4) if std_test_diff is not None else None,
            t_statistic_validation=t_val,
            p_value_validation=p_val,
            t_statistic_test=t_test,
            p_value_test=p_test,
            bayesian_validation_wins=bayes_val_wins,
            random_validation_wins=rand_val_wins,
            validation_ties=val_ties,
            bayesian_test_wins=bayes_test_wins,
            random_test_wins=rand_test_wins,
            test_ties=test_ties,
            scientific_conclusion=conclusion,
            uncertainty_limitations=limitations,
        )

    def get_hpo_experiment(self, experiment_id: str) -> HPOExperimentResponse:
        """Retrieve stored HPO experiment report by identifier."""
        exp_file = self.hpo_experiments_dir / f"{experiment_id}.json"
        if not exp_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"HPO experiment '{experiment_id}' not found.",
            )
        try:
            with open(exp_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return HPOExperimentResponse.model_validate(data)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to load HPO experiment: {exc}",
            ) from exc

    def export_csv(self, experiment_id: str) -> str:
        """Export raw trial records as a CSV string."""
        exp = self.get_hpo_experiment(experiment_id)
        rows: List[Dict[str, Any]] = []

        for rep in exp.replicates:
            # Process random search trials
            for trial in rep.random_search.trials:
                row = {
                    "experiment_id": exp.experiment_id,
                    "dataset_name": exp.protocol.dataset_name,
                    "model_id": exp.protocol.model_id,
                    "seed": rep.seed,
                    "strategy": "random_search",
                    "trial_number": trial.trial_number,
                    "status": trial.status,
                    "validation_score": trial.validation_score,
                    "best_so_far_score": trial.best_so_far_score,
                    "duration_seconds": trial.duration_seconds,
                    "error_message": trial.error_message or "",
                }
                for k, v in trial.parameters.items():
                    row[f"param_{k}"] = v
                rows.append(row)

            # Process bayesian trials
            for trial in rep.bayesian_optimization.trials:
                row = {
                    "experiment_id": exp.experiment_id,
                    "dataset_name": exp.protocol.dataset_name,
                    "model_id": exp.protocol.model_id,
                    "seed": rep.seed,
                    "strategy": "bayesian_optimization",
                    "trial_number": trial.trial_number,
                    "status": trial.status,
                    "validation_score": trial.validation_score,
                    "best_so_far_score": trial.best_so_far_score,
                    "duration_seconds": trial.duration_seconds,
                    "error_message": trial.error_message or "",
                }
                for k, v in trial.parameters.items():
                    row[f"param_{k}"] = v
                rows.append(row)

        df = pd.DataFrame(rows)
        return df.to_csv(index=False)


def get_hpo_service() -> HPOService:
    """Dependency provider for HPOService."""
    return HPOService()
