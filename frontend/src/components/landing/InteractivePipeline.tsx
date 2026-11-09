"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  FileText,
  Database,
  BarChart3,
  FlaskConical,
  Sparkles,
  UploadCloud,
  CheckCircle2,
  ArrowRight,
  Play,
  Trophy,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { motion, useScroll, useMotionValueEvent, useReducedMotion } from "motion/react";
import { api } from "@/lib/api";
import { DatasetProfileResponse } from "@/types/api";
import ScrollReveal from "./ScrollReveal";

interface InteractivePipelineProps {
  onLaunchWorkspace: () => void;
}

interface PipelineCardMeta {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  side: "left" | "right";
  wireIndex: number;
}

const PIPELINE_CARDS: PipelineCardMeta[] = [
  {
    id: 1,
    title: "CSV Upload",
    subtitle: "Upload your tabular dataset in CSV format.",
    icon: FileText,
    side: "left",
    wireIndex: 0,
  },
  {
    id: 2,
    title: "Data Validation",
    subtitle: "Schema verification, missing value checks & null auditing.",
    icon: CheckCircle2,
    side: "left",
    wireIndex: 1,
  },
  {
    id: 3,
    title: "Data Profiling",
    subtitle: "Statistical distributions, correlation matrices & feature analysis.",
    icon: BarChart3,
    side: "left",
    wireIndex: 2,
  },
  {
    id: 4,
    title: "Model Training",
    subtitle: "Multi-estimator automated training with hyperparameter search.",
    icon: FlaskConical,
    side: "right",
    wireIndex: 0,
  },
  {
    id: 5,
    title: "Model Evaluation",
    subtitle: "Cross-validation benchmarks, leaderboard metrics & ROC-AUC.",
    icon: Trophy,
    side: "right",
    wireIndex: 1,
  },
  {
    id: 6,
    title: "Prediction",
    subtitle: "Real-time interactive inference playground & API deployment.",
    icon: Sparkles,
    side: "right",
    wireIndex: 2,
  },
];

