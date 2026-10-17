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
    <section className="relative pt-6 pb-12 lg:pt-10 lg:pb-16 bg-[#001312] border-b border-[#0E3D35]/70 overflow-hidden">
      {/* Ambient glowing radial light */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 75% 60% at 60% 45%, rgba(0, 95, 80, 0.35), transparent 75%)",
        }}
      />

      <div className="relative max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-12">
        {/* Panoramic 2-Column Split: Left Copy & Right 3D Isometric Network */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center mb-10">
          
          {/* ===================================================================
              LEFT COLUMN: Headline, Copy, Action CTAs
              =================================================================== */}
          <div className="lg:col-span-5 flex flex-col justify-center text-left z-10">
            {/* Eyebrow Label */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#031C18]/90 border border-[#0E4A40] mb-6 w-fit shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#4EECBF] shadow-[0_0_8px_#4EECBF]" />
              <span className="text-[10.5px] font-mono uppercase tracking-widest text-[#4EECBF] font-semibold">
                AUTONEXA AI RESEARCH LAB
              </span>
            </div>

            {/* Large Editorial Headline Matching Reference Image */}
            <h1 className="font-editorial text-4xl sm:text-5xl md:text-6xl lg:text-5xl xl:text-[68px] font-normal text-[#F1EFE1] tracking-tight leading-[1.06] mb-6">
              From Raw Data<br />
              to <span className="text-[#4EECBF] italic font-normal">Reliable Models.</span>
            </h1>

            {/* Supporting Text */}
            <p className="text-sm sm:text-base text-[#9AB3A8] leading-relaxed mb-8 font-normal font-sans max-w-lg">
              A powerful AutoML platform for tabular data. Upload, analyze, train, compare and deploy machine learning models — all in one place.
            </p>

            {/* Action CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 mb-2">
              <button
                onClick={onLaunchWorkspace}
                className="px-6 py-3.5 rounded-full bg-[#4EECBF] hover:bg-[#3dd8ab] text-[#031412] font-semibold text-xs sm:text-sm flex items-center gap-2.5 shadow-[0_0_24px_rgba(78,236,191,0.45)] hover:shadow-[0_0_32px_rgba(78,236,191,0.65)] transition-all cursor-pointer group"
              >
                <Upload className="w-4 h-4 stroke-[2.4] group-hover:-translate-y-0.5 transition-transform" />
                <span>Start with a CSV</span>
                <ArrowRight className="w-4 h-4 stroke-[2.4] group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={scrollToWorkflow}
                className="px-6 py-3.5 rounded-full bg-[#041512] border border-[#0E4A40] text-[#F1EFE1] hover:border-[#4EECBF]/60 hover:bg-[#07241E] font-medium text-xs sm:text-sm flex items-center gap-2.5 transition-all cursor-pointer group"
              >
                <Play className="w-3.5 h-3.5 fill-[#4EECBF] text-[#4EECBF] group-hover:scale-110 transition-transform" />
                <span>Explore the Workflow</span>
              </button>
            </div>
          </div>

          {/* ===================================================================
              RIGHT COLUMN: 3D Connected Isometric Network with Mascot
              =================================================================== */}
          <div className="lg:col-span-7 w-full flex items-center justify-center">
            <HeroWorkflowGraphic onSelectStage={() => scrollToSection("pipeline")} />
          </div>

        </div>

        {/* ===================================================================
            BOTTOM ROW: 4 Capability Feature Badges Matching Reference
            =================================================================== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 pt-8 border-t border-[#0E3D35]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#031C18] border border-[#0E4A40]/80 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-[#4EECBF] stroke-[2]" />
            </div>
            <div>
              <div className="text-[13px] text-[#F1EFE1] font-semibold tracking-tight">CSV-based AutoML</div>
              <div className="text-[11.5px] text-[#86A699]">Just upload and go.</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#031C18] border border-[#0E4A40]/80 flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5 text-[#4EECBF] stroke-[2]" />
            </div>
            <div>
              <div className="text-[13px] text-[#F1EFE1] font-semibold tracking-tight">Multiple ML Models</div>
              <div className="text-[11.5px] text-[#86A699]">Find the best performer.</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#031C18] border border-[#0E4A40]/80 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-[#4EECBF] stroke-[2]" />
            </div>
            <div>
              <div className="text-[13px] text-[#F1EFE1] font-semibold tracking-tight">Experiment Tracking</div>
              <div className="text-[11.5px] text-[#86A699]">Keep your ML journey.</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#031C18] border border-[#0E4A40]/80 flex items-center justify-center shrink-0">
              <Box className="w-5 h-5 text-[#4EECBF] stroke-[2]" />
            </div>
            <div>
              <div className="text-[13px] text-[#F1EFE1] font-semibold tracking-tight">Prediction Playground</div>
              <div className="text-[11.5px] text-[#86A699]">Try your model instantly.</div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
