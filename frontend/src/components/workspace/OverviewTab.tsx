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
} from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { DatasetProfileResponse, TrainingResponse } from "@/types/api";
import { SAMPLE_DATASETS } from "@/lib/sampleDatasets";

interface OverviewTabProps {
  datasets: DatasetProfileResponse[];
  experiments: TrainingResponse[];
  onNavigateTab: (tab: any) => void;
  onUploadSample: (sampleId: string) => void;
}

export default function OverviewTab({
  datasets,
  experiments,
  onNavigateTab,
  onUploadSample,
}: OverviewTabProps) {
  const [warnings, setWarnings] = useState([
    { id: "1", title: "Target Cardinality Guard", desc: "Binary & multiclass target distributions are strictly verified prior to fold partitioning." },
    { id: "2", title: "Leakage Prevention Active", desc: "Preprocessing transformers and scalers are fitted strictly inside cross-validation folds." },
  ]);

  const dismissWarning = (id: string) => {
    setWarnings((prev) => prev.filter((w) => w.id !== id));
  };

  const datasetCount = datasets.length;
  const experimentsCount = experiments.length;
  const bestScoreDisplay =
    experiments.length > 0 && experiments[0].best_score !== null && experiments[0].best_score !== undefined
      ? `${Number(experiments[0].best_score).toFixed(3)} ${experiments[0].primary_metric.toUpperCase()}`
      : "—";

  // Chart data based on live experiments or empty state
  const chartData =
    experiments.length > 0
      ? (experiments[0].models_evaluated || []).map((m) => {
          const metricKeys = Object.keys(m.metrics || {});
          const val = metricKeys.length > 0 ? m.metrics[metricKeys[0]] : m.cv_mean;
          return {
            name: m.model_name.slice(0, 8),
            score: typeof val === "number" ? Number(val.toFixed(3)) : 0,
          };
        })
      : [
          { name: "Demo-RF", score: 0.941 },
          { name: "Demo-XGB", score: 0.928 },
          { name: "Demo-LGB", score: 0.915 },
          { name: "Demo-LR", score: 0.885 },
        ];

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F1EFE1] tracking-tight font-sans">Overview</h1>
          <p className="text-xs sm:text-sm text-[#AEBEB5] mt-0.5 font-sans">
            AutoNexa AI Research Platform — System Monitoring &amp; Data Asset Status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-full bg-[#0D1815] text-[#68E7B5] border border-[#2A4E42] text-xs font-mono font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#68E7B5] animate-pulse" />
            <span>FastAPI Operational</span>
          </span>
        </div>
      </div>

      {/* KPI Stats Container */}
      <div className="autonexa-card-elevated p-5 sm:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-[#2A4E42]/60">
          <div className="pt-3 sm:pt-0 sm:px-4 first:px-0">
            <span className="text-[11px] text-[#AEBEB5] uppercase font-mono font-medium tracking-wider">
              Ingested Datasets
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-[#F1EFE1] font-mono">{datasetCount}</span>
              <span className="text-xs text-[#AEBEB5]">files</span>
            </div>
          </div>

          <div className="pt-3 sm:pt-0 sm:px-4">
            <span className="text-[11px] text-[#AEBEB5] uppercase font-mono font-medium tracking-wider">
              Completed Experiments
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-[#F1EFE1] font-mono">{experimentsCount}</span>
              <span className="text-xs text-[#AEBEB5]">runs</span>
            </div>
          </div>

          <div className="pt-3 sm:pt-0 sm:px-4">
            <span className="text-[11px] text-[#AEBEB5] uppercase font-mono font-medium tracking-wider">
              Best Model Metric
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-[#68E7B5] font-mono">{bestScoreDisplay}</span>
            </div>
          </div>

          <div className="pt-3 sm:pt-0 sm:px-4">
            <span className="text-[11px] text-[#AEBEB5] uppercase font-mono font-medium tracking-wider">
              Active Mode
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-bold text-[#F1EFE1] font-mono">
                {datasetCount > 0 ? "Production" : "Ready"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div>
        <p className="text-[11px] text-[#AEBEB5] font-mono font-medium uppercase tracking-wider mb-2.5">
          Quick Actions
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onNavigateTab("datasets")}
            className="btn-autonexa-primary px-4 py-2.5 text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Upload CSV Dataset</span>
          </button>

          <button
            onClick={() => onNavigateTab("training")}
            className="btn-autonexa-secondary px-4 py-2.5 text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <Zap className="w-4 h-4 text-[#68E7B5]" />
            <span>Start AutoML Search</span>
          </button>

          {/* Sample Benchmark Short-cuts */}
          <div className="hidden sm:flex items-center gap-2 ml-auto text-xs">
            <span className="text-[#AEBEB5] text-[11px] font-mono">Benchmark Datasets:</span>
            {SAMPLE_DATASETS.slice(0, 2).map((s) => (
              <button
                key={s.id}
                onClick={() => onUploadSample(s.id)}
                className="px-3 py-1.5 rounded-full bg-[#0D1815] border border-[#2A4E42] text-[11px] text-[#AEBEB5] hover:text-[#68E7B5] hover:border-[#68E7B5] transition-colors cursor-pointer"
              >
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Datasets + Recent Experiments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Datasets Table */}
        <div className="lg:col-span-2 autonexa-card p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[#F1EFE1] font-sans">Recent Ingested Datasets</h2>
              <button
                onClick={() => onNavigateTab("datasets")}
                className="text-xs text-[#68E7B5] hover:underline flex items-center gap-1 font-mono cursor-pointer"
              >
                <span>View all</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {datasets.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#0D1815] border border-[#2A4E42] text-center my-4">
                <Database className="w-8 h-8 text-[#68E7B5] mx-auto mb-2 opacity-80" />
                <h3 className="text-sm font-semibold text-[#F1EFE1]">No datasets uploaded yet</h3>
                <p className="text-xs text-[#AEBEB5] mt-1 max-w-sm mx-auto">
                  Upload your tabular CSV file or load an open-source benchmark (Telco Customer Churn or California Housing) to inspect features.
                </p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    onClick={() => onNavigateTab("datasets")}
                    className="btn-autonexa-primary px-4 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    Upload CSV
                  </button>
                  <button
                    onClick={() => onUploadSample("churn")}
                    className="btn-autonexa-secondary px-3.5 py-1.5 text-xs cursor-pointer"
                  >
                    Load Churn Benchmark
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#2A4E42] text-[11px] text-[#AEBEB5] uppercase tracking-wider">
                      <th className="pb-3 font-semibold">Dataset File</th>
                      <th className="pb-3 font-semibold">Rows</th>
                      <th className="pb-3 font-semibold">Columns</th>
                      <th className="pb-3 font-semibold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A4E42]/40 text-[#F1EFE1]">
                    {datasets.map((d) => (
                      <tr
                        key={d.dataset_id}
                        onClick={() => onNavigateTab("datasets")}
                        className="hover:bg-[#162A23] cursor-pointer transition-colors"
                      >
                        <td className="py-3 font-medium text-[#F1EFE1] flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-[#68E7B5]" />
                          <span className="truncate max-w-[150px] sm:max-w-xs">{d.filename}</span>
                        </td>
                        <td className="py-3 text-[#AEBEB5]">{d.rows.toLocaleString()}</td>
                        <td className="py-3 text-[#AEBEB5]">{d.columns}</td>
                        <td className="py-3 text-right">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#68E7B5]/15 text-[#68E7B5] border border-[#68E7B5]/30">
                            Profiled
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Mini Chart & Warnings */}
        <div className="space-y-4">
          <div className="autonexa-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-[#F1EFE1] uppercase tracking-wider font-mono">
                {experiments.length > 0 ? "Holdout Evaluation" : "Benchmark Preview"}
              </h3>
              <span className="text-[10px] text-[#68E7B5] font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#68E7B5] animate-pulse" />
                {experiments.length > 0 ? "Real Metrics" : "Demo Data"}
              </span>
            </div>

            <div className="h-28 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#AEBEB5" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0D1815",
                      borderColor: "#2A4E42",
                      borderRadius: "8px",
                      fontSize: "11px",
                      color: "#F1EFE1",
                    }}
                  />
                  <Bar dataKey="score" fill="#68E7B5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 pt-3 border-t border-[#2A4E42] flex items-center justify-between text-[11px] text-[#AEBEB5] font-mono">
              <span>{experiments.length > 0 ? `Best: ${experiments[0].best_model}` : "Demo Winner: Random Forest"}</span>
              <span className="text-[#68E7B5] font-bold">{bestScoreDisplay}</span>
            </div>
          </div>

          {/* Diagnostic Warnings */}
          <div className="space-y-2.5">
            {warnings.map((w) => (
              <div
                key={w.id}
                className="rounded-xl bg-[#0D1815] border border-[#2A4E42] p-3.5 shadow-md relative group transition-all"
              >
                <button
                  onClick={() => dismissWarning(w.id)}
                  className="absolute top-2.5 right-2.5 text-[#AEBEB5] hover:text-[#F1EFE1] cursor-pointer"
                  title="Dismiss notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-start gap-2.5 pr-4">
                  <AlertTriangle className="w-4 h-4 text-[#EDC54C] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-[#F1EFE1] font-mono">{w.title}</h4>
                    <p className="text-[11px] text-[#AEBEB5] mt-0.5 leading-snug">{w.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
