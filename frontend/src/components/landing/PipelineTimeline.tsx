"use client";

import React from "react";
import {
  Upload,
  Search,
  Settings,
  Zap,
  BarChart3,
  FlaskConical,
  Target,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface PipelineTimelineProps {
  onLaunchWorkspace: () => void;
}

interface PipelineStage {
  number: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  input: string;
  processing: string;
  output: string;
  features: string[];
  limitations: string[];
  apiEndpoint?: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    number: 1,
    title: "CSV Dataset Upload",
    icon: Upload,
    input: "Raw CSV file (up to 50 MB)",
    processing:
      "File validation, tabular integrity check, SHA-256 fingerprinting, and automated schema inference with column type detection.",
    output:
      "Dataset profile with row/column counts, data types, missing values, duplicate rows, and memory usage.",
    features: [
      "SHA-256 cryptographic fingerprinting",
      "Automatic data type inference",
      "Missing value distribution",
      "Duplicate row detection",
    ],
    limitations: [
      "CSV format only (no Excel, Parquet, etc.)",
      "50 MB file size limit",
      "Tabular data only — no images, text corpora, or time series",
    ],
    apiEndpoint: "POST /api/v1/datasets/upload",
  },
  {
    number: 2,
    title: "Dataset Intelligence & Profiling",
    icon: Search,
    input: "Uploaded dataset ID, optional target column override",
    processing:
      "Column role classification, cardinality analysis, constant/near-constant detection, quality warning generation, and candidate target ranking.",
    output:
      "Column summaries with inferred roles, quality warnings with severity levels, and ranked target candidates.",
    features: [
      "Automatic column role inference (numeric, categorical, identifier, etc.)",
      "High-cardinality detection",
      "Quality warning codes with severity (info, warning, critical)",
    ],
    limitations: [
      "Heuristic-based — may require manual target column override",
      "Does not perform statistical hypothesis testing",
    ],
    apiEndpoint: "POST /api/v1/datasets/{id}/analyze",
  },
  {
    number: 3,
    title: "Task Selection & Training Configuration",
    icon: Settings,
    input: "Dataset analysis results, user configuration preferences",
    processing:
      "ML task type detection (binary classification, multiclass, regression), class distribution analysis, imbalance detection, and evaluation strategy configuration.",
    output:
      "Task recommendation with confidence level, class distribution, imbalance status, and configured training parameters.",
    features: [
      "Binary / multiclass / regression auto-detection",
      "Class imbalance detection with minority class percentage",
      "Configurable evaluation strategy (CV or holdout)",
      "Customizable primary metric",
    ],
    limitations: [
      "No multi-label or multi-output task support",
      "No automatic feature engineering",
    ],
  },
  {
    number: 4,
    title: "AutoML Training Engine",
    icon: Zap,
    input:
      "Target column, task type, model selection, evaluation strategy, time budget",
    processing:
      "Resource-aware candidate model search across linear, tree, and ensemble architectures with StratifiedKFold cross-validation or holdout split. Wall-clock time budgets enforced per model.",
    output:
      "Trained candidate model pipelines with per-fold CV metrics, ranked by primary metric.",
    features: [
      "StratifiedKFold / holdout evaluation",
      "Wall-clock time budget enforcement",
      "MLflow experiment tracking (parent & child runs)",
      "Multiple metric support (F1, ROC-AUC, RMSE, etc.)",
    ],
    limitations: [
      "No hyperparameter tuning (grid/random/Bayesian)",
      "No neural network or deep learning models",
      "No real-time training progress streaming",
      "Training is synchronous — results returned after completion",
    ],
    apiEndpoint: "POST /api/v1/datasets/{id}/train",
  },
  {
    number: 5,
    title: "Evaluation & Model Leaderboard",
    icon: BarChart3,
    input: "Completed training experiment",
    processing:
      "Direction-aware metric ranking, sample standard deviation (ddof=1), holdout test set evaluation on untouched data, and model artifact persistence.",
    output:
      "Ranked leaderboard with CV mean ± std, holdout metrics, best model designation, and evaluation protocol documentation.",
    features: [
      "Direction-aware ranking (higher/lower is better)",
      "Sample std with ddof=1",
      "Untouched holdout test evaluation",
      "Per-model status tracking (successful, failed, timeout)",
    ],
    limitations: [
      "No confusion matrix or ROC curve visualization yet",
      "No model interpretability (SHAP, LIME)",
    ],
  },
  {
    number: 6,
    title: "Experiment Tracking & Model Artifacts",
    icon: FlaskConical,
    input: "Experiment ID",
    processing:
      "Artifact availability verification, model file existence check, metadata retrieval, and MLflow run ID resolution.",
    output:
      "Experiment status, artifact availability, model format, file size, SHA-256 hash, feature lists, and package versions.",
    features: [
      "Artifact existence verification",
      "Model SHA-256 hash tracking",
      "Feature name preservation",
      "Package version recording",
    ],
    limitations: [
      "No model download API",
      "No experiment comparison across runs",
    ],
    apiEndpoint: "GET /api/v1/experiments/{id}",
  },
  {
    number: 7,
    title: "Prediction Playground",
    icon: Target,
    input: "Single JSON record or batch CSV file with experiment ID",
    processing:
      "Feature realignment against training schema, missing feature handling, inference using best trained pipeline, probability distribution computation.",
    output:
      "Predicted labels or values, class probabilities (classification), batch CSV download, and input validation warnings.",
    features: [
      "Zero-retraining inference",
      "Automatic feature realignment",
      "Probability distribution per class",
      "Batch CSV predictions with download",
    ],
    limitations: [
      "Requires a completed experiment",
      "No model serving API or deployment",
      "No A/B testing or shadow deployment",
    ],
    apiEndpoint: "POST /api/v1/experiments/{id}/predict",
  },
];

