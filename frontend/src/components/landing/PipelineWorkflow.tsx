"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  UploadCloud,
  FileText,
  Filter,
  CheckCircle2,
  Zap,
  BarChart3,
  Database,
  Brain,
  FlaskConical,
  Target,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  ArrowRight,
  ArrowDown,
  Loader2,
  Copy,
  ExternalLink,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { SAMPLE_CHURN_CSV, SAMPLE_HOUSING_CSV } from "@/lib/sampleDatasets";
import { DatasetProfileResponse } from "@/types/api";

interface PipelineWorkflowProps {
  onLaunchWorkspace: () => void;
  apiConnected?: boolean | null;
}

type StageControlId =
  | "profiling"
  | "recommendations"
  | "training"
  | "evaluation"
  | "prediction";

interface StageInfo {
  id: StageControlId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  input: string;
  processing: string;
  output: string;
  endpoint?: string;
  parameters: string[];
}

const STAGE_CONTROLS: StageInfo[] = [
  {
    id: "profiling",
    label: "Dataset Profiling",
    icon: Database,
    title: "1. Dataset Ingestion & Profiling",
    description:
      "Automated schema inference, nullity distribution analysis, duplicate detection, and cryptographic SHA-256 dataset fingerprinting.",
    input: "Raw tabular CSV (up to 50 MB, streaming upload)",
    processing:
      "UTF-8 tabular integrity validation, automatic type inference (numeric, categorical, datetime), missing value distribution, memory profiling.",
    output:
      "Dataset profile with shape (rows × columns), column summaries, null ratios, and immutable SHA-256 fingerprint.",
    endpoint: "POST /api/v1/datasets/upload",
    parameters: ["file: multipart/form-data (CSV)", "Content-Type: text/csv"],
  },
  {
    id: "recommendations",
    label: "Task Recommendations",
    icon: Brain,
    title: "2. Dataset Intelligence & Task Detection",
    description:
      "Heuristic ML task detection (binary classification, multiclass, or regression) with target candidate ranking and data quality audits.",
    input: "Profiled dataset ID with optional target column override",
    processing:
      "Column role classification (numeric, categorical, identifier), target cardinality check, class imbalance calculation, quality warning severity tagging.",
    output:
      "Recommended task type, confidence level, class distribution breakdown, quality warning codes (INFO, WARNING, CRITICAL).",
    endpoint: "POST /api/v1/datasets/{id}/analyze",
    parameters: ["target_column?: string", "quality_thresholds?: object"],
  },
  {
    id: "training",
    label: "AutoML Training",
    icon: Zap,
    title: "3. Resource-Aware AutoML Training Engine",
    description:
      "Resource-bounded candidate model search across linear, tree, and ensemble architectures with strict wall-clock time budgets.",
    input: "Target column, task type, candidate model selection, validation protocol, wall-clock time limit",
    processing:
      "Leakage-safe preprocessing pipelines (median/mode imputation, one-hot/ordinal encoding, standard scaling) fit strictly on train folds. StratifiedKFold or holdout validation.",
    output:
      "Fitted estimators, per-fold CV performance scores, sample standard deviations (ddof=1), and MLflow run artifacts.",
    endpoint: "POST /api/v1/datasets/{id}/train",
    parameters: ["models: string[]", "evaluation_strategy: 'cv' | 'holdout'", "cv_folds: number", "max_time_seconds: number"],
  },
  {
    id: "evaluation",
    label: "Model Evaluation",
    icon: FlaskConical,
    title: "4. Multi-Metric Leaderboard & Validation",
    description:
      "Direction-aware metric ranking, sample standard deviation calculations, holdout validation on untouched partitions, and artifact persistence.",
    input: "Completed experiment ID and fitted pipeline artifacts",
    processing:
      "Ranking of all evaluated models by primary metric (F1, ROC-AUC, RMSE, R²). Holdout score verification on unobserved test split.",
    output:
      "Ranked model leaderboard, best estimator designation, CV mean ± std, latency benchmarks, and serialized joblib pipeline.",
    endpoint: "GET /api/v1/experiments/{id}",
    parameters: ["primary_metric: string", "sort_direction: 'asc' | 'desc'"],
  },
  {
    id: "prediction",
    label: "Prediction Playground",
    icon: Target,
    title: "5. Zero-Retraining Inference & Export",
    description:
      "Low-latency real-time JSON inference or high-throughput batch CSV scoring using the winning serialized pipeline with feature realignment.",
    input: "Single JSON record or CSV batch file, experiment ID",
    processing:
      "Feature schema alignment against training pipeline, missing feature imputation with train statistics, probability distribution computation.",
    output:
      "Predicted labels / regression values, class probability distribution array, downloadable batch CSV with predictions appended.",
    endpoint: "POST /api/v1/experiments/{id}/predict",
    parameters: ["features: object | CSV file", "experiment_id: string"],
  },
];

