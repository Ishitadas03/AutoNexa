"use client";

import React from "react";
import {
  Database,
  BrainCircuit,
  Cpu,
  Layers,
  BarChart3,
  Terminal,
  ShieldCheck,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Database,
    title: "Dataset Profiling",
    tag: "Ingestion",
    description:
      "Automated schema inference, nullity distribution, duplicate checks, and non-sensitive statistical profiling.",
  },
  {
    icon: BrainCircuit,
    title: "Task Recommendations",
    tag: "Intelligence",
    description:
      "Heuristic ML task detection (binary, multiclass, regression) with data quality audits and candidate target ranking.",
  },
  {
    icon: Cpu,
    title: "Automated Model Training",
    tag: "AutoML Core",
    description:
      "Resource-aware candidate search across linear, tree, and ensemble architectures with strict wall-clock time budgets.",
  },
  {
    icon: Layers,
    title: "Experiment Tracking",
    tag: "MLflow",
    description:
      "Hierarchical parent runs and nested candidate child runs capturing per-fold metrics, parameters, and artifact hashes.",
  },
  {
    icon: BarChart3,
    title: "Model Comparison",
    tag: "Evaluation",
    description:
      "Direction-aware metric leaderboards, sample standard deviations (ddof=1), and untouched final holdout evaluation.",
  },
  {
    icon: Terminal,
    title: "Prediction Playground",
    tag: "Inference",
    description:
      "Zero-retraining inference with probability distributions, input realignment, and batch CSV predictions with instant downloads.",
  },
];

export default function FeatureHighlights() {
  return (
    <section id="features" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-white/5">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="text-xs font-mono font-semibold text-amber-400 tracking-wider uppercase">
          Research Capabilities
        </span>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mt-2 mb-4">
          Architected for Scientific Rigor
        </h2>
        <p className="text-sm sm:text-base text-slate-400">
          AutoNexa replaces ad-hoc ML scripts with leakage-proof data splitting, atomic artifact persistence, and
          cryptographic provenance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map((feature, idx) => {
          const Icon = feature.icon;
          return (
            <div
              key={idx}
              className="p-6 rounded-2xl glass-panel hover:border-amber-500/30 transition-all duration-300 flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 group-hover:bg-amber-500/20 transition-all">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    {feature.tag}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-white mb-2 group-hover:text-amber-300 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-900 flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[11px]">Production & Research Ready</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