export default function PipelineTimeline({
  onLaunchWorkspace,
}: PipelineTimelineProps) {
  return (
    <section
      id="pipeline"
      className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-white/5"
    >
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-14">
        <span className="text-xs font-mono font-semibold text-amber-400 tracking-wider uppercase">
          Full Pipeline Architecture
        </span>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mt-2 mb-4">
          From Raw Data to Reliable Models
        </h2>
        <p className="text-sm sm:text-base text-slate-400">
          The Seven-Stage AutoML Architecture: Each stage transforms raw data through a disciplined pipeline — from
          CSV ingestion to production-ready inference. Explore inputs, outputs,
          and supported capabilities at each step.
        </p>
      </div>

      {/* ── Desktop: Horizontal Timeline ── */}
      <div className="hidden lg:block">
        {/* Timeline track */}
        <div className="relative mb-8">
          <div className="absolute top-6 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500/40 via-amber-500/20 to-amber-500/40" />
          <div className="grid grid-cols-7 gap-0 relative">
            {PIPELINE_STAGES.map((stage) => {
              const Icon = stage.icon;
              return (
                <div key={stage.number} className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-amber-500/30 flex items-center justify-center text-amber-400 z-10 relative shadow-lg shadow-amber-500/5">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono text-amber-400/80 mt-2">
                    Stage {String(stage.number).padStart(2, "0")}
                  </span>
                  <span className="text-[11px] font-semibold text-white mt-1 text-center leading-tight px-1">
                    {stage.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed stage cards — 2 rows */}
        <div className="space-y-4">
          {/* Row 1: stages 1-4 */}
          <div className="grid grid-cols-4 gap-4">
            {PIPELINE_STAGES.slice(0, 4).map((stage) => (
              <StageCard key={stage.number} stage={stage} />
            ))}
          </div>
          {/* Row 2: stages 5-7 */}
          <div className="grid grid-cols-3 gap-4">
            {PIPELINE_STAGES.slice(4).map((stage) => (
              <StageCard key={stage.number} stage={stage} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile/Tablet: Vertical Timeline ── */}
      <div className="lg:hidden space-y-4">
        {PIPELINE_STAGES.map((stage, idx) => (
          <div key={stage.number} className="relative">
            <StageCard stage={stage} />
            {/* Vertical connector between cards */}
            {idx < PIPELINE_STAGES.length - 1 && (
              <div className="flex justify-center py-1">
                <div className="flex flex-col items-center">
                  <div className="w-px h-4 bg-gradient-to-b from-amber-500/40 to-amber-500/10" />
                  <ChevronRight className="w-3 h-3 text-amber-500/40 rotate-90" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── CTA Banner ── */}
      <div className="mt-16 relative rounded-2xl p-8 sm:p-10 glass-panel-glow border border-amber-500/25 overflow-hidden text-center">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-2xl mx-auto space-y-4">
          <span className="text-xs font-mono font-semibold text-amber-400 uppercase tracking-widest">
            Ready to Build Your ML Pipeline?
          </span>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Explore the AutoNexa Workspace
          </h3>
          <p className="text-xs sm:text-sm text-slate-300">
            Upload your own tabular CSV dataset or use one of the instant
            pre-packaged benchmark datasets.
          </p>
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onLaunchWorkspace}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl btn-gold text-sm font-bold flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 cursor-pointer"
            >
              Launch Interactive Workspace
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────── Stage Card Component ────────────── */
function StageCard({ stage }: { stage: PipelineStage }) {
  const Icon = stage.icon;
  return (
    <div className="stage-card rounded-xl glass-panel p-4 sm:p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-amber-400/70">
              Stage {String(stage.number).padStart(2, "0")}
            </span>
            <h4 className="text-sm font-semibold text-white leading-tight">
              {stage.title}
            </h4>
          </div>
        </div>
      </div>

      {/* Input / Processing / Output */}
      <div className="space-y-2.5 text-[11px] flex-1">
        <div>
          <span className="text-emerald-400 font-mono font-semibold text-[10px] uppercase tracking-wider">
            Input
          </span>
          <p className="text-slate-400 mt-0.5 leading-relaxed">{stage.input}</p>
        </div>
        <div>
          <span className="text-sky-400 font-mono font-semibold text-[10px] uppercase tracking-wider">
            Processing
          </span>
          <p className="text-slate-400 mt-0.5 leading-relaxed">
            {stage.processing}
          </p>
        </div>
        <div>
          <span className="text-amber-400 font-mono font-semibold text-[10px] uppercase tracking-wider">
            Output
          </span>
          <p className="text-slate-400 mt-0.5 leading-relaxed">{stage.output}</p>
        </div>
      </div>

      {/* Features */}
      <div className="mt-3 pt-3 border-t border-slate-800/60">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
          Features
        </span>
        <ul className="mt-1.5 space-y-1">
          {stage.features.map((f, i) => (
            <li
              key={i}
              className="text-[10px] text-slate-400 flex items-start gap-1.5"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-500/60 shrink-0 mt-px" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Limitations */}
      {stage.limitations.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/60">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            Limitations
          </span>
          <ul className="mt-1.5 space-y-1">
            {stage.limitations.map((l, i) => (
              <li
                key={i}
                className="text-[10px] text-slate-500 flex items-start gap-1.5"
              >
                <AlertTriangle className="w-3 h-3 text-amber-500/40 shrink-0 mt-px" />
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* API Endpoint */}
      {stage.apiEndpoint && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/60">
          <code className="text-[9px] font-mono text-slate-600">
            {stage.apiEndpoint}
          </code>
        </div>
      )}
    </div>
  );
}
