"use client";

import React from "react";
import {
  Database,
  Lightbulb,
  Cpu,
  BarChart3,
  FileSpreadsheet,
  Play,
  ArrowRight,
} from "lucide-react";

interface FeatureHighlightsProps {
  onLaunchWorkspace?: () => void;
}

const FEATURES = [
  {
    icon: Database,
    title: "Dataset Profiling",
    description: "Rows, columns, data types, missingness, duplicates and dataset summaries.",
    badge: "Auto-Inspection",
  },
  {
    icon: Lightbulb,
    title: "Task Recommendations",
    description: "Suggested target columns, classification or regression task, and data-quality warnings.",
    badge: "Heuristic Engine",
  },
  {
    icon: Cpu,
    title: "Automated Model Training",
    description: "Multiple candidate models with preprocessing pipelines for classification and regression.",
    badge: "Resource-Bounded",
  },
  {
    icon: BarChart3,
    title: "Model Evaluation",
    description: "Supported metrics, cross-validation and holdout evaluation.",
    badge: "Leakage-Safe",
  },
  {
    icon: FileSpreadsheet,
    title: "Experiment Tracking",
    description: "Experiment metadata, dataset fingerprinting and MLflow tracking (where configured).",
    badge: "Lineage",
  },
  {
    icon: Play,
    title: "Prediction Playground",
    description: "JSON-record prediction and CSV batch prediction using trained models.",
    badge: "Zero-Retrain",
  },
];

export default function FeatureHighlights({ onLaunchWorkspace }: FeatureHighlightsProps) {
  return (
    <section id="features" className="py-20 bg-[#070D0C] border-b border-[#2A4E42]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header Matching Reference Image */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pb-6 border-b border-[#2A4E42]/40">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#68E7B5] block mb-2">
              FEATURES
            </span>
            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl font-normal text-[#F1EFE1] tracking-tight">
              Everything you need for your AutoML workflow.
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 max-w-lg">
            <p className="text-xs sm:text-sm text-[#AEBEB5] font-sans">
              A complete set of tools for real-world machine learning projects.
            </p>
            {onLaunchWorkspace && (
              <button
                onClick={onLaunchWorkspace}
                className="btn-autonexa-secondary px-4 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 font-medium"
              >
                <span>Explore All Features</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 6 Feature Cards Grid Matching Reference Image */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="autonexa-card p-6 flex flex-col justify-between hover:border-[#68E7B5]/60 hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#0D1815] border border-[#2A4E42] flex items-center justify-center text-[#68E7B5] group-hover:border-[#68E7B5] transition-colors">
                      <Icon className="w-5 h-5 stroke-[2]" />
                    </div>
                    <span className="text-[10px] font-mono text-[#68E7B5]/80 bg-[#070D0C] px-2.5 py-0.5 rounded-full border border-[#2A4E42]">
                      {feature.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-[#F1EFE1] mb-2 font-sans">
                    {feature.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#AEBEB5] leading-relaxed font-sans">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
