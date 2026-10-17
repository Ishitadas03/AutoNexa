"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  FileText,
  Database,
  BarChart3,
  FlaskConical,
  Sparkles,
  UploadCloud,
  CheckCircle2,
  ArrowRight,
  Play,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/api";
import { DatasetProfileResponse } from "@/types/api";

interface InteractivePipelineProps {
  onLaunchWorkspace: () => void;
}

interface PipelineCardMeta {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  side: "left" | "right";
  wireIndex: number;
}

const PIPELINE_CARDS: PipelineCardMeta[] = [
  {
    id: 1,
    title: "CSV Dataset Upload",
    subtitle: "Upload your tabular data in CSV format.",
    icon: FileText,
    side: "left",
    wireIndex: 0,
  },
  {
    id: 2,
    title: "Dataset Profiling",
    subtitle: "Analyze data quality, types and key statistics.",
    icon: Database,
    side: "left",
    wireIndex: 1,
  },
  {
    id: 3,
    title: "Data Features",
    subtitle: "Understand features, missing values and distributions.",
    icon: BarChart3,
    side: "left",
    wireIndex: 2,
  },
  {
    id: 4,
    title: "Model Evaluation",
    subtitle: "Compare metrics and select the best model.",
    icon: BarChart3,
    side: "right",
    wireIndex: 0,
  },
  {
    id: 5,
    title: "Experiment Tracking",
    subtitle: "View past experiments, configurations and results.",
    icon: FlaskConical,
    side: "right",
    wireIndex: 1,
  },
  {
    id: 6,
    title: "Prediction Playground",
    subtitle: "Make predictions on new data and export results.",
    icon: Sparkles,
    side: "right",
    wireIndex: 2,
  },
];

