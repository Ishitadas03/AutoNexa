"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Sparkles, ArrowRight } from "lucide-react";

interface HeroWorkflowGraphicProps {
  onSelectStage?: (stageNumber: string) => void;
}

interface StageInfo {
  id: string;
  number: string;
  title: string;
  description: string;
  metric: string;
  leftPercent: number;
  widthPercent: number;
}

const STAGES: StageInfo[] = [
  {
    id: "01",
    number: "01",
    title: "Upload Dataset",
    description: "Ingest CSV files with auto delimiter & encoding detection",
    metric: "Uploaded: 73% & 78%",
    leftPercent: 2,
    widthPercent: 19,
  },
  {
    id: "02",
    number: "02",
    title: "Dataset Profiling",
    description: "Instant schema inference, missingness audit & stats",
    metric: "Rows: 12,458 • Cols: 8",
    leftPercent: 20,
    widthPercent: 20,
  },
  {
    id: "03",
    number: "03",
    title: "AutoML Training",
    description: "Resource-bounded training across XGBoost, LightGBM, RF",
    metric: "Training 4 Candidate Models",
    leftPercent: 39,
    widthPercent: 22,
  },
  {
    id: "04",
    number: "04",
    title: "Model Evaluation",
    description: "Leaderboard comparison across validation partitions",
    metric: "Best: XGBoost (0.892)",
    leftPercent: 61,
    widthPercent: 19,
  },
  {
    id: "05",
    number: "05",
    title: "Predictions",
    description: "Interactive single-record inference & batch evaluation",
    metric: "Class 1: 0.92 • Class 0: 0.08",
    leftPercent: 80,
    widthPercent: 19,
  },
];

