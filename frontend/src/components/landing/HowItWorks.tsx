"use client";

import React from "react";
import { Upload, Search, Zap, Send, ArrowRight } from "lucide-react";

interface HowItWorksProps {
  onLaunchWorkspace: () => void;
}

const STEPS = [
  {
    step: "01",
    icon: Upload,
    title: "Upload",
    desc: "Stream tabular CSV data with automated size enforcement, tabular integrity validation, and cryptographic SHA-256 fingerprinting.",
  },
  {
    step: "02",
    icon: Search,
    title: "Analyze",
    desc: "Execute dataset intelligence to identify target columns, classify feature roles, and audit data quality risks.",
  },
  {
    step: "03",
    icon: Zap,
    title: "Train",
    desc: "Execute resource-aware AutoML with leakage-safe Stratified K-Fold CV or holdout validation under bounded time limits.",
  },
  {
    step: "04",
    icon: Send,
    title: "Predict",
    desc: "Export the winning scikit-learn pipeline for zero-retraining inference via low-latency JSON or high-throughput batch CSV.",
  },
];

export default function HowItWorks({ onLaunchWorkspace }: HowItWorksProps) {
  return (
    <section id="architecture" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-white/5">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="text-xs font-mono font-semibold text-amber-400 tracking-wider uppercase">
          System Workflow
        </span>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mt-2 mb-4">
          How AutoNexa Operates
        </h2>
        <p className="text-sm sm:text-base text-slate-400">
          Four disciplined stages transform uncleaned tabular data into verified, production-ready model pipelines.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div key={idx} className="relative p-6 rounded-2xl glass-panel flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 font-mono text-sm font-bold">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-600">{s.step}</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-900/80 flex items-center gap-1.5 text-xs text-amber-400/80 font-mono">
                <span>Stage {s.step}</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Final High-Impact CTA banner */}
      <div className="relative rounded-3xl p-8 sm:p-12 glass-panel-glow border border-amber-500/30 overflow-hidden text-center">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-2xl mx-auto space-y-4">
          <span className="text-xs font-mono font-semibold text-amber-400 uppercase tracking-widest">
            Ready to Accelerate Your ML Research?
          </span>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Explore the AutoNexa Workspace Now
          </h3>
          <p className="text-xs sm:text-sm text-slate-300">
            Upload your own tabular CSV dataset or use one of our instant pre-packaged benchmark datasets (Churn, Housing, Flight Delays).
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onLaunchWorkspace}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl btn-gold text-sm font-bold flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 cursor-pointer"
            >
              Launch Interactive Workspace
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
