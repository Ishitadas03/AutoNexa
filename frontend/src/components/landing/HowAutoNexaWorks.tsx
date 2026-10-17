"use client";

import React from "react";
import { Upload, Search, Zap, Send, ArrowRight } from "lucide-react";

interface HowAutoNexaWorksProps {
  onLaunchWorkspace: () => void;
}

const STEPS = [
  {
    step: "01",
    icon: Upload,
    title: "Ingestion & Audit",
    description:
      "Upload tabular CSV files up to 50 MB. AutoNexa validates tabular integrity, calculates SHA-256 hashes, and detects data types.",
    endpoint: "POST /api/v1/datasets/upload",
  },
  {
    step: "02",
    icon: Search,
    title: "Autonomous Intelligence",
    description:
      "Heuristic ML task detection (binary, multiclass, regression), class imbalance auditing, and severity-graded quality diagnostics.",
    endpoint: "POST /api/v1/datasets/{id}/analyze",
  },
  {
    step: "03",
    icon: Zap,
    title: "Leakage-Safe AutoML",
    description:
      "Fits preprocessing pipelines strictly inside StratifiedKFold partitions across linear, tree, and ensemble architectures with bounded timeouts.",
    endpoint: "POST /api/v1/datasets/{id}/train",
  },
  {
    step: "04",
    icon: Send,
    title: "Zero-Retrain Deployment",
    description:
      "Exports the winning scikit-learn pipeline for zero-retraining inference via low-latency JSON payloads or batch CSV scoring.",
    endpoint: "POST /api/v1/experiments/{id}/predict",
  },
];

export default function HowAutoNexaWorks({ onLaunchWorkspace }: HowAutoNexaWorksProps) {
  return (
    <section id="how-it-works" className="py-16 md:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-[#14221c]">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12 pb-4 border-b border-[#14221c]">
        <div>
          <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block mb-1">
            System Workflow Architecture
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            How AutoNexa Works
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md">
          Four disciplined execution phases transform raw uncleaned CSV data into production-ready scikit-learn models.
        </p>
      </div>

      {/* 4 Execution Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.step}
              className="p-5 sm:p-6 rounded-2xl bg-[#080d11] border border-[#14221c] hover:border-[#1e382b] hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-9 h-9 rounded-xl bg-[#081510] border border-emerald-900/60 flex items-center justify-center text-emerald-400 font-mono text-xs font-bold">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-mono font-bold text-emerald-400/80 bg-[#06120d] px-2 py-0.5 rounded-full border border-emerald-900/40">
                    Phase {s.step}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-white mb-2">{s.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  {s.description}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-[#14221c]">
                <code className="text-[9px] font-mono text-slate-500 block truncate">
                  {s.endpoint}
                </code>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Action */}
      <div className="mt-10 flex justify-center">
        <button
          onClick={onLaunchWorkspace}
          className="btn-secondary px-5 py-2.5 rounded-full text-xs font-medium flex items-center gap-2 cursor-pointer"
        >
          <span>Open Interactive Workspace</span>
          <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
        </button>
      </div>
    </section>
  );
}
