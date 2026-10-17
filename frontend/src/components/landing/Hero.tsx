"use client";

import React from "react";
import { ArrowRight, Play, Database, Cpu, FileSpreadsheet, Activity } from "lucide-react";
import HeroWorkflowGraphic from "./HeroWorkflowGraphic";

interface HeroProps {
  onLaunchWorkspace: () => void;
}

export default function Hero({ onLaunchWorkspace }: HeroProps) {
  const scrollToWorkflow = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToPipeline = () => {
    document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 bg-[#070D0C] bg-tech-grid border-b border-[#2A4E42]/60 overflow-hidden">
      {/* Subtle ambient emerald radial glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% 10%, rgba(104, 231, 181, 0.15), transparent 75%)",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-4xl mx-auto mb-10">
          {/* Eyebrow Label */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#0D1815] border border-[#2A4E42] mb-5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#68E7B5] animate-pulse shadow-[0_0_8px_#68E7B5]" />
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#68E7B5]">
              AutoNexa AI Research Lab
            </span>
          </div>

          {/* Large Headline - Editorial Serif Typography from Reference */}
          <h1 className="font-editorial text-4xl sm:text-6xl md:text-7xl font-normal text-[#F1EFE1] tracking-tight leading-[1.08] mb-6">
            From Raw Data<br />
            to <span className="text-[#68E7B5] italic">Reliable Models.</span>
          </h1>

          {/* Supporting Text */}
          <p className="max-w-2xl mx-auto text-sm sm:text-base md:text-lg text-[#AEBEB5] leading-relaxed mb-8 font-normal font-sans">
            A powerful AutoML platform for tabular data. Upload, analyze, train, compare and deploy machine learning models — all in one place.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <button
              onClick={onLaunchWorkspace}
              className="btn-autonexa-primary w-full sm:w-auto px-7 py-3 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Start with a CSV</span>
              <ArrowRight className="w-4 h-4 stroke-[2.2]" />
            </button>
            <button
              onClick={scrollToWorkflow}
              className="btn-autonexa-secondary w-full sm:w-auto px-6 py-3 text-sm font-medium flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current text-[#68E7B5]" />
              <span>Explore the Workflow</span>
            </button>
          </div>

          {/* 4 Feature Capability Pills (Underneath CTAs, exactly like Reference) */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-[#AEBEB5] font-sans">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#68E7B5]" />
              <span>CSV-based AutoML</span>
            </div>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#68E7B5]" />
              <span>Multiple ML Models</span>
            </div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#68E7B5]" />
              <span>Experiment Tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#68E7B5]" />
              <span>Prediction Playground</span>
            </div>
          </div>
        </div>

        {/* ===================================================================
            HERO ISOMETRIC CONNECTED WORKFLOW SYSTEM WITH ROBOT MASCOT
            =================================================================== */}
        <div className="mt-8 pt-4">
          <HeroWorkflowGraphic onSelectStage={(stage) => scrollToPipeline()} />
        </div>
      </div>
    </section>
  );
}
