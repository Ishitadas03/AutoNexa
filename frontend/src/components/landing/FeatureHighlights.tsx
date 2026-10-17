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
import ScrollReveal, { StaggerContainer, StaggerItem } from "./ScrollReveal";

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
    <section id="features" className="relative py-12 sm:py-16 bg-[#F2F6F9] border-b border-[#E2E8F0] overflow-hidden">
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
            SECTION HEADER: Alternating Entrance
            =================================================================== */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pb-6 border-b border-[#CBD5E1]">
          <ScrollReveal direction="left" distance={20}>
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
          </ScrollReveal>

          <ScrollReveal direction="right" distance={20} delay={0.1}>
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
          </ScrollReveal>
        </div>

        {/* ===================================================================
            6 RICH FEATURE CARDS GRID: Staggered Alternating Reveals
            =================================================================== */}
        <StaggerContainer staggerDelay={0.08} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            const isHovered = hoveredIdx === idx;
            const isEven = idx % 2 === 0;

            return (
              <StaggerItem key={idx} direction={isEven ? "left" : "right"} distance={20}>
                <div
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`h-full relative p-6 sm:p-7 rounded-2xl border transition-all duration-300 flex flex-col justify-between group overflow-hidden ${
                    isHovered
                      ? "bg-[#0F172A] border-[#3B82F6] shadow-[0_12px_40px_rgba(29,78,216,0.3)] -translate-y-1"
                      : "bg-[#0F172A] border-[#1E293B] shadow-[0_4px_20px_rgba(15,23,42,0.18)] hover:border-[#334155]"
                  }`}
                >
                  {/* Subtle top ambient glow inside dark card */}
                  <div
                    className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-32 rounded-full blur-2xl opacity-20 transition-opacity duration-500 group-hover:opacity-40"
                    style={{
                      background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)",
                    }}
                  />

                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <div
                        className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all duration-300 ${
                          isHovered
                            ? "bg-[#1D4ED8]/30 border-[#3B82F6] text-[#60A5FA] shadow-[0_0_16px_rgba(59,130,246,0.35)] scale-105"
                            : "bg-[#1E293B] border-[#334155] text-[#93C5FD] group-hover:text-[#60A5FA]"
                        }`}
                      >
                        <Icon className="w-6 h-6 stroke-[2]" />
                      </div>

                      <span className="text-[10.5px] font-mono px-3 py-1 rounded-full bg-[#1E293B] border border-[#334155] text-[#93C5FD] font-semibold transition-colors group-hover:border-[#3B82F6]/50 group-hover:text-[#BFDBFE]">
                        {feature.badge}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-white tracking-tight group-hover:text-[#60A5FA] transition-colors mb-1">
                      {feature.title}
                    </h3>
                    <div className="text-[11.5px] font-mono text-[#60A5FA] mb-3">
                      {feature.subtitle}
                    </div>

                    <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed mb-6 font-sans">
                      {feature.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[#1E293B]">
                    <div className="flex items-center justify-between text-xs font-mono mb-3">
                      <span className="text-[#64748B]">Capability:</span>
                      <span className="text-[#60A5FA] font-semibold flex items-center gap-1">
                        <Zap className="w-3 h-3 text-[#60A5FA]" />
                        <span>{feature.microStat}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {feature.tags.map((tag, tIdx) => (
                        <span
                          key={tIdx}
                          className="text-[10.5px] font-mono px-2.5 py-0.5 rounded-md bg-[#1E293B]/80 border border-[#334155]/70 text-[#94A3B8] transition-colors hover:text-white hover:border-[#475569]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        {/* Subtle Inter-Section Continuity Indicator */}
        <div className="mt-10 pt-6 border-t border-[#CBD5E1]/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-[#64748B]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
            <span>Built For Tabular Reliability • Scikit-Learn Ecosystem</span>
          </div>
          <div className="flex items-center gap-3 text-[11.5px]">
            <span className="hidden md:inline">Instant inference & one-click pipeline serialization</span>
            <span className="hidden md:inline text-[#CBD5E1]">•</span>
            <span className="text-[#1D4ED8] font-semibold flex items-center gap-1">
              <span>Ready for production</span>
              <span>↓</span>
            </span>
          </div>
        </div>

      </div>
    </section>
  );
}