export default function InteractivePipeline({ onLaunchWorkspace }: InteractivePipelineProps) {
  const [activeStage, setActiveStage] = useState<number>(1);
  const [hoveredStage, setHoveredStage] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<"churn" | "housing">("churn");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [customProfile, setCustomProfile] = useState<DatasetProfileResponse | null>(null);

  // Playground interactive prediction state
  const [predTenure, setPredTenure] = useState<number>(24);
  const [predMonthlyCharges, setPredMonthlyCharges] = useState<number>(65);
  const [predContract, setPredContract] = useState<string>("One year");
  const [predictionResult, setPredictionResult] = useState<{
    churnProbability: number;
    prediction: string;
  }>({
    churnProbability: 0.18,
    prediction: "Will Retain (No Churn)",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const plinthRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [connectors, setConnectors] = useState<{
    left: { id: number; path: string; dotX: number; dotY: number; pX: number; pY: number }[];
    right: { id: number; path: string; dotX: number; dotY: number; pX: number; pY: number }[];
  } | null>(null);

  const measureConnectors = useCallback(() => {
    if (typeof window === "undefined" || window.innerWidth < 1024) {
      setConnectors(null);
      return;
    }
    const canvas = canvasRef.current;
    const plinth = plinthRef.current;
    if (!canvas || !plinth) return;

    const canvasRect = canvas.getBoundingClientRect();
    const plinthRect = plinth.getBoundingClientRect();
    if (canvasRect.width === 0 || plinthRect.width === 0) return;

    const pLeft = plinthRect.left - canvasRect.left;
    const pRight = plinthRect.right - canvasRect.left;
    const pTop = plinthRect.top - canvasRect.top;
    const pH = plinthRect.height;

    // Plinth anchor points (slight 2px overlap into plinth to ensure seamless joining)
    const leftAnchors: Record<number, { x: number; y: number }> = {
      1: { x: pLeft + 2, y: pTop + pH * (34 / 225) },
      2: { x: pLeft + 2, y: pTop + pH * (106 / 225) },
      3: { x: pLeft + 2, y: pTop + pH * (176 / 225) },
    };

    const rightAnchors: Record<number, { x: number; y: number }> = {
      4: { x: pRight - 2, y: pTop + pH * (36.5 / 225) },
      5: { x: pRight - 2, y: pTop + pH * (108.5 / 225) },
      6: { x: pRight - 2, y: pTop + pH * (176.5 / 225) },
    };

    const leftList: { id: number; path: string; dotX: number; dotY: number; pX: number; pY: number }[] = [];
    [1, 2, 3].forEach((id) => {
      const dotEl = dotRefs.current[id];
      const target = leftAnchors[id];
      if (dotEl && target) {
        const dotRect = dotEl.getBoundingClientRect();
        const dotX = dotRect.left + dotRect.width / 2 - canvasRect.left;
        const dotY = dotRect.top + dotRect.height / 2 - canvasRect.top;

        // Line attaches right at the inner edge of the 14px dot socket (2px overlap for seamless continuity)
        const startDotX = dotX + 5;
        const dx = target.x - startDotX;
        // Cubic Bezier with pure horizontal tangents at both ends
        const path = `M ${startDotX} ${dotY} C ${startDotX + dx * 0.5} ${dotY}, ${startDotX + dx * 0.5} ${target.y}, ${target.x} ${target.y}`;
        leftList.push({ id, path, dotX, dotY, pX: target.x, pY: target.y });
      }
    });

    const rightList: { id: number; path: string; dotX: number; dotY: number; pX: number; pY: number }[] = [];
    [4, 5, 6].forEach((id) => {
      const dotEl = dotRefs.current[id];
      const target = rightAnchors[id];
      if (dotEl && target) {
        const dotRect = dotEl.getBoundingClientRect();
        const dotX = dotRect.left + dotRect.width / 2 - canvasRect.left;
        const dotY = dotRect.top + dotRect.height / 2 - canvasRect.top;

        // Line terminates right at the inner edge of the 14px dot socket (2px overlap for seamless continuity)
        const endDotX = dotX - 5;
        const dx = endDotX - target.x;
        // Cubic Bezier with pure horizontal tangents from plinth to card dot
        const path = `M ${target.x} ${target.y} C ${target.x + dx * 0.5} ${target.y}, ${target.x + dx * 0.5} ${dotY}, ${endDotX} ${dotY}`;
        rightList.push({ id, path, dotX, dotY, pX: target.x, pY: target.y });
      }
    });

    setConnectors({ left: leftList, right: rightList });
  }, []);

  useEffect(() => {
    measureConnectors();
    const t1 = setTimeout(measureConnectors, 50);
    const t2 = setTimeout(measureConnectors, 200);
    const t3 = setTimeout(measureConnectors, 600);

    window.addEventListener("resize", measureConnectors);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && canvasRef.current) {
      ro = new ResizeObserver(() => {
        measureConnectors();
      });
      ro.observe(canvasRef.current);
      if (plinthRef.current) {
        ro.observe(plinthRef.current);
      }
      dotRefs.current.forEach((dot) => {
        if (dot) ro?.observe(dot);
      });
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", measureConnectors);
      if (ro) ro.disconnect();
    };
  }, [measureConnectors, activeStage]);

  const currentActive = hoveredStage ?? activeStage;

  const prefersReducedMotion = useReducedMotion();

  // Scrollytelling scroll tracking on desktop viewports
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (prefersReducedMotion) return;
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      if (latest < 0.16) {
        setActiveStage(1);
      } else if (latest < 0.33) {
        setActiveStage(2);
      } else if (latest < 0.50) {
        setActiveStage(3);
      } else if (latest < 0.67) {
        setActiveStage(4);
      } else if (latest < 0.84) {
        setActiveStage(5);
      } else {
        setActiveStage(6);
      }
    }
  });

  // Auto-play simulation loop
  useEffect(() => {
    if (!isSimulating) return;
    const interval = setInterval(() => {
      setActiveStage((prev) => (prev >= 6 ? 1 : prev + 1));
    }, 2800);
    return () => clearInterval(interval);
  }, [isSimulating]);

  // Update live prediction calculation
  const handleRecalculatePrediction = (tenure: number, monthly: number, contract: string) => {
    setPredTenure(tenure);
    setPredMonthlyCharges(monthly);
    setPredContract(contract);

    let prob = 0.5 - tenure * 0.005 + (monthly - 50) * 0.004;
    if (contract === "Month-to-month") prob += 0.25;
    if (contract === "Two year") prob -= 0.25;
    prob = Math.max(0.04, Math.min(0.96, prob));

    setPredictionResult({
      churnProbability: Math.round(prob * 100) / 100,
      prediction: prob > 0.5 ? "Likely to Churn" : "Will Retain (Loyal)",
    });
  };

  const demoProfiles = {
    churn: {
      filename: "customer_churn_telco.csv",
      rows: 7043,
      cols: 21,
      size: "972 KB",
      target: "churn_status",
      task: "Binary Classification",
      metric: "ROC-AUC",
      bestModel: "Random Forest Classifier",
      bestScore: "0.941",
    },
    housing: {
      filename: "california_housing_benchmark.csv",
      rows: 20640,
      cols: 9,
      size: "1.4 MB",
      target: "median_house_value",
      task: "Regression",
      metric: "R² Score",
      bestModel: "Hist. Gradient Boosting",
      bestScore: "0.925",
    },
  };

  const current = customProfile
    ? {
        filename: customProfile.filename,
        rows: customProfile.rows,
        cols: customProfile.columns,
        size: `${Math.round(customProfile.file_size_bytes / 1024)} KB`,
        target: customProfile.column_names?.[customProfile.column_names.length - 1] || "target",
        task: "Auto-Inferred Classification",
        metric: "F1 Score",
        bestModel: "Random Forest Classifier",
        bestScore: "0.938",
      }
    : demoProfiles[activePreset];

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setUploadMessage("Please select a tabular CSV file.");
      return;
    }
    setIsUploading(true);
    setUploadMessage(null);
    try {
      const profile = await api.uploadDataset(file);
      setCustomProfile(profile);
      setUploadMessage(`Uploaded: ${file.name} (${profile.rows.toLocaleString()} rows)`);
      setActiveStage(2);
    } catch {
      setCustomProfile({
        dataset_id: "demo_custom",
        filename: file.name,
        rows: 8520,
        columns: 18,
        data_types: { id: "int64", feature_1: "float64", target: "int64" },
        column_names: ["id", "feature_1", "feature_2", "target"],
        missing_values: {},
        duplicate_rows: 0,
        file_size_bytes: file.size,
        memory_usage_bytes: file.size * 2,
      });
      setUploadMessage(`Loaded: ${file.name} (Simulated 8,520 rows)`);
      setActiveStage(2);
    } finally {
      setIsUploading(false);
    }
  };

  const leftCards = PIPELINE_CARDS.filter((c) => c.side === "left");
  const rightCards = PIPELINE_CARDS.filter((c) => c.side === "right");

  return (
    <section id="pipeline" className="relative bg-[#F2F6F9] border-b border-[#E2E8F0]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
      />

      {/* SVG Style definitions for energy flow */}
      <style>{`
        @keyframes conduitDashFlow {
          to {
            stroke-dashoffset: -24;
          }
        }
        .conduit-flow-dash {
          stroke-dasharray: 6 4;
          animation: conduitDashFlow 0.85s linear infinite;
        }
      `}</style>

      {/* Outer scrollytelling container: pinned on desktop lg+ (260vh), natural flow on mobile/tablet */}
      <div ref={containerRef} className="relative lg:min-h-[260vh]">
        <div className="lg:sticky lg:top-[var(--navbar-height)] lg:min-h-[calc(100vh-var(--navbar-height))] flex flex-col justify-center py-6 sm:py-10 lg:py-14 overflow-hidden">
          
          {/* Ambient background glow */}
          <div
            className="pointer-events-none absolute inset-0 opacity-40 -z-10"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(29, 78, 216, 0.08), transparent 75%)",
            }}
          />

          <div className="relative max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-10 w-full">
            
            {/* ===================================================================
                SECTION HEADER: Alternating Entrance Reveals
                =================================================================== */}
            <div className="text-center max-w-2xl mx-auto mb-4 sm:mb-6 lg:mb-10">
              <ScrollReveal direction="down" distance={16}>
                <div className="inline-flex items-center gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-white border border-[#CBD5E1] mb-2 sm:mb-3 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
                  <span className="text-[10px] sm:text-[10.5px] font-mono uppercase tracking-widest text-[#334155] font-semibold">
                    THE AUTONEXA PIPELINE
                  </span>
                </div>
              </ScrollReveal>

              <ScrollReveal direction="left" delay={0.06} distance={22}>
                <h2 className="font-editorial text-2xl sm:text-4xl md:text-5xl font-normal text-[#0F172A] tracking-tight leading-[1.1] mb-1.5 sm:mb-2">
                  The AutoNexa <span className="text-[#1E3A8A] italic font-normal">Pipeline.</span>
                </h2>
              </ScrollReveal>

              <ScrollReveal direction="right" delay={0.1} distance={22}>
                <p className="text-xs sm:text-sm text-[#64748B] font-sans px-2">
                  From data upload to predictions — a synchronized AutoML workflow.
                </p>
              </ScrollReveal>

              {/* Scrollytelling Progress Bar (Desktop lg+) */}
              <div className="hidden lg:flex items-center justify-between gap-3 px-4 py-1.5 mt-4 bg-white/90 backdrop-blur-sm rounded-full border border-[#CBD5E1] shadow-xs text-xs font-mono max-w-lg mx-auto">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#1D4ED8] animate-pulse" />
                  <span className="text-[#0F172A] font-semibold text-[11px]">Pipeline Scrollytelling</span>
                </div>
                <div className="flex items-center gap-1">
                  {PIPELINE_CARDS.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => setActiveStage(card.id)}
                      className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold transition-all cursor-pointer ${
                        activeStage === card.id
                          ? "bg-[#1D4ED8] text-white shadow-xs"
                          : "bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A]"
                      }`}
                    >
                      0{card.id}
                    </button>
                  ))}
                </div>
                <span className="text-[#64748B] text-[10.5px]">
                  Step {activeStage} / 6
                </span>
              </div>
            </div>

            {/* ===================================================================
                MAIN CONNECTED PIPELINE CANVAS: 3 LEFT CARDS + ENGINE + 3 RIGHT CARDS
                =================================================================== */}
            <div ref={canvasRef} className="relative w-full max-w-[1360px] mx-auto">
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-3 lg:gap-4 items-center">
                
                {/* -------------------------------------------------------------
                    LEFT COLUMN: 3 Cards (Upload, Validation, Profiling)
                    ------------------------------------------------------------- */}
                <div className="order-2 lg:order-none lg:col-span-3 xl:col-span-3 flex flex-col gap-2.5 sm:gap-3 lg:gap-4 z-20">
                  {leftCards.map((card) => {
                    const Icon = card.icon;
                    const isSelected = activeStage === card.id;
                    const isHovered = hoveredStage === card.id;

                    return (
                      <motion.div
                        key={card.id}
                        onClick={() => setActiveStage(card.id)}
                        onMouseEnter={() => setHoveredStage(card.id)}
                        onMouseLeave={() => setHoveredStage(null)}
                        whileHover={{ scale: prefersReducedMotion ? 1 : 1.015 }}
                        transition={{ duration: 0.2 }}
                        className={`relative p-3 sm:p-3.5 lg:p-4 rounded-2xl border transition-all duration-300 cursor-pointer flex items-center justify-between gap-2.5 sm:gap-3 group min-h-[66px] sm:min-h-[76px] w-full ${
                          isSelected
                            ? "bg-[#EFF6FF] border-[#1D4ED8] shadow-[0_4px_20px_rgba(29,78,216,0.18)] ring-1 ring-[#1D4ED8]/30"
                            : isHovered
                            ? "bg-white border-[#94A3B8] shadow-md"
                            : "bg-white border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                          <div
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                              isSelected
                                ? "bg-[#DBEAFE] border-[#1D4ED8]/60 text-[#1D4ED8]"
                                : "bg-[#F1F5F9] border-[#E2E8F0] text-[#334155] group-hover:text-[#1D4ED8]"
                            }`}
                          >
                            {card.id === 1 ? (
                              <div className="flex flex-col items-center">
                                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="text-[7px] font-mono font-bold text-[#1D4ED8] -mt-0.5 tracking-tighter">
                                  CSV
                                </span>
                              </div>
                            ) : (
                              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5">
                              <span className="text-[10px] font-mono text-[#1D4ED8] font-bold shrink-0">0{card.id}</span>
                              <h3 className="text-xs sm:text-sm font-semibold text-[#0F172A] tracking-tight group-hover:text-[#1D4ED8] transition-colors truncate">
                                {card.title}
                              </h3>
                            </div>
                            <p className="text-[11px] text-[#64748B] leading-snug font-normal line-clamp-2 break-words">
                              {card.subtitle}
                            </p>
                          </div>
                        </div>

                        {/* Right Connection Port Dot */}
                        <div
                          ref={(el) => {
                            dotRefs.current[card.id] = el;
                          }}
                          className="relative shrink-0 flex items-center justify-center ml-1 sm:ml-2"
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                              isSelected
                                ? "bg-[#1D4ED8] shadow-[0_0_12px_#1D4ED8] scale-125"
                                : "bg-[#1D4ED8]/80 shadow-[0_0_6px_rgba(29,78,216,0.5)]"
                            }`}
                          />
                          {isSelected && (
                            <div className="absolute w-6 h-6 rounded-full border border-[#1D4ED8] animate-ping pointer-events-none" />
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* -------------------------------------------------------------
                    CENTER COLUMN: Central Workflow Network & Engine Plinth with Mascot
                    ------------------------------------------------------------- */}
                <div className="order-first lg:order-none lg:col-span-6 xl:col-span-6 relative flex flex-col items-center justify-center my-1.5 sm:my-2 lg:my-0 z-10 px-0 sm:px-2 w-full">
                  <div className="flex lg:hidden items-center gap-1.5 mb-1.5 px-2.5 py-0.5 rounded-full bg-white/90 border border-[#CBD5E1] shadow-xs text-[10px] font-mono text-[#1D4ED8]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1D4ED8] animate-pulse" />
                    <span>AutoNexa Central AI Engine · Step 0{activeStage}/6 Active</span>
                  </div>
                  
                  <div
                    ref={plinthRef}
                    className="relative w-full max-w-[280px] xs:max-w-[320px] sm:max-w-[380px] lg:max-w-[600px] aspect-[437/225] mx-auto group select-none"
                  >
                    <div
                      className="pointer-events-none absolute inset-0 -bottom-6 opacity-35 blur-2xl -z-10"
                      style={{
                        background:
                          "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(29, 78, 216, 0.16), transparent 75%)",
                      }}
                    />

                    <Image
                      src="/images/landing-ref/pipeline-engine-workflow-v3.webp"
                      alt="AutoNexa AI Engine Central Plinth"
                      fill
                      sizes="(max-width: 1024px) 100vw, 600px"
                      loading="lazy"
                      unoptimized
                      className="object-contain pointer-events-none select-none transition-transform duration-700 group-hover:scale-[1.01]"
                      style={{
                        imageRendering: "-webkit-optimize-contrast",
                      }}
                    />

                    {/* SVG Live Energy Conduits & Pulse Stream (Exact 437x225 ViewBox Overlay) */}
                    <svg
                      viewBox="0 0 437 225"
                      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <defs>
                        <filter id="energyGlow" x="-30%" y="-30%" width="160%" height="160%">
                          <feGaussianBlur stdDeviation="2.5" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>

                      {/* Active highlight paths with dynamic energy flow */}
                      {currentActive === 1 && (
                        <path
                          d="M 0 34 L 40 34 C 65 34, 75 107, 103 107"
                          stroke="#1D4ED8"
                          strokeWidth="3.4"
                          strokeOpacity="0.95"
                          filter="url(#energyGlow)"
                          className="conduit-flow-dash"
                        />
                      )}
                      {currentActive === 2 && (
                        <path
                          d="M 0 106 L 103 107"
                          stroke="#1D4ED8"
                          strokeWidth="3.4"
                          strokeOpacity="0.95"
                          filter="url(#energyGlow)"
                          className="conduit-flow-dash"
                        />
                      )}
                      {currentActive === 3 && (
                        <path
                          d="M 0 176 L 40 176 C 65 176, 75 107, 103 107"
                          stroke="#1D4ED8"
                          strokeWidth="3.4"
                          strokeOpacity="0.95"
                          filter="url(#energyGlow)"
                          className="conduit-flow-dash"
                        />
                      )}
                      {currentActive === 4 && (
                        <path
                          d="M 323 107 C 355 107, 365 36.5, 395 36.5 L 437 36.5"
                          stroke="#1D4ED8"
                          strokeWidth="3.4"
                          strokeOpacity="0.95"
                          filter="url(#energyGlow)"
                          className="conduit-flow-dash"
                        />
                      )}
                      {currentActive === 5 && (
                        <path
                          d="M 323 107 L 437 108"
                          stroke="#1D4ED8"
                          strokeWidth="3.4"
                          strokeOpacity="0.95"
                          filter="url(#energyGlow)"
                          className="conduit-flow-dash"
                        />
                      )}
                      {currentActive === 6 && (
                        <path
                          d="M 323 107 C 355 107, 365 176.5, 395 176.5 L 437 176.5"
                          stroke="#1D4ED8"
                          strokeWidth="3.4"
                          strokeOpacity="0.95"
                          filter="url(#energyGlow)"
                          className="conduit-flow-dash"
                        />
                      )}

                      {/* Animated Energy Flow Particles */}
                      <circle r="3.5" fill="#1D4ED8" filter="url(#energyGlow)" style={{ willChange: "transform" }}>
                        <animateMotion
                          dur="2.4s"
                          repeatCount="indefinite"
                          path="M 0 34 L 40 34 C 65 34, 75 107, 103 107"
                        />
                      </circle>
                      <circle r="3.5" fill="#1D4ED8" filter="url(#energyGlow)" style={{ willChange: "transform" }}>
                        <animateMotion
                          dur="2.1s"
                          repeatCount="indefinite"
                          begin="0.7s"
                          path="M 0 106 L 103 107"
                        />
                      </circle>
                      <circle r="3.5" fill="#1D4ED8" filter="url(#energyGlow)" style={{ willChange: "transform" }}>
                        <animateMotion
                          dur="2.5s"
                          repeatCount="indefinite"
                          begin="1.2s"
                          path="M 0 176 L 40 176 C 65 176, 75 107, 103 107"
                        />
                      </circle>

                      {/* Junction Nodes Pulse Rings */}
                      {(currentActive === 1 || currentActive === 2 || currentActive === 3) && (
                        <circle cx="103" cy="107" r="7" stroke="#1D4ED8" strokeWidth="1.6" className="animate-ping opacity-85" />
                      )}
                      {(currentActive === 4 || currentActive === 5 || currentActive === 6) && (
                        <circle cx="323" cy="107" r="7" stroke="#1D4ED8" strokeWidth="1.6" className="animate-ping opacity-85" />
                      )}

                      {/* Animated Outflow Energy Particles */}
                      <circle r="3.5" fill="#1D4ED8" filter="url(#energyGlow)" style={{ willChange: "transform" }}>
                        <animateMotion
                          dur="2.4s"
                          repeatCount="indefinite"
                          path="M 323 107 C 355 107, 365 36.5, 395 36.5 L 437 36.5"
                        />
                      </circle>
                      <circle r="3.5" fill="#1D4ED8" filter="url(#energyGlow)" style={{ willChange: "transform" }}>
                        <animateMotion
                          dur="2.1s"
                          repeatCount="indefinite"
                          begin="0.6s"
                          path="M 323 107 L 437 108"
                        />
                      </circle>
                      <circle r="3.5" fill="#1D4ED8" filter="url(#energyGlow)" style={{ willChange: "transform" }}>
                        <animateMotion
                          dur="2.6s"
                          repeatCount="indefinite"
                          begin="1.1s"
                          path="M 323 107 C 355 107, 365 176.5, 395 176.5 L 437 176.5"
                        />
                      </circle>
                    </svg>

                    <div
                      onClick={() => setIsSimulating(!isSimulating)}
                      title="Click to toggle pipeline simulation"
                      className="absolute inset-0 cursor-pointer"
                    />
                  </div>
                </div>

                {/* -------------------------------------------------------------
                    RIGHT COLUMN: 3 Cards (Training, Evaluation, Prediction)
                    ------------------------------------------------------------- */}
                <div className="order-3 lg:order-none lg:col-span-3 xl:col-span-3 flex flex-col gap-2.5 sm:gap-3 lg:gap-4 z-20">
                  {rightCards.map((card) => {
                    const Icon = card.icon;
                    const isSelected = activeStage === card.id;
                    const isHovered = hoveredStage === card.id;

                    return (
                      <motion.div
                        key={card.id}
                        onClick={() => setActiveStage(card.id)}
                        onMouseEnter={() => setHoveredStage(card.id)}
                        onMouseLeave={() => setHoveredStage(null)}
                        whileHover={{ scale: prefersReducedMotion ? 1 : 1.015 }}
                        transition={{ duration: 0.2 }}
                        className={`relative p-3 sm:p-3.5 lg:p-4 rounded-2xl border transition-all duration-300 cursor-pointer flex items-center justify-between gap-2.5 sm:gap-3 group min-h-[66px] sm:min-h-[76px] w-full ${
                          isSelected
                            ? "bg-[#EFF6FF] border-[#1D4ED8] shadow-[0_4px_20px_rgba(29,78,216,0.18)] ring-1 ring-[#1D4ED8]/30"
                            : isHovered
                            ? "bg-white border-[#94A3B8] shadow-md"
                            : "bg-white border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1]"
                        }`}
                      >
                        {/* On mobile: Content is order-1, Port Dot is order-2. On desktop lg+: Port Dot is order-1, Content is order-2 */}
                        <div
                          ref={(el) => {
                            dotRefs.current[card.id] = el;
                          }}
                          className="relative shrink-0 flex items-center justify-center ml-1 sm:ml-2 order-2 lg:order-1 lg:ml-0 lg:mr-2"
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                              isSelected
                                ? "bg-[#1D4ED8] shadow-[0_0_12px_#1D4ED8] scale-125"
                                : "bg-[#1D4ED8]/80 shadow-[0_0_6px_rgba(29,78,216,0.5)]"
                            }`}
                          />
                          {isSelected && (
                            <div className="absolute w-6 h-6 rounded-full border border-[#1D4ED8] animate-ping pointer-events-none" />
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 order-1 lg:order-2">
                          <div
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                              isSelected
                                ? "bg-[#DBEAFE] border-[#1D4ED8]/60 text-[#1D4ED8]"
                                : "bg-[#F1F5F9] border-[#E2E8F0] text-[#334155] group-hover:text-[#1D4ED8]"
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5">
                              <span className="text-[10px] font-mono text-[#1D4ED8] font-bold shrink-0">0{card.id}</span>
                              <h3 className="text-xs sm:text-sm font-semibold text-[#0F172A] tracking-tight group-hover:text-[#1D4ED8] transition-colors truncate">
                                {card.title}
                              </h3>
                            </div>
                            <p className="text-[11px] text-[#64748B] leading-snug font-normal line-clamp-2 break-words">
                              {card.subtitle}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

              </div>

              {/* ===================================================================
                  DESKTOP SEAMLESS CONDUIT BRIDGE SVG: Connects cards directly to plinth
                  =================================================================== */}
              {connectors && (
                <svg
                  className="hidden lg:block absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <filter id="bridgeGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* 1. Base Static Conduit Lines (all 6 connections, matches plinth dark navy) */}
                  {connectors.left.map((item) => (
                    <path
                      key={`base-left-${item.id}`}
                      d={item.path}
                      stroke="#1E3A8A"
                      strokeWidth="2.5"
                      strokeOpacity="0.75"
                      strokeLinecap="round"
                    />
                  ))}
                  {connectors.right.map((item) => (
                    <path
                      key={`base-right-${item.id}`}
                      d={item.path}
                      stroke="#1E3A8A"
                      strokeWidth="2.5"
                      strokeOpacity="0.75"
                      strokeLinecap="round"
                    />
                  ))}

                  {/* 2. Active Stage Glowing Animated Conduit Flow */}
                  {connectors.left
                    .filter((item) => item.id === currentActive)
                    .map((item) => (
                      <React.Fragment key={`active-left-${item.id}`}>
                        <path
                          d={item.path}
                          stroke="#1D4ED8"
                          strokeWidth="3.4"
                          strokeOpacity="0.95"
                          filter="url(#bridgeGlow)"
                          className="conduit-flow-dash"
                        />
                        <circle r="3.5" fill="#1D4ED8" filter="url(#bridgeGlow)">
                          <animateMotion
                            dur="1.2s"
                            repeatCount="indefinite"
                            path={item.path}
                          />
                        </circle>
                      </React.Fragment>
                    ))}

                  {connectors.right
                    .filter((item) => item.id === currentActive)
                    .map((item) => (
                      <React.Fragment key={`active-right-${item.id}`}>
                        <path
                          d={item.path}
                          stroke="#1D4ED8"
                          strokeWidth="3.4"
                          strokeOpacity="0.95"
                          filter="url(#bridgeGlow)"
                          className="conduit-flow-dash"
                        />
                        <circle r="3.5" fill="#1D4ED8" filter="url(#bridgeGlow)">
                          <animateMotion
                            dur="1.2s"
                            repeatCount="indefinite"
                            path={item.path}
                          />
                        </circle>
                      </React.Fragment>
                    ))}

                </svg>
              )}
            </div>

            {/* ===================================================================
                SIMULATION & STAGE TELEMETRY BAR
                =================================================================== */}
            <div className="mt-4 sm:mt-6 mb-3 sm:mb-5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 rounded-2xl bg-white border border-[#CBD5E1] max-w-4xl mx-auto shadow-sm">
              <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                <button
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    isSimulating
                      ? "bg-[#1D4ED8] text-white shadow-[0_4px_12px_rgba(29,78,216,0.35)]"
                      : "bg-[#F1F5F9] text-[#0F172A] border border-[#CBD5E1] hover:bg-[#E2E8F0]"
                  }`}
                >
                  {isSimulating ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      <span>Pause Auto-Flow</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-[#1D4ED8] text-[#1D4ED8]" />
                      <span>Simulate Flow</span>
                    </>
                  )}
                </button>

                <span className="text-xs font-mono text-[#64748B]">
                  Active: <span className="font-bold text-[#1D4ED8]">Stage 0{activeStage}</span> — {PIPELINE_CARDS[activeStage - 1].title}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={onLaunchWorkspace}
                  className="px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-xl bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#1D4ED8]/40 text-[#1D4ED8] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>Launch Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ===================================================================
                INTERACTIVE STAGE INSPECTION DRAWER: Dynamic View per Active Stage
                =================================================================== */}
            <div className="max-w-4xl mx-auto rounded-2xl bg-white border border-[#CBD5E1] p-4 sm:p-6 lg:p-7 shadow-lg">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 sm:mb-5 border-b border-[#E2E8F0] gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] border border-[#1D4ED8]/60 flex items-center justify-center text-[#1D4ED8] font-mono text-xs font-bold shrink-0">
                    0{activeStage}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm sm:text-base font-bold text-[#0F172A] truncate">
                      {PIPELINE_CARDS[activeStage - 1].title}
                    </h4>
                    <p className="text-xs text-[#64748B]">
                      {PIPELINE_CARDS[activeStage - 1].subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#64748B] font-mono">Dataset:</span>
                  <button
                    onClick={() => {
                      setActivePreset("churn");
                      setCustomProfile(null);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                      activePreset === "churn" && !customProfile
                        ? "bg-[#1D4ED8] text-white font-semibold"
                        : "bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    Telco Churn
                  </button>
                  <button
                    onClick={() => {
                      setActivePreset("housing");
                      setCustomProfile(null);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                      activePreset === "housing" && !customProfile
                        ? "bg-[#1D4ED8] text-white font-semibold"
                        : "bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    CA Housing
                  </button>
                </div>
              </div>

              {/* ---------------- STAGE 1: CSV UPLOAD ---------------- */}
              {activeStage === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                  <div>
                    <h5 className="text-sm font-bold text-[#0F172A] mb-1.5 font-sans">
                      Tabular CSV Ingestion
                    </h5>
                    <p className="text-xs text-[#475569] mb-4 leading-relaxed">
                      Upload tabular CSV files or test benchmark datasets. Delimiters, column schemas, and SHA-256 integrity hashes are computed with automatic malformed record rejection.
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold text-xs flex items-center gap-2 shadow-[0_4px_12px_rgba(29,78,216,0.3)] transition-all cursor-pointer"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>{isUploading ? "Uploading..." : "Upload Local CSV"}</span>
                      </button>
                      <button
                        onClick={() => setActiveStage(2)}
                        className="px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] hover:border-[#94A3B8] text-[#0F172A] text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <span>Proceed to Validation</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#1D4ED8]" />
                      </button>
                    </div>
                    {uploadMessage && (
                      <p className="mt-2.5 text-xs font-mono text-[#15803D] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{uploadMessage}</span>
                      </p>
                    )}
                  </div>

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl border-2 border-dashed border-[#CBD5E1] hover:border-[#1D4ED8] bg-[#F8FAFC] p-6 text-center cursor-pointer transition-colors group"
                  >
                    <UploadCloud className="w-8 h-8 text-[#1D4ED8] mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-semibold text-[#0F172A] mb-0.5">Drop tabular CSV file here</p>
                    <p className="text-[11px] text-[#64748B]">Supports up to 10 MB. UTF-8 tabular format.</p>
                  </div>
                </div>
              )}

              {/* ---------------- STAGE 2: DATA VALIDATION ---------------- */}
              {activeStage === 2 && (
                <div>
                  <p className="text-xs text-[#64748B] mb-3">
                    Automated pre-flight checks confirm schema consistency, verify delimiter parsing, and guard against target leakage.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 font-mono text-xs">
                    {[
                      { check: "Delimiter & Format", detail: "Comma-separated UTF-8 verified", status: "Pass", badge: "bg-[#DCFCE7] text-[#15803D]" },
                      { check: "Schema Integrity", detail: `${current.cols} columns parsed consistently`, status: "Verified", badge: "bg-[#DCFCE7] text-[#15803D]" },
                      { check: "Target Leakage Guard", detail: "0 overlapping post-event columns", status: "Clean", badge: "bg-[#DCFCE7] text-[#15803D]" },
                      { check: "Type Audit", detail: "Automated numeric/categorical classification", status: "Ready", badge: "bg-[#EFF6FF] text-[#1D4ED8]" },
                    ].map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between">
                        <div>
                          <div className="font-bold text-[#0F172A] flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" />
                            <span>{item.check}</span>
                          </div>
                          <div className="text-[11px] text-[#64748B] mt-0.5">{item.detail}</div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${item.badge}`}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-[#15803D] font-mono flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#15803D]" />
                      <span>Schema 100% Validated — Ready for Profiling</span>
                    </span>
                    <button
                      onClick={() => setActiveStage(3)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#EFF6FF] border border-[#1D4ED8]/60 text-[#1D4ED8] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Proceed to Profiling</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* ---------------- STAGE 3: DATA PROFILING ---------------- */}
              {activeStage === 3 && (
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 font-mono text-xs">
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-[10px] uppercase">Total Rows</span>
                      <span className="text-lg font-bold text-[#0F172A]">{current.rows.toLocaleString()}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-[10px] uppercase">Columns</span>
                      <span className="text-lg font-bold text-[#0F172A]">{current.cols}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-[10px] uppercase">Dataset Size</span>
                      <span className="text-lg font-bold text-[#0F172A]">{current.size}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[#64748B] block text-[10px] uppercase">Inferred Task</span>
                      <span className="text-xs font-bold text-[#1D4ED8] truncate block mt-0.5">{current.task}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-4 font-mono text-xs">
                    {[
                      { name: "tenure_months", type: "int64", nulls: "0 (0%)", status: "Clean", imp: "High" },
                      { name: "monthly_charges", type: "float64", nulls: "0 (0%)", status: "Clean", imp: "High" },
                      { name: "contract_type", type: "category", nulls: "0 (0%)", status: "One-Hot Encoded", imp: "Critical" },
                    ].map((feat, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-[#1D4ED8] font-bold">{feat.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[#E2E8F0] text-[#475569]">
                            {feat.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[#64748B] text-[11px] hidden sm:inline">{feat.nulls}</span>
                          <span className="text-[#15803D] text-[11px] font-semibold">{feat.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-[#64748B]">
                      Target Identified: <span className="text-[#1D4ED8] font-mono font-bold">{current.target}</span>
                    </span>
                    <button
                      onClick={() => setActiveStage(4)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#EFF6FF] border border-[#1D4ED8]/60 text-[#1D4ED8] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Proceed to Model Training</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* ---------------- STAGE 4: MODEL TRAINING ---------------- */}
              {activeStage === 4 && (
                <div>
                  <p className="text-xs text-[#64748B] mb-3">
                    AutoNexa trains multi-estimator candidates in parallel under deterministic 5-fold cross validation.
                  </p>
                  <div className="space-y-2 mb-4 font-mono text-xs">
                    {[
                      { name: "Random Forest Classifier", config: "250 trees, max_depth: 12", speed: "1.4s", status: "Trained" },
                      { name: "Hist. Gradient Boosting", config: "300 iterations, lr: 0.05", speed: "0.9s", status: "Trained" },
                      { name: "LightGBM Classifier", config: "num_leaves: 31, fast binning", speed: "0.6s", status: "Trained" },
                      { name: "Logistic Regression (L2)", config: "C=1.0, saga solver", speed: "0.2s", status: "Trained" },
                    ].map((model, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <FlaskConical className="w-3.5 h-3.5 text-[#1D4ED8]" />
                          <div>
                            <span className="font-bold text-[#0F172A]">{model.name}</span>
                            <span className="text-[11px] text-[#64748B] ml-2 hidden sm:inline">({model.config})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[#64748B] text-[11px]">{model.speed}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-[#DCFCE7] text-[#15803D]">
                            {model.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-[#1D4ED8] font-mono flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-[#1D4ED8]" />
                      <span>All 4 Estimators Successfully Converged</span>
                    </span>
                    <button
                      onClick={() => setActiveStage(5)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#EFF6FF] border border-[#1D4ED8]/60 text-[#1D4ED8] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Proceed to Evaluation</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* ---------------- STAGE 5: MODEL EVALUATION ---------------- */}
              {activeStage === 5 && (
                <div>
                  <p className="text-xs text-[#64748B] mb-3">
                    Cross-validation benchmarks determine champion model selection based on primary metric scores and serving latency.
                  </p>
                  <div className="space-y-2 mb-4 font-mono text-xs">
                    {[
                      { name: "Random Forest Classifier", metric: "0.941", latency: "14ms", rank: "#1 Best", isBest: true },
                      { name: "Hist. Gradient Boosting", metric: "0.938", latency: "9ms", rank: "#2", isBest: false },
                      { name: "LightGBM Classifier", metric: "0.929", latency: "6ms", rank: "#3", isBest: false },
                      { name: "Logistic Regression (L2)", metric: "0.874", latency: "2ms", rank: "#4", isBest: false },
                    ].map((m, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          m.isBest
                            ? "bg-[#EFF6FF] border-[#1D4ED8] shadow-[0_2px_12px_rgba(29,78,216,0.15)]"
                            : "bg-[#F8FAFC] border-[#E2E8F0]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {m.isBest ? (
                            <Trophy className="w-4 h-4 text-[#1D4ED8]" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-[#E2E8F0] text-[9px] flex items-center justify-center font-bold text-[#64748B]">
                              {idx + 1}
                            </div>
                          )}
                          <span className="font-bold text-[#0F172A]">{m.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[#64748B] text-[11px]">{m.latency}</span>
                          <span className="text-[#1D4ED8] font-bold text-xs">{m.metric}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              m.isBest ? "bg-[#1D4ED8] text-white" : "bg-[#E2E8F0] text-[#475569]"
                            }`}
                          >
                            {m.rank}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-[#64748B]">
                      Champion Selected: <span className="text-[#1D4ED8] font-bold">Random Forest (0.941)</span>
                    </span>
                    <button
                      onClick={() => setActiveStage(6)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#EFF6FF] border border-[#1D4ED8]/60 text-[#1D4ED8] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Try Interactive Prediction</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* ---------------- STAGE 6: PREDICTION ---------------- */}
              {activeStage === 6 && (
                <div>
                  <p className="text-xs text-[#64748B] mb-4">
                    Interact with the deployed champion model in real time. Adjust tabular values to see immediate inference probabilities.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                    
                    <div className="space-y-3 font-mono text-xs">
                      <div>
                        <div className="flex justify-between text-[#0F172A] mb-1">
                          <span>Tenure (Months): {predTenure}</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="72"
                          value={predTenure}
                          onChange={(e) =>
                            handleRecalculatePrediction(Number(e.target.value), predMonthlyCharges, predContract)
                          }
                          className="w-full accent-[#1D4ED8] cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[#0F172A] mb-1">
                          <span>Monthly Charges ($): {predMonthlyCharges}</span>
                        </div>
                        <input
                          type="range"
                          min="20"
                          max="120"
                          value={predMonthlyCharges}
                          onChange={(e) =>
                            handleRecalculatePrediction(predTenure, Number(e.target.value), predContract)
                          }
                          className="w-full accent-[#1D4ED8] cursor-pointer"
                        />
                      </div>

                      <div>
                        <span className="block text-[#0F172A] mb-1">Contract Agreement</span>
                        <div className="grid grid-cols-3 gap-2">
                          {["Month-to-month", "One year", "Two year"].map((c) => (
                            <button
                              key={c}
                              onClick={() => handleRecalculatePrediction(predTenure, predMonthlyCharges, c)}
                              className={`py-1.5 px-2 text-[10.5px] rounded-lg border transition-colors cursor-pointer text-center ${
                                predContract === c
                                  ? "bg-[#1D4ED8] text-white font-bold border-[#1D4ED8]"
                                  : "bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:text-[#0F172A]"
                              }`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 rounded-2xl bg-[#F8FAFC] border border-[#CBD5E1] shadow-md text-center font-mono">
                      <span className="text-[10px] text-[#64748B] uppercase tracking-wider block mb-1">
                        Champion Model Inference
                      </span>
                      <div
                        className={`text-xl font-bold mb-1 ${
                          predictionResult.churnProbability > 0.5 ? "text-amber-600" : "text-[#1D4ED8]"
                        }`}
                      >
                        {predictionResult.prediction}
                      </div>
                      <div className="text-xs text-[#0F172A] mb-3">
                        Probability Score:{" "}
                        <span className="text-[#1D4ED8] font-bold">
                          {Math.round(predictionResult.churnProbability * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-[#1D4ED8] transition-all duration-300"
                          style={{ width: `${Math.round(predictionResult.churnProbability * 100)}%` }}
                        />
                      </div>
                      <button
                        onClick={onLaunchWorkspace}
                        className="w-full py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(29,78,216,0.3)]"
                      >
                        <span>Deploy This Model to Workspace</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Subtle Inter-Section Continuity Indicator */}
              <div className="mt-5 pt-3.5 border-t border-[#CBD5E1]/60 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs font-mono text-[#64748B]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
                  <span>Full Pipeline Lifecycle • Verified Tabular Architecture</span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="hidden md:inline">Deterministic validation & zero target leakage</span>
                  <span className="hidden md:inline text-[#CBD5E1]">•</span>
                  <a
                    href="#how-it-works"
                    className="text-[#1D4ED8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>Explore 7-Stage Breakdown</span>
                    <span>↓</span>
                  </a>
                </div>
              </div>

            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
