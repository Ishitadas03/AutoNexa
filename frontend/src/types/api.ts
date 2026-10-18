/**
 * TypeScript type definitions matching exact AutoNexa FastAPI backend schemas.
 */

export interface HealthResponse {
  status: string;
  app_name: string;
  app_version: string;
  environment: string;
  debug: boolean;
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
