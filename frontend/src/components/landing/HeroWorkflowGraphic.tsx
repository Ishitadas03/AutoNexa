"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Sparkles, FileSpreadsheet, Database, Cpu, BarChart3, Laptop } from "lucide-react";

interface HeroWorkflowGraphicProps {
  onSelectStage?: (stageId: string) => void;
}

interface Hotspot {
  id: string;
  name: string;
  subtitle: string;
  metric: string;
  x: number; // percentage
  y: number; // percentage
  w: number;
  h: number;
  icon: React.ComponentType<{ className?: string }>;
}

const HOTSPOTS: Hotspot[] = [
  {
    id: "csv",
    name: "CSV Dataset",
    subtitle: "Automated Ingestion",
    metric: "12,458 Rows • 8 Cols",
    x: 13,
    y: 28,
    w: 12,
    h: 22,
    icon: FileSpreadsheet,
  },
  {
    id: "profiling",
    name: "Database Profiles",
    subtitle: "Schema & Quality",
    metric: "0 Missing • Clean",
    x: 21,
    y: 67,
    w: 12,
    h: 24,
    icon: Database,
  },
  {
    id: "engine",
    name: "AutoNexa AI Engine",
    subtitle: "Orchestration & Mascot",
    metric: "Active & Ready",
    x: 52,
    y: 52,
    w: 20,
    h: 44,
    icon: Cpu,
  },
  {
    id: "training",
    name: "AutoML Studio",
    subtitle: "Hyperparameter Search",
    metric: "4 Models Competing",
    x: 77,
    y: 29,
    w: 12,
    h: 22,
    icon: Cpu,
  },
  {
    id: "evaluation",
    name: "Model Evaluation",
    subtitle: "Leaderboard & ROC",
    metric: "XGBoost F1: 0.941",
    x: 88,
    y: 47,
    w: 12,
    h: 24,
    icon: BarChart3,
  },
  {
    id: "prediction",
    name: "Prediction Playground",
    subtitle: "Inference & Deploy",
    metric: "Class 1: 0.92 (4ms)",
    x: 85,
    y: 77,
    w: 15,
    h: 26,
    icon: Laptop,
  },
];

