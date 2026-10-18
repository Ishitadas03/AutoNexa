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
};