export default function HeroWorkflowGraphic({ onSelectStage }: HeroWorkflowGraphicProps) {
  const [activeStage, setActiveStage] = useState<string | null>(null);

  const handleStageClick = (stageId: string) => {
    setActiveStage(stageId);
    onSelectStage?.(stageId);
  };

  return (
    <div className="relative w-full select-none">
      {/* Background radial ambient emerald aura matching reference */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 55% 45%, rgba(46, 230, 168, 0.16), transparent 75%)",
        }}
      />

      <style jsx>{`
        @keyframes chevronFlow {
          0% {
            opacity: 0.3;
            transform: translateX(0px);
          }
          50% {
            opacity: 1;
            transform: translateX(4px);
          }
          100% {
            opacity: 0.3;
            transform: translateX(0px);
          }
        }
        @keyframes pulseHalo {
          0%, 100% {
            opacity: 0.3;
            transform: scale(0.98);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.03);
          }
        }
        .anim-chevron {
          animation: chevronFlow 1.8s ease-in-out infinite;
        }
        .anim-pulse-halo {
          animation: pulseHalo 3s ease-in-out infinite;
        }
      `}</style>

      {/* Horizontal Scrollable Wrapper on Mobile, Crisp Panoramic Container on Desktop */}
      <div className="overflow-x-auto pb-4 pt-1 -mx-2 px-2 scrollbar-none">
        <div className="relative min-w-[760px] xl:min-w-full aspect-[664/376] w-full rounded-2xl overflow-hidden group">
          {/* 1. The High-Fidelity 5-Stage Isometric Workflow Illustration */}
          <div className="relative w-full h-full">
            <Image
              src="/images/hero-workflow-illustration@2x.png"
              alt="AutoNexa 5-Stage Isometric AutoML Pipeline Workflow"
              fill
              priority
              sizes="(max-width: 1280px) 900px, 1100px"
              className="object-contain object-center drop-shadow-[0_15px_35px_rgba(0,0,0,0.7)]"
            />
          </div>

          {/* 2. Animated Energy Chevron Overlays along Conduit Cables */}
          <div className="absolute inset-0 pointer-events-none z-10">
            {/* Conduit 2 -> 3 (Chevron Flow) */}
            <div
              className="absolute left-[33.5%] top-[50%] -translate-y-1/2 flex items-center -space-x-1 text-[#4EECBF] anim-chevron text-xs font-bold drop-shadow-[0_0_8px_#4EECBF]"
              style={{ animationDelay: "0s" }}
            >
              <span>›</span>
              <span>›</span>
              <span>›</span>
            </div>

            {/* Conduit 3 -> 4 (Chevron Flow) */}
            <div
              className="absolute left-[55%] top-[58%] -translate-y-1/2 flex items-center -space-x-1 text-[#4EECBF] anim-chevron text-xs font-bold drop-shadow-[0_0_8px_#4EECBF]"
              style={{ animationDelay: "0.5s" }}
            >
              <span>›</span>
              <span>›</span>
              <span>›</span>
            </div>

            {/* Conduit 4 -> 5 (Chevron Flow) */}
            <div
              className="absolute left-[73.5%] top-[62%] -translate-y-1/2 flex items-center -space-x-1 text-[#4EECBF] anim-chevron text-xs font-bold drop-shadow-[0_0_8px_#4EECBF]"
              style={{ animationDelay: "1s" }}
            >
              <span>›</span>
              <span>›</span>
              <span>›</span>
            </div>

            {/* Robot Active Beacon Pulse at Stage 03 */}
            <div className="absolute left-[47.2%] top-[39.5%] -translate-x-1/2 -translate-y-1/2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4EECBF] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#4EECBF]/80" />
              </span>
            </div>

            {/* Checkmark Beacon Pulse at Stage 05 */}
            <div className="absolute left-[91.5%] top-[56%] -translate-x-1/2 -translate-y-1/2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4EECBF] opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#4EECBF]" />
              </span>
            </div>
          </div>

          {/* 3. Interactive Stage Hotspot Overlays */}
          {STAGES.map((stage) => {
            const isHovered = activeStage === stage.id;
            return (
              <div
                key={stage.id}
                onMouseEnter={() => setActiveStage(stage.id)}
                onMouseLeave={() => setActiveStage(null)}
                onClick={() => handleStageClick(stage.id)}
                className="absolute top-0 bottom-0 z-20 cursor-pointer group/hotspot transition-all duration-300"
                style={{
                  left: `${stage.leftPercent}%`,
                  width: `${stage.widthPercent}%`,
                }}
                role="button"
                tabIndex={0}
                aria-label={`Inspect Stage ${stage.number}: ${stage.title}`}
              >
                {/* Subtle Hover Aura */}
                <div
                  className={`absolute inset-2 rounded-2xl transition-opacity duration-300 pointer-events-none ${
                    isHovered
                      ? "opacity-100 bg-[#4EECBF]/5 border border-[#4EECBF]/40 shadow-[0_0_20px_rgba(78,236,191,0.2)]"
                      : "opacity-0"
                  }`}
                />

                {/* Floating Tooltip Pill on Hover */}
                {isHovered && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-all duration-200">
                    <div className="px-3 py-1.5 rounded-full bg-[#031C18]/95 border border-[#4EECBF] shadow-[0_4px_16px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center gap-2 whitespace-nowrap">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4EECBF] animate-ping" />
                      <span className="text-[11px] font-mono text-[#F1EFE1] font-semibold">
                        {stage.title}
                      </span>
                      <span className="text-[10px] text-[#4EECBF] font-mono">
                        {stage.metric}
                      </span>
                      <ArrowRight className="w-3 h-3 text-[#4EECBF] stroke-[2.2]" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage Status Sub-bar for Mobile or Tablet users */}
      <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-[#9AB3A8] px-2 xl:hidden">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#4EECBF]" />
          <span>Tap any stage to view interactive AutoML details</span>
        </span>
        <span className="text-[#4EECBF]">5 Connected Stages</span>
      </div>
    </div>
  );
}
