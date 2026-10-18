"""Execution script for AutoNexa Phase 10B Multi-Objective AutoML Optimization & Resource-Aware Selection."""

import json
import os
from pathlib import Path
import sys
import time
from typing import Dict, Any
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# Ensure backend directory is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings
from app.schemas.multi_objective import (
    MultiObjectiveExperimentRequest,
    ResourceConstraints,
)
from app.services.analysis_service import AnalysisService
from app.services.automl.multi_objective_service import MultiObjectiveService
from app.services.dataset_service import DatasetService


def run_phase_10b_research():
    """Run real multi-objective AutoML experiments on classification and regression benchmarks."""
    settings = get_settings()
    repo_root = Path(__file__).resolve().parent.parent.parent
    data_dir = repo_root / "data" / "research_benchmarks"
    plots_dir = repo_root / "docs" / "research" / "plots"
    plots_dir.mkdir(parents=True, exist_ok=True)

    churn_path = data_dir / "telecom_customer_churn.csv"
    housing_path = data_dir / "housing_price_valuation.csv"

    upload_dir = settings.resolved_upload_dir
    experiments_dir = settings.resolved_experiments_dir
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=50 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=upload_dir)
    mo_service = MultiObjectiveService(
        upload_dir=upload_dir,
        experiments_dir=experiments_dir,
        analysis_service=analysis_service,
    )

    # Copy datasets to upload directory with UUIDs so dataset_service and analysis_service can access them
    import shutil
    import uuid

    churn_id = f"mo_churn_{uuid.uuid4().hex[:8]}"
    housing_id = f"mo_housing_{uuid.uuid4().hex[:8]}"

    shutil.copyfile(churn_path, upload_dir / f"{churn_id}.csv")
    shutil.copyfile(housing_path, upload_dir / f"{housing_id}.csv")

    print("=" * 80)
    print("AutoNexa Phase 10B: Multi-Objective AutoML Optimization Experiment Runner")
    print("=" * 80)

    # ---------------------------------------------------------
    # Experiment 1: Classification (Telecom Customer Churn)
    # ---------------------------------------------------------
    print("\n[1/2] Executing Classification Multi-Objective Benchmark (Telecom Churn)...")
    clf_request = MultiObjectiveExperimentRequest(
        dataset_id=churn_id,
        target_column="churn",
        task_type="classification",
        include_hpo_candidates=True,
        evaluation_strategy="cross_validation",
        cv_folds=3,
        test_size=0.2,
        primary_metric="f1_weighted",
        random_state=42,
        constraints=ResourceConstraints(
            max_inference_latency_ms=3.0,
            max_training_duration_seconds=30.0,
            max_artifact_size_bytes=500000,
        ),
        selection_policy="balanced_compromise",
    )

    t0_clf = time.perf_counter()
    clf_res = mo_service.run_multi_objective_experiment(clf_request)
    clf_elapsed = time.perf_counter() - t0_clf
    print(f"Classification completed in {clf_elapsed:.2f}s! Evaluated {len(clf_res.candidates)} candidates.")
    print(f"Pareto frontier candidate count: {len(clf_res.pareto_frontier_candidate_ids)}")
    print(f"Selected champion: {clf_res.selection.selected_candidate.measurement.model_name} ({clf_res.selection.selected_candidate_id})")
    print(f"Validation F1: {clf_res.selection.selected_candidate.measurement.validation_score:.4f}")
    print(f"Untouched Holdout Test F1: {clf_res.selection.selected_candidate.measurement.test_score:.4f}")
    print(f"Inference Latency: {clf_res.selection.selected_candidate.measurement.inference_latency_ms_per_sample:.4f} ms/sample")
    print(f"Model Artifact Size: {clf_res.selection.selected_candidate.measurement.model_artifact_size_bytes} bytes")

    # ---------------------------------------------------------
    # Experiment 2: Regression (Housing Price Valuation)
    # ---------------------------------------------------------
    print("\n[2/2] Executing Regression Multi-Objective Benchmark (Housing Valuation)...")
    reg_request = MultiObjectiveExperimentRequest(
        dataset_id=housing_id,
        target_column="sale_price",
        task_type="regression",
        include_hpo_candidates=True,
        evaluation_strategy="cross_validation",
        cv_folds=3,
        test_size=0.2,
        primary_metric="rmse",
        random_state=42,
        constraints=ResourceConstraints(
            max_inference_latency_ms=2.5,
            max_training_duration_seconds=30.0,
            max_artifact_size_bytes=500000,
        ),
        selection_policy="best_performance_constrained",
    )

    t0_reg = time.perf_counter()
    reg_res = mo_service.run_multi_objective_experiment(reg_request)
    reg_elapsed = time.perf_counter() - t0_reg
    print(f"Regression completed in {reg_elapsed:.2f}s! Evaluated {len(reg_res.candidates)} candidates.")
    print(f"Pareto frontier candidate count: {len(reg_res.pareto_frontier_candidate_ids)}")
    print(f"Selected champion: {reg_res.selection.selected_candidate.measurement.model_name} ({reg_res.selection.selected_candidate_id})")
    print(f"Validation RMSE: {reg_res.selection.selected_candidate.measurement.validation_score:.2f}")
    print(f"Untouched Holdout Test RMSE: {reg_res.selection.selected_candidate.measurement.test_score:.2f}")

    # ---------------------------------------------------------
    # Generate High-Resolution Pareto Trade-Off Visualizations
    # ---------------------------------------------------------
    print("\nGenerating Pareto plots...")

    # Plot 1: Classification Pareto Frontier (Inference Latency vs Validation F1)
    fig, ax = plt.subplots(figsize=(8, 5), dpi=300)
    for c in clf_res.candidates:
        m = c.measurement
        lat = m.inference_latency_ms_per_sample
        score = m.validation_score or 0.0
        if not c.is_feasible:
            ax.scatter(lat, score, color="#EF4444", marker="x", s=90, label="Infeasible" if "Infeasible" not in [l.get_label() for l in ax.collections] else "")
            ax.annotate(m.model_name[:12], (lat, score), textcoords="offset points", xytext=(4, -6), fontsize=7, color="#EF4444")
        elif c.is_pareto_optimal:
            is_champ = m.candidate_id == clf_res.selection.selected_candidate_id
            color = "#10B981" if not is_champ else "#1D4ED8"
            marker = "*" if is_champ else "D"
            size = 180 if is_champ else 110
            lbl = "Selected Champion" if is_champ else ("Pareto-Optimal" if "Pareto-Optimal" not in [l.get_label() for l in ax.collections] else "")
            ax.scatter(lat, score, color=color, marker=marker, s=size, edgecolors="black", linewidths=1.2, label=lbl, zorder=5)
            ax.annotate(f"{m.model_name[:15]}\n(F1={score:.3f}, {lat:.2f}ms)", (lat, score), textcoords="offset points", xytext=(6, 5), fontsize=8, fontweight="bold" if is_champ else "normal", color="#0F172A")
        else:
            ax.scatter(lat, score, color="#94A3B8", marker="o", s=70, alpha=0.8, label="Dominated" if "Dominated" not in [l.get_label() for l in ax.collections] else "")
            ax.annotate(m.model_name[:12], (lat, score), textcoords="offset points", xytext=(4, -4), fontsize=7, color="#64748B")

    ax.set_title("Pareto Frontier: Inference Latency vs Validation F1-Score (Telecom Churn)", fontsize=11, fontweight="bold", pad=12)
    ax.set_xlabel("Inference Latency (ms / sample) [Lower is Better]", fontsize=10)
    ax.set_ylabel("Validation F1-Score [Higher is Better]", fontsize=10)
    ax.grid(True, linestyle="--", alpha=0.4)
    ax.legend(frameon=True, facecolor="white", edgecolor="#CBD5E1", fontsize=8, loc="lower right")
    plt.tight_layout()
    clf_plot_path = plots_dir / "classification_pareto_frontier.png"
    plt.savefig(clf_plot_path)
    plt.close()
    print(f"Saved: {clf_plot_path}")

    # Plot 2: Regression Pareto Frontier (Model Size vs RMSE)
    fig, ax = plt.subplots(figsize=(8, 5), dpi=300)
    for c in reg_res.candidates:
        m = c.measurement
        size_kb = m.model_artifact_size_bytes / 1024.0
        score = m.validation_score or 0.0
        if not c.is_feasible:
            ax.scatter(size_kb, score, color="#EF4444", marker="x", s=90, label="Infeasible" if "Infeasible" not in [l.get_label() for l in ax.collections] else "")
            ax.annotate(m.model_name[:12], (size_kb, score), textcoords="offset points", xytext=(4, 4), fontsize=7, color="#EF4444")
        elif c.is_pareto_optimal:
            is_champ = m.candidate_id == reg_res.selection.selected_candidate_id
            color = "#10B981" if not is_champ else "#1D4ED8"
            marker = "*" if is_champ else "D"
            size = 180 if is_champ else 110
            lbl = "Selected Champion" if is_champ else ("Pareto-Optimal" if "Pareto-Optimal" not in [l.get_label() for l in ax.collections] else "")
            ax.scatter(size_kb, score, color=color, marker=marker, s=size, edgecolors="black", linewidths=1.2, label=lbl, zorder=5)
            ax.annotate(f"{m.model_name[:15]}\n(RMSE={score:.0f}, {size_kb:.0f}KB)", (size_kb, score), textcoords="offset points", xytext=(6, 5), fontsize=8, fontweight="bold" if is_champ else "normal", color="#0F172A")
        else:
            ax.scatter(size_kb, score, color="#94A3B8", marker="o", s=70, alpha=0.8, label="Dominated" if "Dominated" not in [l.get_label() for l in ax.collections] else "")
            ax.annotate(m.model_name[:12], (size_kb, score), textcoords="offset points", xytext=(4, 4), fontsize=7, color="#64748B")

    ax.set_title("Pareto Frontier: Compressed Artifact Footprint vs RMSE (Housing Price)", fontsize=11, fontweight="bold", pad=12)
    ax.set_xlabel("Serialized Artifact Size (KB) [Lower is Better]", fontsize=10)
    ax.set_ylabel("Validation RMSE [Lower is Better]", fontsize=10)
    ax.grid(True, linestyle="--", alpha=0.4)
    ax.legend(frameon=True, facecolor="white", edgecolor="#CBD5E1", fontsize=8, loc="upper right")
    plt.tight_layout()
    reg_plot_path = plots_dir / "regression_pareto_frontier.png"
    plt.savefig(reg_plot_path)
    plt.close()
    print(f"Saved: {reg_plot_path}")

    # ---------------------------------------------------------
    # Persist Machine-Readable Phase 10B Manifest
    # ---------------------------------------------------------
    manifest = {
        "metadata": {
            "phase": "10B",
            "title": "Multi-Objective AutoML Optimization & Resource-Aware Model Selection",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "evaluation_engine": "ParetoFrontierCalculator",
            "profiler": "ResourceProfiler",
            "holdout_isolation": "Strict 20% untouched holdout test partition evaluated strictly post-selection",
        },
        "experiments": {
            "classification": clf_res.model_dump(),
            "regression": reg_res.model_dump(),
        },
    }

    manifest_path = repo_root / "docs" / "research" / "phase_10b_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nSaved reproducibility manifest to: {manifest_path}")

    print("\nPhase 10B Research Experiments Complete!")


if __name__ == "__main__":
    run_phase_10b_research()
