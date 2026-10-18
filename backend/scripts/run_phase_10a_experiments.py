"""Script to execute Phase 10A controlled research experiments comparing Random Search vs Bayesian Optimization."""

import json
import os
from pathlib import Path
import sys
import time
from typing import Tuple
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# Ensure backend directory is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# AutoNexa services
from app.core.config import get_settings
from app.schemas.hpo_experiment import HPOExperimentRequest
from app.services.analysis_service import AnalysisService
from app.services.automl.hpo_service import HPOService
from app.services.automl.tracker import compute_dataset_fingerprint
from app.services.dataset_service import DatasetService


def generate_benchmark_datasets(data_dir: Path) -> Tuple[Path, Path]:
    """Generate deterministic benchmark datasets for classification and regression."""
    data_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.RandomState(42)

    # 1. Classification Dataset: Telecom Customer Churn
    # 200 rows, mixed features, realistic non-linear relationships and class imbalance
    churn_path = data_dir / "telecom_customer_churn.csv"
    n_samples = 200
    tenure = rng.randint(1, 72, size=n_samples)
    monthly_charges = np.round(rng.uniform(20.0, 110.0, size=n_samples), 2)
    # Total charges with injected nulls (realistic missingness)
    total_charges = np.round(tenure * monthly_charges + rng.normal(0, 50, size=n_samples), 2)
    total_charges[rng.choice(n_samples, size=5, replace=False)] = np.nan

    contracts = rng.choice(["month-to-month", "one-year", "two-year"], p=[0.55, 0.25, 0.20], size=n_samples)
    internet = rng.choice(["fiber_optic", "dsl", "none"], p=[0.45, 0.40, 0.15], size=n_samples)
    tech_support = rng.choice(["yes", "no"], p=[0.35, 0.65], size=n_samples)

    # Churn probability logistic function
    logit = (
        -0.04 * tenure
        + 0.02 * monthly_charges
        + (contracts == "month-to-month") * 1.2
        + (contracts == "two-year") * -1.5
        + (tech_support == "no") * 0.6
        - 1.0
    )
    prob_churn = 1.0 / (1.0 + np.exp(-logit))
    churn = ["yes" if rng.uniform() < p else "no" for p in prob_churn]

    df_churn = pd.DataFrame({
        "tenure": tenure,
        "monthly_charges": monthly_charges,
        "total_charges": total_charges,
        "contract_type": contracts,
        "internet_service": internet,
        "tech_support": tech_support,
        "churn": churn,
    })
    df_churn.to_csv(churn_path, index=False)

    # 2. Regression Dataset: Housing Valuation
    # 200 rows, mixed features, realistic pricing formula with noise and missingness
    housing_path = data_dir / "housing_price_valuation.csv"
    sqft = rng.randint(700, 3500, size=n_samples)
    bedrooms = rng.randint(1, 6, size=n_samples)
    bathrooms = np.round(1.0 + 0.5 * rng.randint(0, 5, size=n_samples), 1)
    bathrooms[rng.choice(n_samples, size=4, replace=False)] = np.nan
    year_built = rng.randint(1950, 2023, size=n_samples)
    neighborhood = rng.choice(["downtown", "northside", "west_suburbs", "east_hills"], p=[0.25, 0.35, 0.25, 0.15], size=n_samples)
    garage_spaces = rng.randint(0, 3, size=n_samples)

    neigh_prem = {"downtown": 75000, "northside": 40000, "west_suburbs": 20000, "east_hills": 0}
    prem = np.array([neigh_prem[n] for n in neighborhood])
    price = np.round(
        120000
        + sqft * 165.0
        + bedrooms * 12000.0
        + (year_built - 1950) * 850.0
        + garage_spaces * 15000.0
        + prem
        + rng.normal(0, 25000, size=n_samples),
        2
    )

    df_housing = pd.DataFrame({
        "square_feet": sqft,
        "bedrooms": bedrooms,
        "bathrooms": bathrooms,
        "year_built": year_built,
        "neighborhood": neighborhood,
        "garage_spaces": garage_spaces,
        "sale_price": price,
    })
    df_housing.to_csv(housing_path, index=False)

    return churn_path, housing_path


