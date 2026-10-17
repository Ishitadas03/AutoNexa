"use client";

import React from "react";
import { ArrowRight, Play, Database, Sparkles, BarChart3, ShieldCheck } from "lucide-react";
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
    <section className="relative pt-6 pb-10 lg:pt-8 lg:pb-14 bg-[#021414] border-b border-[#0E4A40]/60 overflow-hidden">
      {/* Ambient glowing radial light centered on the right pipeline */}
      <div
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 55% 45%, rgba(0, 85, 75, 0.45), transparent 75%)",
        }}
      />

      <div className="relative max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-12">
        {/* Panoramic 2-Column Split: Left Copy & Right 5-Stage Isometric Workflow */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8 items-center mb-8">
          
          {/* ===================================================================
              LEFT COLUMN: Headline, Copy, Action CTAs
              =================================================================== */}
          <div className="xl:col-span-5 flex flex-col justify-center text-left z-10">
            {/* Eyebrow Label */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#031C18]/90 border border-[#0E4A40] mb-5 w-fit shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#4EECBF] shadow-[0_0_8px_#4EECBF]" />
              <span className="text-[10.5px] font-mono uppercase tracking-widest text-[#4EECBF] font-semibold">
                AUTONEXA AI RESEARCH LAB
              </span>
            </div>

            {/* Large Editorial Headline Matching Reference Image */}
            <h1 className="font-editorial text-4xl sm:text-5xl md:text-6xl xl:text-[68px] font-normal text-[#F1EFE1] tracking-tight leading-[1.06] mb-5">
              From Raw Data<br />
              to <span className="text-[#4EECBF] italic">Reliable Models.</span>
            </h1>

            {/* Supporting Text */}
            <p className="text-sm sm:text-base text-[#9AB3A8] leading-relaxed mb-8 font-normal font-sans max-w-lg">
              A powerful AutoML platform for tabular data. Upload, analyze, train, compare and deploy machine learning models — all in one place.
            </p>

            {/* Action CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3.5">
              <button
                onClick={onLaunchWorkspace}
                className="px-6 py-3 rounded-full bg-[#4EECBF] hover:bg-[#3dd8ab] text-[#051512] font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-[0_0_24px_rgba(78,236,191,0.45)] transition-all cursor-pointer"
              >
                <span>Start with a CSV</span>
                <ArrowRight className="w-4 h-4 stroke-[2.4]" />
              </button>
              <button
                onClick={scrollToWorkflow}
                className="px-6 py-3 rounded-full bg-[#041512] border border-[#0E4A40] text-[#F1EFE1] hover:border-[#4EECBF]/60 hover:bg-[#07241E] font-medium text-xs sm:text-sm flex items-center gap-2.5 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-[#4EECBF] text-[#4EECBF]" />
                <span>Explore the Workflow</span>
              </button>
            </div>
          </div>

          {/* ===================================================================
              RIGHT COLUMN: 5-Stage Isometric Connected System with Mascot
              =================================================================== */}
          <div className="xl:col-span-7 w-full">
            <HeroWorkflowGraphic onSelectStage={() => scrollToPipeline()} />
          </div>

        </div>

        {/* ===================================================================
            BOTTOM ROW: 4 Capability Feature Badges Spanning Horizontally
            =================================================================== */}
        <div className="flex flex-wrap items-center gap-6 sm:gap-10 lg:gap-14 text-xs text-[#9AB3A8] font-sans pt-4 border-t border-[#0E4A40]/40">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-[#4EECBF] stroke-[2.2]" />
            <span className="text-[12px] text-[#9AB3A8] font-medium">CSV-based AutoML</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#4EECBF] stroke-[2.2]" />
            <span className="text-[12px] text-[#9AB3A8] font-medium">Multiple ML Models</span>
          </div>
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-4 h-4 text-[#4EECBF] stroke-[2.2]" />
            <span className="text-[12px] text-[#9AB3A8] font-medium">Experiment Tracking</span>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#4EECBF] stroke-[2.2]" />
            <span className="text-[12px] text-[#9AB3A8] font-medium">Prediction Playground</span>
          </div>
        </div>

      </div>
    </section>
  );
}
