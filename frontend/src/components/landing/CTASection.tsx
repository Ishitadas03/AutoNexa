"use client";

import { ArrowRight, Play, Upload, ShieldCheck, Zap, Cpu } from "lucide-react";

interface CTASectionProps {
  onLaunchWorkspace: () => void;
}

export default function CTASection({ onLaunchWorkspace }: CTASectionProps) {
  const scrollToWorkflow = () => {
    document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative py-20 sm:py-28 bg-[#001312] border-b border-[#0E3D35]/70 overflow-hidden">
      {/* Ambient glowing radial light */}
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(0, 95, 80, 0.4), transparent 75%)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl bg-[#001815] border border-[#0E4A40] p-8 sm:p-14 md:p-16 text-center shadow-[0_20px_50px_rgba(0,0,0,0.85)] overflow-hidden">
          
          {/* Subtle neon corner accents */}
          <div className="absolute top-0 left-0 w-20 h-20 border-t-2 border-l-2 border-[#4EECBF]/60 rounded-tl-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-20 h-20 border-b-2 border-r-2 border-[#4EECBF]/60 rounded-br-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto space-y-6">
            
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#031C18]/90 border border-[#0E4A40] shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#4EECBF] shadow-[0_0_8px_#4EECBF] animate-pulse" />
              <span className="text-[10.5px] font-mono uppercase tracking-widest text-[#4EECBF] font-semibold">
                AUTONEXA AI LAB // READY TO TRAIN
              </span>
            </div>

            {/* Headline */}
            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl font-normal text-[#F1EFE1] tracking-tight leading-[1.1]">
              Ready to Build Your <span className="text-[#4EECBF] italic font-normal">AutoML Pipeline?</span>
            </h2>

            {/* Description */}
            <p className="text-xs sm:text-base text-[#86A699] max-w-lg mx-auto leading-relaxed font-sans">
              Upload custom CSV files or load benchmark datasets to explore, train, evaluate, and deploy machine learning models in minutes.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onLaunchWorkspace}
                className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-[#4EECBF] hover:bg-[#3dd8ab] text-[#001312] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-[0_0_24px_rgba(78,236,191,0.45)] hover:shadow-[0_0_32px_rgba(78,236,191,0.65)] transition-all cursor-pointer group"
              >
                <Upload className="w-4 h-4 stroke-[2.4] group-hover:-translate-y-0.5 transition-transform" />
                <span>Start with a CSV</span>
                <ArrowRight className="w-4 h-4 stroke-[2.4] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={scrollToWorkflow}
                className="w-full sm:w-auto px-7 py-3.5 rounded-full bg-[#03211C] border border-[#0E4A40] text-[#F1EFE1] hover:border-[#4EECBF]/60 hover:bg-[#07362C] font-medium text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer group"
              >
                <Play className="w-3.5 h-3.5 fill-[#4EECBF] text-[#4EECBF] group-hover:scale-110 transition-transform" />
                <span>Explore the Workflow</span>
              </button>
            </div>

            {/* Telemetry Status Bar */}
            <div className="pt-6 border-t border-[#0E3D35]/60 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-xs font-mono text-[#86A699]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#4EECBF]" />
                <span>Leakage-Free 5-Fold CV</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#4EECBF]" />
                <span>&lt; 5ms Serving Latency</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#4EECBF]" />
                <span>Multi-Model Architecture</span>
              </span>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
