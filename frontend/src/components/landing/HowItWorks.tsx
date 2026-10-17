"use client";

import React from "react";
import { Upload, Search, Zap, Send, ArrowRight, ChevronRight } from "lucide-react";

interface HowItWorksProps {
  onLaunchWorkspace: () => void;
}

const STEPS = [
  {
    step: "01",
    icon: Upload,
    title: "Upload",
    desc: "Stream tabular CSV data with automated size enforcement, tabular integrity validation, and cryptographic SHA-256 fingerprinting.",
    detail: "POST /api/v1/datasets/upload",
  },
  {
    step: "02",
    icon: Search,
    title: "Analyze",
    desc: "Execute dataset intelligence to identify target columns, classify feature roles, and audit data quality risks.",
    detail: "POST /api/v1/datasets/{id}/analyze",
  },
  {
    step: "03",
    icon: Zap,
    title: "Train",
    desc: "Execute resource-aware AutoML with leakage-safe StratifiedKFold CV or holdout validation under bounded time limits.",
    detail: "POST /api/v1/datasets/{id}/train",
  },
  {
    step: "04",
    icon: Send,
    title: "Predict",
    desc: "Export the winning scikit-learn pipeline for zero-retraining inference via low-latency JSON or high-throughput batch CSV.",
    detail: "POST /api/v1/experiments/{id}/predict",
  },
];

export default function HowItWorks({ onLaunchWorkspace }: HowItWorksProps) {
  return (
    <section
      id="architecture"
      className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-white/5"
    >
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-xs font-mono font-semibold text-amber-400 tracking-wider uppercase">
          System Workflow
        </span>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mt-2 mb-4">
          How AutoNexa Operates
        </h2>
        <p className="text-sm sm:text-base text-slate-400">
          Four disciplined stages transform uncleaned tabular data into verified,
          production-ready model pipelines.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div
              key={idx}
              className="relative stage-card p-5 rounded-2xl glass-panel flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 font-mono text-sm font-bold">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-600">
                    {s.step}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  {s.desc}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-900/80 space-y-2">
                <code className="text-[9px] font-mono text-slate-600 block">
                  {s.detail}
                </code>
                <div className="flex items-center gap-1.5 text-xs text-amber-400/80 font-mono">
                  <span>Stage {s.step}</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>

              {/* Desktop connector arrow between cards */}
              {idx < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-3 z-10 -translate-y-1/2">
                  <ChevronRight className="w-4 h-4 text-amber-500/40" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onLaunchWorkspace}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium text-xs sm:text-sm transition-all hover:scale-[1.02]"
        >
          <span>Open Interactive Workspace</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
