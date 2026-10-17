"use client";

import React from "react";
import { ArrowRight, Play, Upload, ShieldCheck, Zap, Cpu } from "lucide-react";
import ScrollReveal, { StaggerContainer, StaggerItem } from "./ScrollReveal";

interface CTASectionProps {
  onLaunchWorkspace: () => void;
}

export default function CTASection({ onLaunchWorkspace }: CTASectionProps) {
  const scrollToWorkflow = () => {
    document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative py-14 sm:py-18 bg-gradient-to-b from-[#F2F6F9] via-[#EBF3FB] to-[#F2F6F9] border-b border-[#E2E8F0] overflow-hidden">
      {/* Ambient glowing radial light */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(29, 78, 216, 0.12), transparent 75%)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal direction="up" distance={24} duration={0.6}>
        <div className="relative rounded-3xl bg-white border border-[#CBD5E1] p-8 sm:p-14 md:p-16 text-center shadow-[0_16px_50px_rgba(29,78,216,0.1)] overflow-hidden">
          {/* Glowing cobalt top accent line */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#1D4ED8] to-transparent" />
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(circle at 50% 0%, rgba(29, 78, 216, 0.12), transparent 70%)",
            }}
          />

          <div className="relative z-10 max-w-2xl mx-auto space-y-6">
            
            {/* Eyebrow badge */}
            <ScrollReveal direction="down" distance={16} delay={0.1}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8] animate-pulse" />
              <span className="text-[10.5px] font-mono uppercase tracking-widest text-[#1D4ED8] font-semibold">
                AUTONEXA AI LAB // READY TO TRAIN
              </span>
            </div>
            </ScrollReveal>

            {/* Headline */}
            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl font-normal text-[#0F172A] tracking-tight leading-[1.1]">
              Ready to Build Your <span className="text-[#1E3A8A] italic font-normal">AutoML Pipeline?</span>
            </h2>

            {/* Description */}
            <p className="text-xs sm:text-base text-[#475569] max-w-lg mx-auto leading-relaxed font-sans">
              Upload custom CSV files or load benchmark datasets to explore, train, evaluate, and deploy machine learning models in minutes.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onLaunchWorkspace}
                className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-[0_4px_14px_rgba(29,78,216,0.35)] hover:shadow-[0_6px_20px_rgba(29,78,216,0.45)] transition-all cursor-pointer group"
              >
                <Upload className="w-4 h-4 stroke-[2.4] group-hover:-translate-y-0.5 transition-transform" />
                <span>Start with a CSV</span>
                <ArrowRight className="w-4 h-4 stroke-[2.4] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={scrollToWorkflow}
                className="w-full sm:w-auto px-7 py-3.5 rounded-full bg-white border border-[#CBD5E1] text-[#0F172A] hover:border-[#1D4ED8] hover:bg-[#F8FAFC] font-medium text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer group shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-[#1D4ED8] text-[#1D4ED8] group-hover:scale-110 transition-transform" />
                <span>Explore the Workflow</span>
              </button>
            </div>

            {/* Telemetry Status Bar */}
            <StaggerContainer
              staggerDelay={0.08}
              className="pt-6 border-t border-[#E2E8F0] flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-xs font-mono text-[#64748B]"
            >
              <StaggerItem direction="up" distance={12}>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  <span>Leakage-Free 5-Fold CV</span>
                </span>
              </StaggerItem>
              <StaggerItem direction="up" distance={12}>
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  <span>&lt; 5ms Serving Latency</span>
                </span>
              </StaggerItem>
              <StaggerItem direction="up" distance={12}>
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  <span>Multi-Model Architecture</span>
                </span>
              </StaggerItem>
            </StaggerContainer>

          </div>
        </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
