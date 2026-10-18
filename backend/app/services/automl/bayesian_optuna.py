"""Bayesian optimization using Optuna Tree-structured Parzen Estimator (TPE)."""

import logging
import time
from typing import Any, Callable, Dict, List, Optional
import optuna

from app.schemas.hpo_experiment import HPOTrialRecord, HyperparameterSpace

logger = logging.getLogger(__name__)

# Reduce optuna logging verbosity to maintain clean execution output
optuna.logging.set_verbosity(optuna.logging.WARNING)


class BayesianOptunaOptimizer:
    """Bayesian hyperparameter optimizer powered by Optuna's Tree-structured Parzen Estimator (TPE)."""

    def __init__(
        self,
        search_space: HyperparameterSpace,
        seed: int = 42,
        n_startup_trials: int = 5,
    ) -> None:
        self.search_space = search_space
        self.seed = seed
        self.n_startup_trials = n_startup_trials

    def run_search(
        self,
        objective_fn: Callable[[int, Dict[str, Any]], float],
        trial_budget: int,
        greater_is_better: bool = True,
        time_budget_seconds: Optional[float] = None,
    ) -> List[HPOTrialRecord]:
        """Execute Bayesian Optimization with TPE surrogate under strict trial and time budgets."""
        direction = "maximize" if greater_is_better else "minimize"

        # Startup trials must not exceed total trial budget
        startup = min(self.n_startup_trials, max(1, trial_budget // 3))

        sampler = optuna.samplers.TPESampler(
            seed=self.seed,
            n_startup_trials=startup,
            multivariate=True,
        )

        study = optuna.create_study(
            direction=direction,
            sampler=sampler,
        )

        trials: List[HPOTrialRecord] = []
        best_so_far: Optional[float] = None
        search_start = time.perf_counter()

        def optuna_objective(trial: optuna.Trial) -> float:
            nonlocal best_so_far

            # 1. Sample hyperparameters according to the search space specification
            config: Dict[str, Any] = {}
            for domain in self.search_space.parameters:
                if domain.param_type == "categorical":
                    config[domain.name] = trial.suggest_categorical(domain.name, domain.choices or [])
                elif domain.param_type == "int":
                    low = int(domain.low) if domain.low is not None else 1
                    high = int(domain.high) if domain.high is not None else 100
                    step = int(domain.step) if domain.step is not None and not domain.log else 1
                    config[domain.name] = trial.suggest_int(
                        domain.name,
                        low=low,
                        high=high,
                        step=step if not domain.log else 1,
                        log=domain.log,
                    )
                elif domain.param_type == "float":
                    low = float(domain.low) if domain.low is not None else 0.0
                    high = float(domain.high) if domain.high is not None else 1.0
                    step = float(domain.step) if domain.step is not None and not domain.log else None
                    config[domain.name] = trial.suggest_float(
                        domain.name,
                        low=low,
                        high=high,
                        step=step,
                        log=domain.log,
                    )

            trial_start = time.perf_counter()
            trial_num = trial.number + 1  # 1-indexed for consistent reporting
            val_score: Optional[float] = None
            status_str: str = "completed"
            err_msg: Optional[str] = None

            try:
                score = objective_fn(trial_num, config)
                val_score = round(float(score), 4)

                if best_so_far is None:
                    best_so_far = val_score
                elif greater_is_better and val_score > best_so_far:
                    best_so_far = val_score
                elif not greater_is_better and val_score < best_so_far:
                    best_so_far = val_score

            except Exception as exc:
                logger.exception("Bayesian trial %s failed with config %s: %s", trial_num, config, exc)
                status_str = "failed"
                err_msg = str(exc)
                # In Optuna, failed trials can be pruned or assigned an extreme penalty
                duration = round(time.perf_counter() - trial_start, 4)
                trials.append(
                    HPOTrialRecord(
                        trial_number=trial_num,
                        strategy="bayesian_optimization",
                        parameters=config,
                        validation_score=None,
                        status=status_str,
                        duration_seconds=duration,
                        best_so_far_score=best_so_far,
                        error_message=err_msg,
                    )
                )
                raise optuna.TrialPruned(f"Trial failed: {err_msg}") from exc

            duration = round(time.perf_counter() - trial_start, 4)

            trials.append(
                HPOTrialRecord(
                    trial_number=trial_num,
                    strategy="bayesian_optimization",
                    parameters=config,
                    validation_score=val_score,
                    status=status_str,
                    duration_seconds=duration,
                    best_so_far_score=best_so_far,
                    error_message=err_msg,
                )
            )

            return float(val_score)

        # Optimize with timeout and trial budget safeguards
        timeout = time_budget_seconds if time_budget_seconds is not None else None
        try:
            study.optimize(
                optuna_objective,
                n_trials=trial_budget,
                timeout=timeout,
                catch=(Exception,),
            )
        except Exception as exc:
            logger.warning("Optuna study loop stopped: %s", exc)

        return trials
