"use client";

import React, { useState, useEffect } from "react";
import {
  UploadCloud,
  FileText,
  Play,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  Filter,
  Search,
  CheckCircle2,
  Database,
  BarChart3,
  Zap,
} from "lucide-react";

interface WorkflowVisualizerProps {
  onLaunchWorkspace: () => void;
}

/* ---------- Mock Leaderboard Data ---------- */
const LEADERBOARD_MODELS = [
  {
    rank: 1,
    name: "XGBoost",
    tag: "Candidate M…",
    rocAuc: "0.941",
    metric: "0.947",
    accent: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/40",
    icon: "⚡",
  },
  {
    rank: 2,
    name: "LightGBM",
    tag: "Candidate M…",
    rocAuc: "0.941",
    metric: "0.936",
    accent: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: "🌳",
  },
  {
    rank: 3,
    name: "CatBoost",
    tag: "Candidate M…",
    rocAuc: "0.941",
    metric: "0.932",
    accent: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: "🅱",
  },
];

/* ---------- Animated training progress text ---------- */
function useTrainingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => (p >= 90 ? 0 : p + Math.random() * 8));
    }, 1800);
    return () => clearInterval(interval);
  }, []);
  return Math.min(Math.round(progress), 90);
}

export default function WorkflowVisualizer({ onLaunchWorkspace }: WorkflowVisualizerProps) {
  const [activeLeaderboardTab, setActiveLeaderboardTab] = useState<"candidate" | "interactive">("candidate");
  const progress = useTrainingProgress();

  return (
    <section id="workflow" className="relative py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-amber-400 font-mono mb-3">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Interactive Architecture Preview
        </div>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
          End-to-End Automated Pipeline
        </h2>
        <p className="text-sm sm:text-base text-slate-400">
          Inspect how AutoNexa streams raw tabular CSVs, applies leakage-aware preprocessing, searches model families,
          and exposes calibrated inference pipelines — all in one unified workspace.
        </p>
      </div>

      {/* ========== MOCK WORKSPACE CONTAINER ========== */}
      <div className="relative rounded-2xl border border-slate-800/80 bg-[#0c1117] overflow-hidden shadow-2xl shadow-black/40">
        {/* ---------- Title bar (macOS-style) ---------- */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a0e14] border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>

          {/* Central filter bar */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-slate-400">
            <Filter className="w-3 h-3" />
            <span>Filter log…</span>
          </div>

          {/* Status check pill */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400">Status check pill</span>
          </div>
        </div>

        {/* ---------- 3-Panel Workspace Grid ---------- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 relative">
          {/* ────── Panel 1: CSV Upload ────── */}
          <div className="p-5 lg:p-6 border-b lg:border-b-0 lg:border-r border-slate-800/60 relative">
            {/* Connection line to next panel (desktop) */}
            <div className="hidden lg:block absolute top-1/2 -right-px w-4 -translate-y-1/2 z-10">
              <svg width="16" height="40" viewBox="0 0 16 40" fill="none" className="text-amber-500/40">
                <path d="M0 20 C8 20, 8 10, 16 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M0 20 C8 20, 8 30, 16 30" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </div>

            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-amber-400" />
              CSV Upload
            </h3>

            {/* Drag-and-drop area */}
            <div className="rounded-xl border-2 border-dashed border-slate-700/80 bg-slate-950/40 p-6 text-center mb-4 hover:border-amber-500/40 transition-colors cursor-pointer group">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:border-amber-500/40 transition-colors">
                  <FileText className="w-6 h-6 text-slate-500 group-hover:text-amber-400 transition-colors" />
                </div>
                <div>
                  <p className="text-xs text-slate-300 font-medium">
                    Drop or drag the csv
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    data s in csv here
                  </p>
                </div>
              </div>
            </div>

            {/* OR divider */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">OR</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Upload button */}
            <button className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <UploadCloud className="w-3.5 h-3.5" />
              CSV Upload
            </button>

            {/* Quick stats bar below */}
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>Max 50 MB</span>
              <span>SHA-256 verified</span>
            </div>
          </div>

          {/* ────── Panel 2: AutoML Training Studio ────── */}
          <div className="p-5 lg:p-6 border-b lg:border-b-0 lg:border-r border-slate-800/60 relative">
            {/* Connection line to next panel (desktop) */}
            <div className="hidden lg:block absolute top-1/2 -right-px w-4 -translate-y-1/2 z-10">
              <svg width="16" height="40" viewBox="0 0 16 40" fill="none" className="text-amber-500/40">
                <path d="M0 20 C8 20, 8 10, 16 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M0 20 C8 20, 8 30, 16 30" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                AutoML Training Studio
              </h3>
              {/* Tabs */}
              <div className="flex items-center">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-l bg-slate-900 border border-slate-700 text-amber-400">
                  Training
                </span>
              </div>
            </div>

            {/* Training status bar */}
            <div className="p-3 rounded-lg bg-slate-950/60 border border-white/5 mb-4">
              <div className="flex items-center justify-between text-[11px] mb-2">
                <span className="text-slate-400 font-mono">Training status:</span>
                <span className="text-amber-400 font-mono font-semibold">13h {progress}%…</span>
              </div>
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.max(progress, 12)}%` }}
                />
              </div>
            </div>

            {/* Dataset Summary */}
            <div className="mb-4">
              <h4 className="text-[11px] font-semibold text-white mb-2">Dataset summary</h4>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="p-2 rounded bg-slate-950/60 border border-white/5">
                  <span className="text-slate-500 block mb-0.5">Dataset</span>
                  <span className="text-slate-200 font-mono font-bold text-xs">8,662,300</span>
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-white/5">
                  <span className="text-slate-500 block mb-0.5">Summats</span>
                  <span className="text-slate-200 font-mono font-bold text-xs">259,503</span>
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-white/5">
                  <span className="text-slate-500 block mb-0.5">Target variables</span>
                  <span className="text-slate-200 font-mono font-bold text-xs">123-oas</span>
                </div>
              </div>
            </div>

            {/* Target Variables Section */}
            <div className="space-y-3">
              <div>
                <h4 className="text-[11px] font-semibold text-white mb-1">Target variables</h4>
                <div className="text-[10px] text-slate-400 font-mono p-2 rounded bg-slate-950/60 border border-white/5">
                  target: &apos;<span className="text-amber-400">customer_churn</span>&apos;
                </div>
              </div>
              <div>
                <h4 className="text-[11px] font-semibold text-white mb-1">Target variables</h4>
                <div className="text-[10px] text-slate-400 font-mono p-2 rounded bg-slate-950/60 border border-white/5 space-y-0.5">
                  <div>target: &apos;<span className="text-amber-400">churn_churn</span>&apos;</div>
                  <div>target: &apos;<span className="text-amber-400">customer_churn</span>&apos;</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>StratifiedKFold</span>
              <span className="text-amber-400">5-Fold CV</span>
            </div>
          </div>

          {/* ────── Panel 3: Leaderboard ────── */}
          <div className="p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                Leaderboard
              </h3>
            </div>

            {/* Tab Toggles */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setActiveLeaderboardTab("candidate")}
                className={`text-[10px] font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeLeaderboardTab === "candidate"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
                    : "bg-slate-900 text-slate-400 border border-slate-700 hover:border-slate-600"
                }`}
              >
                Candidate metrics
                {activeLeaderboardTab === "candidate" && <CheckCircle2 className="w-3 h-3" />}
              </button>
              <button
                onClick={() => setActiveLeaderboardTab("interactive")}
                className={`text-[10px] font-mono px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeLeaderboardTab === "interactive"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
                    : "bg-slate-900 text-slate-400 border border-slate-700 hover:border-slate-600"
                }`}
              >
                Interactive metrics
                {activeLeaderboardTab === "interactive" && <CheckCircle2 className="w-3 h-3" />}
              </button>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-2 py-1.5 text-[9px] font-mono text-slate-500 uppercase tracking-wider border-b border-slate-800/60 mb-1">
              <span>#</span>
              <span>Model</span>
              <span>ROC-AUC</span>
              <span>Metrics</span>
            </div>

            {/* Model Rows */}
            <div className="space-y-1">
              {LEADERBOARD_MODELS.map((model) => (
                <div
                  key={model.rank}
                  className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center px-2 py-2.5 rounded-lg transition-colors hover:bg-slate-900/60 group ${
                    model.rank === 1 ? "bg-slate-900/40" : ""
                  }`}
                >
                  {/* Rank */}
                  <span className="text-xs font-mono text-slate-500 w-4 text-center">{model.rank}</span>

                  {/* Model info */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${model.bg} border ${model.border}`}
                    >
                      {model.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{model.name}</div>
                      <div className="text-[9px] text-slate-500 font-mono truncate">{model.tag}</div>
                    </div>
                  </div>

                  {/* ROC-AUC */}
                  <span className="text-xs font-mono text-slate-300">{model.rocAuc}</span>

                  {/* Score pill */}
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${model.bg} border ${model.border} ${model.accent}`}
                  >
                    {model.metric}
                  </span>

                  {/* Actions */}
                  <button className="text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Footer Pagination */}
            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>Forwarded</span>
              <div className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                  8 ▾
                </span>
                <button className="p-0.5 rounded hover:bg-slate-800 text-slate-500 cursor-pointer">
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button className="p-0.5 rounded hover:bg-slate-800 text-slate-500 cursor-pointer">
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========== Capability Pills Below ========== */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
        <button
          onClick={onLaunchWorkspace}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-slate-300 font-medium hover:border-amber-500/40 hover:text-amber-300 transition-all cursor-pointer backdrop-blur-sm"
        >
          <Database className="w-3.5 h-3.5 text-amber-400" />
          Dataset Profiling
        </button>
        <button
          onClick={onLaunchWorkspace}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-slate-300 font-medium hover:border-amber-500/40 hover:text-amber-300 transition-all cursor-pointer backdrop-blur-sm"
        >
          <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
          Task Recommendations
        </button>
        <button
          onClick={onLaunchWorkspace}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-slate-300 font-medium hover:border-amber-500/40 hover:text-amber-300 transition-all cursor-pointer backdrop-blur-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Prediction Playground
        </button>
      </div>

      {/* Decorative ambient glow */}
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] rounded-full pointer-events-none -mr-32 -mb-32" />
    </section>
  );
}
