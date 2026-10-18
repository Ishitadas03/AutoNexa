"""Phase 11 Empirical Research Experiment Runner: Robust Benchmarking, Statistical Reliability, and Artifact Generation."""

from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import platform
import subprocess
import sys
from typing import Any, Dict, List

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import psutil
import scipy
import sklearn

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.schemas.robust_benchmark import RobustBenchmarkRequest
from app.services.automl.robust_benchmarking_service import (
    RobustBenchmarkingService,
    get_robust_benchmark_service,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("Phase11Runner")


def get_git_info() -> Dict[str, Any]:
    """Capture current git revision and status."""
    try:
        commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True
        ).strip()
        status_out = subprocess.check_output(
            ["git", "status", "--porcelain"], text=True
        ).strip()
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"], text=True
        ).strip()
        return {
            "git_commit": commit,
            "git_branch": branch,
            "is_dirty": len(status_out) > 0,
            "uncommitted_files_count": len(status_out.splitlines()) if status_out else 0,
        }
    except Exception as exc:
        return {"git_error": str(exc), "git_commit": "unknown", "is_dirty": False}


def main():
    logger.info("Starting AutoNexa Phase 11 Robust AutoML Benchmarking Experiments...")
    project_root = backend_dir.parent
    plots_dir = project_root / "docs" / "research" / "plots"
    plots_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = project_root / "docs" / "research" / "phase_11_manifest.json"

    service = get_robust_benchmark_service()
    seeds = [42, 123, 456, 789, 1011]

    # -----------------------------------------------------------------------
    # Experiment 1: Multiclass Classification (Wine Recognition Benchmark)
    # -----------------------------------------------------------------------
    logger.info("Executing Experiment 1: Multiclass Classification across 5 seeds...")
    req_clf = RobustBenchmarkRequest(
        dataset_id="wine_multiclass",
        seeds=seeds,
        candidate_strategies=[
            "decision_tree",
            "logistic_regression",
            "random_forest",
            "hist_gradient_boosting",
        ],
        baseline_strategy="decision_tree",
        cv_folds=3,
        test_size=0.2,
        primary_metric="f1_weighted",
        alpha=0.05,
        bootstrap_resamples=1000,
    )
    res_clf = service.run_robust_benchmark(req_clf)
    csv_clf = service.export_csv(res_clf.robust_benchmark_id)
    (project_root / "docs" / "research" / "classification_seed_runs.csv").write_text(
        csv_clf, encoding="utf-8"
    )
    logger.info(
        "Classification experiment complete. Benchmark ID: %s",
        res_clf.robust_benchmark_id,
    )

    # -----------------------------------------------------------------------
    # Experiment 2: Continuous Regression (Diabetes Disease Progression)
    # -----------------------------------------------------------------------
    logger.info("Executing Experiment 2: Continuous Regression across 5 seeds...")
    req_reg = RobustBenchmarkRequest(
        dataset_id="diabetes_regression",
        seeds=seeds,
        candidate_strategies=[
            "ridge",
            "decision_tree",
            "random_forest",
            "hist_gradient_boosting",
        ],
        baseline_strategy="ridge",
        cv_folds=3,
        test_size=0.2,
        primary_metric="rmse",
        alpha=0.05,
        bootstrap_resamples=1000,
    )
    res_reg = service.run_robust_benchmark(req_reg)
    csv_reg = service.export_csv(res_reg.robust_benchmark_id)
    (project_root / "docs" / "research" / "regression_seed_runs.csv").write_text(
        csv_reg, encoding="utf-8"
    )
    logger.info(
        "Regression experiment complete. Benchmark ID: %s",
        res_reg.robust_benchmark_id,
    )

    # -----------------------------------------------------------------------
    # Generate Research Plot 1: Multi-Seed Score Variability & 95% CIs
    # -----------------------------------------------------------------------
    logger.info("Generating Plot 1: Multi-Seed Score Variability & 95% CIs...")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.5), dpi=300)

    # Classification Subplot
    clf_methods = list(res_clf.method_summaries.keys())
    clf_means = [res_clf.method_summaries[m].validation_score.mean for m in clf_methods]
    clf_stds = [
        res_clf.method_summaries[m].validation_score.std or 0.0 for m in clf_methods
    ]
    clf_cis = [
        (
            res_clf.method_summaries[m].validation_score.ci_95_t[1]
            - res_clf.method_summaries[m].validation_score.mean
        )
        if res_clf.method_summaries[m].validation_score.ci_95_t
        else 0.0
        for m in clf_methods
    ]

    x_clf = np.arange(len(clf_methods))
    ax1.bar(
        x_clf,
        clf_means,
        yerr=clf_cis,
        capsize=5,
        color="#2563EB",
        alpha=0.85,
        edgecolor="#1D4ED8",
        label="Mean Score (95% Student-t CI)",
    )
    # Overlay individual seed points
    for idx, m in enumerate(clf_methods):
        m_runs = [
            r.validation_score
            for r in res_clf.raw_seed_runs
            if r.method_name == m and r.validation_score is not None
        ]
        ax1.scatter(
            [idx] * len(m_runs),
            m_runs,
            color="#D97706",
            s=40,
            zorder=4,
            label="Seed Observation" if idx == 0 else "",
        )

    ax1.set_title("A. Classification: F1-Weighted across 5 Seeds (Wine)", fontsize=11, fontweight="bold")
    ax1.set_xticks(x_clf)
    ax1.set_xticklabels([m.replace("_", "\n") for m in clf_methods], fontsize=9)
    ax1.set_ylabel("F1-Weighted Score (Higher is Better)", fontsize=10)
    ax1.set_ylim(0.75, 1.02)
    ax1.grid(axis="y", linestyle="--", alpha=0.5)
    ax1.legend(loc="lower right", fontsize=8)

    # Regression Subplot
    reg_methods = list(res_reg.method_summaries.keys())
    reg_means = [res_reg.method_summaries[m].validation_score.mean for m in reg_methods]
    reg_cis = [
        (
            res_reg.method_summaries[m].validation_score.ci_95_t[1]
            - res_reg.method_summaries[m].validation_score.mean
        )
        if res_reg.method_summaries[m].validation_score.ci_95_t
        else 0.0
        for m in reg_methods
    ]

    x_reg = np.arange(len(reg_methods))
    ax2.bar(
        x_reg,
        reg_means,
        yerr=reg_cis,
        capsize=5,
        color="#059669",
        alpha=0.85,
        edgecolor="#047857",
        label="Mean Score (95% Student-t CI)",
    )
    for idx, m in enumerate(reg_methods):
        m_runs = [
            r.validation_score
            for r in res_reg.raw_seed_runs
            if r.method_name == m and r.validation_score is not None
        ]
        ax2.scatter(
            [idx] * len(m_runs),
            m_runs,
            color="#DC2626",
            s=40,
            zorder=4,
            label="Seed Observation" if idx == 0 else "",
        )

    ax2.set_title("B. Regression: RMSE across 5 Seeds (Diabetes)", fontsize=11, fontweight="bold")
    ax2.set_xticks(x_reg)
    ax2.set_xticklabels([m.replace("_", "\n") for m in reg_methods], fontsize=9)
    ax2.set_ylabel("RMSE Error (Lower is Better)", fontsize=10)
    ax2.grid(axis="y", linestyle="--", alpha=0.5)
    ax2.legend(loc="upper right", fontsize=8)

    plt.tight_layout()
    plot1_path = plots_dir / "phase_11_seed_variability.png"
    plt.savefig(plot1_path, dpi=300)
    plt.close()
    logger.info("Saved Plot 1 to %s", plot1_path)

    # -----------------------------------------------------------------------
    # Generate Research Plot 2: Paired Seed Differences & Effect Sizes
    # -----------------------------------------------------------------------
    logger.info("Generating Plot 2: Paired Seed Differences & Effect Sizes...")
    fig, ax = plt.subplots(figsize=(10, 5), dpi=300)

    clf_pairs = res_clf.paired_comparisons
    pair_labels = [f"{p.method_a} vs\n{p.method_b}" for p in clf_pairs]
    pair_means = [p.mean_difference for p in clf_pairs]
    pair_errs = [
        (p.ci_95_difference[1] - p.mean_difference) if p.ci_95_difference else 0.0
        for p in clf_pairs
    ]

    x_p = np.arange(len(clf_pairs))
    bars = ax.bar(
        x_p,
        pair_means,
        yerr=pair_errs,
        capsize=6,
        color=["#10B981" if m >= 0 else "#EF4444" for m in pair_means],
        alpha=0.85,
        edgecolor="#0F172A",
    )
    ax.axhline(0, color="#64748B", linestyle="--", linewidth=1.2)

    for idx, p in enumerate(clf_pairs):
        dz_str = f"dz={p.cohens_dz:.2f} ({p.cohens_dz_magnitude})" if p.cohens_dz is not None else "dz=0.0"
        p_val_str = f"p={p.bonferroni_adjusted_p_value:.3f}" if p.bonferroni_adjusted_p_value is not None else "N/A"
        y_pos = pair_means[idx] + (pair_errs[idx] if pair_means[idx] >= 0 else -pair_errs[idx])
        y_offset = 0.015 if pair_means[idx] >= 0 else -0.025
        ax.text(
            idx,
            y_pos + y_offset,
            f"{dz_str}\n{p_val_str}",
            ha="center",
            va="bottom" if pair_means[idx] >= 0 else "top",
            fontsize=8,
            fontweight="bold",
        )

    ax.set_title(
        "Paired Seed Differences Delta_s (Candidate - Baseline) on Wine Classification\n"
        "Error bars: 95% Student-t CI of Paired Difference; Annotations: Cohen's dz and Bonferroni-Adjusted p-value",
        fontsize=10.5,
        fontweight="bold",
    )
    ax.set_xticks(x_p)
    ax.set_xticklabels(pair_labels, fontsize=9)
    ax.set_ylabel("Mean Paired Delta (Score_A - Score_Baseline)", fontsize=10)
    ax.grid(axis="y", linestyle="--", alpha=0.5)

    plt.tight_layout()
    plot2_path = plots_dir / "phase_11_paired_differences.png"
    plt.savefig(plot2_path, dpi=300)
    plt.close()
    logger.info("Saved Plot 2 to %s", plot2_path)

    # -----------------------------------------------------------------------
    # Generate Research Plot 3: Resource Profiling: Heap vs Process RSS
    # -----------------------------------------------------------------------
    logger.info("Generating Plot 3: Resource Profiling Heap vs Process RSS...")
    fig, (ax_mem, ax_lat) = plt.subplots(1, 2, figsize=(14, 5), dpi=300)

    # Memory Subplot
    methods_all = list(res_clf.method_summaries.keys())
    heaps_mb = [
        res_clf.method_summaries[m].peak_heap_bytes.mean / (1024 * 1024)
        for m in methods_all
    ]
    rss_mb = [
        (res_clf.method_summaries[m].peak_process_rss_bytes.mean / (1024 * 1024))
        if res_clf.method_summaries[m].peak_process_rss_bytes
        else 0.0
        for m in methods_all
    ]

    x_m = np.arange(len(methods_all))
    width = 0.35

    ax_mem.bar(
        x_m - width / 2,
        heaps_mb,
        width,
        label="Peak Python Heap (tracemalloc)",
        color="#3B82F6",
        alpha=0.9,
    )
    ax_mem.bar(
        x_m + width / 2,
        rss_mb,
        width,
        label="Peak Process RSS (psutil)",
        color="#10B981",
        alpha=0.9,
    )

    ax_mem.set_title("A. Memory Profiling Layer Distinction (Heap vs Process RSS)", fontsize=11, fontweight="bold")
    ax_mem.set_xticks(x_m)
    ax_mem.set_xticklabels([m.replace("_", "\n") for m in methods_all], fontsize=9)
    ax_mem.set_ylabel("Megabytes (MB)", fontsize=10)
    ax_mem.grid(axis="y", linestyle="--", alpha=0.5)
    ax_mem.legend(loc="upper left", fontsize=8.5)

    # Latency Subplot
    lats = [
        res_clf.method_summaries[m].inference_latency_ms.mean for m in methods_all
    ]
    durs = [
        res_clf.method_summaries[m].training_duration_seconds.mean
        for m in methods_all
    ]

    ax_lat.bar(
        x_m,
        lats,
        0.5,
        color="#8B5CF6",
        alpha=0.85,
        edgecolor="#6D28D9",
        label="Inference Latency (ms/sample)",
    )
    ax_lat.set_title("B. Inference Latency per Sample (Warm-Up Benchmark)", fontsize=11, fontweight="bold")
    ax_lat.set_xticks(x_m)
    ax_lat.set_xticklabels([m.replace("_", "\n") for m in methods_all], fontsize=9)
    ax_lat.set_ylabel("Milliseconds / Sample", fontsize=10)
    ax_lat.grid(axis="y", linestyle="--", alpha=0.5)
    ax_lat.legend(loc="upper left", fontsize=8.5)

    plt.tight_layout()
    plot3_path = plots_dir / "phase_11_resource_rss_vs_heap.png"
    plt.savefig(plot3_path, dpi=300)
    plt.close()
    logger.info("Saved Plot 3 to %s", plot3_path)

    # -----------------------------------------------------------------------
    # Machine-Readable Reproducibility Manifest
    # -----------------------------------------------------------------------
    logger.info("Constructing Phase 11 Reproducibility Manifest...")
    git_meta = get_git_info()
    manifest: Dict[str, Any] = {
        "manifest_version": "1.0.0",
        "phase": "Phase 11: Robust AutoML Benchmarking & Statistical Reliability",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "git": git_meta,
        "execution_platform": {
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "cpu_count": os.cpu_count() or 1,
            "system_total_ram_gb": round(psutil.virtual_memory().total / (1024**3), 2),
            "machine": platform.machine(),
            "package_versions": {
                "scikit-learn": sklearn.__version__,
                "numpy": np.__version__,
                "pandas": pd.__version__,
                "scipy": scipy.__version__,
                "psutil": psutil.__version__,
            },
            "profiler_instrumentation": {
                "process_rss_scope": "psutil.Process().memory_info().rss (Resident Set Size including native C libs)",
                "python_heap_scope": "tracemalloc.get_traced_memory() (Python interpreter heap allocations only)",
                "sampling_overhead": "Low: Monotonic timing via time.perf_counter(), instantaneous pre/post fit memory reads",
            },
        },
        "scientific_safeguards": {
            "leakage_prevention": (
                "Train/Val and Holdout Test partition strictly isolated at 80/20. "
                "Feature scaling and imputation transformers fit strictly inside each CV fold. "
                "Final holdout test set evaluated post-selection and never used for model selection or tuning."
            ),
            "statistical_methods": {
                "sample_variance": "Bessel's correction (ddof=1) applied for all sample standard deviations",
                "confidence_intervals": "Student's t-distribution with df=N-1 and Non-Parametric Bootstrap (B=1000 resamples)",
                "paired_comparison": "Exact per-seed difference Delta_s = Score_A,s - Score_B,s on matched partitions",
                "effect_size": "Cohen's dz = Mean(Delta) / Std(Delta)",
                "multiple_testing": "Bonferroni FWER adjustment: p_adj = min(1.0, p * m)",
                "small_sample_policy": "Conservative warning for N < 5; non-rejection of null does not prove equivalence",
            },
        },
        "experiments": {
            "classification_experiment": {
                "benchmark_id": res_clf.robust_benchmark_id,
                "dataset": res_clf.dataset.model_dump(),
                "seeds_evaluated": res_clf.seeds_evaluated,
                "primary_metric": res_clf.primary_metric,
                "baseline_strategy": res_clf.baseline_strategy,
                "method_summaries": {
                    k: v.model_dump() for k, v in res_clf.method_summaries.items()
                },
                "paired_comparisons": [
                    p.model_dump() for p in res_clf.paired_comparisons
                ],
                "raw_runs_count": len(res_clf.raw_seed_runs),
                "csv_artifact": "docs/research/classification_seed_runs.csv",
            },
            "regression_experiment": {
                "benchmark_id": res_reg.robust_benchmark_id,
                "dataset": res_reg.dataset.model_dump(),
                "seeds_evaluated": res_reg.seeds_evaluated,
                "primary_metric": res_reg.primary_metric,
                "baseline_strategy": res_reg.baseline_strategy,
                "method_summaries": {
                    k: v.model_dump() for k, v in res_reg.method_summaries.items()
                },
                "paired_comparisons": [
                    p.model_dump() for p in res_reg.paired_comparisons
                ],
                "raw_runs_count": len(res_reg.raw_seed_runs),
                "csv_artifact": "docs/research/regression_seed_runs.csv",
            },
        },
        "generated_plots": [
            "docs/research/plots/phase_11_seed_variability.png",
            "docs/research/plots/phase_11_paired_differences.png",
            "docs/research/plots/phase_11_resource_rss_vs_heap.png",
        ],
    }

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    logger.info("Saved Reproducibility Manifest to %s", manifest_path)
    logger.info("Phase 11 Experiments Complete!")


if __name__ == "__main__":
    main()
