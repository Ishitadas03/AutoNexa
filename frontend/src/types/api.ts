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