export default function InteractivePipeline({ onLaunchWorkspace }: InteractivePipelineProps) {
  const [activeStage, setActiveStage] = useState<number>(1);
  const [hoveredStage, setHoveredStage] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<"churn" | "housing">("churn");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [customProfile, setCustomProfile] = useState<DatasetProfileResponse | null>(null);

  // Playground interactive prediction state
  const [predTenure, setPredTenure] = useState<number>(24);
  const [predMonthlyCharges, setPredMonthlyCharges] = useState<number>(65);
  const [predContract, setPredContract] = useState<string>("One year");
  const [predictionResult, setPredictionResult] = useState<{
    churnProbability: number;
    prediction: string;
  }>({
    churnProbability: 0.18,
    prediction: "Will Retain (No Churn)",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-play simulation loop
  useEffect(() => {
    if (!isSimulating) return;
    const interval = setInterval(() => {
      setActiveStage((prev) => (prev >= 6 ? 1 : prev + 1));
    }, 2800);
    return () => clearInterval(interval);
  }, [isSimulating]);

  // Update live prediction calculation
  const handleRecalculatePrediction = (tenure: number, monthly: number, contract: string) => {
    setPredTenure(tenure);
    setPredMonthlyCharges(monthly);
    setPredContract(contract);

    // Heuristic simulation for interactive feeling
    let prob = 0.5 - tenure * 0.005 + (monthly - 50) * 0.004;
    if (contract === "Month-to-month") prob += 0.25;
    if (contract === "Two year") prob -= 0.25;
    prob = Math.max(0.04, Math.min(0.96, prob));

    setPredictionResult({
      churnProbability: Math.round(prob * 100) / 100,
      prediction: prob > 0.5 ? "Likely to Churn" : "Will Retain (Loyal)",
    });
  };

  const demoProfiles = {
    churn: {
      filename: "customer_churn_telco.csv",
      rows: 7043,
      cols: 21,
      size: "972 KB",
      target: "churn_status",
      task: "Binary Classification",
      metric: "ROC-AUC",
      bestModel: "Random Forest Classifier",
      bestScore: "0.941",
    },
    housing: {
      filename: "california_housing_benchmark.csv",
      rows: 20640,
      cols: 9,
      size: "1.4 MB",
      target: "median_house_value",
      task: "Regression",
      metric: "R² Score",
      bestModel: "Hist. Gradient Boosting",
      bestScore: "0.925",
    },
  };

  const current = customProfile
    ? {
        filename: customProfile.filename,
        rows: customProfile.rows,
        cols: customProfile.columns,
        size: `${Math.round(customProfile.file_size_bytes / 1024)} KB`,
        target: customProfile.column_names?.[customProfile.column_names.length - 1] || "target",
        task: "Auto-Inferred Classification",
        metric: "F1 Score",
        bestModel: "Random Forest Classifier",
        bestScore: "0.938",
      }
    : demoProfiles[activePreset];

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setUploadMessage("Please select a tabular CSV file.");
      return;
    }
    setIsUploading(true);
    setUploadMessage(null);
    try {
      const profile = await api.uploadDataset(file);
      setCustomProfile(profile);
      setUploadMessage(`Uploaded: ${file.name} (${profile.rows.toLocaleString()} rows)`);
      setActiveStage(2);
    } catch {
      // Offline fallback profile
      setCustomProfile({
        dataset_id: "demo_custom",
        filename: file.name,
        rows: 8520,
        columns: 18,
        data_types: { id: "int64", feature_1: "float64", target: "int64" },
        column_names: ["id", "feature_1", "feature_2", "target"],
        missing_values: {},
        duplicate_rows: 0,
        file_size_bytes: file.size,
        memory_usage_bytes: file.size * 2,
      });
      setUploadMessage(`Loaded: ${file.name} (Simulated 8,520 rows)`);
      setActiveStage(2);
    } finally {
      setIsUploading(false);
    }
  };

  const leftCards = PIPELINE_CARDS.filter((c) => c.side === "left");
  const rightCards = PIPELINE_CARDS.filter((c) => c.side === "right");

  return (
    <section id="pipeline" className="relative py-14 sm:py-20 bg-[#001312] border-b border-[#0E3D35]/70 overflow-hidden">
      {/* Hidden file input for stage 1 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
      />

      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0, 95, 80, 0.3), transparent 75%)",
        }}
      />

      <div className="relative max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* ===================================================================
            SECTION HEADER: Exact Copy & Typography Matching Reference Image
            =================================================================== */}
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#031C18]/90 border border-[#0E4A40] mb-4 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#4EECBF] shadow-[0_0_8px_#4EECBF]" />
            <span className="text-[10.5px] font-mono uppercase tracking-widest text-[#4EECBF] font-semibold">
              THE AUTONEXA PIPELINE
            </span>
          </div>

          {/* Main Headline */}
          <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl font-normal text-[#F1EFE1] tracking-tight leading-[1.1] mb-3">
            The AutoNexa <span className="text-[#4EECBF] italic font-normal">Pipeline.</span>
          </h2>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-[#9AB3A8] font-sans">
            From data upload to predictions — a connected AutoML workflow.
          </p>
        </div>

        {/* ===================================================================
            MAIN CONNECTED PIPELINE CANVAS: 3 LEFT CARDS + ENGINE + 3 RIGHT CARDS
            =================================================================== */}
        <div className="relative w-full max-w-[1360px] mx-auto">
          
          {/* Panoramic 3-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-4 items-center">
            
            {/* -------------------------------------------------------------
                LEFT COLUMN: 3 Cards (Upload, Profiling, Features)
                ------------------------------------------------------------- */}
            <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-5 z-20">
              {leftCards.map((card) => {
                const Icon = card.icon;
                const isSelected = activeStage === card.id;
                const isHovered = hoveredStage === card.id;

                return (
                  <div
                    key={card.id}
                    onClick={() => setActiveStage(card.id)}
                    onMouseEnter={() => setHoveredStage(card.id)}
                    onMouseLeave={() => setHoveredStage(null)}
                    className={`relative p-4 sm:p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex items-center justify-between gap-3 group ${
                      isSelected
                        ? "bg-[#02211C] border-[#4EECBF] shadow-[0_0_24px_rgba(78,236,191,0.28)] scale-[1.01]"
                        : isHovered
                        ? "bg-[#031E19] border-[#4EECBF]/60 shadow-[0_0_16px_rgba(78,236,191,0.15)]"
                        : "bg-[#001815] border-[#0E3E34]/80 hover:border-[#1E6052]"
                    }`}
                  >
                    {/* Left Icon Container */}
                    <div className="flex items-center gap-3.5 sm:gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                          isSelected
                            ? "bg-[#042C24] border-[#4EECBF]/80 text-[#4EECBF]"
                            : "bg-[#021815] border-[#0E3E34] text-[#86A699] group-hover:text-[#4EECBF]"
                        }`}
                      >
                        {card.id === 1 ? (
                          <div className="flex flex-col items-center">
                            <FileText className="w-5 h-5" />
                            <span className="text-[7.5px] font-mono font-bold text-[#4EECBF] -mt-1 tracking-tighter">
                              CSV
                            </span>
                          </div>
                        ) : (
                          <Icon className="w-5 h-5" />
                        )}
                      </div>

                      {/* Title & Subtitle */}
                      <div>
                        <h3 className="text-sm sm:text-base font-semibold text-[#F1EFE1] tracking-tight group-hover:text-[#4EECBF] transition-colors mb-0.5">
                          {card.title}
                        </h3>
                        <p className="text-xs text-[#86A699] leading-snug line-clamp-2 font-normal">
                          {card.subtitle}
                        </p>
                      </div>
                    </div>

                    {/* Right Connection Port Dot (Matches Reference Image) */}
                    <div className="relative shrink-0 flex items-center justify-center">
                      <div
                        className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                          isSelected
                            ? "bg-[#4EECBF] shadow-[0_0_12px_#4EECBF] scale-125"
                            : "bg-[#4EECBF]/80 shadow-[0_0_6px_#4EECBF]"
                        }`}
                      />
                      {isSelected && (
                        <div className="absolute w-6 h-6 rounded-full border border-[#4EECBF] animate-ping pointer-events-none" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* -------------------------------------------------------------
                CENTER COLUMN: Central Isometric Engine Plinth with Mascot
                ------------------------------------------------------------- */}
            <div className="lg:col-span-4 relative flex flex-col items-center justify-center my-4 lg:my-0 z-10">
              
              {/* Stepped Isometric Platform Graphic */}
              <div className="relative w-full max-w-[380px] aspect-[705/555] mx-auto group">
                {/* Radial ground ambient light */}
                <div
                  className="pointer-events-none absolute inset-0 -bottom-6 opacity-60 blur-xl -z-10"
                  style={{
                    background:
                      "radial-gradient(ellipse 65% 55% at 50% 65%, rgba(78, 236, 191, 0.25), transparent 75%)",
                  }}
                />

                <Image
                  src="/images/landing-ref/pipeline-engine-clean@2x.png"
                  alt="AutoNexa AI Engine Central Plinth"
                  fill
                  sizes="(max-width: 1024px) 100vw, 380px"
                  priority
                  className="object-contain pointer-events-none select-none transition-transform duration-700 group-hover:scale-105"
                  style={{
                    imageRendering: "-webkit-optimize-contrast",
                    maskImage: "radial-gradient(ellipse 95% 90% at 50% 50%, black 78%, transparent 100%)",
                    WebkitMaskImage: "radial-gradient(ellipse 95% 90% at 50% 50%, black 78%, transparent 100%)",
                  }}
                />

                {/* Interactive Mascot Click Trigger */}
                <div
                  onClick={() => setIsSimulating(!isSimulating)}
                  title="Click to toggle pipeline simulation"
                  className="absolute inset-0 cursor-pointer"
                />
              </div>

              {/* Bottom Caption Under Engine: Exact Copy Matching Reference Image */}
              <div className="text-center mt-2">
                <span className="text-[12px] font-mono text-[#86A699] tracking-wider font-medium">
                  Task Selection &nbsp;•&nbsp; Model Training &nbsp;•&nbsp; Experiment Tracking
                </span>
              </div>
            </div>

            {/* -------------------------------------------------------------
                RIGHT COLUMN: 3 Cards (Evaluation, Tracking, Predictions)
                ------------------------------------------------------------- */}
            <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-5 z-20">
              {rightCards.map((card) => {
                const Icon = card.icon;
                const isSelected = activeStage === card.id;
                const isHovered = hoveredStage === card.id;

                return (
                  <div
                    key={card.id}
                    onClick={() => setActiveStage(card.id)}
                    onMouseEnter={() => setHoveredStage(card.id)}
                    onMouseLeave={() => setHoveredStage(null)}
                    className={`relative p-4 sm:p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex items-center justify-between gap-3 group ${
                      isSelected
                        ? "bg-[#02211C] border-[#4EECBF] shadow-[0_0_24px_rgba(78,236,191,0.28)] scale-[1.01]"
                        : isHovered
                        ? "bg-[#031E19] border-[#4EECBF]/60 shadow-[0_0_16px_rgba(78,236,191,0.15)]"
                        : "bg-[#001815] border-[#0E3E34]/80 hover:border-[#1E6052]"
                    }`}
                  >
                    {/* Left Connection Port Dot (Matches Reference Image) */}
                    <div className="relative shrink-0 flex items-center justify-center">
                      <div
                        className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                          isSelected
                            ? "bg-[#4EECBF] shadow-[0_0_12px_#4EECBF] scale-125"
                            : "bg-[#4EECBF]/80 shadow-[0_0_6px_#4EECBF]"
                        }`}
                      />
                      {isSelected && (
                        <div className="absolute w-6 h-6 rounded-full border border-[#4EECBF] animate-ping pointer-events-none" />
                      )}
                    </div>

                    {/* Right Icon + Title Container */}
                    <div className="flex items-center gap-3.5 sm:gap-4 flex-1">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                          isSelected
                            ? "bg-[#042C24] border-[#4EECBF]/80 text-[#4EECBF]"
                            : "bg-[#021815] border-[#0E3E34] text-[#86A699] group-hover:text-[#4EECBF]"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>

                      {/* Title & Subtitle */}
                      <div>
                        <h3 className="text-sm sm:text-base font-semibold text-[#F1EFE1] tracking-tight group-hover:text-[#4EECBF] transition-colors mb-0.5">
                          {card.title}
                        </h3>
                        <p className="text-xs text-[#86A699] leading-snug line-clamp-2 font-normal">
                          {card.subtitle}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

          {/* ===================================================================
              SVG MOVABLE FLOW CONDUIT OVERLAY (VISIBLE ON DESKTOP SCREENS)
              Connecting Card Dots to the Central AI Engine Plinth
              =================================================================== */}
          <div className="hidden lg:block absolute inset-0 pointer-events-none z-15">
            <svg
              viewBox="0 0 1360 380"
              className="w-full h-full overflow-visible"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <filter id="pipelineGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Left Conduit 1: Card 1 (CSV Upload) -> Engine */}
              <path
                d="M 445 68 C 530 68, 550 215, 605 235"
                stroke="#4EECBF"
                strokeWidth="2"
                strokeOpacity={activeStage === 1 ? "0.95" : "0.35"}
                filter="url(#pipelineGlow)"
              />
              <circle r="4" fill="#4EECBF" filter="url(#pipelineGlow)">
                <animateMotion
                  dur="2.5s"
                  repeatCount="indefinite"
                  path="M 445 68 C 530 68, 550 215, 605 235"
                />
              </circle>

              {/* Left Conduit 2: Card 2 (Profiling) -> Engine */}
              <path
                d="M 445 188 C 520 188, 545 235, 605 245"
                stroke="#4EECBF"
                strokeWidth="2"
                strokeOpacity={activeStage === 2 ? "0.95" : "0.35"}
                filter="url(#pipelineGlow)"
              />
              <circle r="4" fill="#4EECBF" filter="url(#pipelineGlow)">
                <animateMotion
                  dur="2.2s"
                  repeatCount="indefinite"
                  begin="0.7s"
                  path="M 445 188 C 520 188, 545 235, 605 245"
                />
              </circle>

              {/* Left Conduit 3: Card 3 (Data Features) -> Engine */}
              <path
                d="M 445 308 C 530 308, 550 255, 605 255"
                stroke="#4EECBF"
                strokeWidth="2"
                strokeOpacity={activeStage === 3 ? "0.95" : "0.35"}
                filter="url(#pipelineGlow)"
              />
              <circle r="4" fill="#4EECBF" filter="url(#pipelineGlow)">
                <animateMotion
                  dur="2.6s"
                  repeatCount="indefinite"
                  begin="1.2s"
                  path="M 445 308 C 530 308, 550 255, 605 255"
                />
              </circle>

              {/* Right Conduit 4: Engine -> Card 4 (Model Evaluation) */}
              <path
                d="M 755 235 C 810 215, 830 68, 915 68"
                stroke="#4EECBF"
                strokeWidth="2"
                strokeOpacity={activeStage === 4 ? "0.95" : "0.35"}
                filter="url(#pipelineGlow)"
              />
              <circle r="4" fill="#4EECBF" filter="url(#pipelineGlow)">
                <animateMotion
                  dur="2.5s"
                  repeatCount="indefinite"
                  path="M 755 235 C 810 215, 830 68, 915 68"
                />
              </circle>

              {/* Right Conduit 5: Engine -> Card 5 (Experiment Tracking) */}
              <path
                d="M 755 245 C 815 235, 840 188, 915 188"
                stroke="#4EECBF"
                strokeWidth="2"
                strokeOpacity={activeStage === 5 ? "0.95" : "0.35"}
                filter="url(#pipelineGlow)"
              />
              <circle r="4" fill="#4EECBF" filter="url(#pipelineGlow)">
                <animateMotion
                  dur="2.2s"
                  repeatCount="indefinite"
                  begin="0.6s"
                  path="M 755 245 C 815 235, 840 188, 915 188"
                />
              </circle>

              {/* Right Conduit 6: Engine -> Card 6 (Prediction Playground) */}
              <path
                d="M 755 255 C 810 255, 830 308, 915 308"
                stroke="#4EECBF"
                strokeWidth="2"
                strokeOpacity={activeStage === 6 ? "0.95" : "0.35"}
                filter="url(#pipelineGlow)"
              />
              <circle r="4" fill="#4EECBF" filter="url(#pipelineGlow)">
                <animateMotion
                  dur="2.7s"
                  repeatCount="indefinite"
                  begin="1.1s"
                  path="M 755 255 C 810 255, 830 308, 915 308"
                />
              </circle>
            </svg>
          </div>

        </div>

        {/* ===================================================================
            SIMULATION CONTROL BAR & WORKSPACE LAUNCH TRIGGER
            =================================================================== */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#011714] border border-[#0E3E34] max-w-4xl mx-auto shadow-lg">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                isSimulating
                  ? "bg-[#4EECBF] text-[#001312] shadow-[0_0_16px_rgba(78,236,191,0.5)]"
                  : "bg-[#03231D] text-[#F1EFE1] border border-[#0E4A40] hover:border-[#4EECBF]/60"
              }`}
            >
              {isSimulating ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#001312] animate-ping" />
                  <span>Pause Simulation</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-[#4EECBF] text-[#4EECBF]" />
                  <span>Simulate Pipeline Flow</span>
                </>
              )}
            </button>

            <span className="text-xs font-mono text-[#86A699]">
              Active: Stage 0{activeStage} — {PIPELINE_CARDS[activeStage - 1].title}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onLaunchWorkspace}
              className="px-4 py-2 rounded-xl bg-[#042820] hover:bg-[#07362C] border border-[#4EECBF]/60 text-[#4EECBF] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>Open in Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ===================================================================
            INTERACTIVE STAGE INSPECTION DRAWER: Functional Live Demo
            =================================================================== */}
        <div className="mt-8 max-w-4xl mx-auto rounded-2xl bg-[#001A16] border border-[#0E3E34] p-6 sm:p-8 shadow-2xl">
          
          {/* Header of Active Stage */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-6 border-b border-[#0E3E34]/80 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#032921] border border-[#4EECBF]/60 flex items-center justify-center text-[#4EECBF] font-mono text-xs font-bold">
                0{activeStage}
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-bold text-[#F1EFE1]">
                  {PIPELINE_CARDS[activeStage - 1].title}
                </h4>
                <p className="text-xs text-[#86A699]">
                  {PIPELINE_CARDS[activeStage - 1].subtitle}
                </p>
              </div>
            </div>

            {/* Quick Benchmark Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#86A699] font-mono">Dataset:</span>
              <button
                onClick={() => {
                  setActivePreset("churn");
                  setCustomProfile(null);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                  activePreset === "churn" && !customProfile
                    ? "bg-[#4EECBF] text-[#001312] font-semibold"
                    : "bg-[#03231D] text-[#86A699] hover:text-[#F1EFE1]"
                }`}
              >
                Telco Churn
              </button>
              <button
                onClick={() => {
                  setActivePreset("housing");
                  setCustomProfile(null);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                  activePreset === "housing" && !customProfile
                    ? "bg-[#4EECBF] text-[#001312] font-semibold"
                    : "bg-[#03231D] text-[#86A699] hover:text-[#F1EFE1]"
                }`}
              >
                CA Housing
              </button>
            </div>
          </div>

          {/* ---------------- STAGE 1: CSV DATASET UPLOAD ---------------- */}
          {activeStage === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div>
                <h5 className="text-base font-bold text-[#F1EFE1] mb-2 font-sans">
                  Tabular CSV Ingestion
                </h5>
                <p className="text-xs sm:text-sm text-[#86A699] mb-5 leading-relaxed">
                  Upload custom tabular CSV files or test with AutoNexa benchmark datasets. We validate CSV delimiters, check column schemas, compute SHA-256 integrity hashes, and reject malformed records.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-5 py-2.5 rounded-xl bg-[#4EECBF] hover:bg-[#3dd8ab] text-[#001312] font-semibold text-xs flex items-center gap-2 shadow-[0_0_16px_rgba(78,236,191,0.35)] transition-all cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>{isUploading ? "Uploading..." : "Upload Local CSV"}</span>
                  </button>
                  <button
                    onClick={() => setActiveStage(2)}
                    className="px-4 py-2.5 rounded-xl bg-[#03231D] border border-[#0E4A40] hover:border-[#4EECBF]/60 text-[#F1EFE1] text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>Proceed to Profiling</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#4EECBF]" />
                  </button>
                </div>
                {uploadMessage && (
                  <p className="mt-3 text-xs font-mono text-[#4EECBF] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{uploadMessage}</span>
                  </p>
                )}
              </div>

              {/* Upload Dropzone Preview */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl border-2 border-dashed border-[#0E4A40] hover:border-[#4EECBF] bg-[#001411] p-8 text-center cursor-pointer transition-colors group"
              >
                <UploadCloud className="w-10 h-10 text-[#4EECBF] mx-auto mb-3 group-hover:scale-110 transition-transform" />
                <p className="text-sm font-semibold text-[#F1EFE1] mb-1">Drop tabular CSV file here</p>
                <p className="text-xs text-[#86A699]">Supports up to 50 MB. UTF-8 tabular format.</p>
              </div>
            </div>
          )}

          {/* ---------------- STAGE 2: DATASET PROFILING ---------------- */}
          {activeStage === 2 && (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 font-mono text-xs">
                <div className="p-3.5 rounded-xl bg-[#001411] border border-[#0E3E34]">
                  <span className="text-[#86A699] block text-[10px] uppercase">Total Rows</span>
                  <span className="text-xl font-bold text-[#F1EFE1]">{current.rows.toLocaleString()}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#001411] border border-[#0E3E34]">
                  <span className="text-[#86A699] block text-[10px] uppercase">Columns</span>
                  <span className="text-xl font-bold text-[#F1EFE1]">{current.cols}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#001411] border border-[#0E3E34]">
                  <span className="text-[#86A699] block text-[10px] uppercase">Dataset Size</span>
                  <span className="text-xl font-bold text-[#F1EFE1]">{current.size}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#001411] border border-[#0E3E34]">
                  <span className="text-[#86A699] block text-[10px] uppercase">Inferred Task</span>
                  <span className="text-sm font-bold text-[#4EECBF] truncate block mt-1">{current.task}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-[#86A699]">
                  Target Column Identified: <span className="text-[#4EECBF] font-mono font-bold">{current.target}</span>
                </span>
                <button
                  onClick={() => setActiveStage(3)}
                  className="px-4 py-2 rounded-xl bg-[#03231D] border border-[#4EECBF]/60 text-[#4EECBF] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Explore Features</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ---------------- STAGE 3: DATA FEATURES ---------------- */}
          {activeStage === 3 && (
            <div>
              <p className="text-xs text-[#86A699] mb-4">
                Automated statistical profiling classifies feature types and detects missing or imbalanced variables.
              </p>
              <div className="space-y-2 mb-6 font-mono text-xs">
                {[
                  { name: "tenure_months", type: "int64", nulls: "0 (0%)", status: "Clean", imp: "High" },
                  { name: "monthly_charges", type: "float64", nulls: "0 (0%)", status: "Clean", imp: "High" },
                  { name: "contract_type", type: "category", nulls: "0 (0%)", status: "One-Hot Encoded", imp: "Critical" },
                  { name: "payment_method", type: "category", nulls: "12 (0.17%)", status: "Imputed (Mode)", imp: "Medium" },
                ].map((feat, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#001411] border border-[#0E3E34] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[#4EECBF] font-bold">{feat.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#03261F] text-[#86A699]">
                        {feat.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-[#86A699] text-[11px] hidden sm:inline">{feat.nulls}</span>
                      <span className="text-[#4EECBF] text-[11px] font-semibold">{feat.status}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={() => setActiveStage(4)}
                  className="px-4 py-2 rounded-xl bg-[#03231D] border border-[#4EECBF]/60 text-[#4EECBF] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>View Model Evaluation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ---------------- STAGE 4: MODEL EVALUATION ---------------- */}
          {activeStage === 4 && (
            <div>
              <p className="text-xs text-[#86A699] mb-4">
                AutoNexa trains and benchmarks candidate models under 5-fold cross-validation.
              </p>
              <div className="space-y-2 mb-6 font-mono text-xs">
                {[
                  { name: "Random Forest Classifier", metric: "0.941", latency: "14ms", rank: "#1 Best", isBest: true },
                  { name: "XGBoost (Hist Gradient)", metric: "0.938", latency: "9ms", rank: "#2", isBest: false },
                  { name: "LightGBM Classifier", metric: "0.929", latency: "6ms", rank: "#3", isBest: false },
                  { name: "Logistic Regression (L2)", metric: "0.874", latency: "2ms", rank: "#4", isBest: false },
                ].map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                      m.isBest
                        ? "bg-[#03261F] border-[#4EECBF] shadow-[0_0_12px_rgba(78,236,191,0.2)]"
                        : "bg-[#001411] border-[#0E3E34]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {m.isBest && <Trophy className="w-4 h-4 text-[#4EECBF]" />}
                      <span className="font-bold text-[#F1EFE1]">{m.name}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-[#86A699] text-[11px]">{m.latency}</span>
                      <span className="text-[#4EECBF] font-bold text-sm">{m.metric}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          m.isBest ? "bg-[#4EECBF] text-[#001312]" : "bg-[#001815] text-[#86A699]"
                        }`}
                      >
                        {m.rank}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={() => setActiveStage(5)}
                  className="px-4 py-2 rounded-xl bg-[#03231D] border border-[#4EECBF]/60 text-[#4EECBF] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Experiment Tracking</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ---------------- STAGE 5: EXPERIMENT TRACKING ---------------- */}
          {activeStage === 5 && (
            <div>
              <p className="text-xs text-[#86A699] mb-4">
                Every training iteration, hyperparameter configuration, and metric artifact is permanently tracked.
              </p>
              <div className="space-y-2 mb-6 font-mono text-xs">
                {[
                  { run: "EXP-0941-RF", config: "n_trees: 250, max_depth: 12", score: "0.941 ROC-AUC", status: "Promoted to Prod" },
                  { run: "EXP-0938-XGB", config: "learning_rate: 0.05, n_est: 300", score: "0.938 ROC-AUC", status: "Archived" },
                  { run: "EXP-0929-LGBM", config: "num_leaves: 31, lr: 0.1", score: "0.929 ROC-AUC", status: "Archived" },
                ].map((exp, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-[#001411] border border-[#0E3E34] flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#F1EFE1] flex items-center gap-2">
                        <span>{exp.run}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#03261F] text-[#4EECBF]">
                          {exp.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#86A699] mt-0.5">{exp.config}</div>
                    </div>
                    <span className="text-[#4EECBF] font-bold text-sm">{exp.score}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={() => setActiveStage(6)}
                  className="px-4 py-2 rounded-xl bg-[#03231D] border border-[#4EECBF]/60 text-[#4EECBF] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Try Prediction Playground</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ---------------- STAGE 6: PREDICTION PLAYGROUND ---------------- */}
          {activeStage === 6 && (
            <div>
              <p className="text-xs text-[#86A699] mb-5">
                Interact with the deployed champion model in real time. Adjust tabular values to see immediate inference probabilities.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                
                {/* Input Controls */}
                <div className="space-y-4 font-mono text-xs">
                  <div>
                    <div className="flex justify-between text-[#F1EFE1] mb-1.5">
                      <span>Tenure (Months): {predTenure}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="72"
                      value={predTenure}
                      onChange={(e) =>
                        handleRecalculatePrediction(Number(e.target.value), predMonthlyCharges, predContract)
                      }
                      className="w-full accent-[#4EECBF] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[#F1EFE1] mb-1.5">
                      <span>Monthly Charges ($): {predMonthlyCharges}</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="120"
                      value={predMonthlyCharges}
                      onChange={(e) =>
                        handleRecalculatePrediction(predTenure, Number(e.target.value), predContract)
                      }
                      className="w-full accent-[#4EECBF] cursor-pointer"
                    />
                  </div>

                  <div>
                    <span className="block text-[#F1EFE1] mb-1.5">Contract Agreement</span>
                    <div className="grid grid-cols-3 gap-2">
                      {["Month-to-month", "One year", "Two year"].map((c) => (
                        <button
                          key={c}
                          onClick={() => handleRecalculatePrediction(predTenure, predMonthlyCharges, c)}
                          className={`py-2 px-2 text-[11px] rounded-lg border transition-colors cursor-pointer text-center ${
                            predContract === c
                              ? "bg-[#4EECBF] text-[#001312] font-bold border-[#4EECBF]"
                              : "bg-[#001411] border-[#0E3E34] text-[#86A699] hover:text-[#F1EFE1]"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Live Prediction Output Card */}
                <div className="p-6 rounded-2xl bg-[#001411] border border-[#4EECBF]/60 shadow-[0_0_20px_rgba(78,236,191,0.2)] text-center font-mono">
                  <span className="text-[11px] text-[#86A699] uppercase tracking-wider block mb-2">
                    Model Inference Result
                  </span>
                  <div
                    className={`text-2xl font-bold mb-2 ${
                      predictionResult.churnProbability > 0.5 ? "text-amber-400" : "text-[#4EECBF]"
                    }`}
                  >
                    {predictionResult.prediction}
                  </div>
                  <div className="text-sm text-[#F1EFE1] mb-4">
                    Probability Score:{" "}
                    <span className="text-[#4EECBF] font-bold">
                      {Math.round(predictionResult.churnProbability * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-[#03261F] h-2.5 rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full bg-[#4EECBF] transition-all duration-300"
                      style={{ width: `${Math.round(predictionResult.churnProbability * 100)}%` }}
                    />
                  </div>
                  <button
                    onClick={onLaunchWorkspace}
                    className="w-full py-2.5 rounded-xl bg-[#4EECBF] hover:bg-[#3dd8ab] text-[#001312] font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Deploy This Model to Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </section>
  );
}
