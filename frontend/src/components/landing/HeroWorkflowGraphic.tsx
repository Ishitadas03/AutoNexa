"use client";

import React, { useState } from "react";
import RobotMascot from "./RobotMascot";
import { FileSpreadsheet, Database, Cpu, Trophy, Laptop, Sparkles } from "lucide-react";

interface HeroWorkflowGraphicProps {
  onSelectStage?: (stageNumber: string) => void;
}

export default function HeroWorkflowGraphic({ onSelectStage }: HeroWorkflowGraphicProps) {
  const [hoveredStage, setHoveredStage] = useState<string | null>("03");

  return (
    <div className="relative w-full max-w-2xl mx-auto py-6 px-2 sm:px-4 select-none">
      {/* Background radial emerald atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(104, 231, 181, 0.12), transparent 75%)",
        }}
      />

      {/* Isometric/Perspective Container */}
      <div className="relative grid grid-cols-1 md:grid-cols-5 gap-3 lg:gap-4 items-center">
        {/* SVG Connector Conduit Lines (Visible on md and up) */}
        <div className="hidden md:block absolute inset-0 pointer-events-none z-0">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 680 260" fill="none">
            {/* Conduit 1: 01 -> 02 */}
            <path
              d="M 125 130 L 165 130"
              stroke="#2A916E"
              strokeWidth="2"
              strokeOpacity="0.6"
              strokeDasharray="4 3"
            />
            {/* Conduit 2: 02 -> 03 */}
            <path
              d="M 245 130 L 295 130"
              stroke="#2A916E"
              strokeWidth="2"
              strokeOpacity="0.6"
              strokeDasharray="4 3"
            />
            {/* Conduit 3: 03 -> 04 */}
            <path
              d="M 405 130 L 445 130"
              stroke="#2A916E"
              strokeWidth="2"
              strokeOpacity="0.6"
              strokeDasharray="4 3"
            />
            {/* Conduit 4: 04 -> 05 */}
            <path
              d="M 525 130 L 565 130"
              stroke="#2A916E"
              strokeWidth="2"
              strokeOpacity="0.6"
              strokeDasharray="4 3"
            />

            {/* Glowing Traveling Data Indicator Pulses */}
            <circle r="3.5" fill="#68E7B5">
              <animateMotion dur="2.4s" repeatCount="indefinite" path="M 125 130 L 165 130" />
            </circle>
            <circle r="3.5" fill="#68E7B5">
              <animateMotion dur="2.4s" repeatCount="indefinite" begin="0.6s" path="M 245 130 L 295 130" />
            </circle>
            <circle r="3.5" fill="#68E7B5">
              <animateMotion dur="2.4s" repeatCount="indefinite" begin="1.2s" path="M 405 130 L 445 130" />
            </circle>
            <circle r="3.5" fill="#68E7B5">
              <animateMotion dur="2.4s" repeatCount="indefinite" begin="1.8s" path="M 525 130 L 565 130" />
            </circle>
          </svg>
        </div>

        {/* =====================================================================
            STAGE 01: Upload Dataset (Floating CSV Document + Columns Preview)
            ===================================================================== */}
        <div
          onMouseEnter={() => setHoveredStage("01")}
          onClick={() => onSelectStage?.("01")}
          className={`relative z-10 p-3 sm:p-3.5 rounded-xl transition-all duration-300 cursor-pointer flex flex-col items-center text-center ${
            hoveredStage === "01"
              ? "bg-[#162A23] border border-[#68E7B5]/60 shadow-[0_0_20px_rgba(104,231,181,0.2)]"
              : "bg-[#12201C] border border-[#2A4E42] hover:border-[#3D705F]"
          }`}
        >
          {/* Floating CSV Card Graphic */}
          <div className="w-16 h-20 rounded-lg bg-[#0D1815] border border-[#2A4E42] p-2 flex flex-col justify-between mb-2 shadow-md relative overflow-hidden group-hover:scale-105 transition-transform">
            <div className="flex items-center justify-between border-b border-[#2A4E42]/50 pb-1">
              <span className="text-[8px] font-mono font-bold text-[#68E7B5]">CSV</span>
              <FileSpreadsheet className="w-3 h-3 text-[#AEBEB5]" />
            </div>
            {/* Mini column preview lines */}
            <div className="space-y-1 my-1 text-[7px] font-mono text-[#AEBEB5] text-left">
              <div className="flex justify-between text-[#F1EFE1]">
                <span>Col</span>
                <span>Type</span>
              </div>
              <div className="flex justify-between text-[6.5px]">
                <span>age</span>
                <span className="text-[#68E7B5]">int</span>
              </div>
              <div className="flex justify-between text-[6.5px]">
                <span>income</span>
                <span className="text-[#68E7B5]">float</span>
              </div>
            </div>
            <div className="h-0.5 bg-[#68E7B5]/40 rounded-full w-full" />
          </div>

          <span className="text-[10px] font-mono font-bold text-[#68E7B5]">01</span>
          <h4 className="text-xs font-semibold text-[#F1EFE1] leading-tight">Upload Dataset</h4>
          <p className="text-[9px] text-[#AEBEB5] mt-0.5">Upload and validate your CSV file.</p>
        </div>

        {/* =====================================================================
            STAGE 02: Dataset Profiling (Cylindrical Database Stack)
            ===================================================================== */}
        <div
          onMouseEnter={() => setHoveredStage("02")}
          onClick={() => onSelectStage?.("02")}
          className={`relative z-10 p-3 sm:p-3.5 rounded-xl transition-all duration-300 cursor-pointer flex flex-col items-center text-center ${
            hoveredStage === "02"
              ? "bg-[#162A23] border border-[#68E7B5]/60 shadow-[0_0_20px_rgba(104,231,181,0.2)]"
              : "bg-[#12201C] border border-[#2A4E42] hover:border-[#3D705F]"
          }`}
        >
          {/* Cylinder Discs Stack Graphic */}
          <div className="w-16 h-20 flex flex-col items-center justify-center mb-2 relative">
            {/* Mini bar chart beside cylinder */}
            <div className="flex items-end gap-0.5 h-8 mb-1">
              <span className="w-1.5 h-3 bg-[#2A916E] rounded-t-sm" />
              <span className="w-1.5 h-5 bg-[#68E7B5] rounded-t-sm" />
              <span className="w-1.5 h-7 bg-[#68E7B5] rounded-t-sm" />
              <span className="w-1.5 h-4 bg-[#2A916E] rounded-t-sm" />
            </div>
            {/* Cylinder Disc */}
            <div className="w-12 h-3.5 rounded-full bg-gradient-to-r from-[#1E3A2F] via-[#2A4E42] to-[#1E3A2F] border border-[#3D705F] shadow-sm -mb-1 z-10" />
            <div className="w-12 h-3.5 rounded-full bg-gradient-to-r from-[#162A23] via-[#243F35] to-[#162A23] border border-[#2A4E42] shadow-sm -mb-1 z-0" />
            <div className="w-12 h-3.5 rounded-full bg-gradient-to-r from-[#0D1815] via-[#1E362D] to-[#0D1815] border border-[#2A4E42] shadow-sm" />
          </div>

          <span className="text-[10px] font-mono font-bold text-[#68E7B5]">02</span>
          <h4 className="text-xs font-semibold text-[#F1EFE1] leading-tight">Dataset Profiling</h4>
          <p className="text-[9px] text-[#AEBEB5] mt-0.5">Analyze data and get insights.</p>
        </div>

        {/* =====================================================================
            STAGE 03: AutoML Training (Central AutoNexa Processor + Robot Mascot)
            ===================================================================== */}
        <div
          onMouseEnter={() => setHoveredStage("03")}
          onClick={() => onSelectStage?.("03")}
          className={`relative z-20 p-3 sm:p-4 rounded-2xl transition-all duration-300 cursor-pointer flex flex-col items-center text-center -my-2 ${
            hoveredStage === "03"
              ? "bg-[#162A23] border border-[#68E7B5] shadow-[0_0_30px_rgba(104,231,181,0.25)] scale-105"
              : "bg-[#12201C] border border-[#2A4E42] hover:border-[#68E7B5]/60"
          }`}
        >
          {/* Top Robot Mascot Sitting on Chip */}
          <div className="relative -mt-6 -mb-2">
            <RobotMascot size="sm" isInteractive={true} />
          </div>

          {/* Engraved AutoNexa Processor Platform */}
          <div className="w-20 h-7 rounded-lg bg-[#070D0C] border border-[#2A4E42] flex items-center justify-center gap-1.5 shadow-inner mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#68E7B5] animate-ping" />
            <span className="text-[9px] font-mono font-bold text-[#F1EFE1] tracking-wider">AutoNexa</span>
          </div>

          <span className="text-[10px] font-mono font-bold text-[#68E7B5]">03</span>
          <h4 className="text-xs font-bold text-[#F1EFE1] leading-tight">AutoML Training</h4>
          <p className="text-[9px] text-[#AEBEB5] mt-0.5">Train multiple candidate models.</p>
        </div>

        {/* =====================================================================
            STAGE 04: Model Evaluation (Glass Model Cards & Ranked Metrics)
            ===================================================================== */}
        <div
          onMouseEnter={() => setHoveredStage("04")}
          onClick={() => onSelectStage?.("04")}
          className={`relative z-10 p-3 sm:p-3.5 rounded-xl transition-all duration-300 cursor-pointer flex flex-col items-center text-center ${
            hoveredStage === "04"
              ? "bg-[#162A23] border border-[#68E7B5]/60 shadow-[0_0_20px_rgba(104,231,181,0.2)]"
              : "bg-[#12201C] border border-[#2A4E42] hover:border-[#3D705F]"
          }`}
        >
          {/* Glass Model Card Stack */}
          <div className="w-16 h-20 rounded-lg bg-[#0D1815] border border-[#2A4E42] p-1.5 flex flex-col justify-between mb-2 shadow-md">
            <div className="space-y-1 text-[7px] font-mono text-left">
              <div className="flex items-center gap-1 text-[#68E7B5] font-semibold">
                <span className="w-1 h-1 rounded-full bg-[#68E7B5]" />
                <span className="truncate">Random Forest</span>
              </div>
              <div className="flex items-center gap-1 text-[#AEBEB5]">
                <span className="w-1 h-1 rounded-full bg-[#2A916E]" />
                <span className="truncate">XGBoost</span>
              </div>
              <div className="flex items-center gap-1 text-[#AEBEB5]">
                <span className="w-1 h-1 rounded-full bg-[#2A916E]" />
                <span className="truncate">LightGBM</span>
              </div>
              <div className="flex items-center gap-1 text-[#AEBEB5]">
                <span className="w-1 h-1 rounded-full bg-[#2A916E]" />
                <span className="truncate">Linear Reg.</span>
              </div>
            </div>
            {/* Pillars */}
            <div className="flex items-end justify-center gap-0.5 h-4 pt-1 border-t border-[#2A4E42]/60">
              <span className="w-1.5 h-2 bg-[#2A916E] rounded-t-sm" />
              <span className="w-1.5 h-3 bg-[#68E7B5] rounded-t-sm" />
              <span className="w-1.5 h-4 bg-[#68E7B5] rounded-t-sm" />
            </div>
          </div>

          <span className="text-[10px] font-mono font-bold text-[#68E7B5]">04</span>
          <h4 className="text-xs font-semibold text-[#F1EFE1] leading-tight">Model Evaluation</h4>
          <p className="text-[9px] text-[#AEBEB5] mt-0.5">Compare metrics and find best model.</p>
        </div>

        {/* =====================================================================
            STAGE 05: Predictions (Laptop Displaying Predictions & Graphs)
            ===================================================================== */}
        <div
          onMouseEnter={() => setHoveredStage("05")}
          onClick={() => onSelectStage?.("05")}
          className={`relative z-10 p-3 sm:p-3.5 rounded-xl transition-all duration-300 cursor-pointer flex flex-col items-center text-center ${
            hoveredStage === "05"
              ? "bg-[#162A23] border border-[#68E7B5]/60 shadow-[0_0_20px_rgba(104,231,181,0.2)]"
              : "bg-[#12201C] border border-[#2A4E42] hover:border-[#3D705F]"
          }`}
        >
          {/* Laptop / Dashboard Graphic */}
          <div className="w-18 h-20 flex flex-col items-center justify-center mb-2">
            {/* Screen */}
            <div className="w-15 h-11 rounded-t-md bg-[#070D0C] border border-[#2A4E42] p-1 flex flex-col justify-between shadow-inner">
              <div className="flex items-center justify-between text-[6px] font-mono text-[#AEBEB5]">
                <span className="text-[#68E7B5]">pred.py</span>
                <span>99.2%</span>
              </div>
              {/* Mini SVG Curve */}
              <svg className="w-full h-4 overflow-visible" viewBox="0 0 50 16">
                <path
                  d="M 2 12 Q 15 2, 28 8 T 48 4"
                  stroke="#68E7B5"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            </div>
            {/* Laptop Keyboard Base */}
            <div className="w-18 h-2 rounded-b-md bg-[#162A23] border border-t-0 border-[#336152] flex items-center justify-center">
              <div className="w-5 h-0.5 bg-[#2A4E42] rounded-full" />
            </div>
          </div>

          <span className="text-[10px] font-mono font-bold text-[#68E7B5]">05</span>
          <h4 className="text-xs font-semibold text-[#F1EFE1] leading-tight">Predictions</h4>
          <p className="text-[9px] text-[#AEBEB5] mt-0.5">Use trained model for new data.</p>
        </div>
      </div>
    </div>
  );
}
