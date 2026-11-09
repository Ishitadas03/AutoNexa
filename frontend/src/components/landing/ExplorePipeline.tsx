"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  UploadCloud,
  FileText,
  Database,
  Brain,
  FlaskConical,
  Target,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Sparkles,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";

interface ExplorePipelineProps {
  onLaunchWorkspace: () => void;
}

type WorkflowIndicatorId =
  | "profiling"
  | "recommendations"
  | "training"
  | "evaluation"
  | "prediction";

interface IndicatorDetail {
  id: WorkflowIndicatorId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  input: string;
  processing: string;
  output: string;
}

const WORKFLOW_INDICATORS: IndicatorDetail[] = [
  {
    id: "profiling",
    label: "Dataset Profiling",
    icon: Database,
    title: "Dataset Intelligence & Profiling",
    description:
      "Automated schema inference, nullity distribution analysis, duplicate detection, and cryptographic SHA-256 fingerprinting.",
    input: "Raw tabular CSV file (streaming upload up to 10 MB)",
    processing:
      "Tabular integrity check, statistical summary calculations, missing value ratios, memory profiling.",
    output: "Dataset profile with shape (rows × columns), data types, and SHA-256 fingerprint.",
  },
  {
    id: "recommendations",
    label: "Task Recommendations",
    icon: Brain,
    title: "Task Selection & Recommendations",
    description:
      "Heuristic ML task detection (binary, multiclass, or continuous regression) with data quality audits.",
    input: "Profiled dataset with optional target column override",
    processing:
      "Column role classification, target cardinality check, class imbalance calculation, quality warning severity tagging.",
    output: "Recommended task type, confidence level, class distribution breakdown, quality warning codes.",
  },
  {
    id: "training",
    label: "AutoML Training",
    icon: Zap,
    title: "Resource-Aware AutoML Engine",
    description:
      "Resource-bounded candidate model search across linear, tree, and ensemble architectures with strict wall-clock time budgets.",
    input: "Target column, task type, candidate model selection, validation protocol, wall-clock time limit",
    processing:
      "Leakage-safe preprocessing pipelines fit strictly on train folds. StratifiedKFold or holdout validation.",
    output: "Fitted estimators, per-fold CV performance scores, sample standard deviations (ddof=1).",
  },
  {
    id: "evaluation",
    label: "Model Evaluation",
    icon: FlaskConical,
    title: "Multi-Metric Model Leaderboard",
    description:
      "Direction-aware metric ranking, sample standard deviation calculations, and holdout validation on untouched data.",
    input: "Completed experiment ID and fitted pipeline artifacts",
    processing:
      "Ranking of all evaluated models by primary metric (F1, ROC-AUC, RMSE). Holdout score verification.",
    output: "Ranked model leaderboard, best estimator designation, CV mean ± std, latency benchmarks.",
  },
  {
    id: "prediction",
    label: "Prediction Playground",
    icon: Target,
    title: "Zero-Retraining Inference & Export",
    description:
      "Low-latency real-time JSON inference or high-throughput batch CSV scoring using the winning serialized pipeline.",
    input: "Single JSON record or CSV batch file, experiment ID",
    processing:
      "Feature schema alignment against training pipeline, missing feature imputation with train statistics.",
    output: "Predicted labels / regression values, class probability distribution array, downloadable batch CSV.",
  },
];

