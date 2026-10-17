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
  TrendingUp,
  FileText,
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
  // Dismissible notifications mimicking reference image
  const [warnings, setWarnings] = useState([
    { id: "1", title: "Possible leakage in target", desc: "Target candidate shows high correlation with identifier column." },
    { id: "2", title: "High cardinality detected", desc: "Categorical feature has >25 unique values; threshold clamped." },
    { id: "3", title: "Class imbalance note", desc: "Minority class represents <15% of dataset; StratifiedKFold recommended." },
  ]);

  const dismissWarning = (id: string) => {
    setWarnings((prev) => prev.filter((w) => w.id !== id));
  };

  // Compute live stats or fallback to reference defaults
  const datasetCount = datasets.length > 0 ? datasets.length : 14;
  const experimentsCount = experiments.length > 0 ? experiments.length : 39;
  const bestScoreDisplay =
    experiments.length > 0 && experiments[0].best_score !== null && experiments[0].best_score !== undefined
      ? `${Number(experiments[0].best_score).toFixed(3)} ${experiments[0].primary_metric.toUpperCase()}`
      : "0.941 ROC-AUC";

  // Mini chart data
  const chartData = [
    { name: "M1", score: 0.65 },
    { name: "M2", score: 0.72 },
    { name: "M3", score: 0.88 },
    { name: "M4", score: 0.941 },
    { name: "M5", score: 0.78 },
  ];

  // Default demonstration table rows if no live dataset uploaded yet
  const displayDatasets =
    datasets.length > 0
      ? datasets.map((d) => {
          const colList =
            d.column_names ||
            (Array.isArray((d as any).columns) ? (d as any).columns.map((c: any) => c.name) : []);
          return {
            id: d.filename || d.dataset_id.slice(0, 8),
            rows: (d.rows ?? (d as any).row_count ?? 0).toLocaleString(),
            cols: typeof d.columns === "number" ? d.columns : (d as any).column_count ?? colList.length,
            target: colList[colList.length - 1] || "target",
            status: "#F59E0B",
            rawId: d.dataset_id,
          };
        })
      : [
          { id: "flight_delays_v2.csv", rows: "13,905", cols: 58, target: "0.941 ROC-AUC", status: "#F59E0B" },
          { id: "customer_churn.csv", rows: "2,522", cols: 36, target: "customer_churn", status: "#F59E0B" },
          { id: "customer_churn.csv", rows: "2,870", cols: 47, target: "customer_churn", status: "#F59E0B" },
          { id: "customer_churn.csv", rows: "1,477", cols: 37, target: "customer_churn", status: "#F59E0B" },
          { id: "flight_delays1.csv", rows: "642", cols: 13, target: "target", status: "#F59E0B" },
          { id: "flight_delays.csv", rows: "1,253", cols: 54, target: "target", status: "Status" },
        ];

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-sans">Overview</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">From Raw Data to Reliable Models.</p>
        </div>

        <div className="sm:hidden self-start">
          <span className="px-3 py-1 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 text-xs font-mono font-medium">
            Active System Health
          </span>
        </div>
      </div>

      {/* KPI Stats Container (Reference Replica) */}
      <div className="rounded-2xl glass-panel p-5 sm:p-6 border border-white/5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-800/80">
          <div className="pt-3 sm:pt-0 sm:px-4 first:px-0">
            <span className="text-[11px] text-slate-400 uppercase font-mono font-medium tracking-wider">
              Dataset Count
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-white font-mono">{datasetCount}</span>
              <span className="text-xs text-slate-400">files</span>
            </div>
          </div>

          <div className="pt-3 sm:pt-0 sm:px-4">
            <span className="text-[11px] text-slate-400 uppercase font-mono font-medium tracking-wider">
              Experiments Ran
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-white font-mono">{experimentsCount}</span>
              <span className="text-xs text-slate-400">runs</span>
            </div>
          </div>

          <div className="pt-3 sm:pt-0 sm:px-4">
            <span className="text-[11px] text-slate-400 uppercase font-mono font-medium tracking-wider">
              Best Model Score
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-white font-mono">{bestScoreDisplay}</span>
            </div>
          </div>

          <div className="pt-3 sm:pt-0 sm:px-4">
            <span className="text-[11px] text-slate-400 uppercase font-mono font-medium tracking-wider">
              Last Update
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-bold text-white font-mono">Just now</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Buttons (Reference Replica) */}
      <div>
        <p className="text-[11px] text-slate-400 font-mono font-medium uppercase tracking-wider mb-2">
          Quick Action
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onNavigateTab("datasets")}
            className="px-4 py-2.5 rounded-xl btn-gold-outline text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4 text-amber-400" />
            + Upload Dataset
          </button>

          <button
            onClick={() => onNavigateTab("training")}
            className="px-4 py-2.5 rounded-xl btn-gold text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/10"
          >
            <Zap className="w-4 h-4 text-slate-950 fill-current" />
            ⚡ Start New AutoML
          </button>

          {/* Quick sample loading shortcuts */}
          <div className="hidden sm:flex items-center gap-2 ml-auto text-xs">
            <span className="text-slate-500 text-[11px] font-mono">Try sample:</span>
            {SAMPLE_DATASETS.slice(0, 2).map((s) => (
              <button
                key={s.id}
                onClick={() => onUploadSample(s.id)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 hover:text-amber-400 hover:border-slate-700 transition-colors"
              >
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Datasets + Recent Experiments & Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Datasets Table (2 Cols on Desktop) */}
        <div className="lg:col-span-2 rounded-2xl glass-panel p-5 sm:p-6 border border-white/5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white font-sans">Recent Datasets</h2>
              <button
                onClick={() => onNavigateTab("datasets")}
                className="text-xs text-amber-400 hover:underline flex items-center gap-1 font-mono"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Dataset ID</th>
                    <th className="pb-3 font-semibold">Rows</th>
                    <th className="pb-3 font-semibold">Columns</th>
                    <th className="pb-3 font-semibold">Target Candidate</th>
                    <th className="pb-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                  {displayDatasets.map((row, idx) => (
                    <tr
                      key={idx}
                      onClick={() => onNavigateTab("datasets")}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 font-medium text-white flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        <span className="truncate max-w-[150px] sm:max-w-xs">{row.id}</span>
                      </td>
                      <td className="py-3 text-slate-400">{row.rows}</td>
                      <td className="py-3 text-slate-400">{row.cols}</td>
                      <td className="py-3 text-slate-300">{row.target}</td>
                      <td className="py-3 text-right">
                        <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Experiments Mini Chart & Diagnostic Warning Cards */}
        <div className="space-y-4">
          {/* Recent Experiments Card */}
          <div className="rounded-2xl glass-panel p-5 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Recent Experiments
              </h3>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Runs
              </span>
            </div>

            {/* Recharts Mini Chart */}
            <div className="h-28 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#1e293b",
                      borderRadius: "8px",
                      fontSize: "11px",
                      color: "#f8fafc",
                    }}
                  />
                  <Bar dataKey="score" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Best Model: Random Forest</span>
              <span className="text-amber-400 font-bold">0.941 ROC-AUC</span>
            </div>
          </div>

          {/* Diagnostic Warnings (Reference Replica Toast Cards) */}
          <div className="space-y-2.5">
            {warnings.map((w) => (
              <div
                key={w.id}
                className="rounded-xl bg-[#141d24]/90 border border-amber-500/20 p-3.5 shadow-lg relative group transition-all"
              >
                <button
                  onClick={() => dismissWarning(w.id)}
                  className="absolute top-2.5 right-2.5 text-slate-500 hover:text-white"
                  title="Dismiss notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-start gap-2.5 pr-4">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-300 font-mono">{w.title}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{w.desc}</p>
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
