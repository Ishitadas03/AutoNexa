/** Centralized typed API client for the AutoNexa FastAPI backend. */

import {
  AnalysisRequest,
  AnalysisResponse,
  BenchmarkCompareRequest,
  BenchmarkComparisonResponse,
  DatasetProfileResponse,
  ErrorAnalysisRequest,
  ErrorAnalysisResponse,
  ExperimentInspectionResponse,
  GlobalFeatureImportanceResponse,
  HealthResponse,
  PredictionExplanationRequest,
  PredictionExplanationResponse,
  PredictionRequest,
  PredictionResponse,
  TrainingRequest,
  TrainingResponse,
  BaselineComparisonRequest,
  BaselineComparisonResult,
  LaTeXExportResponse,
  RepeatedRunGroupResponse,
  RepeatedRunRequest,
  HPOExperimentRequest,
  HPOExperimentResponse,
  HyperparameterSpace,
  MultiObjectiveExperimentRequest,
  MultiObjectiveExperimentResponse,
  MultiObjectiveSelectionRequest,
  MultiObjectiveSelectionResult,
  ParetoCandidateResult,
  DatasetCatalogEntry,
  RobustBenchmarkRequest,
  RobustBenchmarkResponse,
  ArtifactVerificationResponse,
  ExperimentCompareRequest,
  ExperimentComparisonResponse,
  ExperimentDetailResponse,
  ExperimentListResponse,
  ModelRegistrationRequest,
  ModelRegistryListResponse,
  ModelVersionRecord,
  ReproducibilityManifest,
  StageTransitionRequest,
  ServingModelSummary,
  ServingModelDetailResponse,
  ServingHealthResponse,
  ServingPredictionRequest,
  ServingPredictionResponse,
  ServingMetricsResponse,
  CacheInvalidationResponse,
  AlertAcknowledgeRequest,
  DriftAnalysisRequest,
  DriftAnalysisResponse,
  GroundTruthIngestRequest,
  GroundTruthIngestResponse,
  MonitoringAlertRecord,
  MonitoringOverviewResponse,
  MonitoringWindowCreate,
  MonitoringWindowResponse,
  PerformanceMetricReport,
  ReferenceProfileCreate,
  ReferenceProfileResponse,
  RetrainingJobRecord,
  RetrainingJobTriggerRequest,
  RetrainingPromotionRequest,
  PipelineCreateRequest,
  PipelineEvent,
  PipelineListResponse,
  PipelineResponse,
} from "@/types/api";

const isProduction = process.env.NODE_ENV === "production";
const rawBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

const API_BASE_URL = rawBaseUrl
  ? rawBaseUrl.replace(/\/$/, "")
  : isProduction
  ? "" // Never silently fall back to localhost in production
  : "http://127.0.0.1:8000";

