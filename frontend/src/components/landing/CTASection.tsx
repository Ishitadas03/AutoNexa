"use client";

import React from "react";
import { ArrowRight, Play, BookOpen } from "lucide-react";

interface CTASectionProps {
  onLaunchWorkspace: () => void;
}

export default function CTASection({ onLaunchWorkspace }: CTASectionProps) {
  const scrollToWorkflow = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="py-20 bg-[#070D0C]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="autonexa-card-elevated p-8 sm:p-14 md:p-16 text-center relative overflow-hidden">
          {/* Subtle ambient emerald glow */}
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(104, 231, 181, 0.2), transparent 75%)",
            }}
          />

          <div className="relative z-10 max-w-2xl mx-auto space-y-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#0D1815] border border-[#2A4E42] mb-1">
              <span className="w-2 h-2 rounded-full bg-[#68E7B5] animate-pulse" />
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#68E7B5]">
                Open-Source Research Lab
              </span>
            </div>

            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl font-normal text-[#F1EFE1] tracking-tight">
              Ready to Build Your AutoML Pipeline?
            </h2>

            <p className="text-xs sm:text-base text-[#AEBEB5] max-w-lg mx-auto leading-relaxed font-sans">
              Upload custom CSV files or load benchmark datasets to explore, train, evaluate, and deploy machine learning models in minutes.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onLaunchWorkspace}
                className="btn-autonexa-primary w-full sm:w-auto px-8 py-3 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Start with a CSV</span>
                <ArrowRight className="w-4 h-4 stroke-[2.2]" />
              </button>
              <button
                onClick={scrollToWorkflow}
                className="btn-autonexa-secondary w-full sm:w-auto px-6 py-3 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current text-[#68E7B5]" />
                <span>Explore the Workflow</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
