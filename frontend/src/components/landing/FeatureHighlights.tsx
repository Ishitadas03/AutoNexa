"use client";

import React from "react";
import {
  BarChart3,
  Lightbulb,
  Cpu,
  TrendingUp,
  FileSpreadsheet,
  Share2,
} from "lucide-react";

const FEATURES = [
  {
    icon: BarChart3,
    title: "Dataset Profiling",
    description: "Rows, columns, data types, missingness, duplicates, and statistical distribution summaries.",
    badge: "Auto-Inspection",
  },
  {
    icon: Lightbulb,
    title: "Task Recommendations",
    description: "Suggested target columns, classification or regression task detection, and data-quality warnings.",
    badge: "Heuristic Engine",
  },
  {
    icon: Cpu,
    title: "Automated Model Training",
    description: "Multiple candidate models with automatic preprocessing pipelines, encoders, and feature handling.",
    badge: "Resource-Bounded",
  },
  {
    icon: TrendingUp,
    title: "Model Evaluation",
    description: "Direction-aware multi-metric scoring, stratified cross-validation, and untouched holdout evaluation.",
    badge: "Leakage-Safe",
  },
  {
    icon: FileSpreadsheet,
    title: "Experiment Tracking",
    description: "Experiment metadata, dataset SHA-256 fingerprinting, parameter logging, and MLflow tracking.",
    badge: "Lineage",
  },
  {
    icon: Share2,
    title: "Prediction Playground",
    description: "Real-time single JSON record inference and high-throughput CSV batch prediction using trained pipelines.",
    badge: "Zero-Retrain",
  },
];

export default function FeatureHighlights() {
  return (
    <section id="features" className="py-16 md:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-[#14221c]">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12 pb-4 border-b border-[#14221c]">
        <div>
          <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block mb-1">
            Platform Capabilities
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Features Highlights
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md">
          Engineered for developer workflows: reproducible pipelines, robust diagnostics, and zero-retraining model serving.
        </p>
      </div>

      {/* 3x2 Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((feature, idx) => {
          const Icon = feature.icon;
          return (
            <div
              key={idx}
              className="p-5 sm:p-6 rounded-2xl bg-[#080d11] border border-[#14221c] hover:border-[#1e382b] hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-9 h-9 rounded-xl bg-[#081510] border border-emerald-900/60 flex items-center justify-center text-emerald-400">
                    <Icon className="w-4 h-4 stroke-[2]" />
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400/80 bg-[#06120d] px-2.5 py-0.5 rounded-full border border-emerald-900/40">
                    {feature.badge}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  {feature.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