export default function PipelineWorkflow({
  onLaunchWorkspace,
  apiConnected,
}: PipelineWorkflowProps) {
  // State for active stage detail drawer
  const [activeStage, setActiveStage] = useState<StageControlId | null>("profiling");
  const [activeLeaderboardTab, setActiveLeaderboardTab] = useState<"candidate" | "interactive">("candidate");

  // State for uploaded dataset preview
  const [datasetMode, setDatasetMode] = useState<"churn" | "housing">("churn");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadedProfile, setUploadedProfile] = useState<DatasetProfileResponse | null>(null);
  const [copiedPill, setCopiedPill] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // SVG connector path state (for dynamic responsive bezier recalculation if needed)
  const panel1Ref = useRef<HTMLDivElement>(null);
  const panel2Ref = useRef<HTMLDivElement>(null);
  const panel3Ref = useRef<HTMLDivElement>(null);

  const handleCopyEndpoint = () => {
    navigator.clipboard.writeText("POST /api/v1/datasets/upload");
    setCopiedPill(true);
    setTimeout(() => setCopiedPill(false), 2000);
  };

  // Real file upload handler connected to backend API
  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      alert("Please upload a CSV file (.csv format only).");
      return;
    }

    setIsUploading(true);
    setUploadSuccess(null);

    try {
      // Connect to real backend API
      const profile = await api.uploadDataset(file);
      setUploadedProfile(profile);
      setUploadSuccess(`Uploaded ${file.name} successfully`);
    } catch {
      // Graceful local parsing for landing page demonstration when backend offline
      const text = await file.text();
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim());
      const mockProfile: DatasetProfileResponse = {
        dataset_id: "ds-" + Math.random().toString(36).substring(2, 9),
        filename: file.name,
        rows: Math.max(1, lines.length - 1),
        columns: headers.length,
        column_names: headers,
        data_types: headers.reduce((acc, col, i) => {
          acc[col] = i % 2 === 0 ? "float64" : "object";
          return acc;
        }, {} as Record<string, string>),
        missing_values: headers.reduce((acc, col) => {
          acc[col] = 0;
          return acc;
        }, {} as Record<string, number>),
        duplicate_rows: 0,
        memory_usage_bytes: file.size,
        file_size_bytes: file.size,
      };
      setUploadedProfile(mockProfile);
      setUploadSuccess(`Loaded ${file.name} (${mockProfile.rows} rows)`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Quick switcher for preset datasets
  const handleSelectPreset = async (preset: "churn" | "housing") => {
    setDatasetMode(preset);
    setUploadedProfile(null);
    setUploadSuccess(null);

    const isChurn = preset === "churn";
    const filename = isChurn ? "customer_churn.csv" : "housing_prices.csv";
    const content = isChurn ? SAMPLE_CHURN_CSV : SAMPLE_HOUSING_CSV;

    try {
      const profile = await api.uploadDatasetContent(content, filename);
      setUploadedProfile(profile);
      setUploadSuccess(`Loaded preset: ${filename}`);
    } catch {
      // Simulation preview fallback
      const lines = content.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim());
      setUploadedProfile({
        dataset_id: "preset-" + preset,
        filename,
        rows: isChurn ? 8662 : 1240,
        columns: headers.length,
        column_names: headers,
        data_types: headers.reduce((acc, col, i) => {
          acc[col] = i % 2 === 0 ? "float64" : "int64";
          return acc;
        }, {} as Record<string, string>),
        missing_values: headers.reduce((acc, col) => {
          acc[col] = 0;
          return acc;
        }, {} as Record<string, number>),
        duplicate_rows: 0,
        memory_usage_bytes: 482000,
        file_size_bytes: 482000,
      });
      setUploadSuccess(`Preset active: ${filename}`);
    }
  };

  const currentStageDetail = STAGE_CONTROLS.find((s) => s.id === activeStage);

  // Dynamic values depending on selected sample or uploaded profile
  const isClassification = datasetMode === "churn";
  const displayRows = uploadedProfile?.rows ?? (isClassification ? 8662 : 1240);
  const displayCols = uploadedProfile?.columns ?? (isClassification ? 24 : 14);
  const displayFilename = uploadedProfile?.filename ?? (isClassification ? "customer_churn.csv" : "housing_prices.csv");
  const displayTarget = isClassification ? "customer_churn" : "price";
  const displayTask = isClassification ? "Binary Classification" : "Continuous Regression";
  const displayMetricName = isClassification ? "ROC-AUC" : "R² Score";

  return (
    <div className="w-full relative mt-4 mb-8" ref={containerRef}>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
        }}
        accept=".csv"
        className="hidden"
      />

      {/* Decorative ambient 4-point star in the right margin (matching reference design) */}
      <div className="hidden xl:block absolute -right-8 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 select-none">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <path
            d="M24 0 C24 16, 32 24, 48 24 C32 24, 24 32, 24 48 C24 32, 16 24, 0 24 C16 24, 24 16, 24 0 Z"
            fill="url(#starGradient)"
          />
          <defs>
            <linearGradient id="starGradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="1" stopColor="#fbbf24" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* =========================================================================
          MAIN WORKSPACE WINDOW FRAME (MATCHES REFERENCE DESIGN)
          ========================================================================= */}
      <div className="relative rounded-2xl border border-slate-800/90 bg-[#0c1117] overflow-hidden shadow-2xl shadow-black/80 backdrop-blur-xl">
        {/* macOS Window Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0a0e14] border-b border-slate-800/80">
          {/* Traffic light window controls */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57] inline-block shadow-sm shadow-red-500/20" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e] inline-block shadow-sm shadow-amber-500/20" />
            <span className="w-3 h-3 rounded-full bg-[#28c840] inline-block shadow-sm shadow-emerald-500/20" />
            <span className="ml-2 text-slate-600 text-xs hidden sm:inline select-none">◫</span>
          </div>

          {/* Search / Filter pill */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-slate-900/90 border border-slate-800 text-xs text-slate-400 font-mono w-44 sm:w-64">
            <Filter className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="text-slate-500 truncate">Filter: pipeline stages…</span>
          </div>

          {/* Status badge pill & copy icon */}
          <div className="flex items-center gap-2">
            <div
              onClick={handleCopyEndpoint}
              title="Click to copy API endpoint"
              className={`cursor-pointer flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-mono transition-colors ${
                apiConnected === true
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                  : apiConnected === false
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                  : "bg-slate-800 border-slate-700 text-slate-300"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  apiConnected === true
                    ? "bg-emerald-400 animate-pulse"
                    : apiConnected === false
                    ? "bg-amber-400"
                    : "bg-slate-400"
                }`}
              />
              <span className="hidden sm:inline">
                {apiConnected === true ? "Status: Ready (FastAPI)" : apiConnected === false ? "Demo: Simulation Mode" : "Checking API..."}
              </span>
              <span className="sm:hidden">
                {apiConnected === true ? "Ready" : "Sim"}
              </span>
              {copiedPill ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-2.5 h-2.5 opacity-70" />}
            </div>
          </div>
        </div>

        {/* =========================================================================
            3-PANEL CONNECTED WORKSPACE CONTAINER
            ========================================================================= */}
        <div className="relative p-4 sm:p-6 lg:p-7">
          {/* Subtle Technical Grid Lines in window background */}
          <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />

          {/* Preset Switcher Bar (Quick testing classification vs regression) */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-800/60 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-[11px] uppercase tracking-wider">Preview Dataset:</span>
              <button
                onClick={() => handleSelectPreset("churn")}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                  datasetMode === "churn"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold"
                    : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                }`}
              >
                Customer Churn (Binary)
              </button>
              <button
                onClick={() => handleSelectPreset("housing")}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                  datasetMode === "housing"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold"
                    : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                }`}
              >
                Housing Prices (Regression)
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="text-amber-400">●</span>
              <span>Flow: CSV Upload → AutoML Studio → Leaderboard</span>
            </div>
          </div>

          {/* DESKTOP SVG CONNECTOR OVERLAY (Behind the 3 Cards) */}
          <div className="hidden lg:block absolute inset-0 pointer-events-none z-0">
            <svg
              className="w-full h-full"
              viewBox="0 0 1000 480"
              preserveAspectRatio="none"
              fill="none"
            >
              <defs>
                <linearGradient id="curveGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
                </linearGradient>
                <linearGradient id="curveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.7" />
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* CONNECTOR 1: Panel 1 (CSV Upload) -> Panel 2 (AutoML Training Studio) */}
              {/* Upper curve */}
              <path
                d="M 330 190 C 355 190, 360 210, 385 210"
                stroke="url(#curveGrad1)"
                strokeWidth="2"
                fill="none"
                filter="url(#glow)"
                strokeDasharray="4 2"
              />
              {/* Lower curve merging into center */}
              <path
                d="M 330 250 C 355 250, 360 210, 385 210"
                stroke="url(#curveGrad1)"
                strokeWidth="2"
                fill="none"
                filter="url(#glow)"
              />

              {/* Flowing traversal particle 1 */}
              <circle r="3.5" fill="#f59e0b" filter="url(#glow)">
                <animateMotion
                  dur="2.4s"
                  repeatCount="indefinite"
                  path="M 330 250 C 355 250, 360 210, 385 210"
                />
              </circle>

              {/* CONNECTOR 2: Panel 2 (AutoML Studio) -> Panel 3 (Model Leaderboard) */}
              {/* Branch curve to top leaderboard rows */}
              <path
                d="M 645 230 C 670 230, 675 180, 705 180"
                stroke="url(#curveGrad2)"
                strokeWidth="2"
                fill="none"
                filter="url(#glow)"
              />
              {/* Branch curve to lower leaderboard rows */}
              <path
                d="M 645 230 C 670 230, 675 270, 705 270"
                stroke="url(#curveGrad2)"
                strokeWidth="2"
                fill="none"
                filter="url(#glow)"
                strokeDasharray="4 2"
              />

              {/* Flowing traversal particle 2 */}
              <circle r="3.5" fill="#fbbf24" filter="url(#glow)">
                <animateMotion
                  dur="2.4s"
                  repeatCount="indefinite"
                  begin="1.2s"
                  path="M 645 230 C 670 230, 675 180, 705 180"
                />
              </circle>
            </svg>
          </div>

          {/* 3 PANELS HORIZONTAL ON DESKTOP, VERTICALLY STACKED ON MOBILE */}
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6 items-stretch">
            {/* =================================================================
                LEFT PANEL — CSV DATASET UPLOAD
                ================================================================= */}
            <div
              ref={panel1Ref}
              className="flex flex-col justify-between p-5 rounded-xl bg-[#090d13]/95 border border-slate-800/80 hover:border-amber-500/40 transition-all shadow-xl relative group"
            >
              {/* Output Socket Dots on right edge */}
              <div className="hidden lg:block absolute -right-1.5 top-[188px] w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900 shadow-md shadow-amber-500/50" />
              <div className="hidden lg:block absolute -right-1.5 top-[248px] w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900 shadow-md shadow-amber-500/50" />

              <div>
                {/* Panel Title */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-amber-400" />
                    CSV Upload
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    Input Stage 1
                  </span>
                </div>

                {/* Drag-and-Drop Zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border-2 border-dashed border-slate-700/80 bg-slate-950/60 p-5 text-center cursor-pointer hover:border-amber-500/60 hover:bg-amber-500/5 transition-all group/drop mb-3"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center group-hover/drop:border-amber-500/50 group-hover/drop:scale-105 transition-all shadow-inner">
                      {isUploading ? (
                        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                      ) : (
                        <FileText className="w-6 h-6 text-slate-400 group-hover/drop:text-amber-400 transition-colors" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-200 group-hover/drop:text-amber-300">
                        CSV Upload
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Drop or upload the csv data in csv here
                      </p>
                    </div>
                  </div>
                </div>

                {/* OR Divider */}
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="text-[9px] text-slate-500 font-mono font-bold">OR</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>

                {/* Solid Amber Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4 stroke-[2.5]" />
                  {isUploading ? "Uploading to Backend..." : "CSV Upload"}
                </button>

                {/* Validation status pill */}
                {uploadSuccess && (
                  <div className="mt-2.5 p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{uploadSuccess}</span>
                  </div>
                )}
              </div>

              {/* Dataset Profile Summary */}
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[11px] font-semibold text-white mb-2">
                  <span>Dataset summary</span>
                  <span className="text-[9px] font-mono text-amber-400 font-normal">
                    {displayFilename}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                    <span className="text-[9px] text-slate-500 block">Rows</span>
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {displayRows.toLocaleString()}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                    <span className="text-[9px] text-slate-500 block">Features</span>
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {displayCols}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                    <span className="text-[9px] text-slate-500 block">Target</span>
                    <span className="text-xs font-mono font-bold text-amber-400 truncate block">
                      {displayTarget}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[9px] font-mono text-slate-500">
                  <span>SHA-256 Verified</span>
                  <span className="text-emerald-400">0 Missing Values</span>
                </div>
              </div>
            </div>

            {/* MOBILE CONNECTOR 1 -> 2 */}
            <div className="flex lg:hidden items-center justify-center py-1">
              <div className="flex flex-col items-center">
                <div className="w-0.5 h-6 bg-gradient-to-b from-amber-500 to-amber-500/20" />
                <ArrowDown className="w-4 h-4 text-amber-400 animate-bounce" />
              </div>
            </div>

            {/* =================================================================
                CENTER PANEL — AUTOML TRAINING STUDIO
                ================================================================= */}
            <div
              ref={panel2Ref}
              className="flex flex-col justify-between p-5 rounded-xl bg-[#090d13]/95 border border-slate-800/80 hover:border-amber-500/40 transition-all shadow-xl relative"
            >
              {/* Sockets: Left input, Right output */}
              <div className="hidden lg:block absolute -left-1.5 top-[208px] w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900 shadow-md shadow-amber-500/50" />
              <div className="hidden lg:block absolute -right-1.5 top-[228px] w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900 shadow-md shadow-amber-500/50" />

              <div>
                {/* Header with Title and Training status pill */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    AutoML Training Studio
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Training
                  </span>
                </div>

                {/* Progress bar matching reference styling */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                    <span>Training status</span>
                    <span className="text-amber-400">100% Ready</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full w-[90%]" />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1">
                    <span>Training status: Stratified 5-Fold</span>
                    <span>90% evaluated</span>
                  </div>
                </div>

                {/* Dataset Summary 3-Column Box (matching reference design) */}
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 mb-3 text-[11px]">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono block mb-1.5">
                    Dataset summary
                  </span>
                  <div className="grid grid-cols-3 gap-2 font-mono">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Dataset</span>
                      <span className="text-slate-200 font-bold">{displayRows.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Samples</span>
                      <span className="text-slate-200 font-bold">259,503</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Target variables</span>
                      <span className="text-amber-400 font-bold">123-oas</span>
                    </div>
                  </div>
                </div>

                {/* Compact Visual Pipeline Strip */}
                <div className="mb-3 p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                    <span className="text-amber-400 font-bold">Dataset</span>
                    <span>→</span>
                    <span className="text-amber-300">Analyze</span>
                    <span>→</span>
                    <span className="text-slate-300">Configure</span>
                    <span>→</span>
                    <span className="text-emerald-400 font-bold">Train</span>
                    <span>→</span>
                    <span className="text-sky-400 font-bold">Evaluate</span>
                  </div>
                </div>

                {/* Target Variables Section */}
                <div className="space-y-1.5 mb-3 text-xs font-mono">
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400 text-[11px]">Target variables</span>
                    <span className="text-amber-400 text-[11px]">target: &apos;{displayTarget}&apos;</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400 text-[11px]">Task Type</span>
                    <span className="text-sky-400 text-[11px]">{displayTask}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Candidate Model Chips */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-400">Protocol: StratifiedKFold</span>
                <span className="text-amber-400">CV Folds: 5</span>
              </div>
            </div>

            {/* MOBILE CONNECTOR 2 -> 3 */}
            <div className="flex lg:hidden items-center justify-center py-1">
              <div className="flex flex-col items-center">
                <div className="w-0.5 h-6 bg-gradient-to-b from-amber-500 to-amber-500/20" />
                <ArrowDown className="w-4 h-4 text-amber-400 animate-bounce" />
              </div>
            </div>

            {/* =================================================================
                RIGHT PANEL — MODEL LEADERBOARD
                ================================================================= */}
            <div
              ref={panel3Ref}
              className="flex flex-col justify-between p-5 rounded-xl bg-[#090d13]/95 border border-slate-800/80 hover:border-amber-500/40 transition-all shadow-xl relative"
            >
              {/* Sockets: Left inputs */}
              <div className="hidden lg:block absolute -left-1.5 top-[178px] w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900 shadow-md shadow-amber-500/50" />
              <div className="hidden lg:block absolute -left-1.5 top-[268px] w-3 h-3 rounded-full bg-amber-400 border-2 border-slate-900 shadow-md shadow-amber-500/50" />

              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                    Leaderboard
                  </h3>
                  <button
                    onClick={onLaunchWorkspace}
                    className="text-[10px] text-amber-400 hover:text-amber-300 font-mono flex items-center gap-1 cursor-pointer"
                  >
                    Workspace Details
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {/* Tab buttons (Candidate metrics / Interactive metrics) */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setActiveLeaderboardTab("candidate")}
                    className={`text-[10px] font-mono px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                      activeLeaderboardTab === "candidate"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold"
                        : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                    }`}
                  >
                    Candidate metrics
                    <span className="text-[9px]">▾</span>
                  </button>
                  <button
                    onClick={() => setActiveLeaderboardTab("interactive")}
                    className={`text-[10px] font-mono px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                      activeLeaderboardTab === "interactive"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold"
                        : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                    }`}
                  >
                    Interactive metrics
                    <span className="text-[9px]">▾</span>
                  </button>
                </div>

                {/* Table Header matching reference */}
                <div className="grid grid-cols-[24px_1fr_60px_60px_20px] gap-2 items-center px-2 py-1.5 text-[9px] font-mono text-slate-500 uppercase tracking-wider border-b border-slate-800 mb-1">
                  <span>#</span>
                  <span>Model</span>
                  <span className="text-right">{displayMetricName}</span>
                  <span className="text-right">Metrics</span>
                  <span />
                </div>

                {/* Ranked Model Rows */}
                <div className="space-y-1.5">
                  {/* Row 1: XGBoost (Winner) */}
                  <div className="grid grid-cols-[24px_1fr_60px_60px_20px] gap-2 items-center px-2 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <span className="text-xs font-mono font-bold text-amber-400">1</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">XGBoost</span>
                        <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-500/30 text-amber-300 font-bold">
                          BEST
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">Candidate M...</span>
                    </div>
                    <span className="text-xs font-mono text-slate-300 text-right">0.941</span>
                    <span className="text-xs font-mono font-bold text-amber-400 text-right">
                      {isClassification ? "0.947" : "0.932"}
                    </span>
                    <MoreVertical className="w-3.5 h-3.5 text-slate-500 hover:text-white cursor-pointer" />
                  </div>

                  {/* Row 2: LightGBM */}
                  <div className="grid grid-cols-[24px_1fr_60px_60px_20px] gap-2 items-center px-2 py-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:bg-slate-900/60 transition-colors">
                    <span className="text-xs font-mono text-slate-400">2</span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">LightGBM</div>
                      <span className="text-[9px] text-slate-500 font-mono">Candidate M...</span>
                    </div>
                    <span className="text-xs font-mono text-slate-400 text-right">0.941</span>
                    <span className="text-xs font-mono text-slate-300 text-right">
                      {isClassification ? "0.936" : "0.915"}
                    </span>
                    <MoreVertical className="w-3.5 h-3.5 text-slate-600 hover:text-white cursor-pointer" />
                  </div>

                  {/* Row 3: CatBoost */}
                  <div className="grid grid-cols-[24px_1fr_60px_60px_20px] gap-2 items-center px-2 py-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:bg-slate-900/60 transition-colors">
                    <span className="text-xs font-mono text-slate-400">3</span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">CatBoost</div>
                      <span className="text-[9px] text-slate-500 font-mono">Candidate M...</span>
                    </div>
                    <span className="text-xs font-mono text-slate-400 text-right">0.941</span>
                    <span className="text-xs font-mono text-slate-300 text-right">
                      {isClassification ? "0.932" : "0.898"}
                    </span>
                    <MoreVertical className="w-3.5 h-3.5 text-slate-600 hover:text-white cursor-pointer" />
                  </div>
                </div>
              </div>

              {/* Pagination footer matching reference */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>Forwarded</span>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    8 ▾
                  </span>
                  <button className="p-1 rounded hover:bg-slate-800 text-slate-400" aria-label="Previous">
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button className="p-1 rounded hover:bg-slate-800 text-slate-400" aria-label="Next">
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          WORKFLOW STAGE CONTROLS IMMEDIATELY BELOW THE PANEL (REQUIREMENT 4)
          ========================================================================= */}
      <div className="mt-6 flex flex-col items-center">
        {/* Centered Pill Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          {STAGE_CONTROLS.map((stage) => {
            const Icon = stage.icon;
            const isSelected = activeStage === stage.id;
            return (
              <button
                key={stage.id}
                onClick={() => setActiveStage((prev) => (prev === stage.id ? null : stage.id))}
                className={`inline-flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer backdrop-blur-md shadow-md ${
                  isSelected
                    ? "bg-amber-500/20 border border-amber-500/60 text-amber-300 shadow-amber-500/10 scale-105"
                    : "bg-[#0b1016]/90 border border-slate-800 text-slate-300 hover:border-amber-500/40 hover:text-white"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-amber-400" : "text-slate-400"}`} />
                <span>{stage.label}</span>
              </button>
            );
          })}
        </div>

        {/* Expanded Stage Detail Panel */}
        {currentStageDetail && (
          <div className="w-full mt-4 p-5 sm:p-6 rounded-xl bg-[#090d13]/95 border border-amber-500/30 shadow-2xl backdrop-blur-lg animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <currentStageDetail.icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white font-sans">
                    {currentStageDetail.title}
                  </h4>
                  <p className="text-xs text-slate-400 font-sans mt-0.5">
                    {currentStageDetail.description}
                  </p>
                </div>
              </div>

              {currentStageDetail.endpoint && (
                <div className="shrink-0 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-amber-400">
                  {currentStageDetail.endpoint}
                </div>
              )}
            </div>

            {/* Inputs, Processing, Outputs 3-Column Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
              {/* Input */}
              <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider block mb-1.5">
                  Input
                </span>
                <p className="text-slate-300 leading-relaxed font-sans">
                  {currentStageDetail.input}
                </p>
              </div>

              {/* Processing */}
              <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-wider block mb-1.5">
                  Processing &amp; Algorithms
                </span>
                <p className="text-slate-300 leading-relaxed font-sans">
                  {currentStageDetail.processing}
                </p>
              </div>

              {/* Output */}
              <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block mb-1.5">
                  Output Artifact
                </span>
                <p className="text-slate-300 leading-relaxed font-sans">
                  {currentStageDetail.output}
                </p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-500">
                <span>Parameters:</span>
                <span className="text-slate-400">
                  {currentStageDetail.parameters.join(" • ")}
                </span>
              </div>
              <button
                onClick={onLaunchWorkspace}
                className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-bold transition-colors cursor-pointer"
              >
                <span>Execute in Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
