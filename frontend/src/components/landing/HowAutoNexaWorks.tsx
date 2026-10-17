"use client";

import React, { useState } from "react";
import {
  FileText,
  Database,
  Settings,
  Cpu,
  BarChart3,
  ClipboardList,
  Play,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

interface HowAutoNexaWorksProps {
  onLaunchWorkspace: () => void;
}

const SEVEN_STAGES = [
  {
    step: "01",
    title: "Upload Dataset",
    description: "Upload and validate your CSV file.",
    icon: FileText,
    input: "User-provided CSV file (up to 50 MB, streaming upload).",
    processing: "Validate tabular integrity, check encoding, detect delimiters, compute immutable SHA-256 fingerprint.",
    output: "A validated dataset registered with immutable dataset_id, ready for automated analysis.",
    endpoint: "POST /api/v1/datasets/upload",
  },
  {
    step: "02",
    title: "Analyze Dataset",
    description: "Detect data types, missing values, and get insights.",
    icon: Database,
    input: "Validated dataset identifier.",
    processing: "Infer column roles (numerical, categorical, datetime), measure missingness, audit class imbalance and high cardinality.",
    output: "Comprehensive dataset profile, recommended candidate targets, and data-quality warnings.",
    endpoint: "POST /api/v1/datasets/{id}/analyze",
  },
  {
    step: "03",
    title: "Configure Task",
    description: "Select target column, choose task type and evaluation settings.",
    icon: Settings,
    input: "Target column selection and evaluation preferences.",
    processing: "Determine classification (binary/multiclass) vs regression, configure StratifiedKFold validation splits strictly in-fold.",
    output: "Strictly validated training task configuration with leakage-prevention guarantees.",
    endpoint: "Task Configuration Protocol",
  },
  {
    step: "04",
    title: "Train Models",
    description: "AutoML trains multiple candidate models with preprocessing.",
    icon: Cpu,
    input: "Configured dataset partition and candidate estimator pool.",
    processing: "Fit scikit-learn pipelines with imputation, one-hot/ordinal encoding, scaling, and hyperparameter tuning under time limits.",
    output: "Trained candidate estimators with reproducible fold metrics and execution timelines.",
    endpoint: "POST /api/v1/datasets/{id}/train",
  },
  {
    step: "05",
    title: "Evaluate & Compare",
    description: "Compare metrics and find the best model.",
    icon: BarChart3,
    input: "Cross-validation and untouched holdout test partition results.",
    processing: "Rank models direction-aware (F1, ROC-AUC, R², RMSE), verify generalization, compute latency benchmarks.",
    output: "Ranked leaderboard, best-model designation, and validation summary charts.",
    endpoint: "GET /api/v1/experiments/{id}",
  },
  {
    step: "06",
    title: "Track Experiments",
    description: "View experiment details and model artifacts.",
    icon: ClipboardList,
    input: "Completed training run identifier.",
    processing: "Serialize winning pipeline artifact (.joblib), log hyperparameters, feature schemas, and MLflow run lineage.",
    output: "Versioned model artifact package and reproducible experiment metadata.",
    endpoint: "GET /api/v1/experiments/{id}",
  },
  {
    step: "07",
    title: "Make Predictions",
    description: "Use the trained model for JSON or CSV predictions.",
    icon: Play,
    input: "Single JSON record or uploaded batch CSV dataset.",
    processing: "Execute preprocessing transforms and estimator inference with class probabilities and schema validation.",
    output: "Real-time predicted labels, prediction probabilities, and downloadable annotated CSVs.",
    endpoint: "POST /api/v1/experiments/{id}/predict",
  },
];

export default function HowAutoNexaWorks({ onLaunchWorkspace }: HowAutoNexaWorksProps) {
  const [selectedStage, setSelectedStage] = useState<string>("01");
  const [detailedViewOpen, setDetailedViewOpen] = useState(true);

  const activeStageData = SEVEN_STAGES.find((s) => s.step === selectedStage) || SEVEN_STAGES[0];

  return (
    <section id="how-it-works" className="py-20 bg-[#070D0C] border-b border-[#2A4E42]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header Matching Reference Image */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pb-6 border-b border-[#2A4E42]/40">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#68E7B5] block mb-2">
              HOW AUTONEXA WORKS
            </span>
            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl font-normal text-[#F1EFE1] tracking-tight">
              A simple workflow from data to predictions.
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 max-w-lg">
            <p className="text-xs sm:text-sm text-[#AEBEB5] font-sans">
              Follow every stage of the AutoML pipeline, designed for tabular data and real-world machine learning projects.
            </p>
            <button
              onClick={() => setDetailedViewOpen(!detailedViewOpen)}
              className="btn-autonexa-secondary px-4 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 font-medium"
            >
              <span>{detailedViewOpen ? "Hide Details" : "View Detailed Guide"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 7 Connected Workflow Cards (Horizontal Sequence Matching Reference) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
          {SEVEN_STAGES.map((s, index) => {
            const Icon = s.icon;
            const isSelected = selectedStage === s.step;
            const isLast = index === SEVEN_STAGES.length - 1;

            return (
              <div
                key={s.step}
                onClick={() => setSelectedStage(s.step)}
                className={`relative p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "bg-[#162A23] border-[#68E7B5] shadow-[0_0_20px_rgba(104,231,181,0.2)]"
                    : "bg-[#12201C] border-[#2A4E42] hover:border-[#3D705F]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-mono font-bold text-[#68E7B5]">
                      {s.step}
                    </span>
                    <Icon className="w-4 h-4 text-[#AEBEB5]" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-semibold text-[#F1EFE1] mb-1.5 leading-snug">
                    {s.title}
                  </h3>
                  <p className="text-[11px] text-[#AEBEB5] leading-relaxed font-sans line-clamp-3">
                    {s.description}
                  </p>
                </div>

                {/* Right Arrow Indicator between items on desktop */}
                {!isLast && (
                  <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
                    <span className="text-[#2A916E] text-xs">→</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ===================================================================
            SCROLLYTELLING / INTERACTIVE STAGE DRILL-DOWN (Input -> Processing -> Output)
            =================================================================== */}
        {detailedViewOpen && (
          <div className="autonexa-card-elevated p-6 sm:p-8 mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-[#2A4E42]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono font-bold text-[#68E7B5] bg-[#070D0C] px-3 py-1 rounded-full border border-[#2A4E42]">
                  Stage {activeStageData.step}
                </span>
                <h3 className="text-lg font-bold text-[#F1EFE1]">{activeStageData.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#AEBEB5] bg-[#070D0C] px-3 py-1 rounded-full border border-[#2A4E42]">
                  {activeStageData.endpoint}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
              {/* Input Card */}
              <div className="p-4 rounded-xl bg-[#0D1815] border border-[#2A4E42]">
                <div className="flex items-center gap-2 text-[#68E7B5] font-mono text-xs font-bold uppercase tracking-wider mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#68E7B5]" />
                  <span>Input</span>
                </div>
                <p className="text-[#F1EFE1] leading-relaxed">{activeStageData.input}</p>
              </div>

              {/* Processing Card */}
              <div className="p-4 rounded-xl bg-[#0D1815] border border-[#2A4E42]">
                <div className="flex items-center gap-2 text-sky-300 font-mono text-xs font-bold uppercase tracking-wider mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  <span>Processing</span>
                </div>
                <p className="text-[#F1EFE1] leading-relaxed">{activeStageData.processing}</p>
              </div>

              {/* Output Card */}
              <div className="p-4 rounded-xl bg-[#0D1815] border border-[#2A4E42]">
                <div className="flex items-center gap-2 text-[#68E7B5] font-mono text-xs font-bold uppercase tracking-wider mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#68E7B5]" />
                  <span>Output</span>
                </div>
                <p className="text-[#F1EFE1] leading-relaxed">{activeStageData.output}</p>
              </div>
            </div>

            {/* Quick Action */}
            <div className="mt-6 pt-4 border-t border-[#2A4E42] flex items-center justify-between text-xs">
              <span className="text-[#AEBEB5]">
                Test this stage interactively in the AutoNexa Workspace.
              </span>
              <button
                onClick={onLaunchWorkspace}
                className="btn-autonexa-primary px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <span>Launch Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
