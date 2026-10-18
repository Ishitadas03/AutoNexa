"""Dataset catalog service for Phase 11: public benchmark datasets and provenance tracking."""

from functools import lru_cache
import hashlib
import logging
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
import numpy as np
import pandas as pd

from app.core.config import Settings, get_settings
from app.schemas.robust_benchmark import DatasetCatalogEntry
from app.services.automl.tracker import compute_dataset_fingerprint

logger = logging.getLogger(__name__)

# Curated benchmark metadata registry
CURATED_BENCHMARKS: Dict[str, Dict[str, Any]] = {
    "breast_cancer_binary": {
        "name": "Breast Cancer Wisconsin Diagnostic",
        "source": "local_fixture",
        "provenance": "Wolberg, Street, & Mangasarian (1995), UCI Machine Learning Repository / OpenML ID 15",
        "license": "CC BY 4.0",
        "task_type": "binary_classification",
        "target_column": "target",
        "description": "569 instances, 30 continuous features computed from digitized FNA images of breast masses.",
    },
    "wine_multiclass": {
        "name": "Wine Recognition Benchmark",
        "source": "local_fixture",
        "provenance": "Forina et al. (1991), Institute of Pharmaceutical and Food Analysis and Technologies, Genoa / OpenML ID 187",
        "license": "CC BY 4.0",
        "task_type": "multiclass_classification",
        "target_column": "target",
        "description": "178 instances, 13 continuous chemical constituents of wines grown in the same region in Italy across 3 cultivars.",
    },
    "diabetes_regression": {
        "name": "Diabetes Disease Progression",
        "source": "local_fixture",
        "provenance": "Efron, Hastie, Johnstone & Tibshirani (2004), LARS / OpenML ID 531",
        "license": "Public Domain / CC0",
        "task_type": "regression",
        "target_column": "target",
        "description": "442 diabetes patients, 10 baseline variables (age, sex, bmi, bp, s1-s6), target is quantitative disease progression measure.",
    },
    "housing_price_valuation": {
        "name": "Housing Price Valuation",
        "source": "local_fixture",
        "provenance": "AutoNexa benchmark suite, simulated real-estate transaction records with mixed categorical/numeric attributes.",
        "license": "Apache 2.0",
        "task_type": "regression",
        "target_column": "sale_price",
        "description": "201 instances, 6 features (square_feet, bedrooms, bathrooms, year_built, neighborhood, garage_spaces).",
    },
    "telecom_customer_churn": {
        "name": "Telecom Customer Churn",
        "source": "local_fixture",
        "provenance": "AutoNexa benchmark suite, customer subscription and usage metrics.",
        "license": "Apache 2.0",
        "task_type": "binary_classification",
        "target_column": "churn",
        "description": "201 instances, 6 features (tenure, monthly_charges, total_charges, contract_type, internet_service, tech_support).",
    },
}


