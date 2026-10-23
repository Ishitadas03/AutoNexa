"use client";

import React, { useState } from "react";
import Image from "next/image";
import { FileSpreadsheet, Database, Cpu, BarChart3, Laptop } from "lucide-react";

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
    x: 12,
    y: 30,
    w: 14,
    h: 26,
    icon: FileSpreadsheet,
  },
  {
    id: "profiling",
    name: "Database Profiles",
    subtitle: "Schema & Quality",
    metric: "0 Missing • Clean",
    x: 14,
    y: 70,
    w: 14,
    h: 28,
    icon: Database,
  },
  {
    id: "engine",
    name: "AutoNexa AI Engine",
    subtitle: "Orchestration & Mascot",
    metric: "Active & Ready",
    x: 46,
    y: 54,
    w: 18,
    h: 40,
    icon: Cpu,
  },
  {
    id: "training",
    name: "AutoML Studio",
    subtitle: "Hyperparameter Search",
    metric: "4 Models Competing",
    x: 68,
    y: 31,
    w: 14,
    h: 26,
    icon: Cpu,
  },
  {
    id: "evaluation",
    name: "Model Evaluation",
    subtitle: "Leaderboard & ROC",
    metric: "XGBoost F1: 0.941",
    x: 78,
    y: 52,
    w: 14,
    h: 26,
    icon: BarChart3,
  },
  {
    id: "prediction",
    name: "Prediction Playground",
    subtitle: "Inference & Deploy",
    metric: "Class 1: 0.92 (4ms)",
    x: 86,
    y: 76,
    w: 16,
    h: 28,
    icon: Laptop,
  },
];

