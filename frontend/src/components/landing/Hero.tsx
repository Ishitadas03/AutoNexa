"use client";

import React from "react";
import { ArrowRight, Play, Database, Settings, BarChart3, Box, Upload } from "lucide-react";
import HeroWorkflowGraphic from "./HeroWorkflowGraphic";

interface HeroProps {
  onLaunchWorkspace: () => void;
}

export default function Hero({ onLaunchWorkspace }: HeroProps) {
  const scrollToWorkflow = () => {
    document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      className="relative bg-[#F2F6F9] border-b border-[#E2E8F0] overflow-hidden flex flex-col"
      style={{ minHeight: 'calc(100svh - var(--navbar-height))' }}
    >
      {/* Ambient soft glow centered on the right graphic */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 75% 60% at 65% 45%, rgba(29, 78, 216, 0.08), transparent 75%)",
        }}
      />

      <div className="relative max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-12 w-full flex-1 flex flex-col justify-center py-8 lg:py-0">
        {/* Panoramic 2-Column Split: Left Copy & Right 3D Isometric Network */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-center">
          
          {/* ===================================================================
              LEFT COLUMN: Headline, Copy, Action CTAs
              =================================================================== */}
          <div className="lg:col-span-5 flex flex-col justify-center text-left z-10">
            {/* Eyebrow Label */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#CBD5E1] mb-6 w-fit shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
              <span className="text-[10.5px] font-mono uppercase tracking-widest text-[#334155] font-semibold">
                AUTONEXA AI RESEARCH LAB
              </span>
            </div>

            {/* Large Editorial Headline Matching Reference Image */}
            <h1 className="font-editorial text-4xl sm:text-5xl md:text-6xl lg:text-5xl xl:text-[68px] font-normal text-[#0F172A] tracking-tight leading-[1.06] mb-6">
              From Raw Data<br />
              to <span className="text-[#1E3A8A] italic font-normal">Reliable Models.</span>
            </h1>

            {/* Supporting Text */}
            <p className="text-sm sm:text-base text-[#475569] leading-relaxed mb-8 font-normal font-sans max-w-lg">
              A powerful AutoML platform for tabular data. Upload, analyze, train, compare and deploy machine learning models — all in one place.
            </p>

            {/* Action CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 mb-2">
              <button
                onClick={onLaunchWorkspace}
                className="px-6 py-3.5 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold text-xs sm:text-sm flex items-center gap-2.5 shadow-[0_4px_14px_rgba(29,78,216,0.35)] hover:shadow-[0_6px_20px_rgba(29,78,216,0.45)] transition-all cursor-pointer group"
              >
                <Upload className="w-4 h-4 stroke-[2.4] group-hover:-translate-y-0.5 transition-transform" />
                <span>Start with a CSV</span>
                <ArrowRight className="w-4 h-4 stroke-[2.4] group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={scrollToWorkflow}
                className="px-6 py-3.5 rounded-full bg-white border border-[#CBD5E1] text-[#0F172A] hover:bg-[#F8FAFC] hover:border-[#94A3B8] font-medium text-xs sm:text-sm flex items-center gap-2.5 transition-all cursor-pointer group shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-[#1D4ED8] text-[#1D4ED8] group-hover:scale-110 transition-transform" />
                <span>Explore the Workflow</span>
              </button>
            </div>
          </div>

          {/* ===================================================================
              RIGHT COLUMN: 3D Connected Isometric Network with Mascot
              — Takes ~55% of width for visual impact
              =================================================================== */}
          <div className="lg:col-span-7 w-full flex items-center justify-center lg:scale-105 xl:scale-110 origin-center">
            <HeroWorkflowGraphic onSelectStage={() => scrollToSection("pipeline")} />
          </div>

        </div>
      </div>

      {/* ===================================================================
          BOTTOM ROW: 4 Capability Feature Badges — pinned to bottom of hero
          =================================================================== */}
      <div className="relative max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-12 w-full pb-6 lg:pb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 pt-6 border-t border-[#CBD5E1]/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#CBD5E1] shadow-xs flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-[#1E293B] stroke-[2]" />
            </div>
            <div>
              <div className="text-[13px] text-[#0F172A] font-semibold tracking-tight">CSV-based AutoML</div>
              <div className="text-[11.5px] text-[#64748B]">Just upload and go.</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#CBD5E1] shadow-xs flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5 text-[#1E293B] stroke-[2]" />
            </div>
            <div>
              <div className="text-[13px] text-[#0F172A] font-semibold tracking-tight">Multiple ML Models</div>
              <div className="text-[11.5px] text-[#64748B]">Find the best performer.</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#CBD5E1] shadow-xs flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-[#1E293B] stroke-[2]" />
            </div>
            <div>
              <div className="text-[13px] text-[#0F172A] font-semibold tracking-tight">Experiment Tracking</div>
              <div className="text-[11.5px] text-[#64748B]">Keep your ML journey.</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#CBD5E1] shadow-xs flex items-center justify-center shrink-0">
              <Box className="w-5 h-5 text-[#1E293B] stroke-[2]" />
            </div>
            <div>
              <div className="text-[13px] text-[#0F172A] font-semibold tracking-tight">Prediction Playground</div>
              <div className="text-[11.5px] text-[#64748B]">Try your model instantly.</div>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
