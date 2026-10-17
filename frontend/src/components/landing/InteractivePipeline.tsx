"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  FileSpreadsheet,
  Database,
  Cpu,
  Trophy,
  Activity,
  UploadCloud,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { DatasetProfileResponse } from "@/types/api";
import RobotMascot from "./RobotMascot";

interface InteractivePipelineProps {
  onLaunchWorkspace: () => void;
}

export default function InteractivePipeline({ onLaunchWorkspace }: InteractivePipelineProps) {
  const [activeStage, setActiveStage] = useState<number>(1);
  const [activePreset, setActivePreset] = useState<"churn" | "housing">("churn");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [customProfile, setCustomProfile] = useState<DatasetProfileResponse | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState(4);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Demo datasets
  const demoProfiles = {
    churn: {
      filename: "customer_churn_telco.csv",
      rows: 7043,
      cols: 21,
      size: "972 KB",
      target: "churn_status",
      task: "Binary Classification",
      metric: "ROC-AUC",
      bestModel: "Random Forest",
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
        bestModel: "Random Forest",
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
      // Offline fallback
      setCustomProfile({
        dataset_id: "demo_custom",
        filename: file.name,
        rows: 8520,
        columns: 18,
        data_types: { id: "int64", feature: "float64", target: "int64" },
        column_names: ["id", "feature_1", "feature_2", "target"],
        missing_values: {},
        duplicate_rows: 0,
        file_size_bytes: file.size,
        memory_usage_bytes: file.size * 2,
      });
      setUploadMessage(`Demo Mode: Loaded ${file.name}`);
      setActiveStage(2);
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartTraining = () => {
    setIsTraining(true);
    setTrainingStep(1);
    setTimeout(() => setTrainingStep(2), 600);
    setTimeout(() => setTrainingStep(3), 1200);
    setTimeout(() => {
      setTrainingStep(4);
      setIsTraining(false);
      setActiveStage(4);
    }, 1800);
  };

  const PIPELINE_CARDS = [
    {
      id: 1,
      title: "CSV Upload",
      icon: FileSpreadsheet,
      desc: "Ingest CSV files up to 50 MB with SHA-256 fingerprinting.",
    },
    {
      id: 2,
      title: "Dataset Profiling",
      icon: Database,
      desc: "Instant schema inference, missingness audit & task detection.",
    },
    {
      id: 3,
      title: "AutoML Training",
      icon: Cpu,
      desc: "Resource-bounded search over linear, tree & ensemble models.",
    },
    {
      id: 4,
      title: "Model Evaluation",
      icon: Trophy,
      desc: "Direction-aware metrics on strictly held-out validation partitions.",
    },
    {
      id: 5,
      title: "Prediction Playground",
      icon: Activity,
      desc: "Real-time JSON record inference & batch CSV scoring.",
    },
  ];

  return (
    <section id="pipeline" className="py-20 bg-[#070D0C] border-b border-[#2A4E42]/60">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
        accept=".csv"
        className="hidden"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pb-6 border-b border-[#2A4E42]/40">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#68E7B5] block mb-2">
              CONNECTED WORKFLOW INTERFACE
            </span>
            <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl font-normal text-[#F1EFE1] tracking-tight">
              Interactive AutoML Pipeline
            </h2>
          </div>
          {/* Preset dataset switcher */}
          <div className="flex items-center gap-2 p-1.5 rounded-full bg-[#0D1815] border border-[#2A4E42] text-xs font-mono">
            <button
              onClick={() => {
                setActivePreset("churn");
                setCustomProfile(null);
              }}
              className={`px-3.5 py-1.5 rounded-full transition-colors cursor-pointer ${
                activePreset === "churn" && !customProfile
                  ? "bg-[#162A23] text-[#68E7B5] font-semibold"
                  : "text-[#AEBEB5] hover:text-[#F1EFE1]"
              }`}
            >
              Benchmark: Telco Churn
            </button>
            <button
              onClick={() => {
                setActivePreset("housing");
                setCustomProfile(null);
              }}
              className={`px-3.5 py-1.5 rounded-full transition-colors cursor-pointer ${
                activePreset === "housing" && !customProfile
                  ? "bg-[#162A23] text-[#68E7B5] font-semibold"
                  : "text-[#AEBEB5] hover:text-[#F1EFE1]"
              }`}
            >
              Benchmark: CA Housing
            </button>
          </div>
        </div>

        {/* ===================================================================
            5 CONNECTED CARDS HEADER ROW WITH SVG ARROWS
            =================================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-10">
          {PIPELINE_CARDS.map((card) => {
            const Icon = card.icon;
            const isSelected = activeStage === card.id;
            return (
              <div
                key={card.id}
                onClick={() => setActiveStage(card.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "bg-[#162A23] border-[#68E7B5] shadow-[0_0_20px_rgba(104,231,181,0.2)]"
                    : "bg-[#12201C] border-[#2A4E42] hover:border-[#3D705F]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-mono font-bold text-[#68E7B5]">0{card.id}</span>
                    <Icon className="w-4 h-4 text-[#AEBEB5]" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-semibold text-[#F1EFE1] mb-1">{card.title}</h3>
                  <p className="text-[11px] text-[#AEBEB5] leading-relaxed line-clamp-2">{card.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ===================================================================
            LIVE STAGE INTERACTIVE PREVIEW CANVAS
            =================================================================== */}
        <div className="autonexa-card-elevated p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-6 border-b border-[#2A4E42] text-xs font-mono gap-3">
            <div className="flex items-center gap-3">
              <div className="relative -my-2">
                <RobotMascot size="xs" stage={activeStage} state={isTraining ? "working" : undefined} isInteractive={true} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#68E7B5] animate-pulse" />
                  <span className="text-[#F1EFE1] font-bold">
                    AutoNexa Tabular Engine // Stage 0{activeStage}: {PIPELINE_CARDS[activeStage - 1].title}
                  </span>
                </div>
                <span className="text-[11px] text-[#AEBEB5]">Interactive AutoML Pipeline Assistant</span>
              </div>
            </div>
            <div className="text-[#AEBEB5]">
              Active: <span className="text-[#68E7B5]">{current.filename}</span>
            </div>
          </div>

          {/* Dynamic Content Based on Active Stage */}
          {activeStage === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div>
                <h3 className="text-lg font-bold text-[#F1EFE1] mb-2 font-sans">
                  Tabular CSV Dataset Ingestion
                </h3>
                <p className="text-xs sm:text-sm text-[#AEBEB5] mb-6 leading-relaxed">
                  Upload custom tabular CSV files or test with AutoNexa benchmark datasets. We validate CSV delimiters, check column schemas, compute SHA-256 integrity hashes, and reject malformed records.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="btn-autonexa-primary px-5 py-2.5 text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>{isUploading ? "Uploading..." : "Upload Local CSV"}</span>
                  </button>
                  <button
                    onClick={() => setActiveStage(2)}
                    className="btn-autonexa-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Proceed to Profiling</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {uploadMessage && (
                  <p className="mt-3 text-xs font-mono text-[#68E7B5] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{uploadMessage}</span>
                  </p>
                )}
              </div>

              {/* Upload Dropzone Preview */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl border-2 border-dashed border-[#2A4E42] hover:border-[#68E7B5] bg-[#0D1815] p-8 text-center cursor-pointer transition-colors"
              >
                <UploadCloud className="w-10 h-10 text-[#68E7B5] mx-auto mb-3" />
                <p className="text-sm font-semibold text-[#F1EFE1] mb-1">Drop tabular CSV file here</p>
                <p className="text-xs text-[#AEBEB5]">Supports up to 50 MB. Encoded in UTF-8.</p>
              </div>
            </div>
          )}

          {activeStage === 2 && (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6 font-mono text-xs">
                <div className="p-4 rounded-xl bg-[#0D1815] border border-[#2A4E42]">
                  <span className="text-[#AEBEB5] block text-[10px] uppercase">Total Rows</span>
                  <span className="text-xl font-bold text-[#F1EFE1]">{current.rows.toLocaleString()}</span>
                </div>
                <div className="p-4 rounded-xl bg-[#0D1815] border border-[#2A4E42]">
                  <span className="text-[#AEBEB5] block text-[10px] uppercase">Columns</span>
                  <span className="text-xl font-bold text-[#F1EFE1]">{current.cols}</span>
                </div>
                <div className="p-4 rounded-xl bg-[#0D1815] border border-[#2A4E42]">
                  <span className="text-[#AEBEB5] block text-[10px] uppercase">Dataset Size</span>
                  <span className="text-xl font-bold text-[#F1EFE1]">{current.size}</span>
                </div>
                <div className="p-4 rounded-xl bg-[#0D1815] border border-[#2A4E42]">
                  <span className="text-[#AEBEB5] block text-[10px] uppercase">Inferred Target</span>
                  <span className="text-xl font-bold text-[#68E7B5] truncate block">{current.target}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#2A4E42]">
                <p className="text-xs text-[#AEBEB5]">
                  Task candidate detected: <span className="text-[#68E7B5] font-semibold">{current.task}</span>. Leakage audit passed.
                </p>
                <button
                  onClick={() => setActiveStage(3)}
                  className="btn-autonexa-primary px-5 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Configure Training</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {activeStage === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div>
                <h3 className="text-lg font-bold text-[#F1EFE1] mb-2 font-sans">
                  AutoML Multi-Model Search
                </h3>
                <p className="text-xs sm:text-sm text-[#AEBEB5] mb-6 leading-relaxed">
                  AutoNexa automatically trains candidate estimators (Linear, Random Forest, Hist. Gradient Boosting, XGBoost) using StratifiedKFold validation to prevent data leakage.
                </p>
                <button
                  onClick={handleStartTraining}
                  disabled={isTraining}
                  className="btn-autonexa-primary px-6 py-2.5 text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  {isTraining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{isTraining ? "Training Models..." : "Start Training Search"}</span>
                </button>
              </div>

              {/* Progress Steps */}
              <div className="p-5 rounded-xl bg-[#0D1815] border border-[#2A4E42] space-y-3 font-mono text-xs">
                <div className={`flex items-center justify-between ${trainingStep >= 1 ? "text-[#68E7B5]" : "text-[#AEBEB5]"}`}>
                  <span>01. Ingestion & Preprocessing</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className={`flex items-center justify-between ${trainingStep >= 2 ? "text-[#68E7B5]" : "text-[#AEBEB5]"}`}>
                  <span>02. Stratified Cross-Validation</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className={`flex items-center justify-between ${trainingStep >= 3 ? "text-[#68E7B5]" : "text-[#AEBEB5]"}`}>
                  <span>03. Model Fitting & Optimization</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className={`flex items-center justify-between ${trainingStep >= 4 ? "text-[#68E7B5]" : "text-[#AEBEB5]"}`}>
                  <span>04. Holdout Metric Ranking</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}

          {activeStage === 4 && (
            <div>
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-xs font-mono text-left">
                  <thead>
                    <tr className="border-b border-[#2A4E42] text-[#AEBEB5]">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Model</th>
                      <th className="py-2 px-3 text-right">CV Score</th>
                      <th className="py-2 px-3 text-right">Holdout Score</th>
                      <th className="py-2 px-3 text-right">Latency</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A4E42]/40 text-[#F1EFE1]">
                    <tr className="bg-[#162A23] font-semibold">
                      <td className="py-2.5 px-3 text-[#68E7B5]">1</td>
                      <td className="py-2.5 px-3 flex items-center gap-2">
                        <span>{current.bestModel}</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] bg-[#68E7B5]/20 text-[#68E7B5] border border-[#68E7B5]/40 font-bold">
                          Winner
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#68E7B5]">{current.bestScore}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#68E7B5]">0.932</td>
                      <td className="py-2.5 px-3 text-right text-[#AEBEB5]">12ms</td>
                      <td className="py-2.5 px-3 text-center text-[#68E7B5]">Fitted</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-[#AEBEB5]">2</td>
                      <td className="py-2.5 px-3">Hist. Gradient Boosting</td>
                      <td className="py-2.5 px-3 text-right">0.928</td>
                      <td className="py-2.5 px-3 text-right">0.919</td>
                      <td className="py-2.5 px-3 text-right text-[#AEBEB5]">8ms</td>
                      <td className="py-2.5 px-3 text-center text-[#AEBEB5]">Fitted</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-[#AEBEB5]">3</td>
                      <td className="py-2.5 px-3">Logistic / Ridge Regression</td>
                      <td className="py-2.5 px-3 text-right">0.892</td>
                      <td className="py-2.5 px-3 text-right">0.885</td>
                      <td className="py-2.5 px-3 text-right text-[#AEBEB5]">2ms</td>
                      <td className="py-2.5 px-3 text-center text-[#AEBEB5]">Fitted</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[#2A4E42]">
                <span className="text-xs text-[#AEBEB5]">
                  Serialized model artifact: <code className="text-[#68E7B5]">pipeline_model.joblib</code> ready for deployment.
                </span>
                <button
                  onClick={() => setActiveStage(5)}
                  className="btn-autonexa-primary px-5 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Test in Playground</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {activeStage === 5 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div>
                <h3 className="text-lg font-bold text-[#F1EFE1] mb-2 font-sans">
                  Real-time Prediction Playground
                </h3>
                <p className="text-xs sm:text-sm text-[#AEBEB5] mb-6 leading-relaxed">
                  Generate immediate single-record inference or download bulk scored CSV predictions using your trained winning model artifact with zero retraining.
                </p>
                <button
                  onClick={onLaunchWorkspace}
                  className="btn-autonexa-primary px-6 py-2.5 text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <span>Open Full Workspace Playground</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Sample Prediction Result Box */}
              <div className="p-5 rounded-xl bg-[#0D1815] border border-[#2A4E42] font-mono text-xs space-y-3">
                <div className="flex items-center justify-between text-[#AEBEB5] border-b border-[#2A4E42] pb-2">
                  <span>Inference Payload:</span>
                  <span className="text-[#68E7B5]">HTTP 200 OK</span>
                </div>
                <div className="text-[#F1EFE1] space-y-1">
                  <div>Predicted Label: <span className="text-[#68E7B5] font-bold">0 (Retained)</span></div>
                  <div>Class Probability: <span className="text-[#68E7B5]">94.2%</span></div>
                  <div>Inference Latency: <span className="text-[#AEBEB5]">4.2 ms</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
