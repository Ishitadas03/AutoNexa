"use client";

import React, { useState } from "react";
import {
  Database,
  Lightbulb,
  Cpu,
  BarChart3,
  FileSpreadsheet,
  Play,
  ArrowRight,
  Zap,
} from "lucide-react";

interface FeatureHighlightsProps {
  onLaunchWorkspace?: () => void;
}

interface FeatureItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  microStat: string;
  tags: string[];
}

const FEATURES: FeatureItem[] = [
  {
    icon: Database,
    title: "Dataset Profiling",
    subtitle: "Automated Tabular Auditing",
    description: "Instant statistical summary of rows, columns, data types, missingness ratios, cardinality, and potential class imbalances.",
    badge: "Auto-Inspection",
    microStat: "12,000 rows/sec profiling",
    tags: ["Null Matrix", "Type Sniffer", "Zero Data Loss"],
  },
  {
    icon: Lightbulb,
    title: "Task Recommendations",
    subtitle: "Heuristic Objective Engine",
    description: "Automatically analyzes candidate target columns, infers classification vs regression objectives, and raises data quality warnings.",
    badge: "Heuristic Engine",
    microStat: "Classification & Regression",
    tags: ["Target Inference", "Class Balance", "Leakage Guard"],
  },
  {
    icon: Cpu,
    title: "Automated Model Training",
    subtitle: "Multi-Estimator Competition",
    description: "Fits multiple candidate pipelines (Random Forest, XGBoost, LightGBM, Logistic Regression) with in-fold preprocessing.",
    badge: "Resource-Bounded",
    microStat: "4 Architectures In-Parallel",
    tags: ["Scikit-Learn", "Median Impute", "One-Hot / Ordinal"],
  },
  {
    icon: BarChart3,
    title: "Model Evaluation",
    subtitle: "Direction-Aware Leaderboard",
    description: "Validates models using strict 5-fold cross-validation and untouched holdouts, ranking candidate estimators by F1 and ROC-AUC.",
    badge: "Leakage-Safe",
    microStat: "5-Fold Stratified CV",
    tags: ["ROC-AUC 0.941", "F1 Macro", "Holdout Delta"],
  },
  {
    icon: FileSpreadsheet,
    title: "Experiment Tracking",
    subtitle: "Artifact Lineage & Serialization",
    description: "Every training iteration, hyperparameter configuration, and metric artifact is packaged into reproducible joblib pipelines.",
    badge: "Lineage",
    microStat: ".joblib Pipeline Package",
    tags: ["SHA-256 Hashing", "MLflow Support", "Param History"],
  },
  {
    icon: Play,
    title: "Prediction Playground",
    subtitle: "Zero-Retrain Instant Inference",
    description: "Test your champion model in an interactive real-time sandbox or upload batch CSV files for instant scored probability outputs.",
    badge: "Zero-Retrain",
    microStat: "< 4.2ms Latency",
    tags: ["Single JSON", "Batch CSV", "Calibrated Probabilities"],
  },
];

export default function FeatureHighlights({ onLaunchWorkspace }: FeatureHighlightsProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <section id="features" className="relative py-16 sm:py-24 bg-[#001312] border-b border-[#0E3D35]/70 overflow-hidden">
      {/* Subtle ambient light */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 30%, rgba(0, 95, 80, 0.25), transparent 75%)",
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
                FEATURES & CAPABILITIES
              </span>
            </div>
            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl font-normal text-[#F1EFE1] tracking-tight leading-[1.1]">
              Everything you need for your <span className="text-[#4EECBF] italic font-normal">AutoML workflow.</span>
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 max-w-lg">
            <p className="text-xs sm:text-sm text-[#86A699] font-sans leading-relaxed">
              A comprehensive toolkit for tabular datasets — from exploratory profiling to multi-model benchmarking and deployment.
            </p>
            {onLaunchWorkspace && (
              <button
                onClick={onLaunchWorkspace}
                className="px-4 py-2 rounded-xl bg-[#02211C] border border-[#4EECBF]/60 text-[#4EECBF] text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_12px_rgba(78,236,191,0.2)] hover:bg-[#032A24] transition-all cursor-pointer shrink-0"
              >
                <span>Launch Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ===================================================================
            6 RICH FEATURE CARDS GRID (Responsive 3-Column on Desktop)
            =================================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            const isHovered = hoveredIdx === idx;

            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`relative p-6 sm:p-7 rounded-2xl border transition-all duration-300 flex flex-col justify-between group ${
                  isHovered
                    ? "bg-[#02211C] border-[#4EECBF] shadow-[0_0_28px_rgba(78,236,191,0.25)] -translate-y-1"
                    : "bg-[#001815] border-[#0E3E34]/80 hover:border-[#1E6052]"
                }`}
              >
                <div>
                  {/* Card Top: Icon & Badge */}
                  <div className="flex items-center justify-between mb-5">
                    <div
                      className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors ${
                        isHovered
                          ? "bg-[#042C24] border-[#4EECBF] text-[#4EECBF] shadow-[0_0_12px_#4EECBF]"
                          : "bg-[#011411] border-[#0E3D35] text-[#86A699] group-hover:text-[#4EECBF]"
                      }`}
                    >
                      <Icon className="w-6 h-6 stroke-[2]" />
                    </div>

                    <span className="text-[10.5px] font-mono px-3 py-1 rounded-full bg-[#02241E] border border-[#0E4A40] text-[#4EECBF] font-semibold">
                      {feature.badge}
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="text-base sm:text-lg font-bold text-[#F1EFE1] tracking-tight group-hover:text-[#4EECBF] transition-colors mb-1">
                    {feature.title}
                  </h3>
                  <div className="text-[11.5px] font-mono text-[#4EECBF] mb-3">
                    {feature.subtitle}
                  </div>

                  {/* Description */}
                  <p className="text-xs sm:text-sm text-[#86A699] leading-relaxed mb-6 font-sans">
                    {feature.description}
                  </p>
                </div>

                {/* Card Bottom: Micro Stat + Tags */}
                <div className="pt-4 border-t border-[#0E3D35]/60">
                  <div className="flex items-center justify-between text-xs font-mono mb-3">
                    <span className="text-[#86A699]">Capability:</span>
                    <span className="text-[#4EECBF] font-semibold flex items-center gap-1">
                      <Zap className="w-3 h-3 text-[#4EECBF]" />
                      <span>{feature.microStat}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {feature.tags.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="text-[10.5px] font-mono px-2.5 py-0.5 rounded-md bg-[#001311] border border-[#0E3D35] text-[#86A699]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
