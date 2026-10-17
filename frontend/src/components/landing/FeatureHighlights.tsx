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
    <section id="features" className="relative py-16 sm:py-24 bg-[#F2F6F9] border-b border-[#E2E8F0] overflow-hidden">
      {/* Subtle ambient light */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 30%, rgba(29, 78, 216, 0.06), transparent 75%)",
        }}
      />

      <div className="relative max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* ===================================================================
            SECTION HEADER
            =================================================================== */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pb-6 border-b border-[#CBD5E1]">
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#CBD5E1] mb-3.5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
              <span className="text-[10.5px] font-mono uppercase tracking-widest text-[#334155] font-semibold">
                FEATURES & CAPABILITIES
              </span>
            </div>
            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl font-normal text-[#0F172A] tracking-tight leading-[1.1]">
              Everything you need for your <span className="text-[#1E3A8A] italic font-normal">AutoML workflow.</span>
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 max-w-lg">
            <p className="text-xs sm:text-sm text-[#475569] font-sans leading-relaxed">
              A comprehensive toolkit for tabular datasets — from exploratory profiling to multi-model benchmarking and deployment.
            </p>
            {onLaunchWorkspace && (
              <button
                onClick={onLaunchWorkspace}
                className="px-4 py-2 rounded-xl bg-white border border-[#CBD5E1] hover:border-[#1D4ED8] text-[#1D4ED8] text-xs font-semibold flex items-center gap-1.5 shadow-xs hover:bg-[#EFF6FF] transition-all cursor-pointer shrink-0"
              >
                <span>Launch Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ===================================================================
            6 RICH FEATURE CARDS GRID
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
                    ? "bg-white border-[#1D4ED8] shadow-[0_8px_30px_rgba(29,78,216,0.15)] -translate-y-1"
                    : "bg-white border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div
                      className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors ${
                        isHovered
                          ? "bg-[#DBEAFE] border-[#1D4ED8] text-[#1D4ED8] shadow-sm"
                          : "bg-[#F1F5F9] border-[#E2E8F0] text-[#1E293B] group-hover:text-[#1D4ED8]"
                      }`}
                    >
                      <Icon className="w-6 h-6 stroke-[2]" />
                    </div>

                    <span className="text-[10.5px] font-mono px-3 py-1 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] font-semibold">
                      {feature.badge}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-[#0F172A] tracking-tight group-hover:text-[#1D4ED8] transition-colors mb-1">
                    {feature.title}
                  </h3>
                  <div className="text-[11.5px] font-mono text-[#1D4ED8] mb-3">
                    {feature.subtitle}
                  </div>

                  <p className="text-xs sm:text-sm text-[#475569] leading-relaxed mb-6 font-sans">
                    {feature.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#E2E8F0]">
                  <div className="flex items-center justify-between text-xs font-mono mb-3">
                    <span className="text-[#64748B]">Capability:</span>
                    <span className="text-[#1D4ED8] font-semibold flex items-center gap-1">
                      <Zap className="w-3 h-3 text-[#1D4ED8]" />
                      <span>{feature.microStat}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {feature.tags.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="text-[10.5px] font-mono px-2.5 py-0.5 rounded-md bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569]"
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
