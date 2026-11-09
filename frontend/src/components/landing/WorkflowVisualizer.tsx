"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  UploadCloud,
  FileText,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  Filter,
  CheckCircle2,
  BarChart3,
  Zap,
  Database,
  Brain,
  FlaskConical,
  Target,
  ArrowDown,
} from "lucide-react";

/* ────────────── Types ────────────── */
interface WorkflowVisualizerProps {
  onLaunchWorkspace: () => void;
}

type StageId =
  | "profiling"
  | "recommendations"
  | "training"
  | "evaluation"
  | "prediction";

interface StageDetail {
  id: StageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  inputs: string[];
  outputs: string[];
  features: string[];
}

/* ────────────── Illustrative leaderboard data (clearly labeled) ────────────── */
const ILLUSTRATIVE_MODELS = [
  {
    rank: 1,
    name: "XGBoost",
    tag: "Candidate Model",
    rocAuc: "0.941",
    metric: "0.947",
    cvStd: "±0.012",
    accent: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/40",
    icon: "⚡",
    isBest: true,
  },
  {
    rank: 2,
    name: "LightGBM",
    tag: "Candidate Model",
    rocAuc: "0.941",
    metric: "0.936",
    cvStd: "±0.018",
    accent: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: "🌳",
    isBest: false,
  },
  {
    rank: 3,
    name: "CatBoost",
    tag: "Candidate Model",
    rocAuc: "0.941",
    metric: "0.932",
    cvStd: "±0.015",
    accent: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: "🅱",
    isBest: false,
  },
];

/* ────────────── Stage detail data ────────────── */
const STAGE_DETAILS: StageDetail[] = [
  {
    id: "profiling",
    label: "Dataset Profiling",
    icon: Database,
    title: "Dataset Intelligence & Profiling",
    description:
      "Automated schema inference, nullity distribution analysis, duplicate detection, and statistical profiling of uploaded CSV datasets.",
    inputs: ["Raw CSV file (up to 10 MB)"],
    outputs: [
      "Column types & roles",
      "Missing value distribution",
      "Duplicate row count",
      "Memory usage",
      "SHA-256 fingerprint",
    ],
    features: [
      "Automatic data type inference",
      "High-cardinality detection",
      "Constant/near-constant column detection",
    ],
  },
  {
    id: "recommendations",
    label: "Task Recommendations",
    icon: Brain,
    title: "Task Selection & Configuration",
    description:
      "Heuristic ML task detection (binary, multiclass, regression) with target candidate ranking and data quality audit.",
    inputs: ["Profiled dataset", "Optional target column override"],
    outputs: [
      "Recommended task type",
      "Confidence level",
      "Class distribution analysis",
      "Imbalance detection",
      "Quality warnings",
    ],
    features: [
      "Binary / multiclass / regression detection",
      "Class imbalance detection",
      "Quality warning codes with severity levels",
    ],
  },
  {
    id: "training",
    label: "AutoML Training",
    icon: Zap,
    title: "AutoML Training Engine",
    description:
      "Resource-aware candidate model search across linear, tree, and ensemble architectures with strict wall-clock time budgets and leakage-safe evaluation.",
    inputs: [
      "Target column",
      "Task type",
      "Model selection",
      "Evaluation strategy",
      "Time budget",
    ],
    outputs: [
      "Trained candidate pipelines",
      "Per-fold CV metrics",
      "Ranked model leaderboard",
      "Best model selection",
    ],
    features: [
      "StratifiedKFold / holdout strategies",
      "Configurable metric (F1, ROC-AUC, RMSE, etc.)",
      "Wall-clock time budgets",
      "MLflow experiment tracking",
    ],
  },
  {
    id: "evaluation",
    label: "Experiment Evaluation",
    icon: FlaskConical,
    title: "Evaluation & Model Leaderboard",
    description:
      "Direction-aware metric leaderboards with CV mean/std, holdout test evaluation, and experiment artifact tracking.",
    inputs: ["Completed training experiment"],
    outputs: [
      "Ranked model leaderboard",
      "CV mean ± std per model",
      "Holdout test metrics",
      "Model artifacts & metadata",
      "Evaluation protocol documentation",
    ],
    features: [
      "Direction-aware ranking (higher/lower is better)",
      "Sample standard deviation (ddof=1)",
      "Untouched holdout test evaluation",
      "MLflow parent & child run tracking",
    ],
  },
  {
    id: "prediction",
    label: "Prediction Playground",
    icon: Target,
    title: "Prediction Playground",
    description:
      "Zero-retraining inference using the best trained pipeline with probability distributions, feature realignment, and batch CSV export.",
    inputs: [
      "Single JSON record or batch CSV file",
      "Completed experiment ID",
    ],
    outputs: [
      "Predicted labels/values",
      "Class probabilities (classification)",
      "Batch CSV download",
      "Input validation warnings",
    ],
    features: [
      "Automatic feature realignment",
      "Probability distribution per class",
      "Batch CSV predictions with instant download",
      "No retraining required",
    ],
  },
];

