# AutoNexa Machine Learning Methodology & Scientific Reliability

This document outlines the mathematical, statistical, and architectural principles implemented across the AutoNexa machine learning engine.

---

## 1. Supported Estimator Catalog

AutoNexa provides an extensible registry of scikit-learn estimators in [`backend/app/services/automl/registry.py`](../backend/app/services/automl/registry.py):

### Classification Estimators
- **Dummy Classifier** (`dummy`): `DummyClassifier(strategy="prior")` provides the theoretical majority-class baseline.
- **Logistic Regression** (`logistic_regression`): `LogisticRegression(max_iter=1000)` provides a convex L2-regularized linear baseline.
- **Decision Tree Classifier** (`decision_tree`): `DecisionTreeClassifier(max_depth=10)` evaluates non-linear orthogonal splits.
- **Random Forest Classifier** (`random_forest`): `RandomForestClassifier(n_estimators=50, max_depth=10, n_jobs=1)` trains an ensemble of de-correlated bagging decision trees.
- **Histogram Gradient Boosting** (`hist_gradient_boosting`): `HistGradientBoostingClassifier(max_iter=50)` utilizes binning-based boosting for fast, scalable tree boosting.

### Regression Estimators
- **Dummy Regressor** (`dummy_regressor` / `dummy`): `DummyRegressor(strategy="mean")` establishes the mean-target baseline.
- **Ridge Linear Regression** (`linear_regression`): `Ridge(alpha=1.0)` provides an L2-penalized linear model resilient to multicollinearity.
- **Decision Tree Regressor** (`decision_tree_regressor` / `decision_tree`): `DecisionTreeRegressor(max_depth=10)` evaluates non-linear regression partitions.
- **Random Forest Regressor** (`random_forest_regressor` / `random_forest`): `RandomForestRegressor(n_estimators=50, max_depth=10, n_jobs=1)` provides variance-reduction bagging.
- **Histogram Gradient Boosting Regressor** (`hist_gradient_boosting_regressor` / `hist_gradient_boosting`): `HistGradientBoostingRegressor(max_iter=50)` for fast non-linear gradient boosted regression.

---

## 2. Preprocessing & Leakage Prevention

Data leakage is prevented structurally through isolated scikit-learn pipelines built in [`backend/app/services/automl/preprocessor.py`](../backend/app/services/automl/preprocessor.py):

1. **Partition Isolation**: Features ($X$) and target ($y$) are split prior to fitting any transformer. Imputers, encoders, and scalers observe strictly the training partition.
2. **Numeric Pipeline**:
   - `SimpleImputer(strategy="median")`: Robust to extreme outliers.
   - `StandardScaler()`: Standardizes features to zero mean and unit variance.
3. **Categorical Pipeline**:
   - `SimpleImputer(strategy="most_frequent")`: Fills missing categorical tokens.
   - `OneHotEncoder(handle_unknown="ignore", sparse_output=False, max_categories=25)`: Binds high cardinality to prevent dimensional explosion while safely handling unseen inference levels.
4. **Column Dropping**: `remainder="drop"` ensures identifier columns, metadata fields, and unselected features are discarded cleanly.

---

## 3. Evaluation & Statistical Metrics

### Cross-Validation & Sample Variance

Metric variance across cross-validation folds is calculated using Bessel's correction to ensure unbiased sample standard deviation estimates:

$$s = \sqrt{\frac{1}{K - 1} \sum_{k=1}^K (m_k - \bar{m})^2} \quad (\text{with } \text{ddof}=1)$$

When single-fold holdout validation is executed, sample standard deviation reports `null` rather than misleading zero variance.

### Rare-Class Stratification Fallback

For classification tasks where any target class count is smaller than the requested fold count ($N_c < K$), the engine automatically falls back to standard K-Fold splitting, preventing runtime exceptions while issuing diagnostic warnings.

### Untouched Holdout Test Partition

A designated holdout partition (e.g., 20% of rows) is reserved and remains untouched throughout model selection and hyperparameter optimization, serving as an unbiased final evaluation estimate.

---

## 4. Explainable AI (SHAP & Permutation)

### Global Feature Importance
- **Tree-Based Estimators**: Extracts normalized Gini / impurity reduction importances directly from fitted trees (`feature_importances_`).
- **Model-Agnostic Permutation**: Shuffles individual features across the untouched holdout test partition and measures the degradation in the primary metric:
  $$I(f) = \text{Score}(X_{\text{test}}, y_{\text{test}}) - \text{Score}(X_{\text{test}}^{\text{perm}(f)}, y_{\text{test}})$$

### Local Instance Attributions (SHAP)
- **Hierarchy**:
  1. `shap.TreeExplainer`: Evaluates exact tree path expectations for random forests and decision trees.
  2. `shap.LinearExplainer`: Evaluates linear coefficients against background feature summaries.
  3. `shap.Explainer`: Generic Kernel/Partition explainer.
  4. **Leave-One-Covariate-Out Perturbation Fallback**: Model-agnostic algorithm replacing queried features with background medians/modes to compute marginal output shifts.

---

## 5. Statistical Hypothesis Testing & Benchmarking

When executing matched repeated-seed benchmarking across two algorithms ($A$ and $B$), AutoNexa computes:

1. **Student's Paired t-Test** (`scipy.stats.ttest_rel`): Tests the null hypothesis that the mean difference between paired seed runs is zero.
2. **Wilcoxon Signed-Rank Test** (`scipy.stats.wilcoxon`): Non-parametric test with Pratt zero-handling for non-normally distributed score deltas.
3. **Bootstrap Confidence Intervals**: Computes 95% percentile bootstrap intervals across 1,000 resamples to evaluate distribution spread without parametric assumptions.
4. **Pareto Dominance**: Candidate $A$ dominates candidate $B$ ($A \succ B$) if $A$ is no worse than $B$ across all objectives and strictly better in at least one objective:
   $$\forall i: f_i(A) \ge f_i(B) \quad \land \quad \exists j: f_j(A) > f_j(B)$$
