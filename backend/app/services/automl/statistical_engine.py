"""Scientific statistical engine for repeated experiments, uncertainty estimation, confidence intervals, and paired hypothesis testing."""

import math
from typing import List, Optional, Tuple
import numpy as np
from scipy import stats

from app.schemas.research_benchmark import MetricStatisticalSummary
from app.schemas.robust_benchmark import PairedComparisonResult, PairedSeedDifferenceRecord


class StatisticalEngine:
    """Computes sample statistics, Student-t intervals, non-parametric bootstrap bounds, and paired hypothesis tests."""

    @staticmethod
    def compute_summary(
        scores: List[float],
        metric_name: str,
        greater_is_better: bool = True,
        bootstrap_resamples: int = 1000,
        random_state: int = 42,
    ) -> MetricStatisticalSummary:
        """Compute sample statistics, quartiles, and 95% confidence bounds over an array of replicate scores."""
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
                q25=None,
                q75=None,
                iqr=None,
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
        q25_val = float(np.percentile(arr, 25))
        q75_val = float(np.percentile(arr, 75))
        iqr_val = float(q75_val - q25_val)
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
            q25=round(q25_val, 4),
            q75=round(q75_val, 4),
            iqr=round(iqr_val, 4),
            min=round(min_val, 4),
            max=round(max_val, 4),
            ci_95_t=ci_95_t,
            ci_95_bootstrap=ci_95_bootstrap,
            interpretation_notes=notes,
        )

    @staticmethod
    def compute_paired_comparison(
        scores_a: List[Optional[float]],
        scores_b: List[Optional[float]],
        seeds: List[int],
        metric_name: str,
        method_a_name: str,
        method_b_name: str,
        greater_is_better: bool = True,
        alpha: float = 0.05,
        num_comparisons: int = 1,
    ) -> PairedComparisonResult:
        """Execute seed-matched paired difference evaluation, effect size (Cohen's dz), and hypothesis testing."""
        paired_records: List[PairedSeedDifferenceRecord] = []
        valid_a: List[float] = []
        valid_b: List[float] = []

        min_len = min(len(scores_a), len(scores_b), len(seeds))
        for i in range(min_len):
            s_a = scores_a[i]
            s_b = scores_b[i]
            seed = seeds[i]

            if (
                s_a is not None
                and s_b is not None
                and not (math.isnan(s_a) or math.isinf(s_a) or math.isnan(s_b) or math.isinf(s_b))
            ):
                delta = float(s_a - s_b)
                paired_records.append(
                    PairedSeedDifferenceRecord(
                        seed=seed,
                        score_a=round(float(s_a), 4),
                        score_b=round(float(s_b), 4),
                        delta=round(delta, 4),
                    )
                )
                valid_a.append(float(s_a))
                valid_b.append(float(s_b))

        n_matched = len(paired_records)

        # Handle zero or single matched seed
        if n_matched < 2:
            return PairedComparisonResult(
                method_a=method_a_name,
                method_b=method_b_name,
                metric_name=metric_name,
                greater_is_better=greater_is_better,
                n_matched_seeds=n_matched,
                mean_difference=round(float(valid_a[0] - valid_b[0]), 4) if n_matched == 1 else 0.0,
                std_difference=None,
                ci_95_difference=None,
                cohens_dz=None,
                cohens_dz_magnitude="zero",
                t_statistic=None,
                t_test_p_value=None,
                wilcoxon_statistic=None,
                wilcoxon_p_value=None,
                bonferroni_adjusted_p_value=None,
                verdict="insufficient_sample_size",
                per_seed_differences=paired_records,
                interpretation=(
                    f"Fewer than 2 matched seeds available between '{method_a_name}' and '{method_b_name}' "
                    f"for metric '{metric_name}' (matched N={n_matched}). Statistical testing requires N >= 2."
                ),
            )

        deltas = np.array([r.delta for r in paired_records], dtype=np.float64)
        mean_diff = float(np.mean(deltas))
        std_diff = float(np.std(deltas, ddof=1))
        se_diff = std_diff / math.sqrt(n_matched)

        # 95% Confidence Interval for mean paired difference
        if std_diff > 1e-12:
            t_crit = float(stats.t.ppf(1.0 - alpha / 2.0, df=n_matched - 1))
            ci_lower = mean_diff - t_crit * se_diff
            ci_upper = mean_diff + t_crit * se_diff
            ci_diff = [round(ci_lower, 4), round(ci_upper, 4)]
            cohens_dz = float(mean_diff / std_diff)
        else:
            ci_diff = [round(mean_diff, 4), round(mean_diff, 4)]
            cohens_dz = 0.0

        # Cohen's dz magnitude categorization
        abs_dz = abs(cohens_dz)
        if abs_dz < 1e-6:
            dz_magnitude = "zero"
        elif abs_dz < 0.2:
            dz_magnitude = "negligible"
        elif abs_dz < 0.5:
            dz_magnitude = "small"
        elif abs_dz < 0.8:
            dz_magnitude = "medium"
        else:
            dz_magnitude = "large"

        # Paired Student's t-test
        t_stat: Optional[float] = None
        t_pval: Optional[float] = None
        try:
            t_res = stats.ttest_rel(valid_a, valid_b)
            if not (math.isnan(t_res.statistic) or math.isnan(t_res.pvalue)):
                t_stat = round(float(t_res.statistic), 4)
                t_pval = round(float(t_res.pvalue), 4)
        except Exception:
            t_stat = None
            t_pval = None

        # Wilcoxon signed-rank test (non-parametric paired test)
        w_stat: Optional[float] = None
        w_pval: Optional[float] = None
        # Wilcoxon requires N >= 5 and non-identical samples for reasonable power
        if n_matched >= 5 and np.any(np.abs(deltas) > 1e-12):
            try:
                w_res = stats.wilcoxon(valid_a, valid_b, alternative="two-sided")
                if not (math.isnan(w_res.statistic) or math.isnan(w_res.pvalue)):
                    w_stat = round(float(w_res.statistic), 4)
                    w_pval = round(float(w_res.pvalue), 4)
            except Exception:
                w_stat = None
                w_pval = None

        # Bonferroni correction for multiple hypothesis testing
        bonferroni_p: Optional[float] = None
        if t_pval is not None:
            bonferroni_p = round(min(1.0, float(t_pval * max(1, num_comparisons))), 4)

        # Verdict logic
        effective_p = bonferroni_p if bonferroni_p is not None else t_pval

        if n_matched < 5:
            verdict = "insufficient_sample_size"
            interpretation = (
                f"Small sample size warning: Only N={n_matched} matched seeds were evaluated. "
                "Parametric normality cannot be verified and statistical power is limited. "
                f"Observed mean difference is {mean_diff:+.4f} (dz = {cohens_dz:.2f}, {dz_magnitude}). "
                "Evaluate at least N=5 seeds for reliable hypothesis testing."
            )
        elif effective_p is not None and effective_p < alpha:
            # Significant difference detected
            is_better = (mean_diff > 0) if greater_is_better else (mean_diff < 0)
            if is_better:
                verdict = "statistically_superior"
                interpretation = (
                    f"'{method_a_name}' demonstrates statistically significant superiority over '{method_b_name}' "
                    f"on {metric_name} (mean paired delta = {mean_diff:+.4f}, p = {effective_p:.4f} < {alpha}, "
                    f"Cohen's dz = {cohens_dz:.2f} [{dz_magnitude}] across N={n_matched} matched seeds)."
                )
            else:
                verdict = "statistically_inferior"
                interpretation = (
                    f"'{method_a_name}' is statistically inferior to '{method_b_name}' "
                    f"on {metric_name} (mean paired delta = {mean_diff:+.4f}, p = {effective_p:.4f} < {alpha}, "
                    f"Cohen's dz = {cohens_dz:.2f} [{dz_magnitude}] across N={n_matched} matched seeds)."
                )
        else:
            # Not statistically significant at alpha level
            if abs_dz < 0.2 and ci_diff and ci_diff[0] <= 0 <= ci_diff[1]:
                verdict = "statistically_equivalent"
                interpretation = (
                    f"No statistically significant difference detected between '{method_a_name}' and '{method_b_name}' "
                    f"(p = {effective_p if effective_p is not None else 'N/A'}, Cohen's dz = {cohens_dz:.2f} [{dz_magnitude}]). "
                    f"The 95% confidence interval for mean delta [{ci_diff[0]:+.4f}, {ci_diff[1]:+.4f}] spans zero."
                )
            else:
                verdict = "inconclusive_high_variance"
                interpretation = (
                    f"Comparison between '{method_a_name}' and '{method_b_name}' is inconclusive (p = {effective_p if effective_p is not None else 'N/A'} >= {alpha}). "
                    f"Observed mean delta is {mean_diff:+.4f}, but high seed variability (s = {std_diff:.4f}) prevents establishing significance."
                )

        return PairedComparisonResult(
            method_a=method_a_name,
            method_b=method_b_name,
            metric_name=metric_name,
            greater_is_better=greater_is_better,
            n_matched_seeds=n_matched,
            mean_difference=round(mean_diff, 4),
            std_difference=round(std_diff, 4),
            ci_95_difference=ci_diff,
            cohens_dz=round(cohens_dz, 4),
            cohens_dz_magnitude=dz_magnitude,
            t_statistic=t_stat,
            t_test_p_value=t_pval,
            wilcoxon_statistic=w_stat,
            wilcoxon_p_value=w_pval,
            bonferroni_adjusted_p_value=bonferroni_p,
            verdict=verdict,
            per_seed_differences=paired_records,
            interpretation=interpretation,
        )
