"use client";

import React from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Sparkles, ShieldCheck, Zap, Database, Layers } from "lucide-react";
import PipelineWorkflow from "@/components/landing/PipelineWorkflow";

// Lazy-load 3D scene with ssr false
const HeroScene = dynamic(() => import("@/components/3d/HeroScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-72 h-72 rounded-full bg-amber-500/10 blur-3xl animate-pulse" />
    </div>
  ),
});

interface HeroProps {
  onLaunchWorkspace: () => void;
  apiConnected?: boolean | null;
}

export default function Hero({ onLaunchWorkspace, apiConnected }: HeroProps) {
  const scrollToDocumentation = () => {
    document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative overflow-hidden pt-10 pb-16 md:pt-16 md:pb-20 bg-grid-pattern">
      {/* 3D Canvas Background */}
      <HeroScene />

      {/* Atmospheric lighting glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-amber-500/10 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[350px] h-[300px] bg-sky-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Eyebrow Label matching reference */}
        <div className="inline-flex items-center gap-2 mb-4 animate-fade-in-up">
          <span className="text-xs sm:text-sm font-semibold text-amber-400 tracking-wider font-mono">
            AutoNexa AI Research Lab
          </span>
        </div>

        {/* Large Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.1] mb-5 font-sans animate-fade-in-up-delay-1 max-w-4xl mx-auto">
          From Raw Data to{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 drop-shadow-[0_0_35px_rgba(245,158,11,0.25)]">
            Reliable Models.
          </span>
        </h1>

        {/* Supporting Description matching reference */}
        <p className="max-w-3xl mx-auto text-base sm:text-lg md:text-xl text-slate-300 font-normal leading-relaxed mb-8 animate-fade-in-up-delay-2">
          The Premium, Research-Grade AutoML Platform for Data Scientists and ML Engineers.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 animate-fade-in-up-delay-3">
          <button
            onClick={onLaunchWorkspace}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl btn-gold text-sm sm:text-base font-bold flex items-center justify-center gap-3 shadow-xl shadow-amber-500/20 cursor-pointer"
          >
            Launch Workspace
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
          <button
            onClick={scrollToDocumentation}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl btn-gold-outline text-sm sm:text-base font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            Explore Documentation
          </button>
        </div>

        {/* =========================================================================
            THE VISUAL CENTERPIECE: 3-PANEL INTERACTIVE WORKFLOW VISUALIZER
            Placed directly below the hero CTA buttons matching reference design
            ========================================================================= */}
        <div className="w-full animate-fade-in-up-delay-3">
          <PipelineWorkflow
            onLaunchWorkspace={onLaunchWorkspace}
            apiConnected={apiConnected}
          />
        </div>

        {/* Value badges strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-5xl mx-auto mt-10 pt-8 border-t border-white/10">
          <div className="p-3 rounded-lg glass-panel text-left">
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Leakage-Free</span>
            </div>
            <p className="text-xs text-slate-400">Strict CV partition isolation</p>
          </div>

          <div className="p-3 rounded-lg glass-panel text-left">
            <div className="flex items-center gap-2 text-sky-400 mb-1">
              <Zap className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Resource-Bounded</span>
            </div>
            <p className="text-xs text-slate-400">Time and row limits enforced</p>
          </div>

          <div className="p-3 rounded-lg glass-panel text-left">
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <Layers className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">MLflow Lineage</span>
            </div>
            <p className="text-xs text-slate-400">Parent &amp; nested child runs</p>
          </div>

          <div className="p-3 rounded-lg glass-panel text-left">
            <div className="flex items-center gap-2 text-amber-300 mb-1">
              <Database className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Safe Inference</span>
            </div>
            <p className="text-xs text-slate-400">JSON &amp; CSV batch predictions</p>
          </div>
        </div>
      </div>
    </section>
  );
}