class DatasetCatalogService:
    """Manages curated benchmark datasets, provenance manifests, and OpenML integration."""

    def __init__(
        self,
        benchmarks_dir: Optional[Path] = None,
        upload_dir: Optional[Path] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        if benchmarks_dir is not None:
            self.benchmarks_dir = benchmarks_dir
        else:
            current_path = Path(__file__).resolve()
            found_dir: Optional[Path] = None
            for parent in reversed(current_path.parents):
                candidate = parent / "data" / "research_benchmarks"
                if candidate.is_dir() and any(candidate.glob("*.csv")):
                    found_dir = candidate
                    break
            if found_dir is None:
                for parent in current_path.parents:
                    candidate = parent / "data" / "research_benchmarks"
                    if candidate.is_dir():
                        found_dir = candidate
                        break
            if found_dir is None:
                found_dir = current_path.parents[4] / "data" / "research_benchmarks"
            found_dir.mkdir(parents=True, exist_ok=True)
            self.benchmarks_dir = found_dir.resolve()

        self.upload_dir = (
            upload_dir if upload_dir is not None else self.settings.resolved_upload_dir
        )

    def _inspect_csv_file(
        self, file_path: Path, dataset_id: str
    ) -> DatasetCatalogEntry:
        """Inspect a CSV file and construct a DatasetCatalogEntry with full provenance."""
        curated = CURATED_BENCHMARKS.get(dataset_id, {})
        df = pd.read_csv(file_path)

        target_col = curated.get("target_column")
        if not target_col or target_col not in df.columns:
            # Fallback to last column
            target_col = df.columns[-1]

        feature_cols = [c for c in df.columns if c != target_col]
        num_features = sum(
            pd.api.types.is_numeric_dtype(df[c]) for c in feature_cols
        )
        cat_features = len(feature_cols) - num_features
        missing_count = int(df.isna().sum().sum())

        # Determine task type
        task_type = curated.get("task_type")
        if not task_type:
            target_series = df[target_col].dropna()
            n_unique = target_series.nunique()
            if pd.api.types.is_numeric_dtype(target_series) and n_unique > 20:
                task_type = "regression"
            elif n_unique == 2:
                task_type = "binary_classification"
            else:
                task_type = "multiclass_classification"

        fingerprint = compute_dataset_fingerprint(file_path)

        return DatasetCatalogEntry(
            dataset_id=dataset_id,
            name=curated.get("name", dataset_id.replace("_", " ").title()),
            source=curated.get("source", "local_fixture"),
            provenance=curated.get(
                "provenance", f"Local dataset file: {file_path.name}"
            ),
            license=curated.get("license", "Open Data / Educational"),
            task_type=task_type,
            target_column=target_col,
            n_rows=len(df),
            n_features=len(feature_cols),
            numeric_features_count=num_features,
            categorical_features_count=cat_features,
            has_missing_values=missing_count > 0,
            missing_cells_count=missing_count,
            dataset_fingerprint=fingerprint,
            is_cached=True,
            description=curated.get(
                "description",
                f"Dataset with {len(df)} rows and {len(feature_cols)} features for {task_type}.",
            ),
        )

    def list_catalog(self) -> List[DatasetCatalogEntry]:
        """List all available benchmark datasets currently in local repository fixtures."""
        entries: List[DatasetCatalogEntry] = []
        if not self.benchmarks_dir.exists():
            return entries

        csv_files = sorted(self.benchmarks_dir.glob("*.csv"))
        for csv_path in csv_files:
            dataset_id = csv_path.stem
            try:
                entry = self._inspect_csv_file(csv_path, dataset_id)
                entries.append(entry)
            except Exception as e:
                logger.warning(
                    "Failed to parse benchmark dataset '%s': %s", csv_path, e
                )
        return entries

    def get_entry(self, dataset_id: str) -> Optional[DatasetCatalogEntry]:
        """Retrieve catalog entry for a specific dataset identifier."""
        file_path = self.resolve_dataset_path(dataset_id)
        if not file_path or not file_path.exists():
            return None
        return self._inspect_csv_file(file_path, dataset_id)

    def resolve_dataset_path(self, dataset_id: str) -> Optional[Path]:
        """Resolve absolute file path for a dataset ID across benchmark fixtures and uploads."""
        # 1. Direct benchmark file
        bench_direct = self.benchmarks_dir / f"{dataset_id}.csv"
        if bench_direct.is_file():
            return bench_direct.resolve()

        bench_exact = self.benchmarks_dir / dataset_id
        if bench_exact.is_file():
            return bench_exact.resolve()

        # 2. Check uploads directory
        upload_direct = self.upload_dir / f"{dataset_id}.csv"
        if upload_direct.is_file():
            return upload_direct.resolve()

        upload_folder = self.upload_dir / dataset_id
        if upload_folder.is_dir():
            csv_matches = list(upload_folder.glob("*.csv"))
            if csv_matches:
                return csv_matches[0].resolve()

        return None

    def load_dataset_dataframe(
        self, dataset_id: str
    ) -> Tuple[pd.DataFrame, DatasetCatalogEntry]:
        """Load dataset as a pandas DataFrame alongside its catalog metadata entry."""
        file_path = self.resolve_dataset_path(dataset_id)
        if not file_path or not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Benchmark dataset '{dataset_id}' not found in catalog or uploads.",
            )

        entry = self._inspect_csv_file(file_path, dataset_id)
        df = pd.read_csv(file_path)
        return df, entry

    def fetch_and_cache_openml(
        self,
        name_or_id: str,
        target_name: Optional[str] = None,
    ) -> DatasetCatalogEntry:
        """Fetch a public tabular dataset from OpenML and cache it locally.

        Respects offline environments: if network is unavailable or download fails,
        returns an informative error.
        """
        safe_name = re.sub(r"[^\w\-]", "_", str(name_or_id).lower())
        cache_file = self.benchmarks_dir / f"openml_{safe_name}.csv"

        if cache_file.exists():
            return self._inspect_csv_file(cache_file, f"openml_{safe_name}")

        try:
            from sklearn.datasets import fetch_openml

            logger.info("Attempting to fetch dataset '%s' from OpenML...", name_or_id)
            # Try as integer ID or name
            try:
                data_id = int(name_or_id)
                dataset = fetch_openml(data_id=data_id, as_frame=True, parser="auto")
            except ValueError:
                dataset = fetch_openml(name=name_or_id, as_frame=True, parser="auto")

            df = dataset.frame
            if df is None or len(df) == 0:
                raise ValueError("OpenML returned empty dataframe")

            # Clean columns
            df.columns = [str(c).strip().replace(" ", "_") for c in df.columns]
            df.to_csv(cache_file, index=False)

            dataset_id = f"openml_{safe_name}"
            # Register in CURATED_BENCHMARKS dynamically
            CURATED_BENCHMARKS[dataset_id] = {
                "name": f"OpenML {name_or_id}",
                "source": "openml",
                "provenance": f"OpenML repository, identifier: {name_or_id}",
                "license": getattr(dataset, "licence", "OpenML License / CC BY"),
                "task_type": "classification" if dataset.target_names else "regression",
                "target_column": target_name or (dataset.target_names[0] if dataset.target_names else df.columns[-1]),
                "description": getattr(dataset, "description", f"Downloaded OpenML dataset {name_or_id}"),
            }

            return self._inspect_csv_file(cache_file, dataset_id)
        except Exception as e:
            logger.error("Failed to fetch OpenML dataset '%s': %s", name_or_id, e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to fetch dataset '{name_or_id}' from OpenML: {e}. If running offline, please use local fixtures.",
            )


@lru_cache
def get_dataset_catalog_service() -> DatasetCatalogService:
    """Return cached singleton instance of DatasetCatalogService."""
    return DatasetCatalogService()
