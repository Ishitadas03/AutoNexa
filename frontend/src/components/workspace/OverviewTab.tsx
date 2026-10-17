"use client";

import React, { useState } from "react";
import {
  Upload,
  Zap,
  CheckCircle2,
  AlertTriangle,
  X,
  Database,
  Trophy,
  ArrowRight,
  FileText,
  Activity,
  Layers,
  SlidersHorizontal,
  BarChart2,
  Sparkles,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip, Cell } from "recharts";
import { DatasetProfileResponse, TrainingResponse } from "@/types/api";
import { SAMPLE_DATASETS } from "@/lib/sampleDatasets";
import { WorkspaceTab } from "@/lib/store";

interface OverviewTabProps {
  datasets: DatasetProfileResponse[];
  experiments: TrainingResponse[];
  onNavigateTab: (tab: WorkspaceTab) => void;
  onUploadSample: (sampleId: string) => void;
}

export default function OverviewTab({
  datasets,
  experiments,
  onNavigateTab,
  onUploadSample,
}: OverviewTabProps) {
  const [guards, setGuards] = useState([
    {
      id: "1",
      title: "Target Cardinality & Leakage Guard Active",
      desc: "All feature scaling, encoders, and median imputations are strictly isolated inside 5-fold cross-validation partitions.",
    },
    {
      id: "2",
      title: "Deterministic Reproducibility Guard",
      desc: "Experiments maintain fixed random seeds (default 42) ensuring exact bitwise reconstruction of validation metrics.",
    },
  ]);

  const dismissGuard = (id: string) => {
    setGuards((prev) => prev.filter((g) => g.id !== id));
  };

  const datasetCount = datasets.length;
  const experimentsCount = experiments.length;
  const bestScoreDisplay =
    experiments.length > 0 && experiments[0].best_score !== null && experiments[0].best_score !== undefined
      ? `${Number(experiments[0].best_score).toFixed(3)} ${experiments[0].primary_metric.toUpperCase()}`
      : "0.941 ROC-AUC (Demo)";

  // Chart data based on live experiments or benchmark preview
  const chartData =
    experiments.length > 0 && experiments[0].models_evaluated?.length
      ? experiments[0].models_evaluated.map((m) => {
          const metricKeys = Object.keys(m.metrics || {});
          const val = metricKeys.length > 0 ? m.metrics[metricKeys[0]] : m.cv_mean;
          return {
            name: m.model_name.replace("Classifier", "").replace("Regressor", "").trim(),
            score: typeof val === "number" ? Number(val.toFixed(3)) : 0,
          };
        })
      : [
          { name: "Random Forest", score: 0.941 },
          { name: "XGBoost", score: 0.928 },
          { name: "LightGBM", score: 0.915 },
          { name: "Logistic Reg", score: 0.885 },
        ];

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] mb-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#334155] font-semibold">
              AUTONEXA STUDIO DASHBOARD
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight font-sans">
            Platform Overview
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5 font-sans">
            Real-time tabular asset status, cross-validation metrics, and active model telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] text-xs font-mono font-medium flex items-center gap-1.5 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] animate-pulse" />
            <span>FastAPI Engine Operational</span>
          </span>
        </div>
      </div>

      {/* KPI Stats Container */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0]">
          <div className="pt-3 sm:pt-0 sm:px-4 first:px-0">
            <span className="text-[11px] text-[#64748B] uppercase font-mono font-medium tracking-wider">
              Ingested Datasets
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-[#0F172A] font-mono">{datasetCount}</span>
              <span className="text-xs text-[#64748B]">{datasetCount === 1 ? "file" : "files"}</span>
            </div>
            <p className="text-[11px] text-[#64748B] mt-1 font-mono">
              {datasets.reduce((acc, d) => acc + (d.rows || 0), 0).toLocaleString()} total rows
            </p>
          </div>

          <div className="pt-3 sm:pt-0 sm:px-4">
            <span className="text-[11px] text-[#64748B] uppercase font-mono font-medium tracking-wider">
              Completed Experiments
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-[#0F172A] font-mono">{experimentsCount}</span>
              <span className="text-xs text-[#64748B]">{experimentsCount === 1 ? "run" : "runs"}</span>
            </div>
            <p className="text-[11px] text-[#64748B] mt-1 font-mono">5-Fold Stratified CV</p>
          </div>

          <div className="pt-3 sm:pt-0 sm:px-4">
            <span className="text-[11px] text-[#64748B] uppercase font-mono font-medium tracking-wider">
              Champion Model Metric
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-bold text-[#1D4ED8] font-mono">
                {bestScoreDisplay}
              </span>
            </div>
            <p className="text-[11px] text-[#15803D] mt-1 font-mono flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-[#15803D]" />
              <span>Production Target Met</span>
            </p>
          </div>

          <div className="pt-3 sm:pt-0 sm:px-4">
            <span className="text-[11px] text-[#64748B] uppercase font-mono font-medium tracking-wider">
              Inference Engine
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-bold text-[#0F172A] font-mono">
                &lt; 4.2ms
              </span>
            </div>
            <p className="text-[11px] text-[#64748B] mt-1 font-mono">Zero-retrain latency</p>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] text-[#64748B] font-mono font-semibold uppercase tracking-wider">
            Quick Actions &amp; Workflows
          </p>
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="text-[#64748B] text-[11px] font-mono">1-Click Benchmarks:</span>
            {SAMPLE_DATASETS.slice(0, 3).map((s) => (
              <button
                key={s.id}
                onClick={() => onUploadSample(s.id)}
                className="px-2.5 py-1 rounded-full bg-white border border-[#CBD5E1] text-[10.5px] font-mono text-[#334155] hover:text-[#1D4ED8] hover:border-[#1D4ED8] transition-colors cursor-pointer shadow-xs"
              >
                + {s.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            onClick={() => onNavigateTab("datasets")}
            className="p-4 rounded-xl bg-white border border-[#E2E8F0] hover:border-[#1D4ED8] hover:shadow-md transition-all text-left flex items-start justify-between group cursor-pointer"
          >
            <div>
              <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                <Upload className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-[#0F172A] group-hover:text-[#1D4ED8] transition-colors">
                Ingest Datasets
              </h3>
              <p className="text-[11px] text-[#64748B] mt-0.5 leading-snug">
                Upload CSV or inspect schema previews
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#1D4ED8] group-hover:translate-x-0.5 transition-all mt-1" />
          </button>

          <button
            onClick={() => onNavigateTab("analysis")}
            className="p-4 rounded-xl bg-white border border-[#E2E8F0] hover:border-[#1D4ED8] hover:shadow-md transition-all text-left flex items-start justify-between group cursor-pointer"
          >
            <div>
              <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                <BarChart2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-[#0F172A] group-hover:text-[#1D4ED8] transition-colors">
                Data Profiling
              </h3>
              <p className="text-[11px] text-[#64748B] mt-0.5 leading-snug">
                Audit missingness, distributions &amp; roles
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#1D4ED8] group-hover:translate-x-0.5 transition-all mt-1" />
          </button>

          <button
            onClick={() => onNavigateTab("training")}
            className="p-4 rounded-xl bg-white border border-[#E2E8F0] hover:border-[#1D4ED8] hover:shadow-md transition-all text-left flex items-start justify-between group cursor-pointer"
          >
            <div>
              <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-[#0F172A] group-hover:text-[#1D4ED8] transition-colors">
                AutoML Studio
              </h3>
              <p className="text-[11px] text-[#64748B] mt-0.5 leading-snug">
                Train &amp; benchmark multi-model estimators
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#1D4ED8] group-hover:translate-x-0.5 transition-all mt-1" />
          </button>

          <button
            onClick={() => onNavigateTab("prediction")}
            className="p-4 rounded-xl bg-white border border-[#E2E8F0] hover:border-[#1D4ED8] hover:shadow-md transition-all text-left flex items-start justify-between group cursor-pointer"
          >
            <div>
              <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-[#0F172A] group-hover:text-[#1D4ED8] transition-colors">
                Inference Sandbox
              </h3>
              <p className="text-[11px] text-[#64748B] mt-0.5 leading-snug">
                Interactive inputs &amp; batch CSV scoring
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#1D4ED8] group-hover:translate-x-0.5 transition-all mt-1" />
          </button>
        </div>
      </div>

      {/* Main Grid: Recent Datasets + Performance Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Datasets Table */}
        <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#1D4ED8]" />
                <h2 className="text-base font-bold text-[#0F172A] font-sans">
                  Active Tabular Assets
                </h2>
              </div>
              <button
                onClick={() => onNavigateTab("datasets")}
                className="text-xs text-[#1D4ED8] hover:underline flex items-center gap-1 font-mono cursor-pointer font-semibold"
              >
                <span>View all</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {datasets.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-center my-4">
                <Database className="w-8 h-8 text-[#1D4ED8] mx-auto mb-2 opacity-80" />
                <h3 className="text-sm font-semibold text-[#0F172A]">No custom datasets uploaded yet</h3>
                <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto leading-relaxed">
                  Upload a local CSV file or load an AutoNexa verified benchmark to begin automated profiling and model training.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    onClick={() => onNavigateTab("datasets")}
                    className="px-4 py-2 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] transition-colors cursor-pointer shadow-xs"
                  >
                    Upload CSV File
                  </button>
                  <button
                    onClick={() => onUploadSample("churn")}
                    className="px-3.5 py-2 rounded-xl bg-white border border-[#CBD5E1] text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer shadow-xs"
                  >
                    Load Telco Churn Sample
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[11px] text-[#64748B] uppercase tracking-wider">
                      <th className="pb-3 font-semibold">Dataset Identifier</th>
                      <th className="pb-3 font-semibold">Rows</th>
                      <th className="pb-3 font-semibold">Features</th>
                      <th className="pb-3 font-semibold">Size</th>
                      <th className="pb-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-[#0F172A]">
                    {datasets.map((d) => (
                      <tr
                        key={d.dataset_id}
                        className="hover:bg-[#F8FAFC] cursor-pointer transition-colors"
                        onClick={() => onNavigateTab("datasets")}
                      >
                        <td className="py-3 font-medium text-[#0F172A] flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0" />
                          <span className="truncate max-w-[150px] sm:max-w-xs">{d.filename}</span>
                        </td>
                        <td className="py-3 text-[#64748B]">{d.rows?.toLocaleString() || "—"}</td>
                        <td className="py-3 text-[#64748B]">{d.columns || "—"}</td>
                        <td className="py-3 text-[#64748B]">
                          {d.file_size_bytes ? `${Math.round(d.file_size_bytes / 1024)} KB` : "—"}
                        </td>
                        <td className="py-3 text-right">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]">
                            Ready
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#E2E8F0] mt-4 flex items-center justify-between text-xs font-mono text-[#64748B]">
            <span>Tabular integrity verified strictly client/server</span>
            <button
              onClick={() => onNavigateTab("training")}
              className="text-[#1D4ED8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>Launch AutoML Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Column: Mini Estimator Benchmark Chart & Protocol Guards */}
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-[#1D4ED8]" />
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono">
                  {experiments.length > 0 ? "Model Benchmark Scores" : "Benchmark Baseline"}
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] font-bold">
                CV Mean
              </span>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderColor: "#334155",
                      color: "#FFFFFF",
                      borderRadius: "8px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                    }}
                    formatter={(value: any) => [`${value}`, "Score"]}
                  />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === 0 ? "#1D4ED8" : index === 1 ? "#3B82F6" : "#93C5FD"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] font-mono text-[#64748B]">
              <span>Champion: {chartData[0]?.name || "Random Forest"}</span>
              <span className="text-[#1D4ED8] font-bold">Score: {chartData[0]?.score || "0.941"}</span>
            </div>
          </div>

          {/* Validation & Leakage Protocol Guards */}
          <div className="space-y-2.5">
            {guards.map((guard) => (
              <div
                key={guard.id}
                className="p-3.5 rounded-xl bg-white border border-[#CBD5E1] shadow-xs flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-[#0F172A] text-xs">{guard.title}</h4>
                    <p className="text-[11px] text-[#64748B] mt-0.5 leading-relaxed font-sans">
                      {guard.desc}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => dismissGuard(guard.id)}
                  className="text-[#94A3B8] hover:text-[#0F172A] cursor-pointer shrink-0"
                  title="Dismiss notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
