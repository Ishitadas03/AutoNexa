"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Database,
  Settings,
  Cpu,
  BarChart3,
  ClipboardList,
  Play,
  Pause,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import RobotMascot from "./RobotMascot";
import RobotAnimationGuideModal from "./RobotAnimationGuideModal";

interface HowAutoNexaWorksProps {
  onLaunchWorkspace: () => void;
}

interface StageDefinition {
  step: string;
  num: number;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
  mascotState: "idle" | "working" | "thinking" | "success";
  inputSummary: string;
  processingSummary: string;
  outputSummary: string;
  technicalSpecs: string[];
  metrics: { label: string; value: string }[];
}

const SEVEN_STAGES: StageDefinition[] = [
  {
    step: "01",
    num: 1,
    title: "Upload Dataset",
    subtitle: "Tabular Ingestion & Validation",
    description: "Upload local CSV files or test with AutoNexa curated benchmarks with streaming schema validation.",
    icon: FileText,
    endpoint: "POST /api/v1/datasets/upload",
    mascotState: "working",
    inputSummary: "Raw CSV file (up to 50 MB, streaming multipart upload, auto-delimited).",
    processingSummary: "Validate tabular integrity, verify UTF-8 encoding, compute immutable SHA-256 fingerprint hash.",
    outputSummary: "Registered dataset with unique immutable dataset_id ready for automated pipeline ingestion.",
    technicalSpecs: ["SHA-256 Verification", "Multi-Delimiter Sniffer", "Zero Data-Loss Buffer"],
    metrics: [
      { label: "Max File Size", value: "50 MB" },
      { label: "Encoding", value: "UTF-8 / Latin-1" },
      { label: "Validation Time", value: "< 240ms" },
    ],
  },
  {
    step: "02",
    num: 2,
    title: "Analyze Dataset",
    subtitle: "Automated Statistical Profiling",
    description: "Deep audit of feature roles, missingness ratios, cardinality, and data-quality warnings.",
    icon: Database,
    endpoint: "POST /api/v1/datasets/{id}/analyze",
    mascotState: "thinking",
    inputSummary: "Registered dataset identifier from Stage 01.",
    processingSummary: "Audit column roles (numeric, categorical, datetime), measure missingness, check class balance.",
    outputSummary: "Comprehensive dataset profile, recommended candidate targets, and data-quality health report.",
    technicalSpecs: ["Cardinality Auditing", "Missingness Matrix", "Target Leakage Scanner"],
    metrics: [
      { label: "Profile Speed", value: "12,000 rows/sec" },
      { label: "Null Detection", value: "100% Exact" },
      { label: "Type Inference", value: "Multi-Role" },
    ],
  },
  {
    step: "03",
    num: 3,
    title: "Configure Task",
    subtitle: "Task Objective & Validation Setup",
    description: "Select target column, configure classification/regression objective, and enforce leak-free CV partitions.",
    icon: Settings,
    endpoint: "Task Configuration Protocol",
    mascotState: "thinking",
    inputSummary: "Selected target variable and user evaluation constraints.",
    processingSummary: "Determine classification (binary/multiclass) vs regression; build StratifiedKFold validation splits strictly in-fold.",
    outputSummary: "Strictly validated training task configuration with leakage-prevention guarantees.",
    technicalSpecs: ["Stratified 5-Fold CV", "Holdout Partition (20%)", "In-Fold Preprocessor"],
    metrics: [
      { label: "Validation Scheme", value: "5-Fold Stratified" },
      { label: "Holdout Split", value: "20% Untouched" },
      { label: "Leakage Guard", value: "Strictly Enforced" },
    ],
  },
  {
    step: "04",
    num: 4,
    title: "Train Models",
    subtitle: "AutoML Multi-Estimator Studio",
    description: "Simultaneously fits diverse candidate architectures with bounded hyperparameter exploration.",
    icon: Cpu,
    endpoint: "POST /api/v1/datasets/{id}/train",
    mascotState: "working",
    inputSummary: "Configured training partition, feature matrix, and candidate estimator pool.",
    processingSummary: "Fit scikit-learn pipelines with median imputation, one-hot/ordinal encoding, scaling, and tuning.",
    outputSummary: "Trained candidate estimators with reproducible fold metrics, training times, and loss trajectories.",
    technicalSpecs: ["Multi-Model Race", "Scikit-Learn Pipelines", "Adaptive Early Stopping"],
    metrics: [
      { label: "Architectures", value: "RF, XGB, LGBM, LR" },
      { label: "Preprocessing", value: "In-Pipeline" },
      { label: "Resource Bound", value: "CPU Bound Safe" },
    ],
  },
  {
    step: "05",
    num: 5,
    title: "Evaluate & Compare",
    subtitle: "Direction-Aware Leaderboard",
    description: "Comprehensive cross-validation score ranking, ROC-AUC comparison, and holdout generalization.",
    icon: BarChart3,
    endpoint: "GET /api/v1/experiments/{id}",
    mascotState: "success",
    inputSummary: "Cross-validation and untouched holdout test partition predictions.",
    processingSummary: "Rank models direction-aware (F1, ROC-AUC, R², RMSE), verify generalization, benchmark latency.",
    outputSummary: "Ranked leaderboard, best-model designation, confusion matrix, and ROC-AUC curve artifacts.",
    technicalSpecs: ["ROC-AUC Analysis", "F1 Macro/Micro", "Generalization Delta Check"],
    metrics: [
      { label: "Primary Metric", value: "ROC-AUC / F1" },
      { label: "Best Candidate", value: "Random Forest" },
      { label: "Top Score", value: "0.941" },
    ],
  },
  {
    step: "06",
    num: 6,
    title: "Track Experiments",
    subtitle: "Artifact Serialization & Lineage",
    description: "Packaging winning pipelines, hyperparameter logs, and reproducibility metadata into joblib artifacts.",
    icon: ClipboardList,
    endpoint: "GET /api/v1/experiments/{id}/artifacts",
    mascotState: "idle",
    inputSummary: "Completed training run identifier and winning model pipeline.",
    processingSummary: "Serialize winning pipeline artifact (.joblib), log hyperparameters, feature schemas, and run lineage.",
    outputSummary: "Versioned model artifact package and reproducible experiment lineage report.",
    technicalSpecs: ["Joblib Serialization", "Param Versioning", "Immutable SHA Fingerprint"],
    metrics: [
      { label: "Artifact Format", value: ".joblib Pipeline" },
      { label: "Lineage Tracking", value: "Full Audit Log" },
      { label: "Storage Footprint", value: "~1.2 MB" },
    ],
  },
  {
    step: "07",
    num: 7,
    title: "Make Predictions",
    subtitle: "Real-Time Inference Sandbox",
    description: "Execute single JSON record predictions or bulk CSV inferences with instant confidence scores.",
    icon: Play,
    endpoint: "POST /api/v1/experiments/{id}/predict",
    mascotState: "success",
    inputSummary: "Single JSON record or uploaded batch CSV dataset.",
    processingSummary: "Execute preprocessing transforms and estimator inference with class probabilities and schema validation.",
    outputSummary: "Real-time predicted labels, prediction probabilities, and downloadable annotated CSV files.",
    technicalSpecs: ["Sub-5ms Latency", "Batch CSV Processor", "Probability Calibration"],
    metrics: [
      { label: "Inference Latency", value: "< 4.2ms" },
      { label: "Batch Capacity", value: "50k rows/batch" },
      { label: "Confidence Output", value: "Calibrated %" },
    ],
  },
];