export default function ExplorePipeline({ onLaunchWorkspace }: ExplorePipelineProps) {
  // State for dataset upload in Card 1
  const [datasetName, setDatasetName] = useState<string>("customer_churn.csv");
  const [rowsCount, setRowsCount] = useState<number | string>(8662);
  const [colsCount, setColsCount] = useState<number | string>(24);
  const [fileSizeBytes, setFileSizeBytes] = useState<string>("482 KB");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>("customer_churn.csv loaded");

  // State for AutoML Training Studio in Card 2
  const [selectedDataset, setSelectedDataset] = useState<string>("churn");
  const [targetColumn, setTargetColumn] = useState<string>("churn");
  const [taskType, setTaskType] = useState<string>("Classification");
  const [evalStrategy, setEvalStrategy] = useState<string>("Cross-Validation (5 folds)");
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isTraining, setIsTraining] = useState<boolean>(false);

  // State for active indicator drawer
  const [activeIndicator, setActiveIndicator] = useState<WorkflowIndicatorId | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle dataset selection change in Card 2
  const handleDatasetChange = (val: string) => {
    setSelectedDataset(val);
    if (val === "churn") {
      setDatasetName("customer_churn.csv");
      setRowsCount(8662);
      setColsCount(24);
      setFileSizeBytes("482 KB");
      setTargetColumn("churn");
      setTaskType("Classification");
      setUploadStatus("customer_churn.csv loaded");
    } else {
      setDatasetName("housing_prices.csv");
      setRowsCount(1240);
      setColsCount(14);
      setFileSizeBytes("94 KB");
      setTargetColumn("price");
      setTaskType("Regression");
      setUploadStatus("housing_prices.csv loaded");
    }
  };

  // Real file upload handler connected to backend API
  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      alert("Please upload a CSV file (.csv format only).");
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    try {
      const profile = await api.uploadDataset(file);
      setDatasetName(profile.filename);
      setRowsCount(profile.rows);
      setColsCount(profile.columns);
      const sizeKB = (profile.file_size_bytes || profile.memory_usage_bytes || file.size) / 1024;
      setFileSizeBytes(`${sizeKB.toFixed(1)} KB`);
      setUploadStatus(`Uploaded ${file.name}`);
      if (profile.column_names && profile.column_names.length > 0) {
        setTargetColumn(profile.column_names[profile.column_names.length - 1]);
      }
    } catch {
      // Offline fallback
      const text = await file.text();
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map((h) => h.trim());
      setDatasetName(file.name);
      setRowsCount(Math.max(1, lines.length - 1));
      setColsCount(headers.length);
      const sizeKB = file.size / 1024;
      setFileSizeBytes(`${sizeKB.toFixed(1)} KB`);
      setUploadStatus(`Loaded ${file.name}`);
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

  // Simulate training sequence through the 4 steps
  const handleStartTraining = () => {
    setIsTraining(true);
    setActiveStep(1);
    setTimeout(() => setActiveStep(2), 700);
    setTimeout(() => setActiveStep(3), 1400);
    setTimeout(() => {
      setActiveStep(4);
      setIsTraining(false);
    }, 2200);
  };

  const currentIndicator = WORKFLOW_INDICATORS.find((i) => i.id === activeIndicator);

  return (
    <section id="pipeline" className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
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

      {/* Section Header matching reference */}
      <div className="text-center max-w-3xl mx-auto mb-14">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-4">
          Explore the{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500">
            AutoNexa
          </span>{" "}
          Pipeline
        </h2>
        <p className="text-sm sm:text-base text-slate-400">
          From raw CSV data to evaluated machine learning models, follow every stage of the AutoML workflow.
        </p>
      </div>

      {/* =========================================================================
          THE THREE CONNECTED CARDS CONTAINER
          ========================================================================= */}
      <div className="relative">
        {/* DESKTOP SVG CONNECTOR OVERLAY WITH CONTINUOUS MOVING GOLD PARTICLES */}
        <div className="hidden lg:block absolute inset-0 pointer-events-none z-0">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 1200 480" fill="none">
            <defs>
              <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
              </linearGradient>
              <filter id="particleGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* CONNECTOR 1: Card 1 (CSV Upload) -> Card 2 (AutoML Training Studio) */}
            <path
              id="connector1"
              d="M 370 230 C 400 230, 400 250, 430 250"
              stroke="url(#flowGrad)"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray="6 3"
            />
            {/* Visibly moving gold particle along Connector 1 */}
            <circle r="4.5" fill="#fbbf24" filter="url(#particleGlow)">
              <animateMotion
                dur="2.2s"
                repeatCount="indefinite"
                path="M 370 230 C 400 230, 400 250, 430 250"
              />
            </circle>

            {/* CONNECTOR 2: Card 2 (AutoML Training Studio) -> Card 3 (Model Leaderboard) */}
            <path
              id="connector2"
              d="M 770 250 C 800 250, 800 230, 830 230"
              stroke="url(#flowGrad)"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray="6 3"
            />
            {/* Visibly moving gold particle along Connector 2 */}
            <circle r="4.5" fill="#fbbf24" filter="url(#particleGlow)">
              <animateMotion
                dur="2.2s"
                repeatCount="indefinite"
                begin="1.1s"
                path="M 770 250 C 800 250, 800 230, 830 230"
              />
            </circle>
          </svg>
        </div>

        {/* 3 CARDS IN HORIZONTAL GRID (Desktop) / VERTICAL STACK (Mobile) */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {/* =====================================================================
              CARD 1: 01 CSV Upload
              ===================================================================== */}
          <div className="relative rounded-2xl bg-[#090d13]/95 border border-slate-800/90 hover:border-amber-500/40 transition-all p-5 sm:p-6 flex flex-col justify-between shadow-2xl backdrop-blur-xl group">
            {/* Outgoing socket dot on right edge for desktop connector */}
            <div className="hidden lg:block absolute -right-2 top-[226px] w-4 h-4 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md shadow-amber-500/60" />

            <div>
              {/* Card Header matching reference */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center font-mono">
                      01
                    </span>
                    <h3 className="text-base font-bold text-white">CSV Upload</h3>
                    <span className="text-[10px] text-amber-400 font-mono truncate max-w-[120px]">
                      ({datasetName})
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Upload your dataset to get started</p>
                </div>
              </div>

              {/* Drag and Drop Zone matching reference */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed border-slate-700/80 bg-slate-950/60 p-6 text-center cursor-pointer hover:border-amber-500/60 hover:bg-amber-500/5 transition-all mb-4 group/drop"
              >
                <div className="flex flex-col items-center gap-2.5">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center group-hover/drop:border-amber-500/50 group-hover/drop:scale-105 transition-all shadow-inner">
                    {isUploading ? (
                      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    ) : (
                      <UploadCloud className="w-6 h-6 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-200 group-hover/drop:text-amber-300">
                      Drag and drop your CSV file here
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">or click to browse</p>
                  </div>
                </div>
              </div>

              {/* Choose CSV File Solid Gold Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isUploading ? "Uploading..." : "Choose CSV File"}
              </button>

              {/* Upload Status Confirmation */}
              {uploadStatus && (
                <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{uploadStatus}</span>
                </div>
              )}
            </div>

            {/* Bottom 3 Stat Boxes matching reference */}
            <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
                <span className="text-xs font-mono font-bold text-white block">
                  {typeof rowsCount === "number" ? rowsCount.toLocaleString() : rowsCount}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mt-0.5">Rows</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
                <span className="text-xs font-mono font-bold text-white block">
                  {typeof colsCount === "number" ? colsCount.toLocaleString() : colsCount}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mt-0.5">Columns</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
                <span className="text-xs font-mono font-bold text-white block">
                  {fileSizeBytes}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mt-0.5">File Size</span>
              </div>
            </div>
          </div>

          {/* MOBILE CONNECTOR 1 -> 2 (Vertical with moving gold particle) */}
          <div className="flex lg:hidden items-center justify-center py-2">
            <svg width="40" height="48" viewBox="0 0 40 48" fill="none">
              <path d="M 20 0 L 20 48" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="4 2" />
              <circle r="4" fill="#fbbf24">
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 20 0 L 20 48" />
              </circle>
            </svg>
          </div>

          {/* =====================================================================
              CARD 2: 02 AutoML Training Studio
              ===================================================================== */}
          <div className="relative rounded-2xl bg-[#090d13]/95 border border-slate-800/90 hover:border-amber-500/40 transition-all p-5 sm:p-6 flex flex-col justify-between shadow-2xl backdrop-blur-xl group">
            {/* Sockets on left and right borders for desktop */}
            <div className="hidden lg:block absolute -left-2 top-[246px] w-4 h-4 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md shadow-amber-500/60" />
            <div className="hidden lg:block absolute -right-2 top-[246px] w-4 h-4 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md shadow-amber-500/60" />

            <div>
              {/* Card Header matching reference */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center font-mono">
                      02
                    </span>
                    <h3 className="text-base font-bold text-white">AutoML Training Studio</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Configure and train multiple models</p>
                </div>
              </div>

              {/* 2x2 Form Controls Grid matching reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-xs font-sans">
                {/* Dataset Select */}
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">Dataset</label>
                  <select
                    value={selectedDataset}
                    onChange={(e) => handleDatasetChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-200 text-xs focus:border-amber-500 focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="churn">Customer Churn</option>
                    <option value="housing">Housing Prices</option>
                  </select>
                </div>

                {/* Target Column Select */}
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">Target Column</label>
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-200 text-xs focus:border-amber-500 focus:outline-none transition-colors cursor-pointer"
                  >
                    {selectedDataset === "churn" ? (
                      <>
                        <option value="churn">churn</option>
                        <option value="monthly_charges">monthly_charges</option>
                        <option value="contract">contract</option>
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

                {/* Task Type Select */}
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">Task Type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-200 text-xs focus:border-amber-500 focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="Classification">Classification</option>
                    <option value="Regression">Regression</option>
                  </select>
                </div>

                {/* Evaluation Strategy Select */}
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">Evaluation Strategy</label>
                  <select
                    value={evalStrategy}
                    onChange={(e) => setEvalStrategy(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-200 text-xs focus:border-amber-500 focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="Cross-Validation (5 folds)">Cross-Validation (5 folds)</option>
                    <option value="Holdout Split (80/20)">Holdout Split (80/20)</option>
                  </select>
                </div>
              </div>

              {/* Start Training Solid Gold Button */}
              <button
                type="button"
                onClick={handleStartTraining}
                disabled={isTraining}
                className="w-full py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                {isTraining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Running Training Pipeline...</span>
                  </>
                ) : (
                  <span>Start Training</span>
                )}
              </button>
            </div>

            {/* 4-Step Progress Indicator below button matching reference */}
            <div className="mt-5 pt-4 border-t border-slate-800/80">
              <div className="relative flex items-center justify-between text-center px-1">
                {/* Connecting track line */}
                <div className="absolute top-3.5 left-4 right-4 h-0.5 bg-slate-800 -z-0" />

                {/* Step 1: Analyze */}
                <div className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                      activeStep >= 1
                        ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/30"
                        : "bg-slate-900 border border-slate-700 text-slate-400"
                    }`}
                  >
                    1
                  </div>
                  <span className={`text-[10px] mt-1.5 font-medium ${activeStep >= 1 ? "text-amber-300" : "text-slate-500"}`}>
                    Analyze
                  </span>
                </div>

                {/* Step 2: Preprocess */}
                <div className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                      activeStep >= 2
                        ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/30"
                        : "bg-slate-900 border border-slate-700 text-slate-400"
                    }`}
                  >
                    2
                  </div>
                  <span className={`text-[10px] mt-1.5 font-medium ${activeStep >= 2 ? "text-amber-300" : "text-slate-500"}`}>
                    Preprocess
                  </span>
                </div>

                {/* Step 3: Train */}
                <div className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                      activeStep >= 3
                        ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/30"
                        : "bg-slate-900 border border-slate-700 text-slate-400"
                    }`}
                  >
                    3
                  </div>
                  <span className={`text-[10px] mt-1.5 font-medium ${activeStep >= 3 ? "text-amber-300" : "text-slate-500"}`}>
                    Train
                  </span>
                </div>

                {/* Step 4: Evaluate */}
                <div className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                      activeStep >= 4
                        ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/30"
                        : "bg-slate-900 border border-slate-700 text-slate-400"
                    }`}
                  >
                    4
                  </div>
                  <span className={`text-[10px] mt-1.5 font-medium ${activeStep >= 4 ? "text-amber-300" : "text-slate-500"}`}>
                    Evaluate
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* MOBILE CONNECTOR 2 -> 3 (Vertical with moving gold particle) */}
          <div className="flex lg:hidden items-center justify-center py-2">
            <svg width="40" height="48" viewBox="0 0 40 48" fill="none">
              <path d="M 20 0 L 20 48" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="4 2" />
              <circle r="4" fill="#fbbf24">
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 20 0 L 20 48" />
              </circle>
            </svg>
          </div>

          {/* =====================================================================
              CARD 3: 03 Model Leaderboard
              ===================================================================== */}
          <div className="relative rounded-2xl bg-[#090d13]/95 border border-slate-800/90 hover:border-amber-500/40 transition-all p-5 sm:p-6 flex flex-col justify-between shadow-2xl backdrop-blur-xl group">
            {/* Ingoing socket on left border for desktop */}
            <div className="hidden lg:block absolute -left-2 top-[226px] w-4 h-4 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md shadow-amber-500/60" />

            <div>
              {/* Card Header matching reference */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center font-mono">
                      03
                    </span>
                    <h3 className="text-base font-bold text-white">Model Leaderboard</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Compare models and choose the best</p>
                </div>
              </div>

              {/* Table matching reference design */}
              <div className="w-full text-xs font-mono mb-4">
                {/* Table Header */}
                <div className="grid grid-cols-[20px_1fr_60px_60px_45px] gap-2 items-center px-2 py-2 text-[10px] text-slate-400 font-semibold border-b border-slate-800">
                  <span>#</span>
                  <span>Model</span>
                  <span className="text-right">ROC-AUC</span>
                  <span className="text-right">F1 Score</span>
                  <span className="text-right">Status</span>
                </div>

                {/* Row 1: Random Forest (Winner) */}
                <div className="grid grid-cols-[20px_1fr_60px_60px_45px] gap-2 items-center px-2 py-2.5 rounded-lg bg-slate-950/40 border border-slate-800/60 mt-1">
                  <span className="text-slate-400">1</span>
                  <span className="text-white font-sans font-medium truncate">Random Forest</span>
                  <span className="text-right text-slate-300">0.941</span>
                  <span className="text-right text-slate-300">0.938</span>
                  <div className="text-right">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Best
                    </span>
                  </div>
                </div>

                {/* Row 2: Hist. Gradient Boosting */}
                <div className="grid grid-cols-[20px_1fr_60px_60px_45px] gap-2 items-center px-2 py-2.5 rounded-lg hover:bg-slate-900/50 transition-colors">
                  <span className="text-slate-500">2</span>
                  <span className="text-slate-300 font-sans truncate">Hist. Gradient Boosting</span>
                  <span className="text-right text-slate-400">0.936</span>
                  <span className="text-right text-slate-400">0.934</span>
                  <span className="text-right text-slate-600">—</span>
                </div>

                {/* Row 3: Logistic Regression */}
                <div className="grid grid-cols-[20px_1fr_60px_60px_45px] gap-2 items-center px-2 py-2.5 rounded-lg hover:bg-slate-900/50 transition-colors">
                  <span className="text-slate-500">3</span>
                  <span className="text-slate-300 font-sans truncate">Logistic Regression</span>
                  <span className="text-right text-slate-400">0.912</span>
                  <span className="text-right text-slate-400">0.901</span>
                  <span className="text-right text-slate-600">—</span>
                </div>

                {/* Row 4: Decision Tree */}
                <div className="grid grid-cols-[20px_1fr_60px_60px_45px] gap-2 items-center px-2 py-2.5 rounded-lg hover:bg-slate-900/50 transition-colors">
                  <span className="text-slate-500">4</span>
                  <span className="text-slate-300 font-sans truncate">Decision Tree</span>
                  <span className="text-right text-slate-400">0.876</span>
                  <span className="text-right text-slate-400">0.861</span>
                  <span className="text-right text-slate-600">—</span>
                </div>

                {/* Row 5: Dummy Classifier */}
                <div className="grid grid-cols-[20px_1fr_60px_60px_45px] gap-2 items-center px-2 py-2.5 rounded-lg hover:bg-slate-900/50 transition-colors">
                  <span className="text-slate-500">5</span>
                  <span className="text-slate-300 font-sans truncate">Dummy Classifier</span>
                  <span className="text-right text-slate-400">0.521</span>
                  <span className="text-right text-slate-400">0.318</span>
                  <span className="text-right text-slate-600">—</span>
                </div>
              </div>
            </div>

            {/* View Full Results Button matching reference */}
            <div className="pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={onLaunchWorkspace}
                className="w-full py-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-850 text-white border border-slate-700/80 hover:border-amber-500/40 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>View Full Results</span>
                <ArrowRight className="w-4 h-4 text-amber-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          FIVE WORKFLOW INDICATORS IMMEDIATELY BELOW PANEL (REQUIREMENT 6)
          ========================================================================= */}
      <div className="mt-12 flex flex-col items-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {WORKFLOW_INDICATORS.map((indicator) => {
            const Icon = indicator.icon;
            const isSelected = activeIndicator === indicator.id;
            return (
              <button
                key={indicator.id}
                onClick={() => setActiveIndicator((prev) => (prev === indicator.id ? null : indicator.id))}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer backdrop-blur-md shadow-md ${
                  isSelected
                    ? "bg-amber-500/20 border border-amber-500/60 text-amber-300 shadow-amber-500/10 scale-105"
                    : "bg-[#0b1016]/90 border border-slate-800 text-slate-300 hover:border-amber-500/40 hover:text-white"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-amber-400" : "text-slate-400"}`} />
                <span>{indicator.label}</span>
              </button>
            );
          })}
        </div>

        {/* Expandable Technical Specification Drawer */}
        {currentIndicator && (
          <div className="w-full max-w-4xl mt-5 p-5 sm:p-6 rounded-2xl bg-[#0a0e14]/95 border border-amber-500/30 shadow-2xl backdrop-blur-lg animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-800">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <currentIndicator.icon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">{currentIndicator.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5">{currentIndicator.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider block mb-1.5">
                  Input
                </span>
                <p className="text-slate-300 leading-relaxed">{currentIndicator.input}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-wider block mb-1.5">
                  Processing &amp; Logic
                </span>
                <p className="text-slate-300 leading-relaxed">{currentIndicator.processing}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block mb-1.5">
                  Output Artifact
                </span>
                <p className="text-slate-300 leading-relaxed">{currentIndicator.output}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
