"""Scientific statistical engine for repeated experiments, uncertainty estimation, and confidence intervals."""

import math
from typing import List, Optional
import numpy as np
from scipy import stats

from app.schemas.research_benchmark import MetricStatisticalSummary


class StatisticalEngine:
    """Computes sample statistics, Student-t intervals, and non-parametric bootstrap bounds."""

    @staticmethod
    def compute_summary(
        scores: List[float],
        metric_name: str,
        greater_is_better: bool = True,
        bootstrap_resamples: int = 1000,
        random_state: int = 42,
    ) -> MetricStatisticalSummary:
        """Compute sample statistics and 95% confidence bounds over an array of replicate scores."""
        # Filter valid finite floats
        valid_scores = [
            float(x) for x in scores
            if x is not None and not (math.isnan(x) or math.isinf(x))
        ]
        n = len(valid_scores)

        if n == 0:
            return MetricStatisticalSummary(
                metric_name=metric_name,
                valid_runs=0,
                mean=0.0,
                std=None,
                median=0.0,
                min=0.0,
                max=0.0,
                ci_95_t=None,
                ci_95_bootstrap=None,
                interpretation_notes=(
                    f"No valid numerical observations recorded for metric '{metric_name}'. "
                    "Failed runs are excluded rather than imputed as zeroes to prevent artificial score deflation."
                ),
            )

        arr = np.array(valid_scores, dtype=np.float64)
        mean_val = float(np.mean(arr))
        median_val = float(np.median(arr))
        min_val = float(np.min(arr))
        max_val = float(np.max(arr))

        if n >= 2:
            # Sample standard deviation with Bessel's correction (ddof=1)
            std_val = float(np.std(arr, ddof=1))
        else:
            std_val = None

        # 1. Student's t-distribution 95% Confidence Interval
        ci_95_t: Optional[List[float]] = None
        if n >= 2 and std_val is not None:
            if std_val > 1e-12:
                se = std_val / math.sqrt(n)
                # 95% two-sided -> alpha = 0.05 -> critical quantile at 0.975
                t_crit = float(stats.t.ppf(0.975, df=n - 1))
                ci_lower = mean_val - t_crit * se
                ci_upper = mean_val + t_crit * se
                ci_95_t = [round(ci_lower, 4), round(ci_upper, 4)]
            else:
                # Zero variance across runs
                ci_95_t = [round(mean_val, 4), round(mean_val, 4)]

        # 2. Non-parametric Percentile Bootstrap 95% Confidence Interval
        ci_95_bootstrap: Optional[List[float]] = None
        if n >= 2:
            rng = np.random.RandomState(random_state)
            B = max(100, min(bootstrap_resamples, 5000))
            # Resample with replacement: shape (B, N)
            indices = rng.randint(0, n, size=(B, n))
            resample_means = np.mean(arr[indices], axis=1)
            b_lower = float(np.percentile(resample_means, 2.5))
            b_upper = float(np.percentile(resample_means, 97.5))
            ci_95_bootstrap = [round(b_lower, 4), round(b_upper, 4)]

        # Explanatory scientific interpretation note
        if n == 1:
            notes = (
                f"Single observation recorded for '{metric_name}' (N=1). "
                "Degrees of freedom are insufficient (df=0) to construct sample variance or confidence intervals."
            )
        else:
            notes = (
                f"Sample statistics based on N={n} independent seed replicates. "
                "Sample standard deviation computed with Bessel's correction (ddof=1). "
                "Confidence intervals characterize sampling variability of the mean across seeds. "
                "Note: Overlapping confidence intervals between competing models do not prove equivalence; "
                "cross-validation fold evaluations within an individual seed are not independent replicates."
            )

        return MetricStatisticalSummary(
            metric_name=metric_name,
            valid_runs=n,
            mean=round(mean_val, 4),
            std=round(std_val, 4) if std_val is not None else None,
            median=round(median_val, 4),
            min=round(min_val, 4),
            max=round(max_val, 4),
            ci_95_t=ci_95_t,
            ci_95_bootstrap=ci_95_bootstrap,
            interpretation_notes=notes,
        )
