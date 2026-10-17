/** Centralized typed API client for the AutoNexa FastAPI backend. */

import {
  AnalysisRequest,
  AnalysisResponse,
  DatasetProfileResponse,
  ExperimentInspectionResponse,
  HealthResponse,
  PredictionRequest,
  PredictionResponse,
  TrainingRequest,
  TrainingResponse,
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
};