/* ────────────── SVG Connector Between Panels (Desktop) ────────────── */
function PanelConnector() {
  return (
    <div className="hidden lg:flex items-center justify-center w-8 -mx-1 relative z-10">
      <svg
        width="32"
        height="80"
        viewBox="0 0 32 80"
        fill="none"
        className="overflow-visible"
      >
        {/* Main curved path */}
        <path
          d="M0 40 C16 40, 16 20, 32 20"
          stroke="url(#connectorGradient)"
          strokeWidth="1.5"
          fill="none"
          className="connector-path-glow"
        />
        <path
          d="M0 40 C16 40, 16 60, 32 60"
          stroke="url(#connectorGradient)"
          strokeWidth="1.5"
          fill="none"
          className="connector-path-glow"
          style={{ animationDelay: "0.5s" }}
        />
        {/* Glowing dot on top path */}
        <circle r="3" fill="#f59e0b" opacity="0.9">
          <animateMotion
            dur="3s"
            repeatCount="indefinite"
            path="M0 40 C16 40, 16 20, 32 20"
          />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
        {/* Glowing dot on bottom path */}
        <circle r="2.5" fill="#fbbf24" opacity="0.7">
          <animateMotion
            dur="3s"
            repeatCount="indefinite"
            begin="1.5s"
            path="M0 40 C16 40, 16 60, 32 60"
          />
          <animate
            attributeName="opacity"
            values="0;0.8;0.8;0"
            dur="3s"
            repeatCount="indefinite"
            begin="1.5s"
          />
        </circle>
        <defs>
          <linearGradient id="connectorGradient" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="1" stopColor="#f59e0b" stopOpacity="0.15" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/* ────────────── Mobile Vertical Connector ────────────── */
function VerticalConnector() {
  return (
    <div className="flex lg:hidden items-center justify-center py-2">
      <div className="relative flex flex-col items-center">
        <div className="w-px h-6 bg-gradient-to-b from-amber-500/40 to-amber-500/10" />
        <ArrowDown className="w-3.5 h-3.5 text-amber-500/50 -mt-0.5" />
      </div>
    </div>
  );
}

/* ────────────── Stage Detail Panel ────────────── */
function StageDetailPanel({ stage }: { stage: StageDetail }) {
  const Icon = stage.icon;
  return (
    <div className="detail-panel-enter mt-6 rounded-xl glass-panel-glow p-5 md:p-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h4 className="text-base font-bold text-white mb-1">{stage.title}</h4>
          <p className="text-sm text-slate-400 leading-relaxed">
            {stage.description}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Inputs */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-white/5">
          <h5 className="text-[11px] font-mono font-semibold text-emerald-400 uppercase tracking-wider mb-2">
            Input
          </h5>
          <ul className="space-y-1">
            {stage.inputs.map((input, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                <ChevronRight className="w-3 h-3 text-slate-600 shrink-0 mt-0.5" />
                {input}
              </li>
            ))}
          </ul>
        </div>

        {/* Outputs */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-white/5">
          <h5 className="text-[11px] font-mono font-semibold text-sky-400 uppercase tracking-wider mb-2">
            Output
          </h5>
          <ul className="space-y-1">
            {stage.outputs.map((output, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                <ChevronRight className="w-3 h-3 text-slate-600 shrink-0 mt-0.5" />
                {output}
              </li>
            ))}
          </ul>
        </div>

        {/* Features */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-white/5">
          <h5 className="text-[11px] font-mono font-semibold text-amber-400 uppercase tracking-wider mb-2">
            Key Features
          </h5>
          <ul className="space-y-1">
            {stage.features.map((feat, i) => (
              <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-amber-500/60 shrink-0 mt-0.5" />
                {feat}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ────────────── Main Component ────────────── */
export default function WorkflowVisualizer({
  onLaunchWorkspace,
}: WorkflowVisualizerProps) {
  const [activeLeaderboardTab, setActiveLeaderboardTab] = useState<
    "candidate" | "interactive"
  >("candidate");
  const [activeStage, setActiveStage] = useState<StageId | null>(null);
  const stageScrollerRef = useRef<HTMLDivElement>(null);

  const handleStageClick = useCallback((stageId: StageId) => {
    setActiveStage((prev) => (prev === stageId ? null : stageId));
  }, []);

  // Scroll active stage pill into view on mobile
  useEffect(() => {
    if (!activeStage || !stageScrollerRef.current) return;
    const btn = stageScrollerRef.current.querySelector(
      `[data-stage="${activeStage}"]`
    );
    btn?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeStage]);

  const activeStageData = activeStage
    ? STAGE_DETAILS.find((s) => s.id === activeStage) ?? null
    : null;

  return (
    <section
      id="workflow"
      className="relative py-12 md:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-amber-400 font-mono mb-3">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Interactive Architecture Preview
        </div>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mb-3">
          End-to-End Automated Pipeline
        </h2>
        <p className="text-sm sm:text-base text-slate-400">
          Inspect how AutoNexa processes raw tabular CSVs, applies leakage-aware
          preprocessing, searches model families, and exposes calibrated inference
          — all in one unified workspace.
        </p>
      </div>

      {/* ========== MOCK WORKSPACE CONTAINER ========== */}
      <div className="relative rounded-2xl border border-slate-800/80 bg-[#0c1117] overflow-hidden shadow-2xl shadow-black/40">
        {/* Title bar (macOS-style) */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a0e14] border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-slate-400">
            <Filter className="w-3 h-3" />
            <span>Filter log…</span>
          </div>

          {/* Illustrative label */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-amber-400/80">Illustrative Preview</span>
          </div>
        </div>

        {/* ─── 3-Panel Workspace Grid ─── */}
        <div className="flex flex-col lg:flex-row">
          {/* ── Panel 1: CSV Upload ── */}
          <div className="flex-1 p-5 lg:p-6 border-b lg:border-b-0 lg:border-r border-slate-800/60 pipeline-panel">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-amber-400" />
              CSV Upload
            </h3>

            {/* Drag-and-drop area */}
            <div className="rounded-xl border-2 border-dashed border-slate-700/80 bg-slate-950/40 p-5 text-center mb-4 hover:border-amber-500/40 transition-colors cursor-pointer group">
              <div className="flex flex-col items-center gap-2.5">
                <div className="w-11 h-11 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:border-amber-500/40 transition-colors">
                  <FileText className="w-5 h-5 text-slate-500 group-hover:text-amber-400 transition-colors" />
                </div>
                <div>
                  <p className="text-xs text-slate-300 font-medium">
                    Drop or drag your CSV data here
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Tabular CSV format • Up to 10 MB
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                OR
              </span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            <button
              onClick={onLaunchWorkspace}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              CSV Upload
            </button>

            {/* Dataset summary — illustrative */}
            <div className="mt-4 pt-3 border-t border-slate-800/60">
              <h4 className="text-[11px] font-semibold text-white mb-2">
                Dataset summary
              </h4>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="p-2 rounded bg-slate-950/60 border border-white/5">
                  <span className="text-slate-500 block mb-0.5">Rows</span>
                  <span className="text-slate-200 font-mono font-bold text-xs">
                    8,662
                  </span>
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-white/5">
                  <span className="text-slate-500 block mb-0.5">Features</span>
                  <span className="text-slate-200 font-mono font-bold text-xs">
                    24
                  </span>
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-white/5">
                  <span className="text-slate-500 block mb-0.5">Target</span>
                  <span className="text-amber-400 font-mono font-bold text-xs">
                    churn
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-slate-600 mt-2 italic font-mono">
                ⓘ Illustrative preview — upload your data in the workspace
              </p>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>Max 10 MB</span>
              <span>SHA-256 verified</span>
            </div>
          </div>

          {/* Connector 1→2 */}
          <PanelConnector />
          <VerticalConnector />

          {/* ── Panel 2: AutoML Training Studio ── */}
          <div className="flex-1 p-5 lg:p-6 border-b lg:border-b-0 lg:border-r border-slate-800/60 pipeline-panel">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                AutoML Training Studio
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-400">
                Training
              </span>
            </div>

            {/* Training config — illustrative */}
            <div className="space-y-3 mb-4">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-white/5">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400 font-mono">Target column</span>
                  <span className="text-amber-400 font-mono font-semibold">
                    customer_churn
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-white/5">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400 font-mono">Task type</span>
                  <span className="text-sky-400 font-mono">Binary Classification</span>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-white/5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">Evaluation</span>
                  <span className="text-slate-300 font-mono">StratifiedKFold (5)</span>
                </div>
              </div>
            </div>

            {/* Candidate model cards — illustrative */}
            <h4 className="text-[11px] font-semibold text-white mb-2">
              Candidate Models
            </h4>
            <div className="space-y-1.5 mb-4">
              {["XGBoost", "LightGBM", "CatBoost", "Random Forest"].map(
                (model, i) => (
                  <div
                    key={model}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-950/50 border border-white/5 text-[10px]"
                  >
                    <span className="text-slate-300 font-mono">{model}</span>
                    <span
                      className={`font-mono ${
                        i === 0 ? "text-emerald-400" : "text-slate-500"
                      }`}
                    >
                      {i === 0 ? "✓ Best" : "Candidate"}
                    </span>
                  </div>
                )
              )}
            </div>

            <div className="mt-auto pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>StratifiedKFold</span>
              <span className="text-amber-400">5-Fold CV</span>
            </div>
            <p className="text-[9px] text-slate-600 mt-2 italic font-mono">
              ⓘ Illustrative config — configure in the workspace
            </p>
          </div>

          {/* Connector 2→3 */}
          <PanelConnector />
          <VerticalConnector />

          {/* ── Panel 3: Leaderboard ── */}
          <div className="flex-1 p-5 lg:p-6 pipeline-panel">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                Leaderboard
              </h3>
            </div>

            {/* Tab Toggles */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setActiveLeaderboardTab("candidate")}
                className={`text-[10px] font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeLeaderboardTab === "candidate"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
                    : "bg-slate-900 text-slate-400 border border-slate-700 hover:border-slate-600"
                }`}
              >
                Candidate metrics
                {activeLeaderboardTab === "candidate" && (
                  <CheckCircle2 className="w-3 h-3" />
                )}
              </button>
              <button
                onClick={() => setActiveLeaderboardTab("interactive")}
                className={`text-[10px] font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeLeaderboardTab === "interactive"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
                    : "bg-slate-900 text-slate-400 border border-slate-700 hover:border-slate-600"
                }`}
              >
                Interactive metrics
                {activeLeaderboardTab === "interactive" && (
                  <CheckCircle2 className="w-3 h-3" />
                )}
              </button>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-2 py-1.5 text-[9px] font-mono text-slate-500 uppercase tracking-wider border-b border-slate-800/60 mb-1">
              <span>#</span>
              <span>Model</span>
              <span>ROC-AUC</span>
              <span>Metrics</span>
            </div>

            {/* Model Rows */}
            <div className="space-y-1">
              {ILLUSTRATIVE_MODELS.map((model) => (
                <div
                  key={model.rank}
                  className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center px-2 py-2.5 rounded-lg transition-colors hover:bg-slate-900/60 group ${
                    model.rank === 1 ? "bg-slate-900/40" : ""
                  }`}
                >
                  <span className="text-xs font-mono text-slate-500 w-4 text-center">
                    {model.rank}
                  </span>

                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${model.bg} border ${model.border}`}
                    >
                      {model.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                        {model.name}
                        {model.isBest && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            BEST
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono truncate">
                        {model.tag} {model.cvStd}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs font-mono text-slate-300">
                    {model.rocAuc}
                  </span>

                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${model.bg} border ${model.border} ${model.accent}`}
                  >
                    {model.metric}
                  </span>

                  <button
                    onClick={onLaunchWorkspace}
                    className="text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    aria-label={`View details for ${model.name}`}
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span className="italic">Illustrative data</span>
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                  3 ▾
                </span>
                <button className="p-0.5 rounded hover:bg-slate-800 text-slate-500 cursor-pointer" aria-label="Previous page">
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button className="p-0.5 rounded hover:bg-slate-800 text-slate-500 cursor-pointer" aria-label="Next page">
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========== Workflow Stage Selectors ========== */}
      <div
        ref={stageScrollerRef}
        className="flex items-center justify-start lg:justify-center gap-2.5 mt-8 overflow-x-auto pb-2 stage-scroller"
      >
        {STAGE_DETAILS.map((stage) => {
          const Icon = stage.icon;
          const isActive = activeStage === stage.id;
          return (
            <button
              key={stage.id}
              data-stage={stage.id}
              onClick={() => handleStageClick(stage.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer backdrop-blur-sm shrink-0 ${
                isActive
                  ? "bg-amber-500/15 border border-amber-500/50 text-amber-300 shadow-lg shadow-amber-500/10"
                  : "bg-slate-900/80 border border-slate-700/80 text-slate-300 hover:border-amber-500/40 hover:text-amber-300"
              }`}
              aria-expanded={isActive}
              aria-controls={isActive ? `stage-detail-${stage.id}` : undefined}
            >
              <Icon className="w-3.5 h-3.5 text-amber-400" />
              {stage.label}
            </button>
          );
        })}
      </div>

      {/* ========== Expanded Stage Detail Panel ========== */}
      {activeStageData && (
        <div
          id={`stage-detail-${activeStageData.id}`}
          role="region"
          aria-label={`Details for ${activeStageData.title}`}
        >
          <StageDetailPanel stage={activeStageData} />
        </div>
      )}

      {/* Decorative ambient glow */}
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] rounded-full pointer-events-none -mr-32 -mb-32" />
    </section>
  );
}
