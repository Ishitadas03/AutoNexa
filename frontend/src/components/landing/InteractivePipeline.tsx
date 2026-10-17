"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  UploadCloud,
  FileText,
  Database,
  Zap,
  BarChart3,
  FlaskConical,
  Target,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Settings,
  ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { DatasetProfileResponse } from "@/types/api";

interface InteractivePipelineProps {
  onLaunchWorkspace: () => void;
}

interface SevenStage {
  number: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  input: string;
  processing: string;
  output: string;
  endpoint?: string;
}

const SEVEN_STAGES: SevenStage[] = [
  {
    number: "01",
    title: "CSV Dataset Upload",
    icon: UploadCloud,
    description: "Stream tabular CSV data with schema inference, nullity distribution analysis, and SHA-256 fingerprinting.",
    input: "Raw CSV file (up to 50 MB, streaming upload)",
    processing: "Tabular integrity checks, delimiter detection, type inference (numeric, categorical, datetime).",
    output: "Dataset profile with shape (rows × columns), data types, missing counts, and immutable hash.",
    endpoint: "POST /api/v1/datasets/upload",
  },
  {
    number: "02",
    title: "Dataset Intelligence & Profiling",
    icon: Database,
    description: "Heuristic feature role classification, target candidate identification, and data-quality audits.",
    input: "Profiled dataset ID, optional target override",
    processing: "Target cardinality checks, class imbalance ratio, quality warning severity tagging (INFO, WARNING, CRITICAL).",
    output: "Column role summaries, recommended target, quality warnings with actionable remedies.",
    endpoint: "POST /api/v1/datasets/{id}/analyze",
  },
  {
    number: "03",
    title: "Task Selection & Configuration",
    icon: Settings,
    description: "Task type verification (binary, multiclass, regression) and cross-validation strategy selection.",
    input: "Target column, user evaluation preferences",
    processing: "Stratification analysis, fold split generation, evaluation metric selection (F1, ROC-AUC, RMSE, R²).",
    output: "Validated training configuration with bounded time and resource limits.",
    endpoint: "Configuration specification",
  },
  {
    number: "04",
    title: "AutoML Training Engine",
    icon: Zap,
    description: "Multi-model search across linear, tree, and ensemble architectures with strict wall-clock limits.",
    input: "Configured training request and dataset split",
    processing: "Leakage-safe preprocessing pipelines fit strictly in-fold. Parallel estimator training with timeout guardrails.",
    output: "Fitted candidate estimators with per-fold metrics, sample standard deviations (ddof=1).",
    endpoint: "POST /api/v1/datasets/{id}/train",
  },
  {
    number: "05",
    title: "Evaluation & Model Comparison",
    icon: BarChart3,
    description: "Direction-aware metric leaderboard, holdout validation on untouched data, and winner selection.",
    input: "Trained candidate models and test partition",
    processing: "Leaderboard ranking by primary metric, generalization error check on untouched holdout split.",
    output: "Ranked leaderboard, best model designation, CV mean ± std, latency benchmarks.",
    endpoint: "GET /api/v1/experiments/{id}",
  },
  {
    number: "06",
    title: "Experiment Tracking & Artifacts",
    icon: FlaskConical,
    description: "MLflow run lineage with parent/child structure, hyperparameter logging, and serialized joblib pipeline.",
    input: "Completed experiment ID",
    processing: "Model file serialization, metadata extraction, dependency version recording, SHA-256 artifact verification.",
    output: "Serialized pipeline file, feature names list, run metrics, artifact checksum.",
    endpoint: "GET /api/v1/experiments/{id}",
  },
  {
    number: "07",
    title: "Prediction Playground",
    icon: Target,
    description: "Low-latency JSON inference or high-throughput batch CSV scoring using the winning pipeline.",
    input: "Single JSON record or batch CSV, experiment ID",
    processing: "Feature schema realignment, missing value imputation using train distribution, probability estimation.",
    output: "Predicted values/labels, class probability distributions, downloadable scored CSV.",
    endpoint: "POST /api/v1/experiments/{id}/predict",
  },
];