export default function HeroWorkflowGraphic({ onSelectStage }: HeroWorkflowGraphicProps) {
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);

  return (
    <div className="relative w-full max-w-[960px] mx-auto select-none">
      {/* Background ambient radial glow */}
      <div
        className="pointer-events-none absolute -inset-4 opacity-40 blur-2xl -z-10"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 55% 50%, rgba(29, 78, 216, 0.12), transparent 75%)",
        }}
      />

      {/* Main Aspect Container (Clean 1160 / 560 = 2.0714 without any burned-in badges) */}
      <div className="relative w-full aspect-[1160/560] rounded-2xl overflow-hidden group">
        
        {/* Crisp Retina 3D Isometric Artwork with Stationary Robot on Central Plinth */}
        <Image
          src="/images/landing-ref/hero-network-light@2x.webp"
          alt="AutoNexa Connected 3D Pipeline Network"
          fill
          sizes="(max-width: 1024px) 100vw, 960px"
          priority
          unoptimized
          className="object-contain pointer-events-none select-none transition-transform duration-700 ease-out group-hover:scale-[1.01]"
          style={{ imageRendering: "-webkit-optimize-contrast" }}
        />

        {/* ===================================================================
            SVG MOVABLE ANIMATED ENERGY FLOW OVERLAY
            =================================================================== */}
        <svg
          viewBox="0 0 1160 560"
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="bluePulse" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="greenPulse" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.0" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Conduit Path 1: Top-Left CSV Pedestal -> Central Mascot Plinth */}
          <path
            d="M 140 180 L 260 240 L 370 310 L 460 310"
            stroke="#1D4ED8"
            strokeWidth="2.2"
            strokeOpacity={activeHotspot?.id === "csv" ? "0.95" : "0.4"}
            fill="none"
          />
          <circle r="4" fill="#1D4ED8" filter="url(#bluePulse)" style={{ willChange: "transform" }}>
            <animateMotion
              dur="2.8s"
              repeatCount="indefinite"
              path="M 140 180 L 260 240 L 370 310 L 460 310"
            />
          </circle>

          {/* Animated CSV Document Packet moving along Conduit 1 to AI Engine */}
          <g style={{ willChange: "transform" }}>
            <animateMotion
              dur="4.6s"
              repeatCount="indefinite"
              path="M 140 180 L 260 240 L 370 310 L 460 310"
            />
            <g transform="translate(-11, -13)">
              <rect
                width="22"
                height="26"
                rx="4"
                fill="#FFFFFF"
                stroke="#1D4ED8"
                strokeWidth="1.6"
                filter="url(#bluePulse)"
              />
              <path
                d="M 4 7 L 18 7 M 4 11 L 18 11 M 4 15 L 13 15"
                stroke="#94A3B8"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <rect x="3" y="17" width="16" height="6" rx="2" fill="#1D4ED8" />
              <text
                x="11"
                y="21.5"
                fill="#FFFFFF"
                fontSize="4.8"
                fontFamily="ui-monospace, monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                CSV
              </text>
            </g>
          </g>

          {/* Conduit Path 2: Bottom-Left DB Cylinders -> Central Mascot Plinth */}
          <path
            d="M 180 390 L 270 360 L 380 370 L 460 360"
            stroke="#1D4ED8"
            strokeWidth="2.2"
            strokeOpacity={activeHotspot?.id === "profiling" ? "0.95" : "0.4"}
            fill="none"
          />
          <circle r="4" fill="#1D4ED8" filter="url(#bluePulse)" style={{ willChange: "transform" }}>
            <animateMotion
              dur="2.4s"
              repeatCount="indefinite"
              begin="0.8s"
              path="M 180 390 L 270 360 L 380 370 L 460 360"
            />
          </circle>

          {/* Conduit Path 3: Central Plinth -> Top-Right Blue Cubes */}
          <path
            d="M 600 280 L 690 220 L 785 180"
            stroke="#1D4ED8"
            strokeWidth="2.2"
            strokeOpacity={activeHotspot?.id === "training" ? "0.95" : "0.4"}
            fill="none"
          />
          <circle r="4" fill="#1D4ED8" filter="url(#bluePulse)" style={{ willChange: "transform" }}>
            <animateMotion
              dur="2.6s"
              repeatCount="indefinite"
              path="M 600 280 L 690 220 L 785 180"
            />
          </circle>

          {/* Conduit Path 4: Central Plinth -> Mid-Right Bar Charts */}
          <path
            d="M 620 320 L 740 300 L 895 290"
            stroke="#1D4ED8"
            strokeWidth="2.2"
            strokeOpacity={activeHotspot?.id === "evaluation" ? "0.95" : "0.4"}
            fill="none"
          />
          <circle r="4" fill="#1D4ED8" filter="url(#bluePulse)" style={{ willChange: "transform" }}>
            <animateMotion
              dur="2.3s"
              repeatCount="indefinite"
              begin="0.5s"
              path="M 620 320 L 740 300 L 895 290"
            />
          </circle>

          {/* Conduit Path 5: Central Plinth -> Bottom-Right Prediction Laptop */}
          <path
            d="M 610 350 L 750 420 L 960 420"
            stroke="#1D4ED8"
            strokeWidth="2.2"
            strokeOpacity={activeHotspot?.id === "prediction" ? "0.95" : "0.4"}
            fill="none"
          />
          <circle r="4" fill="#1D4ED8" filter="url(#bluePulse)" style={{ willChange: "transform" }}>
            <animateMotion
              dur="2.7s"
              repeatCount="indefinite"
              begin="1.1s"
              path="M 610 350 L 750 420 L 960 420"
            />
          </circle>

          {/* Traveling Prediction Model Result Packet reaching the laptop */}
          <g style={{ willChange: "transform" }}>
            <animateMotion
              dur="3.8s"
              repeatCount="indefinite"
              begin="1.2s"
              path="M 610 350 L 750 420 L 960 420"
            />
            <g transform="translate(-10, -10)">
              <circle cx="10" cy="10" r="9" fill="#10B981" fillOpacity="0.2" />
              <circle cx="10" cy="10" r="4.5" fill="#10B981" filter="url(#greenPulse)" />
            </g>
          </g>

          {/* Model Result Telemetry Badge at Prediction Station (960, 420) */}
          <g transform="translate(930, 382)" style={{ willChange: "transform" }}>
            <circle cx="30" cy="11" r="16" fill="none" stroke="#10B981" strokeWidth="1.2" opacity="0.6">
              <animate attributeName="r" values="8;24" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <rect
              width="62"
              height="20"
              rx="10"
              fill="#FFFFFF"
              stroke="#10B981"
              strokeWidth="1.5"
              filter="url(#greenPulse)"
            />
            <circle cx="9" cy="10" r="3.5" fill="#10B981" />
            <text
              x="36"
              y="13.5"
              fill="#065F46"
              fontSize="6"
              fontFamily="ui-monospace, monospace"
              fontWeight="bold"
              textAnchor="middle"
            >
              F1: 0.941 ✓
            </text>
          </g>

          {/* Central AI Engine Plinth Energy Aura (around Mascot) */}
          <g transform="translate(535, 325)" style={{ willChange: "transform" }}>
            <ellipse rx="36" ry="12" fill="none" stroke="#1D4ED8" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.6">
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0"
                to="360"
                dur="14s"
                repeatCount="indefinite"
              />
            </ellipse>
            <ellipse rx="48" ry="16" fill="none" stroke="#60A5FA" strokeWidth="1" strokeDasharray="3 3" opacity="0.4">
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="360"
                to="0"
                dur="18s"
                repeatCount="indefinite"
              />
            </ellipse>
          </g>

          {/* Glowing Junction Dots */}
          <circle cx="140" cy="180" r="3.5" fill="#1D4ED8" />
          <circle cx="260" cy="240" r="3" fill="#1D4ED8" />
          <circle cx="180" cy="390" r="3.5" fill="#1D4ED8" />
          <circle cx="690" cy="220" r="3" fill="#1D4ED8" />
          <circle cx="785" cy="180" r="3.5" fill="#1D4ED8" />
          <circle cx="895" cy="290" r="3.5" fill="#1D4ED8" />
          <circle cx="750" cy="420" r="3" fill="#1D4ED8" />
          <circle cx="960" cy="420" r="3.5" fill="#1D4ED8" />
        </svg>

        {/* ===================================================================
            INTERACTIVE HOTSPOTS WITH CLEAN TOOLTIPS
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
            <div className="absolute inset-0 rounded-2xl border border-transparent group-hover/spot:border-[#1D4ED8]/60 group-hover/spot:bg-[#1D4ED8]/5 transition-all duration-300" />
            <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#1D4ED8] opacity-0 group-hover/spot:opacity-100 shadow-[0_0_8px_#1D4ED8] transition-opacity duration-300 animate-ping" />
          </div>
        ))}

        {/* Dynamic Floating Tooltip */}
        {activeHotspot && (
          <div
            className="absolute z-30 pointer-events-none transition-all duration-300 animate-in fade-in zoom-in-95"
            style={{
              left: `${activeHotspot.x}%`,
              top: `${Math.max(12, activeHotspot.y - 20)}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="px-3.5 py-2 rounded-xl bg-white border border-[#CBD5E1] shadow-xl flex items-center gap-2.5 whitespace-nowrap">
              <div className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8] animate-pulse" />
              <div>
                <div className="text-[11.5px] font-bold text-[#0F172A] font-sans flex items-center gap-1.5">
                  <span>{activeHotspot.name}</span>
                  <span className="text-[#1D4ED8] font-mono text-[10px]">({activeHotspot.metric})</span>
                </div>
                <div className="text-[10px] text-[#64748B] font-mono">
                  {activeHotspot.subtitle} • Click to inspect
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