def main():
    print("=" * 80)
    print("AutoNexa Phase 10A: Controlled Research Experiment Execution")
    print("Comparing Random Search vs Bayesian Optimization (Optuna TPE)")
    print("=" * 80)

    settings = get_settings()
    upload_dir = settings.resolved_upload_dir
    experiments_dir = settings.resolved_experiments_dir
    data_dir = Path("data/research_benchmarks")

    churn_file, housing_file = generate_benchmark_datasets(data_dir)
    print(f"[1/5] Benchmark datasets generated in {data_dir}")
    print(f"  - Classification: {churn_file} ({compute_dataset_fingerprint(churn_file)[:16]}...)")
    print(f"  - Regression:     {housing_file} ({compute_dataset_fingerprint(housing_file)[:16]}...)")

    dataset_service = DatasetService(upload_dir=upload_dir)
    analysis_service = AnalysisService(upload_dir=upload_dir)
    hpo_service = HPOService(
        upload_dir=upload_dir,
        experiments_dir=experiments_dir,
        analysis_service=analysis_service,
    )

    # Copy and register datasets into AutoNexa upload directory
    import shutil
    import uuid

    churn_id = str(uuid.uuid4())
    churn_target = upload_dir / f"{churn_id}.csv"
    shutil.copy(churn_file, churn_target)
    churn_profile = dataset_service.profile_csv(churn_target, dataset_id=churn_id, original_filename="telecom_customer_churn.csv")

    housing_id = str(uuid.uuid4())
    housing_target = upload_dir / f"{housing_id}.csv"
    shutil.copy(housing_file, housing_target)
    housing_profile = dataset_service.profile_csv(housing_target, dataset_id=housing_id, original_filename="housing_price_valuation.csv")

    print(f"[2/5] Datasets registered with AutoNexa:")
    print(f"  - Churn dataset ID:   {churn_profile.dataset_id} ({churn_profile.rows} rows, {churn_profile.columns} cols)")
    print(f"  - Housing dataset ID: {housing_profile.dataset_id} ({housing_profile.rows} rows, {housing_profile.columns} cols)")

    # Execute Experiment 1: Classification (Random Forest Classifier, 20 trials, 3 seeds)
    print("\n[3/5] Executing Experiment 1: Classification (Random Forest Classifier, 20 trials, seeds=[42, 123, 456])...")
    t0 = time.perf_counter()
    req_clf = HPOExperimentRequest(
        dataset_id=churn_profile.dataset_id,
        target_column="churn",
        task_type="classification",
        model_id="random_forest",
        trial_budget=20,
        seeds=[42, 123, 456],
        evaluation_strategy="cross_validation",
        cv_folds=3,
        test_size=0.2,
        primary_metric="f1_weighted",
    )
    res_clf = hpo_service.run_hpo_experiment(req_clf)
    duration_clf = time.perf_counter() - t0
    print(f"  Completed in {duration_clf:.2f}s! Overall winner: {res_clf.overall_winner}")
    print(f"  - Random Search Mean Val F1:     {res_clf.random_search_summary.validation_mean:.4f} +/- {res_clf.random_search_summary.validation_std}")
    print(f"  - Bayesian Opt Mean Val F1:      {res_clf.bayesian_summary.validation_mean:.4f} +/- {res_clf.bayesian_summary.validation_std}")
    print(f"  - Random Search Mean Test F1:    {res_clf.random_search_summary.test_mean:.4f} +/- {res_clf.random_search_summary.test_std}")
    print(f"  - Bayesian Opt Mean Test F1:     {res_clf.bayesian_summary.test_mean:.4f} +/- {res_clf.bayesian_summary.test_std}")
    print(f"  - Paired Test Wins: Bayes {res_clf.statistical_comparison.bayesian_test_wins} vs Random {res_clf.statistical_comparison.random_test_wins} (Ties: {res_clf.statistical_comparison.test_ties})")
    print(f"  - Scientific Conclusion: {res_clf.statistical_comparison.scientific_conclusion}")

    # Execute Experiment 2: Regression (Random Forest Regressor, 20 trials, 3 seeds)
    print("\n[4/5] Executing Experiment 2: Regression (Random Forest Regressor, 20 trials, seeds=[42, 123, 456])...")
    t1 = time.perf_counter()
    req_reg = HPOExperimentRequest(
        dataset_id=housing_profile.dataset_id,
        target_column="sale_price",
        task_type="regression",
        model_id="random_forest_regressor",
        trial_budget=20,
        seeds=[42, 123, 456],
        evaluation_strategy="cross_validation",
        cv_folds=3,
        test_size=0.2,
        primary_metric="rmse",
    )
    res_reg = hpo_service.run_hpo_experiment(req_reg)
    duration_reg = time.perf_counter() - t1
    print(f"  Completed in {duration_reg:.2f}s! Overall winner: {res_reg.overall_winner}")
    print(f"  - Random Search Mean Val RMSE:   ${res_reg.random_search_summary.validation_mean:,.2f} +/- {res_reg.random_search_summary.validation_std}")
    print(f"  - Bayesian Opt Mean Val RMSE:    ${res_reg.bayesian_summary.validation_mean:,.2f} +/- {res_reg.bayesian_summary.validation_std}")
    print(f"  - Random Search Mean Test RMSE:  ${res_reg.random_search_summary.test_mean:,.2f} +/- {res_reg.random_search_summary.test_std}")
    print(f"  - Bayesian Opt Mean Test RMSE:   ${res_reg.bayesian_summary.test_mean:,.2f} +/- {res_reg.bayesian_summary.test_std}")
    print(f"  - Paired Test Wins: Bayes {res_reg.statistical_comparison.bayesian_test_wins} vs Random {res_reg.statistical_comparison.random_test_wins} (Ties: {res_reg.statistical_comparison.test_ties})")
    print(f"  - Scientific Conclusion: {res_reg.statistical_comparison.scientific_conclusion}")

    # Generate Convergence Plots
    print("\n[5/5] Generating convergence plots...")
    plots_dir = Path("docs/research/plots")
    plots_dir.mkdir(parents=True, exist_ok=True)

    # Plot 1: Classification Convergence Curve
    plt.figure(figsize=(9, 5))
    trials_axis = list(range(1, 21))
    plt.plot(trials_axis, res_clf.random_search_summary.mean_convergence_curve, "o-", label="Random Search (Mean)", color="#3b82f6", linewidth=2)
    plt.plot(trials_axis, res_clf.bayesian_summary.mean_convergence_curve, "s-", label="Bayesian Optuna TPE (Mean)", color="#10b981", linewidth=2)
    plt.xlabel("Trial Number (1 to 20)", fontsize=11)
    plt.ylabel("Validation F1-Weighted Score (Higher is Better)", fontsize=11)
    plt.title("Classification Convergence: Random Search vs Bayesian Optimization (N=3 seeds)", fontsize=12, fontweight="bold")
    plt.grid(True, linestyle="--", alpha=0.5)
    plt.legend(frameon=True)
    plt.tight_layout()
    clf_plot_path = plots_dir / "classification_hpo_convergence.png"
    plt.savefig(clf_plot_path, dpi=150)
    plt.close()
    print(f"  - Classification plot saved to {clf_plot_path}")

    # Plot 2: Regression Convergence Curve
    plt.figure(figsize=(9, 5))
    plt.plot(trials_axis, res_reg.random_search_summary.mean_convergence_curve, "o-", label="Random Search (Mean)", color="#3b82f6", linewidth=2)
    plt.plot(trials_axis, res_reg.bayesian_summary.mean_convergence_curve, "s-", label="Bayesian Optuna TPE (Mean)", color="#10b981", linewidth=2)
    plt.xlabel("Trial Number (1 to 20)", fontsize=11)
    plt.ylabel("Validation RMSE ($) (Lower is Better)", fontsize=11)
    plt.title("Regression Convergence: Random Search vs Bayesian Optimization (N=3 seeds)", fontsize=12, fontweight="bold")
    plt.grid(True, linestyle="--", alpha=0.5)
    plt.legend(frameon=True)
    plt.tight_layout()
    reg_plot_path = plots_dir / "regression_hpo_convergence.png"
    plt.savefig(reg_plot_path, dpi=150)
    plt.close()
    print(f"  - Regression plot saved to {reg_plot_path}")

    # Save summary metadata
    manifest_path = Path("docs/research/phase_10a_manifest.json")
    manifest = {
        "classification_experiment_id": res_clf.experiment_id,
        "regression_experiment_id": res_reg.experiment_id,
        "classification_results": res_clf.model_dump(),
        "regression_results": res_reg.model_dump(),
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"  - Experiment manifest saved to {manifest_path}")

    print("\nPhase 10A experiment run completed successfully!")


if __name__ == "__main__":
    from typing import Tuple
    main()