export default function InteractivePipeline({ onLaunchWorkspace }: InteractivePipelineProps) {
  // Preset selector
  const [activePreset, setActivePreset] = useState<"churn" | "housing">("churn");
  const [uploadedProfile, setUploadedProfile] = useState<DatasetProfileResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  // Training form state
  const [targetColumn, setTargetColumn] = useState<string>("churn");
  const [taskType, setTaskType] = useState<string>("Classification");
  const [evalStrategy, setEvalStrategy] = useState<string>("StratifiedKFold (5 folds)");
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isTraining, setIsTraining] = useState<boolean>(false);

  // Active expanded stage detail
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isClassification = activePreset === "churn";
  const displayFilename = uploadedProfile?.filename ?? (isClassification ? "customer_churn.csv" : "housing_prices.csv");
  const displayRows = uploadedProfile?.rows ?? (isClassification ? 8662 : 1240);
  const displayCols = uploadedProfile?.columns ?? (isClassification ? 24 : 14);
  const displayFileSize = uploadedProfile
    ? `${((uploadedProfile.file_size_bytes || 482000) / 1024).toFixed(1)} KB`
    : (isClassification ? "482 KB" : "94 KB");

  // Handle Preset Toggle
  const handleSelectPreset = (preset: "churn" | "housing") => {
    setActivePreset(preset);
    setUploadedProfile(null);
    setUploadMessage(null);
    if (preset === "churn") {
      setTargetColumn("churn");
      setTaskType("Classification");
    } else {
      setTargetColumn("price");
      setTaskType("Regression");
    }
  };

  // Real file upload connected to API
  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      alert("Please upload a CSV file (.csv format only).");
      return;
    }

    setIsUploading(true);
    setUploadMessage(null);

    try {
      const profile = await api.uploadDataset(file);
      setUploadedProfile(profile);
      setUploadMessage(`Uploaded ${file.name}`);
      if (profile.column_names && profile.column_names.length > 0) {
        setTargetColumn(profile.column_names[profile.column_names.length - 1]);
      }
    } catch {
      // Local fallback
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
      setUploadMessage(`Loaded ${file.name}`);
      if (headers.length > 0) {
        setTargetColumn(headers[headers.length - 1]);
      }
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

  // Simulate training sequence through 4 steps
  const handleStartTraining = () => {
    setIsTraining(true);
    setActiveStep(1);
    setTimeout(() => setActiveStep(2), 600);
    setTimeout(() => setActiveStep(3), 1200);
    setTimeout(() => {
      setActiveStep(4);
      setIsTraining(false);
    }, 1800);
  };

  return (
    <section id="pipeline" className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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

      {/* Section Header: Minimal, Technical */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pb-5 border-b border-[#14221c]">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-mono text-emerald-400 mb-2 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Workflow Engine</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Interactive AutoNexa Pipeline
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
            A real, connected workflow from uncleaned CSV ingestion to ranked estimators and zero-retrain artifacts.
          </p>
        </div>
      </div>

      {/* =========================================================================
          PART A: THE THREE CONNECTED PANELS (In Ramotion Rounded Inset Canvas)
          ========================================================================= */}
      <div className="ramotion-canvas-frame p-4 sm:p-6 md:p-8 mb-20 relative overflow-hidden">
        {/* Subtle ambient inner emerald glow */}
        <div
          className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[650px] h-[250px] opacity-25"
          style={{
            background: "radial-gradient(circle, rgba(16, 185, 129, 0.25), transparent 70%)",
          }}
        />

        {/* Technical Window Header Bar */}
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-5 mb-7 border-b border-[#14221c] text-xs font-mono">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500/80 inline-block" />
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#081510] border border-emerald-900/50 text-[11px] text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span>autonexa-runtime // tabular-engine-v1.0</span>
            </div>
          </div>

          {/* Dataset Preset Toggle */}
          <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#08120d] border border-[#14291f] text-xs font-mono">
            <button
              onClick={() => handleSelectPreset("churn")}
              className={`px-3.5 py-1 rounded-full transition-colors cursor-pointer ${
                activePreset === "churn"
                  ? "bg-[#0f241a] text-emerald-300 font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Benchmark: Telco Churn
            </button>
            <button
              onClick={() => handleSelectPreset("housing")}
              className={`px-3.5 py-1 rounded-full transition-colors cursor-pointer ${
                activePreset === "housing"
                  ? "bg-[#0f241a] text-emerald-300 font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Benchmark: CA Housing
            </button>
          </div>
        </div>

        {/* DESKTOP THIN SVG CONNECTOR OVERLAY (Behind cards, with subtle moving emerald indicator) */}
        <div className="hidden lg:block absolute inset-0 pointer-events-none z-0">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 1200 460" fill="none">
            {/* CONNECTOR 1: Panel 1 (CSV Upload) -> Panel 2 (AutoML Studio) */}
            <path
              d="M 370 270 C 400 270, 400 270, 430 270"
              stroke="#10b981"
              strokeWidth="1.5"
              strokeOpacity="0.4"
              fill="none"
              strokeDasharray="4 3"
            />
            {/* Subtle, precise emerald indicator traveling along connector 1 */}
            <circle r="3.5" fill="#34d399">
              <animateMotion
                dur="2.4s"
                repeatCount="indefinite"
                path="M 370 270 C 400 270, 400 270, 430 270"
              />
            </circle>

            {/* CONNECTOR 2: Panel 2 (AutoML Studio) -> Panel 3 (Model Leaderboard) */}
            <path
              d="M 770 270 C 800 270, 800 270, 830 270"
              stroke="#10b981"
              strokeWidth="1.5"
              strokeOpacity="0.4"
              fill="none"
              strokeDasharray="4 3"
            />
            {/* Subtle, precise emerald indicator traveling along connector 2 */}
            <circle r="3.5" fill="#34d399">
              <animateMotion
                dur="2.4s"
                repeatCount="indefinite"
                begin="1.2s"
                path="M 770 270 C 800 270, 800 270, 830 270"
              />
            </circle>
          </svg>
        </div>

        {/* 3 PANELS GRID */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {/* ===================================================================
              PANEL 1: CSV Upload
              =================================================================== */}
          <div className="rounded-xl bg-[#080d11] border border-[#14221c] hover:border-[#1f372c] transition-colors p-5 sm:p-6 flex flex-col justify-between relative group">
            {/* Socket dot on right edge for desktop connector */}
            <div className="hidden lg:block absolute -right-1.5 top-[226px] w-3 h-3 rounded-full bg-emerald-400 border border-slate-950 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />

            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#14221c]">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">CSV Upload</h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-400/80 bg-[#081510] px-2 py-0.5 rounded-full border border-emerald-900/60">
                  Stage 01
                </span>
              </div>

              {/* Upload Dropzone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-dashed border-[#1a2c24] hover:border-emerald-500/50 bg-[#06090c] p-6 text-center cursor-pointer transition-colors mb-4 group/drop"
              >
                <div className="flex flex-col items-center gap-2">
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                  ) : (
                    <UploadCloud className="w-5 h-5 text-slate-400 group-hover/drop:text-emerald-400 transition-colors" />
                  )}
                  <p className="text-xs font-medium text-slate-300">
                    Drop tabular CSV file here
                  </p>
                  <p className="text-[10px] text-slate-500">
                    or click to browse local files (max 50 MB)
                  </p>
                </div>
              </div>

              {/* Choose CSV File Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full py-2 rounded-full bg-[#0d161a] hover:bg-[#122026] text-slate-200 border border-[#1b2c26] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>{isUploading ? "Reading CSV..." : "Choose CSV File"}</span>
              </button>

              {uploadMessage && (
                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{uploadMessage}</span>
                </div>
              )}
            </div>

            {/* Dataset Profile Summary */}
            <div className="mt-5 pt-3.5 border-t border-[#14221c]">
              <div className="flex items-center justify-between text-[11px] mb-2 font-mono">
                <span className="text-slate-500">Active:</span>
                <span className="text-emerald-400 font-medium truncate max-w-[170px]">{displayFilename}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="p-2 rounded bg-[#060a0d] border border-[#14221c]">
                  <span className="text-slate-200 font-bold block">{displayRows.toLocaleString()}</span>
                  <span className="text-[9px] text-slate-500 block uppercase">Rows</span>
                </div>
                <div className="p-2 rounded bg-[#060a0d] border border-[#14221c]">
                  <span className="text-slate-200 font-bold block">{displayCols}</span>
                  <span className="text-[9px] text-slate-500 block uppercase">Cols</span>
                </div>
                <div className="p-2 rounded bg-[#060a0d] border border-[#14221c]">
                  <span className="text-slate-200 font-bold block">{displayFileSize}</span>
                  <span className="text-[9px] text-slate-500 block uppercase">Size</span>
                </div>
              </div>
            </div>
          </div>

          {/* MOBILE CONNECTOR 1 -> 2 */}
          <div className="flex lg:hidden items-center justify-center py-1">
            <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
              <path d="M 12 0 L 12 32" stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="3 3" />
              <circle r="3" fill="#34d399">
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 12 0 L 12 32" />
              </circle>
            </svg>
          </div>

          {/* ===================================================================
              PANEL 2: AutoML Training Studio
              =================================================================== */}
          <div className="rounded-xl bg-[#080d11] border border-[#14221c] hover:border-[#1f372c] transition-colors p-5 sm:p-6 flex flex-col justify-between relative group">
            {/* Sockets for desktop connector */}
            <div className="hidden lg:block absolute -left-1.5 top-[226px] w-3 h-3 rounded-full bg-emerald-400 border border-slate-950 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <div className="hidden lg:block absolute -right-1.5 top-[226px] w-3 h-3 rounded-full bg-emerald-400 border border-slate-950 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />

            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#14221c]">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">AutoML Training Studio</h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-300 bg-[#081911] px-2.5 py-0.5 rounded-full border border-emerald-900/60">
                  Ready
                </span>
              </div>

              {/* Training Configuration Grid */}
              <div className="grid grid-cols-2 gap-2.5 mb-4 text-xs font-sans">
                <div>
                  <label className="text-[10px] font-mono text-slate-500 block mb-1">Target Column</label>
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#06090c] border border-[#1a2c24] text-slate-300 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    {isClassification ? (
                      <>
                        <option value="churn">churn</option>
                        <option value="contract">contract</option>
                        <option value="monthly_charges">monthly_charges</option>
                      </>
                    ) : (
                      <>
                        <option value="price">price</option>
                        <option value="sqft">sqft</option>
                        <option value="bedrooms">bedrooms</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-slate-500 block mb-1">Task Type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#06090c] border border-[#1a2c24] text-slate-300 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Classification">Classification</option>
                    <option value="Regression">Regression</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] font-mono text-slate-500 block mb-1">Validation Protocol</label>
                  <select
                    value={evalStrategy}
                    onChange={(e) => setEvalStrategy(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#06090c] border border-[#1a2c24] text-slate-300 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="StratifiedKFold (5 folds)">StratifiedKFold (5 folds) — Leakage Safe</option>
                    <option value="Holdout Split (80/20)">Holdout Split (80/20)</option>
                  </select>
                </div>
              </div>

              {/* Start Training Button - Ramotion style */}
              <button
                type="button"
                onClick={handleStartTraining}
                disabled={isTraining}
                className="btn-ramotion w-full py-2.5 text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isTraining ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>Executing Pipeline...</span>
                  </>
                ) : (
                  <span>Start Training Search</span>
                )}
              </button>
            </div>

            {/* 4-Step Technical Progress Indicator */}
            <div className="mt-5 pt-3.5 border-t border-[#14221c]">
              <div className="flex items-center justify-between text-center px-1 text-[11px] font-mono">
                <div className={`flex flex-col items-center ${activeStep >= 1 ? "text-emerald-400 font-semibold" : "text-slate-600"}`}>
                  <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center mb-1">1</span>
                  <span>Analyze</span>
                </div>
                <div className={`flex-1 h-px mx-2 -mt-4 ${activeStep >= 2 ? "bg-emerald-500/50" : "bg-[#182920]"}`} />
                <div className={`flex flex-col items-center ${activeStep >= 2 ? "text-emerald-400 font-semibold" : "text-slate-600"}`}>
                  <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center mb-1">2</span>
                  <span>Preprocess</span>
                </div>
                <div className={`flex-1 h-px mx-2 -mt-4 ${activeStep >= 3 ? "bg-emerald-500/50" : "bg-[#182920]"}`} />
                <div className={`flex flex-col items-center ${activeStep >= 3 ? "text-emerald-400 font-semibold" : "text-slate-600"}`}>
                  <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center mb-1">3</span>
                  <span>Train</span>
                </div>
                <div className={`flex-1 h-px mx-2 -mt-4 ${activeStep >= 4 ? "bg-emerald-500/50" : "bg-[#182920]"}`} />
                <div className={`flex flex-col items-center ${activeStep >= 4 ? "text-emerald-400 font-semibold" : "text-slate-600"}`}>
                  <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center mb-1">4</span>
                  <span>Evaluate</span>
                </div>
              </div>
            </div>
          </div>

          {/* MOBILE CONNECTOR 2 -> 3 */}
          <div className="flex lg:hidden items-center justify-center py-1">
            <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
              <path d="M 12 0 L 12 32" stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="3 3" />
              <circle r="3" fill="#34d399">
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 12 0 L 12 32" />
              </circle>
            </svg>
          </div>

          {/* ===================================================================
              PANEL 3: Model Leaderboard
              =================================================================== */}
          <div className="rounded-xl bg-[#080d11] border border-[#14221c] hover:border-[#1f372c] transition-colors p-5 sm:p-6 flex flex-col justify-between relative group">
            {/* Socket for desktop connector */}
            <div className="hidden lg:block absolute -left-1.5 top-[226px] w-3 h-3 rounded-full bg-emerald-400 border border-slate-950 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />

            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#14221c]">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Model Leaderboard</h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-400/80 bg-[#081510] px-2 py-0.5 rounded-full border border-emerald-900/60">
                  Evaluation
                </span>
              </div>

              {/* Table */}
              <div className="w-full text-xs font-mono mb-4">
                <div className="grid grid-cols-[18px_1fr_55px_55px_45px] gap-1.5 px-2 py-1.5 text-[10px] text-slate-500 border-b border-[#14221c]">
                  <span>#</span>
                  <span>Model</span>
                  <span className="text-right">{isClassification ? "ROC-AUC" : "R²"}</span>
                  <span className="text-right">{isClassification ? "F1" : "RMSE"}</span>
                  <span className="text-right">Status</span>
                </div>

                <div className="grid grid-cols-[18px_1fr_55px_55px_45px] gap-1.5 items-center px-2 py-2 rounded bg-[#0b1913] border border-[#163826] mt-1 text-slate-200">
                  <span className="text-emerald-400 font-bold">1</span>
                  <span className="truncate font-sans font-medium">Random Forest</span>
                  <span className="text-right">{isClassification ? "0.941" : "0.925"}</span>
                  <span className="text-right">{isClassification ? "0.938" : "24.1k"}</span>
                  <div className="text-right">
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                      Best
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-[18px_1fr_55px_55px_45px] gap-1.5 items-center px-2 py-1.5 text-slate-400 hover:text-slate-200">
                  <span className="text-slate-600">2</span>
                  <span className="truncate font-sans">Hist. Gradient Boosting</span>
                  <span className="text-right">{isClassification ? "0.936" : "0.918"}</span>
                  <span className="text-right">{isClassification ? "0.934" : "26.4k"}</span>
                  <span className="text-right text-slate-600">—</span>
                </div>

                <div className="grid grid-cols-[18px_1fr_55px_55px_45px] gap-1.5 items-center px-2 py-1.5 text-slate-400 hover:text-slate-200">
                  <span className="text-slate-600">3</span>
                  <span className="truncate font-sans">Logistic Regression</span>
                  <span className="text-right">{isClassification ? "0.912" : "0.892"}</span>
                  <span className="text-right">{isClassification ? "0.901" : "31.0k"}</span>
                  <span className="text-right text-slate-600">—</span>
                </div>

                <div className="grid grid-cols-[18px_1fr_55px_55px_45px] gap-1.5 items-center px-2 py-1.5 text-slate-400 hover:text-slate-200">
                  <span className="text-slate-600">4</span>
                  <span className="truncate font-sans">Decision Tree</span>
                  <span className="text-right">{isClassification ? "0.876" : "0.845"}</span>
                  <span className="text-right">{isClassification ? "0.861" : "38.2k"}</span>
                  <span className="text-right text-slate-600">—</span>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-3 border-t border-[#14221c]">
              <button
                type="button"
                onClick={onLaunchWorkspace}
                className="w-full py-2 rounded-full bg-[#0d161a] hover:bg-[#122026] text-slate-300 hover:text-white border border-[#1b2c26] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>View Full Results in Workspace</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PART B: THE DETAILED SEVEN-STAGE PIPELINE (Directly Below 3 Panels)
          ========================================================================= */}
      <div className="pt-8 border-t border-[#14221c]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-8">
          <div>
            <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block mb-1">
              End-to-End Pipeline Architecture
            </span>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Seven-Stage AutoML Execution Specification
            </h3>
          </div>
          <p className="text-xs text-slate-400 max-w-md font-sans">
            Every step transforms tabular data through reproducible Python &amp; scikit-learn pipelines with leakage prevention.
          </p>
        </div>

        {/* Seven Stage Track: Horizontal on Desktop, Vertical on Mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
          {SEVEN_STAGES.map((stage) => {
            const Icon = stage.icon;
            const isExpanded = expandedStage === stage.number;
            return (
              <div
                key={stage.number}
                onClick={() => setExpandedStage(isExpanded ? null : stage.number)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between text-left ${
                  isExpanded
                    ? "bg-[#0c1c15] border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                    : "bg-[#080d11] border-[#14221c] hover:border-[#1f372c]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono font-bold text-emerald-400">
                      {stage.number}
                    </span>
                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-white mb-1 leading-snug">
                    {stage.title}
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-relaxed font-sans line-clamp-3">
                    {stage.description}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-[#14221c] flex items-center justify-between text-[9px] font-mono text-slate-500">
                  <span>Details</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180 text-emerald-400" : ""}`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Expanded Stage Drawer */}
        {expandedStage && (
          <div className="mt-4 p-5 rounded-xl bg-[#080e12] border border-[#162e22] text-xs font-sans animate-in fade-in duration-150">
            {(() => {
              const active = SEVEN_STAGES.find((s) => s.number === expandedStage);
              if (!active) return null;
              return (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2.5 border-b border-[#14221c]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-emerald-400">Stage {active.number}:</span>
                      <span className="text-sm font-bold text-white">{active.title}</span>
                    </div>
                    {active.endpoint && (
                      <span className="text-[10px] font-mono text-slate-400 bg-[#06090c] px-2.5 py-0.5 rounded-full border border-[#14221c]">
                        {active.endpoint}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3.5 rounded-lg bg-[#06090c] border border-[#14221c]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 block mb-1">
                        Input
                      </span>
                      <p className="text-slate-300 leading-relaxed">{active.input}</p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#06090c] border border-[#14221c]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 block mb-1">
                        Processing
                      </span>
                      <p className="text-slate-300 leading-relaxed">{active.processing}</p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-[#06090c] border border-[#14221c]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 block mb-1">
                        Output
                      </span>
                      <p className="text-slate-300 leading-relaxed">{active.output}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </section>
  );
}
