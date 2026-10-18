"""Modular, reproducible Random Search hyperparameter optimizer."""

import json
import logging
import math
import time
from typing import Any, Callable, Dict, List, Optional, Set
import numpy as np

from app.schemas.hpo_experiment import HPOTrialRecord, HyperparameterSpace, ParameterDomain

logger = logging.getLogger(__name__)


class RandomSearchOptimizer:
    """Random search hyperparameter optimizer with duplicate avoidance and seed reproducibility."""

    def __init__(self, search_space: HyperparameterSpace, seed: int = 42) -> None:
        self.search_space = search_space
        self.seed = seed
        self.rng = np.random.RandomState(seed)
        self.visited_hashes: Set[str] = set()

    def _sample_single_param(self, domain: ParameterDomain) -> Any:
        """Sample a valid value for a single parameter domain respecting type, bounds, and log scale."""
        if domain.param_type == "categorical":
            if not domain.choices:
                raise ValueError(f"Categorical parameter '{domain.name}' has no choices defined.")
            idx = self.rng.randint(0, len(domain.choices))
            return domain.choices[idx]

        if domain.low is None or domain.high is None:
            raise ValueError(f"Numeric parameter '{domain.name}' must have low and high bounds.")

        if domain.param_type == "int":
            low = int(domain.low)
            high = int(domain.high)
            step = int(domain.step) if domain.step is not None and domain.step > 0 else 1

            if domain.log:
                log_low = math.log10(max(1, low))
                log_high = math.log10(max(1, high))
                val = 10.0 ** self.rng.uniform(log_low, log_high)
                val_rounded = int(round(val))
                return max(low, min(high, val_rounded))
            else:
                n_steps = max(1, (high - low) // step)
                return low + step * int(self.rng.randint(0, n_steps + 1))

        elif domain.param_type == "float":
            low = float(domain.low)
            high = float(domain.high)

            if domain.log:
                log_low = math.log10(max(1e-9, low))
                log_high = math.log10(max(1e-9, high))
                val = 10.0 ** self.rng.uniform(log_low, log_high)
                return round(float(val), 6)
            else:
                if domain.step is not None and domain.step > 0:
                    step = float(domain.step)
                    n_steps = max(1, int(round((high - low) / step)))
                    val = low + step * float(self.rng.randint(0, n_steps + 1))
                    return round(float(min(high, val)), 6)
                else:
                    return round(float(self.rng.uniform(low, high)), 6)

        raise ValueError(f"Unknown parameter type '{domain.param_type}' for '{domain.name}'")

    def _hash_config(self, config: Dict[str, Any]) -> str:
        """Compute deterministic JSON string for duplicate avoidance."""
        return json.dumps(config, sort_keys=True, default=str)

    def sample_configuration(self, max_retries: int = 50) -> Dict[str, Any]:
        """Sample a valid configuration from the search space, avoiding previously seen configurations if possible."""
        candidate: Dict[str, Any] = {}
        for _ in range(max_retries):
            candidate = {
                param.name: self._sample_single_param(param)
                for param in self.search_space.parameters
            }
            cand_hash = self._hash_config(candidate)
            if cand_hash not in self.visited_hashes:
                self.visited_hashes.add(cand_hash)
                return candidate

        # If exhausted unique samples, return the candidate
        return candidate

    def run_search(
        self,
        objective_fn: Callable[[int, Dict[str, Any]], float],
        trial_budget: int,
        greater_is_better: bool = True,
        time_budget_seconds: Optional[float] = None,
    ) -> List[HPOTrialRecord]:
        """Execute random search over trial_budget iterations, tracking history and wall-clock elapsed time."""
        trials: List[HPOTrialRecord] = []
        best_so_far: Optional[float] = None
        search_start = time.perf_counter()

        for trial_num in range(1, trial_budget + 1):
            # Check elapsed time limit if configured
            if time_budget_seconds is not None:
                elapsed = time.perf_counter() - search_start
                if elapsed >= time_budget_seconds:
                    logger.warning("Random search time budget exhausted (%s >= %s)", elapsed, time_budget_seconds)
                    break

            config = self.sample_configuration()
            trial_start = time.perf_counter()
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
                logger.exception("Error evaluating trial %s with config %s: %s", trial_num, config, exc)
                status_str = "failed"
                err_msg = str(exc)

            duration = round(time.perf_counter() - trial_start, 4)

            trials.append(
                HPOTrialRecord(
                    trial_number=trial_num,
                    strategy="random_search",
                    parameters=config,
                    validation_score=val_score,
                    status=status_str,
                    duration_seconds=duration,
                    best_so_far_score=best_so_far,
                    error_message=err_msg,
                )
            )

        return trials
