"use client";

import React from "react";
import { ArrowRight, BookOpen } from "lucide-react";

interface CTASectionProps {
  onLaunchWorkspace: () => void;
}

export default function CTASection({ onLaunchWorkspace }: CTASectionProps) {
  const scrollToDocs = () => {
    document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="py-16 md:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="ramotion-canvas-frame p-8 sm:p-12 md:p-16 text-center relative overflow-hidden">
        {/* Subtle ambient emerald glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(16, 185, 129, 0.2), transparent 75%)",
          }}
        />

        <div className="relative z-10 max-w-2xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#081510] border border-emerald-900/50 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-300">
              Open-Source Research Lab
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
            Ready to Build Your AutoML Pipeline?
          </h2>

          <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            Upload custom CSV files or load pre-packaged benchmark datasets to explore, train, and evaluate machine learning models in minutes.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <button
              onClick={onLaunchWorkspace}
              className="btn-ramotion w-full sm:w-auto px-7 py-3 text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer font-semibold"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="w-4 h-4 stroke-[2.2]" />
            </button>
            <button
              onClick={scrollToDocs}
              className="btn-secondary w-full sm:w-auto px-6 py-3 text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer font-medium"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              <span>Pipeline Documentation</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