export default function HeroWorkflowGraphic({ onSelectStage }: HeroWorkflowGraphicProps) {
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);

  return (
    <div className="relative w-full max-w-[960px] mx-auto select-none">
      {/* Background ambient radial glow matching emerald color */}
      <div
        className="pointer-events-none absolute -inset-4 opacity-50 blur-2xl -z-10"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 55% 50%, rgba(78, 236, 191, 0.18), transparent 75%)",
        }}
      />

      {/* Main Aspect Container (1200 / 516 = 2.3255) */}
      <div className="relative w-full aspect-[1200/516] rounded-2xl overflow-hidden group">
        
        {/* Crisp Retina 3D Isometric Artwork from Reference Image */}
        <Image
          src="/images/landing-ref/hero-network-clean@2x.png"
          alt="AutoNexa Connected 3D Pipeline Network"
          fill
          sizes="(max-width: 1024px) 100vw, 960px"
          priority
          className="object-contain pointer-events-none select-none transition-transform duration-700 ease-out group-hover:scale-[1.01]"
          style={{ imageRendering: "-webkit-optimize-contrast" }}
        />

        {/* ===================================================================
            SVG MOVABLE ANIMATED ENERGY FLOW OVERLAY
            =================================================================== */}
        <svg
          viewBox="0 0 1200 516"
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Glowing neon filters */}
            <filter id="neonPulse" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="strongGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur1" />
              <feGaussianBlur stdDeviation="2" result="blur2" />
              <feMerge>
                <feMergeNode in="blur1" />
                <feMergeNode in="blur2" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Linear gradients for pulses */}
            <linearGradient id="flowGradLeft" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4EECBF" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#4EECBF" stopOpacity="0.9" />
            </linearGradient>

            <linearGradient id="flowGradRight" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4EECBF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#4EECBF" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Conduit Path 1: Top-Left CSV Pedestal -> Central Mascot Plinth */}
          <path
            id="conduit-csv"
            d="M 215 178 L 295 212 L 420 310 L 515 320"
            stroke="#4EECBF"
            strokeWidth="2"
            strokeOpacity={activeHotspot?.id === "csv" ? "0.95" : "0.35"}
            filter={activeHotspot?.id === "csv" ? "url(#strongGlow)" : "url(#neonPulse)"}
            fill="none"
          />
          {/* Animated moving particle from CSV to Plinth */}
          <circle r="4.5" fill="#4EECBF" filter="url(#neonPulse)">
            <animateMotion
              dur="2.8s"
              repeatCount="indefinite"
              path="M 215 178 L 295 212 L 420 310 L 515 320"
            />
          </circle>

          {/* Conduit Path 2: Bottom-Left DB Cylinders -> Central Mascot Plinth */}
          <path
            id="conduit-db"
            d="M 315 360 L 390 325 L 480 345 L 530 350"
            stroke="#4EECBF"
            strokeWidth="2"
            strokeOpacity={activeHotspot?.id === "profiling" ? "0.95" : "0.35"}
            filter={activeHotspot?.id === "profiling" ? "url(#strongGlow)" : "url(#neonPulse)"}
            fill="none"
          />
          {/* Animated moving particle from DB to Plinth */}
          <circle r="4.5" fill="#4EECBF" filter="url(#neonPulse)">
            <animateMotion
              dur="2.4s"
              repeatCount="indefinite"
              begin="0.8s"
              path="M 315 360 L 390 325 L 480 345 L 530 350"
            />
          </circle>

          {/* Conduit Path 3: Central Plinth -> Top-Right Blue Cubes */}
          <path
            id="conduit-cubes"
            d="M 685 290 L 780 230 L 890 190"
            stroke="#4EECBF"
            strokeWidth="2"
            strokeOpacity={activeHotspot?.id === "training" ? "0.95" : "0.35"}
            filter={activeHotspot?.id === "training" ? "url(#strongGlow)" : "url(#neonPulse)"}
            fill="none"
          />
          {/* Animated moving particle from Plinth to Blue Cubes */}
          <circle r="4.5" fill="#4EECBF" filter="url(#neonPulse)">
            <animateMotion
              dur="2.6s"
              repeatCount="indefinite"
              path="M 685 290 L 780 230 L 890 190"
            />
          </circle>

          {/* Conduit Path 4: Central Plinth -> Mid-Right Bar Charts */}
          <path
            id="conduit-bars"
            d="M 720 320 L 830 280 L 980 255"
            stroke="#4EECBF"
            strokeWidth="2"
            strokeOpacity={activeHotspot?.id === "evaluation" ? "0.95" : "0.35"}
            filter={activeHotspot?.id === "evaluation" ? "url(#strongGlow)" : "url(#neonPulse)"}
            fill="none"
          />
          {/* Animated moving particle from Plinth to Bar Charts */}
          <circle r="4.5" fill="#4EECBF" filter="url(#neonPulse)">
            <animateMotion
              dur="2.3s"
              repeatCount="indefinite"
              begin="0.5s"
              path="M 720 320 L 830 280 L 980 255"
            />
          </circle>

          {/* Conduit Path 5: Central Plinth -> Bottom-Right Prediction Laptop */}
          <path
            id="conduit-laptop"
            d="M 715 365 L 840 420 L 965 395"
            stroke="#4EECBF"
            strokeWidth="2"
            strokeOpacity={activeHotspot?.id === "prediction" ? "0.95" : "0.35"}
            filter={activeHotspot?.id === "prediction" ? "url(#strongGlow)" : "url(#neonPulse)"}
            fill="none"
          />
          {/* Animated moving particle from Plinth to Laptop */}
          <circle r="4.5" fill="#4EECBF" filter="url(#neonPulse)">
            <animateMotion
              dur="2.7s"
              repeatCount="indefinite"
              begin="1.1s"
              path="M 715 365 L 840 420 L 965 395"
            />
          </circle>

          {/* Glowing Junction Dots at corners */}
          <circle cx="215" cy="178" r="3.5" fill="#4EECBF" filter="url(#neonPulse)" />
          <circle cx="295" cy="212" r="3" fill="#4EECBF" />
          <circle cx="315" cy="360" r="3.5" fill="#4EECBF" filter="url(#neonPulse)" />
          <circle cx="390" cy="325" r="3" fill="#4EECBF" />
          <circle cx="780" cy="230" r="3" fill="#4EECBF" />
          <circle cx="890" cy="190" r="3.5" fill="#4EECBF" filter="url(#neonPulse)" />
          <circle cx="830" cy="280" r="3" fill="#4EECBF" />
          <circle cx="980" cy="255" r="3.5" fill="#4EECBF" filter="url(#neonPulse)" />
          <circle cx="840" cy="420" r="3" fill="#4EECBF" />
          <circle cx="965" cy="395" r="3.5" fill="#4EECBF" filter="url(#neonPulse)" />
        </svg>

        {/* ===================================================================
            INTERACTIVE HOTSPOTS WITH SLEEK METRIC TOOLTIPS
            =================================================================== */}
        {HOTSPOTS.map((spot) => (
          <div
            key={spot.id}
            onClick={() => onSelectStage?.(spot.id)}
            onMouseEnter={() => setActiveHotspot(spot)}
            onMouseLeave={() => setActiveHotspot(null)}
            style={{
              left: `${spot.x}%`,
              top: `${spot.y}%`,
              width: `${spot.w}%`,
              height: `${spot.h}%`,
              transform: "translate(-50%, -50%)",
            }}
            className="absolute z-20 cursor-pointer rounded-2xl group/spot transition-all duration-300 hover:scale-105"
          >
            {/* Subtle glow highlight on hover */}
            <div className="absolute inset-0 rounded-2xl border border-transparent group-hover/spot:border-[#4EECBF]/60 group-hover/spot:bg-[#4EECBF]/10 transition-all duration-300" />

            {/* Glowing indicator beacon */}
            <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#4EECBF] opacity-0 group-hover/spot:opacity-100 shadow-[0_0_10px_#4EECBF] transition-opacity duration-300 animate-ping" />
          </div>
        ))}

        {/* Dynamic Floating Tooltip */}
        {activeHotspot && (
          <div
            className="absolute z-30 pointer-events-none transition-all duration-300 animate-in fade-in zoom-in-95"
            style={{
              left: `${activeHotspot.x}%`,
              top: `${Math.max(12, activeHotspot.y - 24)}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="px-3.5 py-2 rounded-xl bg-[#011413]/95 border border-[#4EECBF]/70 shadow-[0_8px_24px_rgba(0,0,0,0.85)] backdrop-blur-md flex items-center gap-2.5 whitespace-nowrap">
              <div className="w-2 h-2 rounded-full bg-[#4EECBF] shadow-[0_0_8px_#4EECBF] animate-pulse" />
              <div>
                <div className="text-[11.5px] font-bold text-[#F1EFE1] font-sans flex items-center gap-1.5">
                  <span>{activeHotspot.name}</span>
                  <span className="text-[#4EECBF] font-mono text-[10px]">({activeHotspot.metric})</span>
                </div>
                <div className="text-[10px] text-[#9AB3A8] font-mono">
                  {activeHotspot.subtitle} • Click to inspect
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Helper Prompt on Mobile & Tablet */}
      <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-[#86A699] px-2 sm:px-4">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#4EECBF] shrink-0" />
          <span>Interactive 3D Pipeline • Hover or tap nodes to inspect stages</span>
        </span>
        <span className="text-[#4EECBF] font-semibold hidden sm:inline">AutoML Connected System</span>
      </div>
    </div>
  );
}
