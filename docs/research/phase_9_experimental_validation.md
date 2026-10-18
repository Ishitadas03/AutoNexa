# AutoNexa Phase 9: Research-Grade Experimental Validation & Benchmarking Framework

## 1. Executive Summary & Research Motivation

The goal of **AutoNexa Phase 9** is to elevate AutoNexa from an automated machine learning application to a scientifically rigorous experimental research platform. Standard AutoML platforms frequently report optimistic point estimates on single arbitrary splits, omit uncertainty bounds, neglect simple heuristic baselines, or fail to document sources of experimental variance.

Phase 9 establishes:
1. **Configuration-Driven Reproducible Experimental Protocols (`v1.0`)**: Every experiment series binds the cryptographic SHA-256 dataset hash, feature schema, hardware architecture, library version manifest, and stochastic seed allocations.
2. **Repeated-Seed Evaluation Series**: Empirical evaluation across 2 to 10 random seeds to measure distribution variance rather than relying on a single lucky split.
3. **Scientifically Defensible Statistical Summaries**: Sample mean, Bessel-corrected sample standard deviation ($ddof=1$), median, range, Student's $t$ 95% confidence intervals, and deterministic non-parametric percentile bootstrap 95% confidence bounds.
4. **Canonical Baseline Auditing**: Fair evaluation against `DummyClassifier` (majority modal class), `DummyRegressor` (sample mean), and unregularized / simple linear models on identical preprocessed holdout splits, generating empirical selection quality verdicts (`outperformed`, `tied`, `underperformed`).
5. **Real Resource Efficiency & Inference Latency Profiling**: Monotonic wall-clock durations, fit vs. evaluation timing, real batch prediction latency ($ms/\text{sample}$) and throughput ($\text{samples}/\text{sec}$) benchmarked on standard batch sizes ($M=50$), and standard library `tracemalloc` peak heap allocation measurements.
6. **Academic Publication Export**: Direct streaming of structured CSV replicates, JSON manifests, and publication-ready LaTeX tables formatted for submission to NeurIPS, ICML, or ICLR.

---

## 2. Versioned Experimental Protocol (`protocol_version="1.0"`)

Every repeated experimental group captures a fully serializable `ExperimentalProtocol` object:

| Dimension | Specification | Purpose |
|---|---|---|
| **Protocol Version** | `"1.0"` | Guarantees schema consistency and backward-compatible evaluation |
| **Dataset Fingerprint** | SHA-256 hash | Ensures all runs executed on byte-for-byte identical source data |
| **Task & Target** | Inferred or user-specified | Locks target column name and task taxonomy |
| **Partition Strategy** | Train / Validation / Holdout Test | Standardizes split proportions (e.g., 80% train, 20% holdout) |
| **Evaluation Design** | Varied Splits vs. Fixed Partition | Discloses whether variability measures pipeline-wide sampling or fitting variance |
| **Seed Allocations** | Distinct integer list (2 to 10 seeds) | Defines random states across stochastic pipeline components |
| **Environment Fingerprint** | Python, NumPy, Pandas, Scikit-learn, SciPy, MLflow versions | Records software dependency stack for reproducibility auditing |
| **Hardware Platform** | OS, architecture, processor, core count | Documents execution platform without fabricating hardware counters |

### Methodological Variability Distinction
- **Varied Splits Design** (Default): Different random seeds produce distinct train/validation/test partitions as well as estimator random states. This measures variability across the combined data partition, feature preprocessing, model selection, and fitting procedure.
- **Fixed Partition Design**: Data partitions are fixed (seed 42), and only estimator initialization and stochastic solver seeds vary. This isolates pure algorithmic stochasticity from sampling variance.
- **Cross-Validation Fold Caveat**: Cross-validation fold scores evaluated within a single seed are not statistically independent replicates due to sample reuse and training set overlap. AutoNexa explicitly documents this distinction in API metadata and UI warnings.

---

## 3. Statistical Methods & Uncertainty Reporting

### 3.1 Sample Statistics
Given $N$ successful replicate scores $\{x_1, x_2, \dots, x_N\}$ for a specific evaluation metric:

$$\bar{x} = \frac{1}{N} \sum_{i=1}^N x_i$$

