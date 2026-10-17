"use client";

import React from "react";
import { ArrowRight, ChevronDown, Database, Cpu, ShieldCheck, Download, Fingerprint, Sparkles } from "lucide-react";

interface HeroProps {
  onLaunchWorkspace: () => void;
}

export default function Hero({ onLaunchWorkspace }: HeroProps) {
  const scrollToPipeline = () => {
    document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative pt-16 pb-16 md:pt-24 md:pb-20 bg-[#06090c] bg-tech-grid border-b border-[#14221c] overflow-hidden">
      {/* Subtle ambient emerald vignette (Ramotion atmosphere) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(16, 185, 129, 0.16), transparent 75%)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Eyebrow Label - Minimal technical badge with emerald pulse */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#08140f] border border-emerald-900/60 mb-6 shadow-[0_0_15px_-3px_rgba(16,185,129,0.25)]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-300">
            AutoNexa AI Research Lab // Tabular AutoML
          </span>
        </div>

        {/* Large Headline - Ramotion signature typography with inline pill icons */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-[1.2] mb-5 max-w-4xl mx-auto font-sans">
          From Raw Data{" "}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 mx-1 rounded-full bg-[#091f16] border border-emerald-500/40 text-emerald-300 text-xl sm:text-2xl md:text-3xl align-middle font-mono font-medium shadow-[0_0_12px_rgba(16,185,129,0.2)]">
            <Fingerprint className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 shrink-0" />
            <span>tabular</span>
          </span>{" "}
          to Reliable{" "}
          <span className="text-emerald-400">Models</span>{" "}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 mx-1 rounded-full bg-[#091f16] border border-emerald-500/40 text-emerald-300 text-xl sm:text-2xl md:text-3xl align-middle font-mono font-medium shadow-[0_0_12px_rgba(16,185,129,0.2)]">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 shrink-0" />
            <span>AI</span>
          </span>
        </h1>

        {/* Supporting Description - Clean typography, slate grey */}
        <p className="max-w-2xl mx-auto text-sm sm:text-base md:text-lg text-slate-400 leading-relaxed mb-9 font-normal">
          A disciplined, open-source AutoML platform for exploring tabular datasets,
          training verified estimators, tracking MLflow experiments, and exporting production-grade pipelines.
        </p>

        {/* Action Buttons - Ramotion glowing pill button + secondary slate button */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-14">
          <button
            onClick={onLaunchWorkspace}
            className="btn-ramotion w-full sm:w-auto px-7 py-3 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Launch Workspace</span>
            <ArrowRight className="w-4 h-4 stroke-[2.2]" />
          </button>
          <button
            onClick={scrollToPipeline}
            className="btn-secondary w-full sm:w-auto px-6 py-3 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Explore Pipeline</span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* 4 Restrained Technical Feature Pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto pt-6 border-t border-[#14221c] text-xs font-mono text-slate-400 text-left">
          <div className="p-3.5 rounded-xl bg-[#090e12] border border-[#14221c] hover:border-[#20362b] transition-colors">
            <div className="flex items-center gap-2 text-slate-200 mb-1">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-[11px]">CSV-based AutoML</span>
            </div>
            <p className="text-[10px] text-slate-500 font-sans">Automated schema inference &amp; audits</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#090e12] border border-[#14221c] hover:border-[#20362b] transition-colors">
            <div className="flex items-center gap-2 text-slate-200 mb-1">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-[11px]">Multiple ML Models</span>
            </div>
            <p className="text-[10px] text-slate-500 font-sans">Linear, ensemble &amp; tree architectures</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#090e12] border border-[#14221c] hover:border-[#20362b] transition-colors">
            <div className="flex items-center gap-2 text-slate-200 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-[11px]">Leakage-Safe CV</span>
            </div>
            <p className="text-[10px] text-slate-500 font-sans">Stratified partitions fit strictly in-fold</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#090e12] border border-[#14221c] hover:border-[#20362b] transition-colors">
            <div className="flex items-center gap-2 text-slate-200 mb-1">
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-[11px]">Zero Retraining</span>
            </div>
            <p className="text-[10px] text-slate-500 font-sans">Standalone scikit-learn pipeline artifacts</p>
          </div>
        </div>
      </div>
    </section>
  );
}
