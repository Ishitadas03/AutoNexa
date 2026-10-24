/**
 * TypeScript type definitions matching exact AutoNexa FastAPI backend schemas.
 */

export interface HealthResponse {
  status: string;
  app_name: string;
  version?: string;
  app_version?: string;
  environment?: string;
  debug?: boolean;
}

export interface DatasetProfileResponse {
  dataset_id: string;
  filename: string;
  rows: number;
  columns: number;
  column_names: string[];
  data_types: Record<string, string>;
  missing_values: Record<string, number>;
  duplicate_rows: number;
  memory_usage_bytes: number;
  file_size_bytes: number;
  // Optional client-side preview rows cached when uploaded via browser
  preview_rows?: Array<Record<string, unknown>>;
  // Backward compatibility accessors
  row_count?: number;
  column_count?: number;
  missing_values_count?: number;
  duplicate_rows_count?: number;
}

export interface DatasetSummary extends DatasetProfileResponse {
  fingerprint_sha256: string;
  validation_status: string;
  created_at: string;
  updated_at: string;
  associated_experiments_count?: number;
  associated_pipelines_count?: number;
}

export interface DatasetListResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  datasets: DatasetSummary[];
}

export type ColumnRole = "numeric" | "categorical" | "identifier" | "datetime" | "text" | "target" | "unknown";
export type WarningSeverity = "info" | "warning" | "critical";

export interface ColumnSummary {
  name: string;
  inferred_type: string;
  role: ColumnRole;
  missing_count: number;
  missing_percentage: number;
  unique_count: number;
  is_constant: boolean;
  is_near_constant: boolean;
  is_high_cardinality: boolean;
}

export interface TargetCandidate {
  column_name: string;
  reason: string;
  suggested_task: string;
}

export interface QualityWarning {
  code: string;
  category: string;
  severity: WarningSeverity;
  column?: string | null;
  message: string;
}

export interface TaskRecommendation {
  target_column: string;
  task_type: string;
  confidence: string;
  rationale: string;
  class_distribution?: Record<string, number> | null;
  is_class_imbalanced?: boolean | null;
  minority_class_percentage?: number | null;
  heuristic_disclaimer?: string;
}

export interface AnalysisRequest {
  target_column?: string | null;
  task_override?: "classification" | "regression" | null;
}

export interface AnalysisResponse {
  dataset_id: string;
  rows: number;
  columns: number;
  column_summaries: ColumnSummary[];
  numeric_columns: string[];
  categorical_columns: string[];
  duplicate_rows_count: number;
  duplicate_rows_percentage: number;
  candidate_targets: TargetCandidate[];
  quality_warnings: QualityWarning[];
  task_recommendation?: TaskRecommendation | null;
}

export type ModelStatus = "successful" | "failed" | "skipped_timeout";

export interface ModelEvaluationResult {
  model_id: string;
  model_name: string;
  status: ModelStatus;
  metrics: Record<string, any>;
  cv_scores?: number[] | null;
  cv_mean?: number | null;
  cv_std?: number | null;
  valid_folds_count?: number | null;
  fold_metrics?: Array<Record<string, any>> | null;
  duration_seconds: number;
  error_message?: string | null;
}

export interface TrainingRequest {
  target_column: string;
  task_type?: "classification" | "regression" | null;
  evaluation_strategy?: "holdout" | "cross_validation";
  cv_folds?: number;
  cv_rare_class_fallback?: boolean;
  holdout_test?: boolean;
  test_size?: number;
  random_state?: number;
  time_budget_seconds?: number;
  models?: string[] | null;
  primary_metric?: string | null;
}

export interface TrainingResponse {
  experiment_id: string;
  dataset_id: string;
  dataset_fingerprint: string;
  target_column: string;
  task_type: string;
  evaluation_strategy: string;
  cv_folds?: number | null;
  primary_metric: string;
  primary_metric_greater_is_better: boolean;
  random_state: number;
  test_size: number;
  train_rows: number;
  test_rows: number;
  features_count: number;
  feature_names?: string[] | null;
  models_evaluated: ModelEvaluationResult[];
  ranked_models: string[];
  best_model?: string | null;
  best_score?: number | null;
  test_metrics?: Record<string, any> | null;
  total_duration_seconds: number;
  artifacts_saved: boolean;
  mlflow_run_id?: string | null;
  mlflow_experiment_id?: string | null;
  tracking_status: string;
  tracking_warning?: string | null;
  evaluation_protocol: string;
  disclaimer: string;
}

export interface ArtifactAvailability {
  metadata_exists: boolean;
  model_file_exists: boolean;
  model_format: string;
  model_size_bytes?: number | null;
  model_sha256?: string | null;
}

export interface ExperimentInspectionResponse {
  experiment_id: string;
  status: string;
  dataset_id: string;
  dataset_fingerprint: string;
  target_column: string;
  task_type: string;
  evaluation_strategy: string;
  primary_metric: string;
  primary_metric_greater_is_better?: boolean | null;
  best_model?: string | null;
  best_score?: number | null;
  test_metrics?: Record<string, any> | null;
  ranked_models: string[];
  features_count: number;
  feature_names: string[];
  numeric_features?: string[] | null;
  categorical_features?: string[] | null;
  artifact_availability: ArtifactAvailability;
  tracking_status: string;
  mlflow_run_id?: string | null;
  mlflow_experiment_id?: string | null;
  tracking_warning?: string | null;
  evaluation_protocol?: string | null;
  total_duration_seconds?: number | null;
  package_versions?: Record<string, string> | null;
  security_notice: string;
}