$$\text{Sample Std } s = \sqrt{\frac{1}{N - 1} \sum_{i=1}^N (x_i - \bar{x})^2} \quad (\text{Bessel's correction, } ddof=1)$$

- When $N = 1$, sample variance and standard deviation have zero degrees of freedom ($df = 0$) and are strictly reported as `null` rather than zero.
- Failed or timed-out runs are accounted for in $N_{\text{failed}}$ and never imputed as zero scores to prevent artificial score deflation.

### 3.2 Student's $t$ 95% Confidence Interval
For $N \ge 2$, under the assumption of approximately normally distributed replicate means:

$$\text{CI}_{95\%} = \left[ \bar{x} - t_{0.975, N-1} \cdot \frac{s}{\sqrt{N}}, \quad \bar{x} + t_{0.975, N-1} \cdot \frac{s}{\sqrt{N}} \right]$$

### 3.3 Non-Parametric Percentile Bootstrap 95% Confidence Interval
To provide distribution-free confidence bounds without assuming normality:
1. Draw $B = 1000$ bootstrap resamples with replacement: $\mathbf{x}^{*(b)} \sim \text{Uniform}(\{x_1, \dots, x_N\})$ of size $N$.
2. Compute resample means $\bar{x}^{*(b)} = \frac{1}{N} \sum_{i=1}^N x_i^{*(b)}$.
3. Determine empirical percentiles:

$$\text{CI}_{95\%}^{\text{boot}} = \left[ \text{Percentile}_{2.5}(\bar{x}^*), \quad \text{Percentile}_{97.5}(\bar{x}^*) \right]$$

4. **Deterministic Reproducibility**: Bootstrap resampling uses a fixed pseudorandom generator (`np.random.RandomState(42)`) to ensure identical repeated runs produce identical confidence intervals.

---

## 4. Fair Canonical Baseline Evaluation

To scientifically evaluate AutoML model selection quality, candidate models must be compared against simple, interpretable baselines evaluated under the **exact same preprocessed holdout partition**:

### Classification Baselines
- **`dummy_most_frequent`**: Heuristic baseline predicting the modal class observed in the training partition.
- **`simple_logistic_regression`**: Simple linear classification baseline using L2 regularization and standard preprocessing.

### Regression Baselines
- **`dummy_mean_regressor`**: Empirical baseline predicting the sample mean target of the training partition.
- **`simple_linear_regression`**: Ordinary Least Squares linear baseline using standard preprocessing.

### Selection Quality Verdicts
- **`outperformed`**: AutoML model strictly exceeds baseline score by $> 0.001$ (higher-is-better) or $< -0.001$ (lower-is-better).
- **`tied`**: Difference between candidate and baseline is within $|\Delta| \le 0.001$.
- **`underperformed`**: Baseline achieves superior performance to the AutoML selected model.

### Non-Positive Baseline Safeguard
When a baseline score is $\le 0$ (or near zero, e.g. $R^2 \le 0$ for a mean dummy predictor on noisy test sets), relative percentage change ($\Delta\%$) is omitted (`null`) and accompanied by an explicit explanatory notice. This prevents nonsensical or distorted percentage ratios in scientific reports.

---

## 5. Real Resource Efficiency & Profiling

AutoNexa measures actual runtime and memory metrics without requiring external C-level profiling extensions:
- **Monotonic Wall-Clock Timing**: Timing recorded using `time.perf_counter()` or `time.monotonic()` to prevent clock skew or NTP jumps.
- **Inference Latency & Throughput**: Measured on a standardized batch size ($M = 50$) over holdout test data:
  - Latency: Single-sample prediction duration in milliseconds ($ms/\text{sample}$).
  - Throughput: Evaluated inferences per second ($\text{samples}/\text{sec}$).
- **Peak Memory Usage**: Captured using Python standard library `tracemalloc`, tracing peak memory allocation delta during training.
- **Model Artifact Footprint**: File size on disk of the serialized scikit-learn pipeline joblib binary.

---

## 6. API Specifications (Additive & Backward-Compatible)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/benchmarks/compare` | Phase 8 comparative research benchmarking & comparability audit |
| `POST` | `/api/v1/benchmarks/repeated-runs` | Execute 2 to 10 seed evaluation series, statistical summary, baseline audit |
| `GET` | `/api/v1/benchmarks/repeated-runs/{run_group_id}` | Retrieve stored repeated experiment series and statistical reports |
| `POST` | `/api/v1/benchmarks/baseline-comparison` | Evaluate dummy & linear baselines against an existing trained experiment |
| `GET` | `/api/v1/benchmarks/repeated-runs/{run_group_id}/export-csv` | Download per-run replicate outcomes and metrics as CSV |
| `GET` | `/api/v1/benchmarks/repeated-runs/{run_group_id}/latex` | Generate NeurIPS/ICML publication-grade LaTeX table code |

---

## 7. Known Threats to Validity & Limitations

1. **Hardware Non-Determinism**: Even with fixed random seeds, floating-point rounding, SIMD vectorization, multi-threading schedules, and underlying BLAS/LAPACK library implementations may cause minor numeric variations across different CPU architectures or OS versions.
2. **Sample Size Limitations ($N \le 10$)**: In typical laptop and single-workstation environments, compute budgets constrain replicate counts ($2 \le N \le 10$). While Student's $t$ distributions account for small sample sizes, confidence intervals will naturally be wider than in large-cluster evaluations.
3. **No Overlapping CI Fallacy**: Overlapping confidence intervals between competing models do not prove statistical equivalence; hypothesis testing requires formal paired tests (such as Wilcoxon signed-rank or paired $t$-tests across identical seeds).