export default function HowAutoNexaWorks({ onLaunchWorkspace }: HowAutoNexaWorksProps) {
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [robotModalOpen, setRobotModalOpen] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const activeStage = SEVEN_STAGES[selectedStepIndex];

  // Auto-advance loop when playing
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setSelectedStepIndex((prev) => (prev >= SEVEN_STAGES.length - 1 ? 0 : prev + 1));
    }, 3800);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying]);

  const handleNext = () => {
    setSelectedStepIndex((prev) => (prev >= SEVEN_STAGES.length - 1 ? 0 : prev + 1));
  };

  const handlePrev = () => {
    setSelectedStepIndex((prev) => (prev <= 0 ? SEVEN_STAGES.length - 1 : prev - 1));
  };

  return (
    <section id="how-it-works" className="relative py-16 sm:py-24 bg-[#001312] border-b border-[#0E3D35]/70 overflow-hidden">
      {/* Ambient background light */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 75% 55% at 50% 45%, rgba(0, 95, 80, 0.35), transparent 75%)",
        }}
      />

      <div className="relative max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* ===================================================================
            SECTION HEADER: Matching Reference Editorial Design
            =================================================================== */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pb-6 border-b border-[#0E3D35]/60">
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#031C18]/90 border border-[#0E4A40] mb-3.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#4EECBF] shadow-[0_0_8px_#4EECBF]" />
              <span className="text-[10.5px] font-mono uppercase tracking-widest text-[#4EECBF] font-semibold">
                HOW AUTONEXA WORKS
              </span>
            </div>
            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl font-normal text-[#F1EFE1] tracking-tight leading-[1.1]">
              A simple workflow from data to <span className="text-[#4EECBF] italic font-normal">predictions.</span>
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 max-w-lg">
            <p className="text-xs sm:text-sm text-[#86A699] font-sans leading-relaxed">
              Follow every stage of the AutoML pipeline, designed for tabular data, strict cross-validation, and real-world deployment.
            </p>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => setRobotModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[#02211C] border border-[#4EECBF]/60 text-[#4EECBF] text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_12px_rgba(78,236,191,0.2)] hover:bg-[#032A24] transition-all cursor-pointer"
                title="Open interactive Robot Animation Guide"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Animation Guide</span>
              </button>
            </div>
          </div>
        </div>

        {/* ===================================================================
            MOVABLE WORKFLOW STEPPER RAIL (Interactive, Responsive & Animated)
            =================================================================== */}
        <div className="relative mb-10">
          
          {/* Top Control Bar: Play/Pause, Step Navigation & Auto-Advance Progress */}
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isPlaying
                    ? "bg-[#4EECBF] text-[#001312] shadow-[0_0_12px_rgba(78,236,191,0.4)]"
                    : "bg-[#03211C] text-[#86A699] border border-[#0E3D35] hover:text-[#F1EFE1]"
                }`}
              >
                {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                <span>{isPlaying ? "Simulating Live" : "Resume Flow"}</span>
              </button>

              <span className="text-xs font-mono text-[#86A699] hidden sm:inline">
                Active: <span className="text-[#4EECBF] font-semibold">Stage {activeStage.step} • {activeStage.title}</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                className="w-8 h-8 rounded-lg bg-[#021A17] border border-[#0E3D35] text-[#86A699] hover:text-[#4EECBF] hover:border-[#4EECBF]/60 flex items-center justify-center transition-colors cursor-pointer"
                title="Previous Stage"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNext}
                className="w-8 h-8 rounded-lg bg-[#021A17] border border-[#0E3D35] text-[#86A699] hover:text-[#4EECBF] hover:border-[#4EECBF]/60 flex items-center justify-center transition-colors cursor-pointer"
                title="Next Stage"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Connected 7-Stage Horizontal Track (Scrollable on small mobile, Panoramic on tablet/desktop) */}
          <div className="relative overflow-x-auto pb-4 pt-2 scrollbar-none">
            
            {/* Glowing animated connection wire behind stages */}
            <div className="hidden lg:block absolute top-[38px] left-[6%] right-[6%] h-[2.5px] bg-[#0E3D35] z-0">
              <div
                className="h-full bg-[#4EECBF] transition-all duration-700 ease-out shadow-[0_0_12px_#4EECBF]"
                style={{
                  width: `${(selectedStepIndex / (SEVEN_STAGES.length - 1)) * 100}%`,
                }}
              />
            </div>

            <div className="grid grid-cols-7 gap-3 min-w-[980px] lg:min-w-0 relative z-10">
              {SEVEN_STAGES.map((stage, idx) => {
                const Icon = stage.icon;
                const isSelected = selectedStepIndex === idx;
                const isCompleted = idx < selectedStepIndex;

                return (
                  <div
                    key={stage.step}
                    onClick={() => {
                      setSelectedStepIndex(idx);
                      setIsPlaying(false);
                    }}
                    className={`relative p-3.5 sm:p-4 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between group ${
                      isSelected
                        ? "bg-[#02241E] border-[#4EECBF] shadow-[0_0_24px_rgba(78,236,191,0.3)] -translate-y-1"
                        : isCompleted
                        ? "bg-[#011815] border-[#0E4A40] hover:border-[#4EECBF]/60"
                        : "bg-[#001411] border-[#0E3D35]/70 hover:border-[#1E6052]"
                    }`}
                  >
                    <div>
                      {/* Top Step Number + Icon */}
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className={`text-xs font-mono font-bold transition-colors ${
                            isSelected ? "text-[#4EECBF]" : "text-[#86A699] group-hover:text-[#4EECBF]"
                          }`}
                        >
                          {stage.step}
                        </span>
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                            isSelected
                              ? "bg-[#4EECBF] text-[#001312] shadow-[0_0_10px_#4EECBF]"
                              : isCompleted
                              ? "bg-[#022A22] text-[#4EECBF]"
                              : "bg-[#021815] text-[#86A699] group-hover:text-[#4EECBF]"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                      </div>

                      {/* Title & Subtitle */}
                      <h3
                        className={`text-xs sm:text-sm font-semibold tracking-tight transition-colors line-clamp-1 mb-1 ${
                          isSelected ? "text-[#F1EFE1]" : "text-[#E0DDD5] group-hover:text-[#4EECBF]"
                        }`}
                      >
                        {stage.title}
                      </h3>
                      <p className="text-[11px] text-[#86A699] leading-snug line-clamp-2">
                        {stage.subtitle}
                      </p>
                    </div>

                    {/* Active Bottom Pulse Bar */}
                    <div className="mt-3 pt-2 border-t border-[#0E3D35]/50 flex items-center justify-between">
                      <span className="text-[9.5px] font-mono text-[#86A699] uppercase tracking-wider">
                        {isSelected ? "Active" : isCompleted ? "Complete" : "Ready"}
                      </span>
                      {isSelected ? (
                        <span className="w-2 h-2 rounded-full bg-[#4EECBF] shadow-[0_0_8px_#4EECBF] animate-ping" />
                      ) : isCompleted ? (
                        <CheckCircle2 className="w-3 h-3 text-[#4EECBF]" />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* ===================================================================
            MOVABLE STAGE DRILL-DOWN DECK: The Interactive Lab Console
            =================================================================== */}
        <div className="relative rounded-3xl bg-[#001815] border border-[#0E4A40] p-6 sm:p-8 lg:p-10 shadow-2xl overflow-hidden">
          
          {/* Subtle background glow centered on the mascot */}
          <div
            className="pointer-events-none absolute -top-12 -left-12 w-96 h-96 opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(78, 236, 191, 0.25), transparent 70%)",
            }}
          />

          {/* Console Header Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 mb-8 border-b border-[#0E3D35] gap-4">
            
            {/* Mascot Avatar + Stage Identity */}
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-2xl bg-[#02211C] border border-[#4EECBF]/60 flex items-center justify-center p-1 shrink-0 shadow-[0_0_20px_rgba(78,236,191,0.2)]">
                <RobotMascot
                  size="xs"
                  stage={activeStage.num}
                  state={activeStage.mascotState}
                  isInteractive={true}
                />
              </div>

              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#022B23] border border-[#4EECBF]/60 text-[#4EECBF] font-mono text-[11px] font-bold">
                    Stage {activeStage.step}
                  </span>
                  <span className="text-[11px] font-mono text-[#86A699]">
                    Status: <span className="text-[#4EECBF] font-semibold">{activeStage.mascotState.toUpperCase()}</span>
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-[#F1EFE1] tracking-tight">
                  {activeStage.title} — <span className="text-[#4EECBF] font-normal">{activeStage.subtitle}</span>
                </h3>
              </div>
            </div>

            {/* API Endpoint & Technical Specs Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-[#001311] border border-[#0E3D35] text-xs font-mono text-[#86A699] flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-[#4EECBF]" />
                <span>{activeStage.endpoint}</span>
              </span>
              <button
                onClick={onLaunchWorkspace}
                className="px-4 py-2 rounded-xl bg-[#4EECBF] hover:bg-[#3dd8ab] text-[#001312] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_16px_rgba(78,236,191,0.35)]"
              >
                <span>Test in Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 3-Column Pipeline Architecture: Input -> Processing Engine -> Validated Output */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            
            {/* 1. INPUT STREAM CARD */}
            <div className="p-5 rounded-2xl bg-[#001411] border border-[#0E3D35] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-[#4EECBF] font-mono text-xs font-bold uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-[#4EECBF] shadow-[0_0_6px_#4EECBF]" />
                    <span>01 // Input Stream</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#02241E] text-[#86A699]">
                    Streaming
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#F1EFE1] leading-relaxed mb-4">
                  {activeStage.inputSummary}
                </p>
              </div>

              <div className="pt-3 border-t border-[#0E3D35]/50 flex items-center justify-between text-[11px] font-mono text-[#86A699]">
                <span>Format</span>
                <span className="text-[#4EECBF]">{activeStage.metrics[0].value}</span>
              </div>
            </div>

            {/* 2. PROCESSING ENGINE CARD */}
            <div className="p-5 rounded-2xl bg-[#001411] border border-[#4EECBF]/50 shadow-[0_0_20px_rgba(78,236,191,0.12)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sky-400 font-mono text-xs font-bold uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8] animate-pulse" />
                    <span>02 // Execution Engine</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#03232A] text-sky-300">
                    Automated
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#F1EFE1] leading-relaxed mb-4">
                  {activeStage.processingSummary}
                </p>
              </div>

              <div className="pt-3 border-t border-[#0E3D35]/50 flex items-center justify-between text-[11px] font-mono text-[#86A699]">
                <span>Throughput</span>
                <span className="text-sky-300 font-bold">{activeStage.metrics[1].value}</span>
              </div>
            </div>

            {/* 3. VALIDATED ARTIFACT CARD */}
            <div className="p-5 rounded-2xl bg-[#001411] border border-[#0E3D35] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-[#4EECBF] font-mono text-xs font-bold uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-[#4EECBF] shadow-[0_0_6px_#4EECBF]" />
                    <span>03 // Validated Output</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#02241E] text-[#86A699]">
                    Artifact
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#F1EFE1] leading-relaxed mb-4">
                  {activeStage.outputSummary}
                </p>
              </div>

              <div className="pt-3 border-t border-[#0E3D35]/50 flex items-center justify-between text-[11px] font-mono text-[#86A699]">
                <span>Verification</span>
                <span className="text-[#4EECBF] font-bold">{activeStage.metrics[2].value}</span>
              </div>
            </div>

          </div>

          {/* Interactive Technical Spec Chips */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#0E3D35]/60 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[#86A699] mr-1">Guarantees:</span>
              {activeStage.technicalSpecs.map((spec, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-lg bg-[#021F1A] border border-[#0E4A40] text-[#4EECBF] text-[11px] flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3 h-3 text-[#4EECBF]" />
                  <span>{spec}</span>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-4 text-[#86A699]">
              <span>Auto-advancing: <span className="text-[#4EECBF]">{isPlaying ? "ON" : "PAUSED"}</span></span>
              <span>Stage {selectedStepIndex + 1} of 7</span>
            </div>
          </div>

        </div>

        {/* Robot Animation Guide Interactive Verification Modal */}
        <RobotAnimationGuideModal
          isOpen={robotModalOpen}
          onClose={() => setRobotModalOpen(false)}
        />
      </div>
    </section>
  );
}