export interface PredictionRequest {
  records: Array<Record<string, any>>;
}

export interface PredictionResponse {
  experiment_id: string;
  task_type: string;
  target_column: string;
  selected_model: string;
  prediction_count: number;
  predictions: any[];
  probabilities?: Array<Record<string, number>> | null;
  class_labels?: string[] | null;
  warnings?: string[] | null;
}

// ==========================================
// Phase 8: Model Explainability Interfaces
// ==========================================

export interface FeatureImportanceItem {
  feature: string;
  importance: number;
  importance_std?: number | null;
  normalized_importance?: number | null;
  rank: number;
}

export interface TransformedFeatureImportanceItem {
  transformed_feature: string;
  source_feature: string;
  label: string;
  importance: number;
  normalized_importance?: number | null;
}

export interface GlobalFeatureImportanceResponse {
  experiment_id: string;
  model_id: string;
  model_name: string;
  task_type: string;
  target_column: string;
  importance_method: string;
  sample_size: number;
  features_count: number;
  feature_importances: FeatureImportanceItem[];
  transformed_feature_importances?: TransformedFeatureImportanceItem[] | null;
  evaluation_partition: string;
  random_state?: number | null;
  method_details: string;
  scientific_limitations: string;
}

export interface FeatureContribution {
  feature: string;
  value: any;
  contribution: number;
  relative_share?: number | null;
  details?: Array<{ label: string; attribution: number }> | null;
}

export interface InstanceExplanation {
  record_index: number;
  input_features: Record<string, any>;
  prediction: any;
  prediction_probabilities?: Record<string, number> | null;
  base_value: number;
  predicted_value?: number | null;
  feature_contributions: FeatureContribution[];
  class_attributions?: Record<string, FeatureContribution[]> | null;
}

export interface PredictionExplanationRequest {
  records: Array<Record<string, any>>;
  method?: "auto" | "shap" | "fallback";
}

export interface PredictionExplanationResponse {
  experiment_id: string;
  model_id: string;
  task_type: string;
  target_column: string;
  explanation_method: string;
  explanation_count: number;
  explanations: InstanceExplanation[];
  baseline_summary: string;
  scientific_limitations: string;
}

// ==========================================
// Phase 8: Prediction Error Analysis Interfaces
// ==========================================

export interface ErrorAnalysisRequest {
  split?: "test" | "train" | "full";
  max_error_examples?: number;
  custom_records?: Array<Record<string, any>> | null;
}

export interface ClassErrorSummary {
  class_label: string;
  precision?: number | null;
  recall?: number | null;
  f1_score?: number | null;
  support: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  true_negatives: number;
}

export interface ConfidenceBucket {
  bin_range: string;
  mean_confidence: number;
  observed_accuracy: number;
  sample_count: number;
}

export interface MisclassifiedInstance {
  record_index: number;
  true_label: string;
  predicted_label: string;
  confidence?: number | null;
  probabilities?: Record<string, number> | null;
  input_features: Record<string, any>;
}

export interface ClassificationErrorAnalysis {
  accuracy: number;
  balanced_accuracy?: number | null;
  f1_weighted?: number | null;
  f1_macro?: number | null;
  brier_score_loss?: number | null;
  confusion_matrix: number[][];
  class_labels: string[];
  class_metrics: ClassErrorSummary[];
  total_samples: number;
  misclassified_count: number;
  error_rate: number;
  class_imbalance_ratio?: number | null;
  confidence_buckets?: ConfidenceBucket[] | null;
  top_misclassified_examples: MisclassifiedInstance[];
}

export interface RegressionResidualSummary {
  mean_residual: number;
  std_residual: number;
  min_residual: number;
  p25_residual: number;
  median_residual: number;
  p75_residual: number;
  max_residual: number;
  mae: number;
  rmse: number;
  median_absolute_error: number;
  r2_score?: number | null;
  max_absolute_error: number;
}

export interface FeatureErrorCorrelation {
  feature_name: string;
  correlation_with_absolute_error: number;
  interpretation: string;
}

export interface CategoryErrorSlice {
  feature_name: string;
  category_value: string;
  mae: number;
  sample_count: number;
}

export interface RegressionOutlierInstance {
  record_index: number;
  true_value: number;
  predicted_value: number;
  residual: number;
  absolute_error: number;
  input_features: Record<string, any>;
}

export interface RegressionErrorAnalysis {
  total_samples: number;
  residual_summary: RegressionResidualSummary;
  feature_error_correlations: FeatureErrorCorrelation[];
  categorical_slices?: CategoryErrorSlice[] | null;
  top_error_examples: RegressionOutlierInstance[];
}

export interface ErrorAnalysisResponse {
  experiment_id: string;
  model_id: string;
  task_type: string;
  target_column: string;
  evaluation_split: string;
  sample_size: number;
  is_independent_test_evaluation: boolean;
  classification_analysis?: ClassificationErrorAnalysis | null;
  regression_analysis?: RegressionErrorAnalysis | null;
  evaluation_notice: string;
}

// ==========================================
// Phase 8: Research Benchmarking Interfaces
// ==========================================

export interface BenchmarkCompareRequest {
  experiment_ids: string[];
  baseline_experiment_id?: string | null;
  sort_metric?: string | null;
}