function getEffectiveUrl(endpoint: string, overrideUrl?: string): string {
  const base = (overrideUrl !== undefined ? overrideUrl : API_BASE_URL).replace(/\/$/, "");
  if (!base && isProduction) {
    throw new ApiError(
      503,
      "NEXT_PUBLIC_API_BASE_URL is not configured for production. Please configure your deployed backend API URL in Vercel project environment variables."
    );
  }
  return `${base}${endpoint}`;
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`API Error ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const data = await res.json();
      if (data && typeof data === "object" && "detail" in data) {
        errorDetail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // Body not JSON
    }
    throw new ApiError(res.status, errorDetail);
  }
  return res.json() as Promise<T>;
}

function getServingHeaders(apiKey?: string, extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extraHeaders,
  };
  const key = apiKey || (typeof window !== "undefined" ? localStorage.getItem("autonexa_serving_api_key") || "" : "");
  if (key) {
    headers["X-API-Key"] = key;
  }
  return headers;
}

export const api = {
  getBaseUrl(): string {
    return API_BASE_URL;
  },

  /** Check backend health status */
  async checkHealth(overrideUrl?: string): Promise<HealthResponse> {
    const url = getEffectiveUrl("/api/v1/health", overrideUrl);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<HealthResponse>(res);
  },

  /** Upload a CSV dataset file */
  async uploadDataset(file: File): Promise<DatasetProfileResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const url = getEffectiveUrl("/api/v1/datasets/upload");
    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });
    return handleResponse<DatasetProfileResponse>(res);
  },

  /** Upload dataset from raw CSV string */
  async uploadDatasetContent(csvContent: string, filename: string): Promise<DatasetProfileResponse> {
    const blob = new Blob([csvContent], { type: "text/csv" });
    const file = new File([blob], filename, { type: "text/csv" });
    return this.uploadDataset(file);
  },

  /** Analyze dataset intelligence & task detection */
  async analyzeDataset(datasetId: string, request?: AnalysisRequest): Promise<AnalysisResponse> {
    const url = getEffectiveUrl(`/api/v1/datasets/${datasetId}/analyze`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request || {}),
    });
    return handleResponse<AnalysisResponse>(res);
  },

  /** Train AutoML models on dataset */
  async trainDataset(datasetId: string, request: TrainingRequest): Promise<TrainingResponse> {
    const url = getEffectiveUrl(`/api/v1/datasets/${datasetId}/train`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<TrainingResponse>(res);
  },

  /** Inspect completed experiment and model artifact */
  async inspectExperiment(experimentId: string): Promise<ExperimentInspectionResponse> {
    const url = getEffectiveUrl(`/api/v1/experiments/${experimentId}`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<ExperimentInspectionResponse>(res);
  },

  /** Generate predictions for JSON records */
  async predictRecords(experimentId: string, request: PredictionRequest): Promise<PredictionResponse> {
    const url = getEffectiveUrl(`/api/v1/experiments/${experimentId}/predict`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<PredictionResponse>(res);
  },

  /** Batch predict on uploaded CSV file and return CSV Blob */
  async predictCsv(experimentId: string, file: File): Promise<{ blob: Blob; filename: string }> {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const url = getEffectiveUrl(`/api/v1/experiments/${experimentId}/predict-csv`);
    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const errorData = await res.json();
        detail = errorData.detail || detail;
      } catch {
        // ignore
      }
      throw new ApiError(res.status, detail);
    }

    const disposition = res.headers.get("content-disposition");
    let filename = `predictions_${experimentId}.csv`;
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    const blob = await res.blob();
    return { blob, filename };
  },

  /** Compute global feature importances for an experiment's winning pipeline */
  async getFeatureImportance(
    experimentId: string,
    method?: "auto" | "native" | "permutation",
    sampleSize?: number,
    randomState?: number
  ): Promise<GlobalFeatureImportanceResponse> {
    const params = new URLSearchParams();
    if (method) params.append("method", method);
    if (sampleSize) params.append("sample_size", sampleSize.toString());
    if (randomState !== undefined) params.append("random_state", randomState.toString());

    const qs = params.toString() ? `?${params.toString()}` : "";
    const url = getEffectiveUrl(`/api/v1/experiments/${experimentId}/explainability/importance${qs}`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<GlobalFeatureImportanceResponse>(res);
  },

  /** Generate local prediction attributions for input records */
  async explainPrediction(
    experimentId: string,
    request: PredictionExplanationRequest
  ): Promise<PredictionExplanationResponse> {
    const url = getEffectiveUrl(`/api/v1/experiments/${experimentId}/explainability/prediction`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<PredictionExplanationResponse>(res);
  },

  /** Execute prediction error analysis */
  async analyzeErrors(
    experimentId: string,
    request?: ErrorAnalysisRequest
  ): Promise<ErrorAnalysisResponse> {
    const url = getEffectiveUrl(`/api/v1/experiments/${experimentId}/error-analysis`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request || {}),
    });
    return handleResponse<ErrorAnalysisResponse>(res);
  },

  /** Comparative research benchmarking across multiple experiments */
  async compareBenchmarks(request: BenchmarkCompareRequest): Promise<BenchmarkComparisonResponse> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/compare`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<BenchmarkComparisonResponse>(res);
  },

  // ==========================================
  // Phase 9: Research Experimental Benchmarking
  // ==========================================

  /** Execute repeated-seed experimental series across 2 to 10 random seeds */
  async runRepeatedRuns(request: RepeatedRunRequest): Promise<RepeatedRunGroupResponse> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/repeated-runs`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<RepeatedRunGroupResponse>(res);
  },

  /** Retrieve stored repeated experiment series and statistical summaries */
  async getRepeatedRunGroup(runGroupId: string): Promise<RepeatedRunGroupResponse> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/repeated-runs/${encodeURIComponent(runGroupId)}`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<RepeatedRunGroupResponse>(res);
  },

  /** Compare an existing experiment against canonical dummy and linear baselines */
  async compareBaselines(request: BaselineComparisonRequest): Promise<BaselineComparisonResult[]> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/baseline-comparison`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<BaselineComparisonResult[]>(res);
  },

  /** Generate publication-grade academic LaTeX table for repeated experiment series */
  async getRepeatedRunsLatex(runGroupId: string): Promise<LaTeXExportResponse> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/repeated-runs/${encodeURIComponent(runGroupId)}/latex`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<LaTeXExportResponse>(res);
  },

  /** Generate download URL for repeated runs CSV */
  getRepeatedRunsCsvUrl(runGroupId: string): string {
    return getEffectiveUrl(`/api/v1/benchmarks/repeated-runs/${encodeURIComponent(runGroupId)}/export-csv`);
  },

  // ==========================================
  // Phase 10A: Controlled HPO Benchmark (Random Search vs Bayesian Optuna)
  // ==========================================

  /** Retrieve available hyperparameter search spaces */
  async getHpoSearchSpaces(): Promise<HyperparameterSpace[]> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/hpo-spaces`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<HyperparameterSpace[]>(res);
  },

  /** Run controlled Random Search vs Bayesian Optimization experiment */
  async runHpoExperiment(request: HPOExperimentRequest): Promise<HPOExperimentResponse> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/hpo-experiment`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<HPOExperimentResponse>(res);
  },

  /** Retrieve stored HPO experiment report */
  async getHpoExperiment(experimentId: string): Promise<HPOExperimentResponse> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/hpo-experiment/${encodeURIComponent(experimentId)}`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<HPOExperimentResponse>(res);
  },

  /** Get CSV download URL for HPO trial records */
  getHpoCsvUrl(experimentId: string): string {
    return getEffectiveUrl(`/api/v1/benchmarks/hpo-experiment/${encodeURIComponent(experimentId)}/export-csv`);
  },

  // ==========================================
  // Phase 10B: Multi-Objective & Resource-Aware Selection
  // ==========================================

  /** Run multi-objective optimization across candidate models with resource profiling */
  async runMultiObjectiveExperiment(request: MultiObjectiveExperimentRequest): Promise<MultiObjectiveExperimentResponse> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/multi-objective`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<MultiObjectiveExperimentResponse>(res);
  },

  /** Retrieve stored multi-objective experiment report */
  async getMultiObjectiveExperiment(experimentId: string): Promise<MultiObjectiveExperimentResponse> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/multi-objective/${encodeURIComponent(experimentId)}`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<MultiObjectiveExperimentResponse>(res);
  },

  /** Retrieve only non-dominated Pareto-optimal models */
  async getMultiObjectiveParetoFrontier(experimentId: string): Promise<ParetoCandidateResult[]> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/multi-objective/${encodeURIComponent(experimentId)}/pareto`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<ParetoCandidateResult[]>(res);
  },

  /** Apply updated resource constraints and select winning candidate */
  async selectMultiObjectiveModel(
    experimentId: string,
    request: MultiObjectiveSelectionRequest
  ): Promise<MultiObjectiveSelectionResult> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/multi-objective/${encodeURIComponent(experimentId)}/select`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<MultiObjectiveSelectionResult>(res);
  },

  /** Get CSV download URL for multi-objective candidates */
  getMultiObjectiveCsvUrl(experimentId: string): string {
    return getEffectiveUrl(`/api/v1/benchmarks/multi-objective/${encodeURIComponent(experimentId)}/export-csv`);
  },

  /** Phase 11: List curated benchmark datasets with provenance */
  async getBenchmarkDatasetCatalog(): Promise<DatasetCatalogEntry[]> {
    const url = getEffectiveUrl("/api/v1/benchmarks/dataset-catalog");
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<DatasetCatalogEntry[]>(res);
  },

  /** Phase 11: Execute multi-seed robust benchmark */
  async runRobustBenchmark(request: RobustBenchmarkRequest): Promise<RobustBenchmarkResponse> {
    const url = getEffectiveUrl("/api/v1/benchmarks/robust");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<RobustBenchmarkResponse>(res);
  },

  /** Phase 11: Retrieve existing robust benchmark by ID */
  async getRobustBenchmark(robustBenchmarkId: string): Promise<RobustBenchmarkResponse> {
    const url = getEffectiveUrl(`/api/v1/benchmarks/robust/${encodeURIComponent(robustBenchmarkId)}`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<RobustBenchmarkResponse>(res);
  },

  /** Phase 11: Get CSV download URL for robust benchmark seed runs */
  getRobustBenchmarkCsvUrl(robustBenchmarkId: string): string {
    return getEffectiveUrl(`/api/v1/benchmarks/robust/${encodeURIComponent(robustBenchmarkId)}/export-csv`);
  },

  // ==========================================
  // Phase 12: Experiment Tracking & Model Registry
  // ==========================================

  /** List persisted experiments with pagination and filtering */
  async listExperiments(params?: {
    page?: number;
    page_size?: number;
    task_type?: string;
    status?: string;
    dataset_id?: string;
    search?: string;
  }): Promise<ExperimentListResponse> {
    const qs = new URLSearchParams();
    if (params?.page) qs.append("page", params.page.toString());
    if (params?.page_size) qs.append("page_size", params.page_size.toString());
    if (params?.task_type) qs.append("task_type", params.task_type);
    if (params?.status) qs.append("status", params.status);
    if (params?.dataset_id) qs.append("dataset_id", params.dataset_id);
    if (params?.search) qs.append("search", params.search);

    const qString = qs.toString() ? `?${qs.toString()}` : "";
    const url = getEffectiveUrl(`/api/v1/experiments${qString}`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<ExperimentListResponse>(res);
  },

  /** Retrieve full experiment detail */
  async getExperimentDetails(experimentId: string): Promise<ExperimentDetailResponse> {
    const url = getEffectiveUrl(`/api/v1/experiments/${encodeURIComponent(experimentId)}/details`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<ExperimentDetailResponse>(res);
  },

  /** Compare selected experiments side-by-side */
  async compareExperiments(experimentIds: string[]): Promise<ExperimentComparisonResponse> {
    const url = getEffectiveUrl("/api/v1/experiments/compare");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experiment_ids: experimentIds }),
    });
    return handleResponse<ExperimentComparisonResponse>(res);
  },

  /** Get cryptographic reproducibility manifest */
  async getReproducibilityManifest(experimentId: string): Promise<ReproducibilityManifest> {
    const url = getEffectiveUrl(`/api/v1/experiments/${encodeURIComponent(experimentId)}/reproducibility-manifest`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<ReproducibilityManifest>(res);
  },

  /** Verify experiment artifact presence and SHA-256 */
  async verifyExperimentArtifact(experimentId: string): Promise<ArtifactVerificationResponse> {
    const url = getEffectiveUrl(`/api/v1/experiments/${encodeURIComponent(experimentId)}/reproducibility-manifest/verify`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<ArtifactVerificationResponse>(res);
  },

  /** Download experiment model artifact .joblib */
  async downloadExperimentArtifact(experimentId: string): Promise<{ blob: Blob; filename: string }> {
    const url = getEffectiveUrl(`/api/v1/experiments/${encodeURIComponent(experimentId)}/artifact`);
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const errorData = await res.json();
        detail = errorData.detail || detail;
      } catch {
        // ignore
      }
      throw new ApiError(res.status, detail);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition");
    let filename = `autonexa_model_${experimentId.slice(0, 8)}.joblib`;
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    return { blob, filename };
  },

  /** Delete an experiment */
  async deleteExperiment(experimentId: string): Promise<{ success: boolean; message: string }> {
    const url = getEffectiveUrl(`/api/v1/experiments/${encodeURIComponent(experimentId)}`);
    const res = await fetch(url, { method: "DELETE" });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  /** List registered models */
  async listRegisteredModels(): Promise<ModelRegistryListResponse> {
    const url = getEffectiveUrl("/api/v1/models");
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<ModelRegistryListResponse>(res);
  },

  /** Register model version from experiment */
  async registerModel(request: ModelRegistrationRequest): Promise<ModelVersionRecord> {
    const url = getEffectiveUrl("/api/v1/models/register");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<ModelVersionRecord>(res);
  },

  /** List versions for a model family */
  async getModelVersions(modelName: string): Promise<ModelVersionRecord[]> {
    const url = getEffectiveUrl(`/api/v1/models/${encodeURIComponent(modelName)}`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<ModelVersionRecord[]>(res);
  },

  /** Retrieve version details */
  async getVersionDetails(modelName: string, version: number): Promise<ModelVersionRecord> {
    const url = getEffectiveUrl(`/api/v1/models/${encodeURIComponent(modelName)}/versions/${version}`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<ModelVersionRecord>(res);
  },

  /** Transition lifecycle stage of a model version */
  async transitionModelStage(
    modelName: string,
    version: number,
    request: StageTransitionRequest
  ): Promise<ModelVersionRecord> {
    const url = getEffectiveUrl(`/api/v1/models/${encodeURIComponent(modelName)}/versions/${version}/stage`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return handleResponse<ModelVersionRecord>(res);
  },

  /** Verify registered model version artifact integrity */
  async verifyVersionArtifact(modelName: string, version: number): Promise<ArtifactVerificationResponse> {
    const url = getEffectiveUrl(`/api/v1/models/${encodeURIComponent(modelName)}/versions/${version}/verify`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return handleResponse<ArtifactVerificationResponse>(res);
  },

  /** Download registered model version artifact */
  async downloadVersionArtifact(modelName: string, version: number): Promise<{ blob: Blob; filename: string }> {
    const url = getEffectiveUrl(`/api/v1/models/${encodeURIComponent(modelName)}/versions/${version}/download`);
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const errorData = await res.json();
        detail = errorData.detail || detail;
      } catch {
        // ignore
      }
      throw new ApiError(res.status, detail);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition");
    let filename = `${modelName}_v${version}.joblib`;
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    return { blob, filename };
  },

  /** Compare versions of a model family */
  async compareModelVersions(modelName: string, versions?: number[]): Promise<Record<string, any>> {
    const qs = versions && versions.length ? `?${versions.map((v) => `versions=${v}`).join("&")}` : "";
    const url = getEffectiveUrl(`/api/v1/models/${encodeURIComponent(modelName)}/compare-versions${qs}`);
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    return handleResponse<Record<string, any>>(res);
  },

  // ---------------------------------------------------------------------------
  // Phase 13: Secure Model Serving & Deployment
  // ---------------------------------------------------------------------------

  /** List models and eligible serving versions */
  async listServingModels(apiKey?: string): Promise<ServingModelSummary[]> {
    const url = getEffectiveUrl("/api/v1/serving/models");
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<ServingModelSummary[]>(res);
  },

  /** Get detailed schema and capabilities for a specific serving version */
  async getServingModelDetail(modelName: string, version: number, apiKey?: string): Promise<ServingModelDetailResponse> {
    const url = getEffectiveUrl(`/api/v1/serving/models/${encodeURIComponent(modelName)}/versions/${version}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<ServingModelDetailResponse>(res);
  },

  /** Check live health and artifact integrity of a specific serving version */
  async checkServingModelHealth(modelName: string, version: number, apiKey?: string): Promise<ServingHealthResponse> {
    const url = getEffectiveUrl(`/api/v1/serving/models/${encodeURIComponent(modelName)}/versions/${version}/health`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<ServingHealthResponse>(res);
  },

  /** Execute prediction against a specific model version */
  async predictServingVersion(
    modelName: string,
    version: number,
    request: ServingPredictionRequest,
    apiKey?: string
  ): Promise<ServingPredictionResponse> {
    const url = getEffectiveUrl(`/api/v1/serving/models/${encodeURIComponent(modelName)}/versions/${version}/predict`);
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    });
    return handleResponse<ServingPredictionResponse>(res);
  },

  /** Execute prediction against active production/staging version */
  async predictServingActive(
    modelName: string,
    request: ServingPredictionRequest,
    apiKey?: string
  ): Promise<ServingPredictionResponse> {
    const url = getEffectiveUrl(`/api/v1/serving/models/${encodeURIComponent(modelName)}/predict`);
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    });
    return handleResponse<ServingPredictionResponse>(res);
  },

  /** Get operational serving metrics (request counts, latency stats, error counters) */
  async getServingMetrics(apiKey?: string): Promise<ServingMetricsResponse> {
    const url = getEffectiveUrl("/api/v1/serving/metrics");
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<ServingMetricsResponse>(res);
  },

  /** Invalidate in-memory cached model instances (requires admin key if auth enabled) */
  async invalidateServingCache(
    modelName?: string,
    version?: number,
    apiKey?: string
  ): Promise<CacheInvalidationResponse> {
    const path = modelName && version !== undefined
      ? `/api/v1/serving/models/${encodeURIComponent(modelName)}/versions/${version}/cache/invalidate`
      : "/api/v1/serving/cache/invalidate";
    const url = getEffectiveUrl(path);
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey),
    });
    return handleResponse<CacheInvalidationResponse>(res);
  },

  // ---------------------------------------------------------------------------
  // Phase 14: Model Monitoring, Drift Detection & Automated Retraining
  // ---------------------------------------------------------------------------

  /** Retrieve consolidated operational overview for monitoring */
  async getMonitoringOverview(apiKey?: string): Promise<MonitoringOverviewResponse> {
    const url = getEffectiveUrl("/api/v1/monitoring/overview");
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<MonitoringOverviewResponse>(res);
  },

  /** Retrieve recent runtime inference telemetry events */
  async getMonitoringTelemetry(limit: number = 50, apiKey?: string): Promise<Record<string, any>[]> {
    const url = getEffectiveUrl(`/api/v1/monitoring/telemetry?limit=${limit}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<Record<string, any>[]>(res);
  },

  /** Establish a new baseline reference profile from a training/validation dataset (Admin role) */
  async createReferenceProfile(
    request: ReferenceProfileCreate,
    apiKey?: string
  ): Promise<ReferenceProfileResponse> {
    const url = getEffectiveUrl("/api/v1/monitoring/reference-profiles");
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    });
    return handleResponse<ReferenceProfileResponse>(res);
  },

  /** List baseline reference profiles */
  async listReferenceProfiles(modelName?: string, apiKey?: string): Promise<ReferenceProfileResponse[]> {
    const qs = modelName ? `?model_name=${encodeURIComponent(modelName)}` : "";
    const url = getEffectiveUrl(`/api/v1/monitoring/reference-profiles${qs}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<ReferenceProfileResponse[]>(res);
  },

  /** Get specific reference profile details */
  async getReferenceProfile(profileId: string, apiKey?: string): Promise<ReferenceProfileResponse> {
    const url = getEffectiveUrl(`/api/v1/monitoring/reference-profiles/${encodeURIComponent(profileId)}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<ReferenceProfileResponse>(res);
  },

  /** Record a monitoring window batch */
  async recordMonitoringWindow(
    request: MonitoringWindowCreate,
    apiKey?: string
  ): Promise<MonitoringWindowResponse> {
    const url = getEffectiveUrl("/api/v1/monitoring/windows");
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    });
    return handleResponse<MonitoringWindowResponse>(res);
  },

  /** List recorded monitoring windows */
  async listMonitoringWindows(modelName?: string, apiKey?: string): Promise<MonitoringWindowResponse[]> {
    const qs = modelName ? `?model_name=${encodeURIComponent(modelName)}` : "";
    const url = getEffectiveUrl(`/api/v1/monitoring/windows${qs}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<MonitoringWindowResponse[]>(res);
  },

  /** Get contents of a monitoring window */
  async getMonitoringWindow(windowId: string, apiKey?: string): Promise<Record<string, any>> {
    const url = getEffectiveUrl(`/api/v1/monitoring/windows/${encodeURIComponent(windowId)}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<Record<string, any>>(res);
  },

  /** Run statistical drift analysis on a window or records */
  async runDriftAnalysis(
    request: DriftAnalysisRequest,
    apiKey?: string
  ): Promise<DriftAnalysisResponse> {
    const url = getEffectiveUrl("/api/v1/monitoring/drift-analysis");
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    });
    return handleResponse<DriftAnalysisResponse>(res);
  },

  /** List historical drift reports */
  async listDriftReports(modelName?: string, apiKey?: string): Promise<DriftAnalysisResponse[]> {
    const qs = modelName ? `?model_name=${encodeURIComponent(modelName)}` : "";
    const url = getEffectiveUrl(`/api/v1/monitoring/drift-reports${qs}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<DriftAnalysisResponse[]>(res);
  },

  /** Ingest delayed ground-truth labels */
  async ingestGroundTruth(
    request: GroundTruthIngestRequest,
    apiKey?: string
  ): Promise<GroundTruthIngestResponse> {
    const url = getEffectiveUrl("/api/v1/monitoring/ground-truth");
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    });
    return handleResponse<GroundTruthIngestResponse>(res);
  },

  /** Evaluate ground-truth performance against model training baseline */
  async evaluateGroundTruthPerformance(
    modelName: string,
    version?: number,
    windowId?: string,
    apiKey?: string
  ): Promise<PerformanceMetricReport> {
    const params = new URLSearchParams();
    params.set("model_name", modelName);
    if (version !== undefined) params.set("version", String(version));
    if (windowId) params.set("window_id", windowId);

    const url = getEffectiveUrl(`/api/v1/monitoring/ground-truth/evaluate?${params.toString()}`);
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey),
    });
    return handleResponse<PerformanceMetricReport>(res);
  },

  /** List ground-truth performance evaluation reports */
  async listPerformanceReports(modelName?: string, apiKey?: string): Promise<PerformanceMetricReport[]> {
    const qs = modelName ? `?model_name=${encodeURIComponent(modelName)}` : "";
    const url = getEffectiveUrl(`/api/v1/monitoring/performance-reports${qs}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<PerformanceMetricReport[]>(res);
  },

  /** List operational alerts */
  async listMonitoringAlerts(
    modelName?: string,
    alertStatus?: string,
    apiKey?: string
  ): Promise<MonitoringAlertRecord[]> {
    const params = new URLSearchParams();
    if (modelName) params.set("model_name", modelName);
    if (alertStatus) params.set("status", alertStatus);
    const qs = params.toString() ? `?${params.toString()}` : "";

    const url = getEffectiveUrl(`/api/v1/monitoring/alerts${qs}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<MonitoringAlertRecord[]>(res);
  },

  /** Acknowledge an operational alert (Admin role) */
  async acknowledgeMonitoringAlert(
    alertId: string,
    request?: AlertAcknowledgeRequest,
    apiKey?: string
  ): Promise<MonitoringAlertRecord> {
    const url = getEffectiveUrl(`/api/v1/monitoring/alerts/${encodeURIComponent(alertId)}/acknowledge`);
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(request || {}),
    });
    return handleResponse<MonitoringAlertRecord>(res);
  },

  /** Trigger automated retraining with candidate validation gate (Admin role) */
  async triggerRetraining(
    request: RetrainingJobTriggerRequest,
    apiKey?: string
  ): Promise<RetrainingJobRecord> {
    const url = getEffectiveUrl("/api/v1/monitoring/retraining/trigger");
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    });
    return handleResponse<RetrainingJobRecord>(res);
  },

  /** List historical automated retraining jobs */
  async listRetrainingJobs(modelName?: string, apiKey?: string): Promise<RetrainingJobRecord[]> {
    const qs = modelName ? `?model_name=${encodeURIComponent(modelName)}` : "";
    const url = getEffectiveUrl(`/api/v1/monitoring/retraining/jobs${qs}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<RetrainingJobRecord[]>(res);
  },

  /** Promote a validated retrained candidate model to production or staging (Admin role) */
  async promoteRetrainedCandidate(
    jobId: string,
    request?: RetrainingPromotionRequest,
    apiKey?: string
  ): Promise<RetrainingJobRecord> {
    const url = getEffectiveUrl(`/api/v1/monitoring/retraining/jobs/${encodeURIComponent(jobId)}/promote`);
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(request || {}),
    });
    return handleResponse<RetrainingJobRecord>(res);
  },

  // ==========================================
  // Phase 15: Pipeline Orchestration API
  // ==========================================

  /** Create and launch an asynchronous pipeline run (Admin role) */
  async createPipeline(
    request: PipelineCreateRequest,
    apiKey?: string
  ): Promise<PipelineResponse> {
    const url = getEffectiveUrl("/api/v1/pipelines");
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(request),
    });
    return handleResponse<PipelineResponse>(res);
  },

  /** List pipeline executions with pagination and optional filtering */
  async listPipelines(
    params?: {
      status?: string;
      model_name?: string;
      dataset_id?: string;
      limit?: number;
      offset?: number;
      page?: number;
      page_size?: number;
    },
    apiKey?: string
  ): Promise<PipelineListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.model_name) searchParams.set("model_name", params.model_name);
    if (params?.dataset_id) searchParams.set("dataset_id", params.dataset_id);

    // Calculate effective limit clamped to backend constraints [1, 100] (default 50)
    const effectiveLimit = Math.min(
      100,
      Math.max(1, params?.limit ?? params?.page_size ?? 50)
    );
    searchParams.set("limit", String(effectiveLimit));

    // Calculate effective offset (offset takes precedence, else (page - 1) * limit)
    let effectiveOffset = 0;
    if (params?.offset !== undefined) {
      effectiveOffset = Math.max(0, params.offset);
    } else if (params?.page !== undefined) {
      effectiveOffset = Math.max(0, (params.page - 1) * effectiveLimit);
    }
    searchParams.set("offset", String(effectiveOffset));

    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    const url = getEffectiveUrl(`/api/v1/pipelines${qs}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<PipelineListResponse>(res);
  },

  /** Get pipeline execution status and full stage timeline */
  async getPipeline(pipelineId: string, apiKey?: string): Promise<PipelineResponse> {
    const url = getEffectiveUrl(`/api/v1/pipelines/${encodeURIComponent(pipelineId)}`);
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<PipelineResponse>(res);
  },

  /** Request cancellation of an active pipeline execution (Admin role) */
  async cancelPipeline(pipelineId: string, apiKey?: string): Promise<PipelineResponse> {
    const url = getEffectiveUrl(`/api/v1/pipelines/${encodeURIComponent(pipelineId)}/cancel`);
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
    });
    return handleResponse<PipelineResponse>(res);
  },

  /** Retry a failed or cancelled pipeline execution (Admin role) */
  async retryPipeline(pipelineId: string, apiKey?: string): Promise<PipelineResponse> {
    const url = getEffectiveUrl(`/api/v1/pipelines/${encodeURIComponent(pipelineId)}/retry`);
    const res = await fetch(url, {
      method: "POST",
      headers: getServingHeaders(apiKey, { "Content-Type": "application/json" }),
    });
    return handleResponse<PipelineResponse>(res);
  },

  /** Retrieve ordered audit and lifecycle events for a pipeline execution */
  async getPipelineEvents(
    pipelineId: string,
    limit: number = 100,
    apiKey?: string
  ): Promise<PipelineEvent[]> {
    const url = getEffectiveUrl(
      `/api/v1/pipelines/${encodeURIComponent(pipelineId)}/events?limit=${encodeURIComponent(limit)}`
    );
    const res = await fetch(url, {
      method: "GET",
      headers: getServingHeaders(apiKey),
      cache: "no-store",
    });
    return handleResponse<PipelineEvent[]>(res);
  },
};