export interface ComparabilityWarning {
  dimension: string;
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface ModelBenchmarkEntry {
  rank: number;
  experiment_id: string;
  model_id: string;
  model_name: string;
  task_type: string;
  target_column: string;
  dataset_id: string;
  dataset_fingerprint: string;
  evaluation_strategy: string;
  random_state?: number | null;
  test_size?: number | null;
  train_rows?: number | null;
  test_rows?: number | null;
  features_count: number;
  primary_metric_name: string;
  primary_metric_score?: number | null;
  metrics: Record<string, any>;
  training_duration_seconds?: number | null;
  is_baseline: boolean;
  delta_primary_metric?: number | null;
  delta_percentage?: number | null;
  package_versions?: Record<string, string> | null;
  mlflow_run_id?: string | null;
}

export interface BenchmarkComparisonResponse {
  benchmark_id: string;
  task_type: string;
  sort_metric: string;
  sort_metric_greater_is_better: boolean;
  is_strictly_comparable: boolean;
  comparability_verdict: "strictly_comparable" | "conditionally_comparable" | "non_comparable";
  comparability_warnings: ComparabilityWarning[];
  baseline_experiment_id?: string | null;
  models_compared_count: number;
  leaderboard: ModelBenchmarkEntry[];
  reproducibility_manifest: Record<string, any>;
  scientific_guidance: string;
}

// ==========================================
// Phase 9: Research Experimental Validation & Benchmarking
// ==========================================

export interface ExperimentalProtocol {
  protocol_version: string;
  dataset_id: string;
  dataset_fingerprint: string;
  target_column: string;
  task_type: string;
  evaluation_strategy: string;
  cv_folds: number;
  test_size: number;
  configured_seeds: number[];
  models?: string[] | null;
  primary_metric: string;
  greater_is_better: boolean;
  fixed_split: boolean;
  bootstrap_resamples: number;
  variability_source: string;
  hardware_metadata: Record<string, any>;
  package_versions: Record<string, string>;
  reproducibility_notes: string;
}

export interface IndividualRunRecord {
  run_index: number;
  seed: number;
  status: "successful" | "failed";
  experiment_id?: string | null;
  best_model?: string | null;
  best_model_name?: string | null;
  best_validation_score?: number | null;
  test_metrics: Record<string, number>;
  duration_seconds: number;
  peak_memory_bytes?: number | null;
  error_message?: string | null;
}

export interface MetricStatisticalSummary {
  metric_name: string;
  valid_runs: number;
  mean: number;
  std?: number | null;
  median: number;
  q25?: number | null;
  q75?: number | null;
  iqr?: number | null;
  min: number;
  max: number;
  ci_95_t?: [number, number] | null;
  ci_95_bootstrap?: [number, number] | null;
  interpretation_notes: string;
}

export interface BaselineComparisonResult {
  baseline_name: string;
  baseline_strategy: string;
  baseline_metrics: Record<string, any>;
  model_metrics: Record<string, any>;
  primary_metric: string;
  delta_absolute: number;
  delta_percentage?: number | null;
  selection_quality: "outperformed" | "tied" | "underperformed";
  notes: string;
}

export interface ResourceEfficiencyReport {
  total_wall_clock_seconds: number;
  avg_fit_duration_seconds: number;
  avg_eval_duration_seconds: number;
  prediction_latency_ms_per_sample?: number | null;
  prediction_throughput_samples_per_sec?: number | null;
  model_artifact_size_bytes?: number | null;
  peak_memory_bytes?: number | null;
  hardware_metadata: Record<string, any>;
  efficiency_score_ratio?: number | null;
}

export interface RepeatedRunGroupResponse {
  run_group_id: string;
  dataset_id: string;
  dataset_fingerprint: string;
  target_column: string;
  task_type: string;
  protocol: ExperimentalProtocol;
  n_requested_runs: number;
  n_successful_runs: number;
  n_failed_runs: number;
  primary_metric: string;
  greater_is_better: boolean;
  metric_summaries: Record<string, MetricStatisticalSummary>;
  runs: IndividualRunRecord[];
  baseline_comparisons: BaselineComparisonResult[];
  resource_efficiency: ResourceEfficiencyReport;
  comparability_verdict: "strictly_comparable" | "conditionally_comparable" | "non_comparable";
  scientific_disclaimer: string;
}

export interface RepeatedRunRequest {
  dataset_id: string;
  target_column: string;
  task_type?: string | null;
  seeds?: number[];
  models?: string[] | null;
  evaluation_strategy?: "holdout" | "cross_validation";
  cv_folds?: number;
  test_size?: number;
  primary_metric?: string | null;
  fixed_split?: boolean;
  bootstrap_resamples?: number;
}

export interface BaselineComparisonRequest {
  experiment_id: string;
  primary_metric?: string | null;
}

export interface LaTeXExportResponse {
  run_group_id: string;
  latex: string;
}

// ==========================================
// Phase 10A: Controlled HPO Research Experiment
// ==========================================

export interface ParameterDomain {
  name: string;
  param_type: "int" | "float" | "categorical";
  low?: number | null;
  high?: number | null;
  step?: number | null;
  log: boolean;
  choices?: any[] | null;
  description?: string | null;
}

export interface HyperparameterSpace {
  model_id: string;
  model_name: string;
  task_type: string;
  parameters: ParameterDomain[];
}

export interface HPOTrialRecord {
  trial_number: number;
  strategy: "random_search" | "bayesian_optimization";
  parameters: Record<string, any>;
  validation_score?: number | null;
  status: "completed" | "failed" | "timeout";
  duration_seconds: number;
  best_so_far_score?: number | null;
  error_message?: string | null;
}

export interface HPOStrategyReplicateResult {
  strategy: "random_search" | "bayesian_optimization";
  seed: number;
  total_trials: number;
  completed_trials: number;
  failed_trials: number;
  total_duration_seconds: number;
  time_to_best_seconds: number;
  trial_to_best: number;
  best_trial_number: number;
  best_parameters: Record<string, any>;
  best_validation_score: number;
  test_score: number;
  test_metrics: Record<string, any>;
  baseline_default_validation_score?: number | null;
  improvement_over_default?: number | null;
  improvement_over_initial?: number | null;
  trials: HPOTrialRecord[];
  convergence_history: number[];
}

export interface HPOReplicateComparison {
  replicate_index: number;
  seed: number;
  random_search: HPOStrategyReplicateResult;
  bayesian_optimization: HPOStrategyReplicateResult;
  delta_validation: number;
  delta_test: number;
  validation_winner: "bayesian" | "random" | "tied";
  test_winner: "bayesian" | "random" | "tied";
}

export interface HPOStrategyAggregateSummary {
  strategy: "random_search" | "bayesian_optimization";
  n_replicates: number;
  validation_mean: number;
  validation_std?: number | null;
  validation_median: number;
  validation_min: number;
  validation_max: number;
  test_mean: number;
  test_std?: number | null;
  test_median: number;
  test_min: number;
  test_max: number;
  avg_total_duration_seconds: number;
  avg_time_to_best_seconds: number;
  avg_trial_to_best: number;
  mean_convergence_curve: number[];
}

export interface HPOStatisticalComparison {
  metric_name: string;
  greater_is_better: boolean;
  n_replicates: number;
  mean_validation_difference: number;
  std_validation_difference?: number | null;
  mean_test_difference: number;
  std_test_difference?: number | null;
  t_statistic_validation?: number | null;
  p_value_validation?: number | null;
  t_statistic_test?: number | null;
  p_value_test?: number | null;
  bayesian_validation_wins: number;
  random_validation_wins: number;
  validation_ties: number;
  bayesian_test_wins: number;
  random_test_wins: number;
  test_ties: number;
  scientific_conclusion: string;
  uncertainty_limitations: string;
}

export interface HPOExperimentProtocol {
  protocol_version: string;
  protocol_id: string;
  dataset_id: string;
  dataset_name: string;
  dataset_fingerprint: string;
  dataset_shape: number[];
  target_column: string;
  task_type: string;
  model_id: string;
  model_name: string;
  search_space: HyperparameterSpace;
  trial_budget: number;
  seeds: number[];
  evaluation_strategy: string;
  cv_folds?: number | null;
  test_size: number;
  primary_metric: string;
  greater_is_better: boolean;
  bayesian_library: string;
  bayesian_surrogate: string;
  n_startup_trials: number;
  software_manifest: Record<string, string>;
  hardware_metadata: Record<string, any>;
}

export interface HPOExperimentRequest {
  dataset_id: string;
  target_column: string;
  task_type?: string | null;
  model_id?: string;
  trial_budget?: number;
  seeds?: number[];
  evaluation_strategy?: "cross_validation" | "holdout";
  cv_folds?: number;
  test_size?: number;
  primary_metric?: string | null;
}

export interface HPOExperimentResponse {
  experiment_id: string;
  created_at: string;
  protocol: HPOExperimentProtocol;
  replicates: HPOReplicateComparison[];
  random_search_summary: HPOStrategyAggregateSummary;
  bayesian_summary: HPOStrategyAggregateSummary;
  statistical_comparison: HPOStatisticalComparison;
  overall_winner: "bayesian_optimization" | "random_search" | "inconclusive";
  total_wall_clock_seconds: number;
  csv_export_url: string;
}

// ============================================================================
// Phase 10B: Multi-Objective AutoML Optimization & Resource-Aware Selection
// ============================================================================

export type ObjectiveDirection = "maximize" | "minimize";

export type SelectionPolicy =
  | "best_performance_constrained"
  | "lowest_latency_constrained"
  | "lowest_size_constrained"
  | "balanced_compromise";

export interface ObjectiveDefinition {
  name: string;
  key: string;
  direction: ObjectiveDirection;
  unit: string;
  description: string;
}

export interface ResourceConstraints {
  max_training_duration_seconds?: number | null;
  max_inference_latency_ms?: number | null;
  max_artifact_size_bytes?: number | null;
  max_peak_memory_bytes?: number | null;
  min_predictive_score?: number | null;
  max_complexity?: number | null;
}

export interface ConstraintViolation {
  constraint_name: string;
  threshold: number;
  actual_value: number;
  unit: string;
  message: string;
}

export interface ModelComplexityMetadata {
  estimator_type: string;
  tree_count?: number | null;
  max_depth?: number | null;
  total_tree_nodes?: number | null;
  leaf_count?: number | null;
  n_parameters?: number | null;
  n_nonzero_coefficients?: number | null;
  summary_complexity_score: number;
  complexity_unit: string;
  notes: string;
}

export interface CandidateMeasurement {
  candidate_id: string;
  model_id: string;
  model_name: string;
  hyperparameters: Record<string, any>;
  status: "completed" | "failed";
  error_message?: string | null;
  predictive_metric: string;
  predictive_direction: ObjectiveDirection;
  validation_score?: number | null;
  cv_std?: number | null;
  training_duration_seconds: number;
  inference_latency_ms_per_sample: number;
  inference_throughput_samples_per_sec: number;
  model_artifact_size_bytes: number;
  peak_memory_bytes?: number | null;
  complexity: ModelComplexityMetadata;
  test_score?: number | null;
  test_metrics?: Record<string, any> | null;
}

export interface ParetoCandidateResult {
  measurement: CandidateMeasurement;
  is_feasible: boolean;
  constraint_violations: ConstraintViolation[];
  is_pareto_optimal: boolean;
  dominated_by: string[];
  dominates: string[];
  status_explanation: string;
  normalized_scores: Record<string, number>;
  distance_to_utopia?: number | null;
}

export interface MultiObjectiveSelectionRequest {
  constraints?: ResourceConstraints | null;
  policy: SelectionPolicy;
  custom_weights?: Record<string, number> | null;
}

export interface MultiObjectiveSelectionResult {
  selected_candidate_id?: string | null;
  policy_used: SelectionPolicy;
  satisfies_all_constraints: boolean;
  feasible_candidates_count: number;
  infeasible_candidates_count: number;
  selection_explanation: string;
  selected_candidate?: ParetoCandidateResult | null;
  tied_candidate_ids: string[];
  untouched_test_evaluation?: Record<string, any> | null;
}

export interface MultiObjectiveExperimentRequest {
  dataset_id: string;
  target_column: string;
  task_type?: string | null;
  candidate_models?: string[] | null;
  include_hpo_candidates?: boolean;
  evaluation_strategy?: "cross_validation" | "holdout";
  cv_folds?: number;
  test_size?: number;
  primary_metric?: string | null;
  random_state?: number;
  constraints?: ResourceConstraints | null;
  selection_policy?: SelectionPolicy;
}

export interface MultiObjectiveExperimentResponse {
  experiment_id: string;
  created_at: string;
  dataset_id: string;
  dataset_name: string;
  dataset_fingerprint: string;
  task_type: string;
  primary_metric: string;
  objectives_evaluated: ObjectiveDefinition[];
  candidates: ParetoCandidateResult[];
  pareto_frontier_candidate_ids: string[];
  selection: MultiObjectiveSelectionResult;
  execution_platform: Record<string, any>;
  profiling_methodology_disclaimer: string;
  csv_export_url: string;
}

// ==========================================
// Phase 11: Robust AutoML Benchmarking & Statistical Reliability
// ==========================================

export interface DatasetCatalogEntry {
  dataset_id: string;
  name: string;
  source: "local_fixture" | "openml" | "pmlb" | "custom";
  provenance: string;
  license: string;
  task_type: "binary_classification" | "multiclass_classification" | "regression";
  target_column: string;
  n_rows: number;
  n_features: number;
  numeric_features_count: number;
  categorical_features_count: number;
  has_missing_values: boolean;
  missing_cells_count: number;
  dataset_fingerprint: string;
  is_cached: boolean;
  description: string;
}

export interface PairedSeedDifferenceRecord {
  seed: number;
  score_a: number;
  score_b: number;
  delta: number;
}

export interface PairedComparisonResult {
  method_a: string;
  method_b: string;
  metric_name: string;
  greater_is_better: boolean;
  n_matched_seeds: number;
  mean_difference: number;
  std_difference?: number | null;
  ci_95_difference?: [number, number] | null;
  cohens_dz?: number | null;
  cohens_dz_magnitude: "negligible" | "small" | "medium" | "large" | "zero";
  t_statistic?: number | null;
  t_test_p_value?: number | null;
  wilcoxon_statistic?: number | null;
  wilcoxon_p_value?: number | null;
  bonferroni_adjusted_p_value?: number | null;
  verdict:
    | "statistically_superior"
    | "statistically_inferior"
    | "inconclusive_high_variance"
    | "statistically_equivalent"
    | "insufficient_sample_size";
  per_seed_differences: PairedSeedDifferenceRecord[];
  interpretation: string;
}

export interface SeedRunRecord {
  run_id: string;
  seed: number;
  method_name: string;
  status: "completed" | "failed";
  validation_score?: number | null;
  holdout_test_score?: number | null;
  training_duration_seconds: number;
  inference_latency_ms: number;
  inference_throughput_sec: number;
  model_artifact_size_bytes: number;
  peak_heap_bytes?: number | null;
  peak_process_rss_bytes?: number | null;
  rss_delta_bytes?: number | null;
  complexity_score: number;
  complexity_unit: string;
  error_message?: string | null;
}

export interface MethodAggregateStatistics {
  method_name: string;
  n_seeds_requested: number;
  n_seeds_successful: number;
  n_seeds_failed: number;
  validation_score: MetricStatisticalSummary;
  holdout_test_score?: MetricStatisticalSummary | null;
  training_duration_seconds: MetricStatisticalSummary;
  inference_latency_ms: MetricStatisticalSummary;
  model_artifact_size_bytes: MetricStatisticalSummary;
  peak_heap_bytes: MetricStatisticalSummary;
  peak_process_rss_bytes?: MetricStatisticalSummary | null;
  rss_delta_bytes?: MetricStatisticalSummary | null;
}

export interface RobustBenchmarkRequest {
  dataset_id: string;
  target_column?: string | null;
  task_type?: string | null;
  seeds?: number[];
  candidate_strategies?: string[] | null;
  baseline_strategy?: string | null;
  evaluation_strategy?: "cross_validation" | "holdout";
  cv_folds?: number;
  test_size?: number;
  primary_metric?: string | null;
  alpha?: number;
  bootstrap_resamples?: number;
}

export interface RobustBenchmarkResponse {
  robust_benchmark_id: string;
  created_at: string;
  dataset: DatasetCatalogEntry;
  seeds_evaluated: number[];
  primary_metric: string;
  greater_is_better: boolean;
  baseline_strategy: string;
  method_summaries: Record<string, MethodAggregateStatistics>;
  paired_comparisons: PairedComparisonResult[];
  raw_seed_runs: SeedRunRecord[];
  execution_platform: Record<string, any>;
  scientific_guidance: string;
  csv_export_url: string;
}

// ==========================================
// Phase 12: Experiment Tracking & Model Registry
// ==========================================

export type LifecycleStage = "development" | "staging" | "production" | "archived";

export interface ExperimentSummary {
  experiment_id: string;
  name?: string | null;
  description?: string | null;
  dataset_id: string;
  dataset_fingerprint: string;
  task_type: string;
  target_column: string;
  status: string;
  best_model?: string | null;
  best_score?: number | null;
  primary_metric: string;
  primary_metric_greater_is_better?: boolean | null;
  evaluation_strategy?: string | null;
  total_duration_seconds?: number | null;
  created_at: string;
  models_count: number;
  has_artifact: boolean;
}

export interface ExperimentListResponse {
  items: ExperimentSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ExperimentDetailResponse {
  experiment_id: string;
  name?: string | null;
  description?: string | null;
  status: string;
  dataset_id: string;
  dataset_fingerprint: string;
  target_column: string;
  task_type: string;
  evaluation_strategy: string;
  cv_folds?: number | null;
  primary_metric: string;
  primary_metric_greater_is_better?: boolean | null;
  random_state?: number | null;
  test_size?: number | null;
  train_rows?: number | null;
  test_rows?: number | null;
  features_count?: number | null;
  feature_names?: string[] | null;
  numeric_features?: string[] | null;
  categorical_features?: string[] | null;
  ranked_models?: string[] | null;
  best_model?: string | null;
  best_score?: number | null;
  test_metrics?: Record<string, any> | null;
  evaluation_protocol?: string | null;
  total_duration_seconds?: number | null;
  models_evaluated?: Array<Record<string, any>> | null;
  artifacts?: Record<string, any> | null;
  package_versions?: Record<string, string> | null;
  system_info?: Record<string, string> | null;
  created_at?: string | null;
  error_info?: Record<string, any> | null;
}

export interface ExperimentCompareRequest {
  experiment_ids: string[];
}

export interface ExperimentComparisonItem {
  experiment_id: string;
  name?: string | null;
  dataset_id: string;
  dataset_fingerprint: string;
  task_type: string;
  target_column: string;
  best_model?: string | null;
  primary_metric: string;
  best_score?: number | null;
  test_metrics?: Record<string, any> | null;
  metrics: Record<string, number | null>;
  duration_seconds?: number | null;
  features_count?: number | null;
  train_rows?: number | null;
  evaluation_strategy?: string | null;
  cv_folds?: number | null;
  random_state?: number | null;
  package_versions?: Record<string, string> | null;
  has_artifact: boolean;
  registered_version?: string | null;
}

export interface ExperimentComparisonResponse {
  experiments: ExperimentComparisonItem[];
  common_dataset: boolean;
  common_task: boolean;
  metric_comparison: Record<string, Record<string, number | null>>;
  metric_directions: Record<string, boolean>;
  best_per_metric: Record<string, string>;
  compatibility_warning?: string | null;
  statistical_summary?: Record<string, any> | null;
}

export interface ReproducibilityManifest {
  manifest_version: string;
  experiment_id: string;
  created_at: string;
  dataset: Record<string, any>;
  configuration: Record<string, any>;
  preprocessing: Record<string, any>;
  model: Record<string, any>;
  environment: Record<string, any>;
  metrics: Record<string, any>;
  artifact: Record<string, any>;
  reproducibility_level: string;
  scientific_disclaimer: string;
  manifest_sha256?: string | null;
}

export interface ModelRegistrationRequest {
  experiment_id: string;
  model_name: string;
  description?: string | null;
  tags?: string[];
  initial_stage?: LifecycleStage;
}

export interface StageTransitionRequest {
  new_stage: LifecycleStage;
  reason?: string | null;
}

export interface LifecycleAuditEntry {
  timestamp: string;
  from_stage: string;
  to_stage: string;
  reason?: string | null;
  operator: string;
}

export interface ModelVersionRecord {
  model_name: string;
  version: number;
  version_tag: string;
  experiment_id: string;
  stage: LifecycleStage;
  task_type: string;
  model_family: string;
  primary_metric: string;
  score?: number | null;
  test_metrics?: Record<string, any> | null;
  dataset_id: string;
  dataset_fingerprint: string;
  artifact_filename: string;
  artifact_sha256: string;
  artifact_size_bytes: number;
  status: string;
  description?: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  audit_history: LifecycleAuditEntry[];
}

export interface RegisteredModelSummary {
  model_name: string;
  latest_version: number;
  production_version?: number | null;
  staging_version?: number | null;
  versions_count: number;
  task_type: string;
  latest_primary_metric: string;
  latest_score?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ModelRegistryListResponse {
  models: RegisteredModelSummary[];
  total: number;
}

export interface ArtifactVerificationResponse {
  verified: boolean;
  expected_sha256: string;
  actual_sha256?: string | null;
  size_bytes?: number | null;
  artifact_exists: boolean;
  message: string;
}

// ==========================================
// Phase 13: Secure Model Serving & Deployment
// ==========================================

export interface ServingModelSummary {
  model_name: string;
  active_version?: number | null;
  active_stage?: string | null;
  task_type: string;
  model_family: string;
  primary_metric: string;
  score?: number | null;
  serving_status: "active" | "ineligible";
  available_versions: number[];
  production_version?: number | null;
  staging_version?: number | null;
}

export interface ServingModelDetailResponse {
  model_name: string;
  version: number;
  version_tag: string;
  stage: string;
  task_type: string;
  model_family: string;
  score?: number | null;
  primary_metric: string;
  feature_names: string[];
  numeric_features?: string[] | null;
  categorical_features?: string[] | null;
  supports_probabilities: boolean;
  classes?: any[] | null;
  artifact_sha256: string;
  artifact_size_bytes: number;
  created_at: string;
  is_cached: boolean;
}

export interface ServingHealthResponse {
  status: "healthy" | "degraded";
  model_name: string;
  version: number;
  stage: string;
  artifact_verified: boolean;
  loaded_in_cache: boolean;
  message: string;
}

export interface ServingPredictionRequest {
  records: Record<string, any>[];
}

export interface ServingPredictionResponse {
  model_name: string;
  version: number;
  version_tag: string;
  stage: string;
  task_type: string;
  records_count: number;
  predictions: any[];
  probabilities?: Record<string, number>[] | null;
  latency_ms: number;
  timestamp: string;
}

export interface ServingMetricsResponse {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  validation_errors: number;
  integrity_errors: number;
  average_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  models_served: Record<
    string,
    {
      model_name: string;
      version: number;
      total_requests: number;
      successful_requests: number;
      failed_requests: number;
      avg_latency_ms: number;
      min_latency_ms: number;
      max_latency_ms: number;
      last_request_at?: string | null;
    }
  >;
}

export interface CacheInvalidationResponse {
  model_name: string;
  version?: number | null;
  evicted: boolean;
  message: string;
}

// ==========================================
// Phase 14: Model Monitoring, Drift Detection & Retraining Interfaces
// ==========================================

export type DriftMethodType =
  | "psi"
  | "ks_2samp"
  | "categorical_psi"
  | "unseen_categories"
  | "missing_rate_delta";

export type DriftStatusType =
  | "no_drift"
  | "warning"
  | "drift_detected"
  | "insufficient_data";

export type AlertSeverityType = "info" | "warning" | "critical";

export type AlertStatusType = "active" | "acknowledged" | "resolved";

export type RetrainingPolicyType =
  | "performance_degradation"
  | "sustained_drift"
  | "manual";

export type RetrainingJobStatusType =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type CandidateValidationStatusType =
  | "pending"
  | "passed"
  | "rejected"
  | "failed";

export interface NumericalFeatureSummary {
  feature_name: string;
  count: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  p25: number;
  p50: number;
  p75: number;
  missing_count: number;
  missing_rate: number;
  bin_edges: number[];
  bin_counts: number[];
}

export interface CategoricalFeatureSummary {
  feature_name: string;
  total_count: number;
  distinct_categories: number;
  category_frequencies: Record<string, number>;
  category_counts: Record<string, number>;
  missing_count: number;
  missing_rate: number;
}

export interface ReferenceProfileCreate {
  model_name: string;
  version?: number | null;
  dataset_id: string;
  split_source?: string;
  description?: string | null;
}

export interface ReferenceProfileResponse {
  profile_id: string;
  model_name: string;
  version: number;
  dataset_id: string;
  dataset_fingerprint: string;
  split_source: string;
  sample_count: number;
  numerical_features: Record<string, NumericalFeatureSummary>;
  categorical_features: Record<string, CategoricalFeatureSummary>;
  feature_names: string[];
  created_at: string;
  is_active: boolean;
}

export interface MonitoringWindowCreate {
  model_name: string;
  version?: number | null;
  window_id?: string | null;
  records: Record<string, any>[];
  prediction_ids?: string[] | null;
}

export interface MonitoringWindowResponse {
  window_id: string;
  model_name: string;
  version: number;
  record_count: number;
  created_at: string;
  feature_names: string[];
  status: string;
}

export interface FeatureDriftResult {
  feature_name: string;
  feature_type: "numerical" | "categorical";
  drift_method: DriftMethodType;
  statistic: number;
  p_value?: number | null;
  threshold: number;
  drift_status: DriftStatusType;
  ref_sample_count: number;
  cur_sample_count: number;
  ref_missing_rate: number;
  cur_missing_rate: number;
  missing_rate_delta: number;
  unseen_categories_count?: number | null;
  unseen_categories_rate?: number | null;
  warnings: string[];
  distribution_summary?: Record<string, any> | null;
}

export interface MultivariateDriftResult {
  method: string;
  statistic: number;
  threshold: number;
  drift_detected: boolean;
  explanation: string;
}

export interface DriftAnalysisRequest {
  model_name: string;
  version?: number | null;
  reference_profile_id?: string | null;
  window_id?: string | null;
  records?: Record<string, any>[] | null;
  psi_warning_threshold?: number | null;
  psi_critical_threshold?: number | null;
  ks_pvalue_threshold?: number | null;
}

export interface DriftAnalysisResponse {
  report_id: string;
  model_name: string;
  version: number;
  reference_profile_id: string;
  window_id?: string | null;
  sample_count: number;
  features_evaluated_count: number;
  drifted_features_count: number;
  warning_features_count: number;
  drift_share: number;
  overall_status: DriftStatusType;
  feature_results: FeatureDriftResult[];
  multivariate_result?: MultivariateDriftResult | null;
  data_quality_warnings: string[];
  timestamp: string;
}

export interface GroundTruthRecord {
  prediction_id?: string | null;
  record_index?: number | null;
  true_label: any;
}

export interface GroundTruthIngestRequest {
  model_name: string;
  version?: number | null;
  window_id?: string | null;
  labels: GroundTruthRecord[];
}

export interface GroundTruthIngestResponse {
  ingested_count: number;
  duplicate_count: number;
  matched_count: number;
  unmatched_count: number;
  message: string;
}

export interface PerformanceMetricReport {
  report_id: string;
  model_name: string;
  version: number;
  task_type: string;
  evaluation_window_id?: string | null;
  sample_size: number;
  baseline_metric_name: string;
  baseline_metric_score?: number | null;
  current_metric_score?: number | null;
  metric_delta?: number | null;
  metric_delta_percentage?: number | null;
  metrics: Record<string, any>;
  degradation_detected: boolean;
  degradation_percentage?: number | null;
  warnings: string[];
  evaluated_at: string;
}

export interface MonitoringAlertRecord {
  alert_id: string;
  model_name: string;
  version: number;
  alert_type: string;
  severity: AlertSeverityType;
  status: AlertStatusType;
  message: string;
  evidence: Record<string, any>;
  created_at: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
}

export interface AlertAcknowledgeRequest {
  acknowledged_by?: string | null;
  note?: string | null;
}

export interface CandidateValidationResult {
  status: CandidateValidationStatusType;
  candidate_model_id: string;
  candidate_score: number;
  baseline_score: number;
  metric_name: string;
  regression_percentage: number;
  tolerance_percentage: number;
  passed: boolean;
  details: Record<string, any>;
  reasons: string[];
}

export interface RetrainingJobTriggerRequest {
  model_name: string;
  version?: number | null;
  dataset_id: string;
  trigger_policy?: RetrainingPolicyType;
  trigger_evidence?: Record<string, any> | null;
  target_column?: string | null;
  time_budget_seconds?: number | null;
  tolerance_percentage?: number | null;
}

export interface RetrainingJobRecord {
  job_id: string;
  model_name: string;
  source_version: number;
  dataset_id: string;
  dataset_fingerprint: string;
  trigger_policy: RetrainingPolicyType;
  trigger_reason: string;
  status: RetrainingJobStatusType;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  experiment_id?: string | null;
  candidate_model_id?: string | null;
  candidate_version?: number | null;
  candidate_validation?: CandidateValidationResult | null;
  promoted_to_stage?: string | null;
  promotion_timestamp?: string | null;
  error_message?: string | null;
}

export interface RetrainingPromotionRequest {
  target_stage?: string;
  operator?: string | null;
  reason?: string | null;
}

export interface MonitoringOverviewResponse {
  total_telemetry_events: number;
  models_monitored_count: number;
  active_alerts_count: number;
  drift_detected_models_count: number;
  recent_alerts: MonitoringAlertRecord[];
  recent_drift_reports: DriftAnalysisResponse[];
  recent_retraining_jobs: RetrainingJobRecord[];
}

// ==========================================
// Phase 15: Pipeline Orchestration Types
// ==========================================

export type PipelineStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export type PipelineStage =
  | "dataset_validation"
  | "provenance_initialization"
  | "training"
  | "evaluation"
  | "experiment_manifest"
  | "registry_registration"
  | "promotion_gate"
  | "monitoring_initialization"
  | "completed";

export type PromotionPolicy = "manual" | "auto_staging" | "auto_production";

export interface StageRecord {
  stage: PipelineStage;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  message?: string | null;
  details?: Record<string, any> | null;
}

export interface PipelineProvenance {
  pipeline_id: string;
  config_fingerprint: string;
  dataset_id: string;
  dataset_fingerprint?: string | null;
  task_type: string;
  target_column: string;
  evaluation_strategy?: string | null;
  primary_metric?: string | null;
  random_state?: number | null;
  experiment_id?: string | null;
  model_name: string;
  model_version?: number | null;
  artifact_checksum?: string | null;
  reference_profile_id?: string | null;
  environment_info: Record<string, any>;
  package_versions: Record<string, string>;
  created_at: string;
}

export interface PipelineEvent {
  event_id: string;
  pipeline_id: string;
  stage: PipelineStage;
  event_type: "info" | "warning" | "error" | "state_change";
  message: string;
  timestamp: string;
  metadata?: Record<string, any> | null;
}

export interface PipelineCreateRequest {
  dataset_id: string;
  target_column: string;
  task_type?: "classification" | "regression" | null;
  model_name: string;
  description?: string | null;
  training_config?: TrainingRequest | Record<string, any> | null;
  auto_register?: boolean;
  initial_registry_stage?: "development" | "staging";
  promotion_policy?: PromotionPolicy;
  candidate_tolerance_pct?: number;
  create_reference_profile?: boolean;
  monitoring_split_source?: string;
  random_seed?: number;
}

export interface PipelineResponse {
  pipeline_id: string;
  status: PipelineStatus;
  current_stage: PipelineStage;
  dataset_id: string;
  dataset_fingerprint?: string | null;
  target_column: string;
  task_type: string;
  model_name: string;
  model_version?: number | null;
  model_stage?: string | null;
  experiment_id?: string | null;
  primary_metric?: string | null;
  metric_value?: number | null;
  artifact_checksum?: string | null;
  reference_profile_id?: string | null;
  promotion_policy?: PromotionPolicy | null;
  auto_register?: boolean | null;
  create_reference_profile?: boolean | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  retry_count: number;
  failure_reason?: string | null;
  description?: string | null;
  stages: StageRecord[];
  provenance?: PipelineProvenance | null;
}

export interface PipelineListResponse {
  total: number;
  limit: number;
  offset: number;
  pipelines: PipelineResponse[];
}
