"use client";

import React from "react";
import {
  Trophy,
  Activity,
  FileText,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrainingResponse } from "@/types/api";
import { formatDuration } from "@/lib/utils";

interface LeaderboardTabProps {
  activeExperiment: TrainingResponse | null;
  onNavigateTab: (tab: any) => void;
}

export default function LeaderboardTab({ activeExperiment, onNavigateTab }: LeaderboardTabProps) {
  if (!activeExperiment) {
    return (
      <div className="p-12 text-center rounded-2xl autonexa-card space-y-4">
        <Trophy className="w-10 h-10 text-[#68E7B5] mx-auto opacity-70" />
        <h3 className="text-lg font-bold text-[#F1EFE1]">No Experiment Results Available</h3>
        <p className="text-xs text-[#AEBEB5] max-w-sm mx-auto">
          Train an AutoML model in the Studio to generate a model leaderboard and compare performance.
        </p>
        <button
          onClick={() => onNavigateTab("training")}
          className="px-4 py-2 rounded-xl btn-autonexa-primary text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
        >
          <span>Go to AutoML Studio</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Prepare chart comparison data
  const chartData = activeExperiment.models_evaluated
    .filter((m) => m.status === "successful")
    .map((m) => {
      const score = m.cv_mean !== null && m.cv_mean !== undefined ? m.cv_mean : m.metrics[activeExperiment.primary_metric] || 0;
      return {
        name: m.model_name.replace(" Classifier", "").replace(" Regressor", ""),
        score: Number(score.toFixed(4)),
        duration: m.duration_seconds,
      };
    });

  const bestModelResult = activeExperiment.models_evaluated.find(
    (m) => m.model_id === activeExperiment.best_model
  );

  const calculatedBestScore =
    activeExperiment.best_score ??
    (bestModelResult ? (bestModelResult.cv_mean ?? bestModelResult.metrics[activeExperiment.primary_metric]) : null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F1EFE1] tracking-tight font-sans">
            Model Leaderboard & Experiment Results
          </h1>
          <p className="text-xs sm:text-sm text-[#AEBEB5] mt-0.5">
            Ranked candidate evaluation outcomes under strict evaluation protocol.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigateTab("prediction")}
            className="px-4 py-2 rounded-xl btn-autonexa-primary text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-[#68E7B5]/15"
          >
            <Activity className="w-4 h-4 stroke-[2.5]" />
            <span>Open in Prediction Playground</span>
          </button>
          <button
            onClick={() => onNavigateTab("details")}
            className="px-3 py-2 rounded-xl btn-autonexa-secondary text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Artifact Details</span>
          </button>
        </div>
      </div>

      {/* Winning Model Hero Banner */}
      <div className="p-6 rounded-2xl autonexa-card-elevated border border-[#2A4E42] relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-56 h-56 bg-[#68E7B5]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#0D1815] border border-[#2A4E42] flex items-center justify-center text-[#68E7B5] shrink-0 shadow-lg shadow-[#68E7B5]/10">
              <Trophy className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-[#162A23] text-[#68E7B5] border border-[#2A4E42]">
                  Winning Estimator
                </span>
                <span className="text-xs text-[#AEBEB5] font-mono">Rank #1</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#F1EFE1] font-sans">
                {bestModelResult?.model_name || activeExperiment.best_model}
              </h2>
              <p className="text-xs text-[#AEBEB5] mt-1 font-mono">
                Evaluated under {activeExperiment.evaluation_strategy} • Metric: {activeExperiment.primary_metric}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t md:border-t-0 md:border-l border-[#2A4E42] pt-4 md:pt-0 md:pl-6 text-xs font-mono">
            <div>
              <span className="text-[10px] uppercase text-[#AEBEB5]/70 block">Best Score</span>
              <span className="text-xl font-bold text-[#68E7B5] block">
                {calculatedBestScore !== null && calculatedBestScore !== undefined
                  ? Number(calculatedBestScore).toFixed(4)
                  : "N/A"}
              </span>
              <span className="text-[10px] text-[#AEBEB5]/70">{activeExperiment.primary_metric}</span>
            </div>

            {activeExperiment.test_metrics && (
              <div>
                <span className="text-[10px] uppercase text-[#AEBEB5]/70 block">Final Test Set</span>
                <span className="text-xl font-bold text-[#68E7B5] block">
                  {Number(activeExperiment.test_metrics[activeExperiment.primary_metric] || 0).toFixed(4)}
                </span>
                <span className="text-[10px] text-[#AEBEB5]/70">Untouched holdout</span>
              </div>
            )}

            <div>
              <span className="text-[10px] uppercase text-[#AEBEB5]/70 block">Total Duration</span>
              <span className="text-base font-bold text-[#F1EFE1] block mt-0.5">
                {formatDuration(activeExperiment.total_duration_seconds)}
              </span>
              <span className="text-[10px] text-[#AEBEB5]/70">{activeExperiment.models_evaluated.length} models tested</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Comparison Chart & Full Leaderboard Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance Bar Chart (1 Col) */}
        <div className="rounded-2xl autonexa-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-[#F1EFE1] uppercase tracking-wider font-mono">
                Model Performance Comparison
              </h3>
              <span className="text-[10px] text-[#68E7B5] font-mono">{activeExperiment.primary_metric}</span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A4E42" horizontal={false} />
                  <XAxis type="number" stroke="#AEBEB5" fontSize={10} domain={[0, "auto"]} />
                  <YAxis dataKey="name" type="category" stroke="#F1EFE1" fontSize={10} width={90} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0D1815",
                      borderColor: "#2A4E42",
                      borderRadius: "8px",
                      fontSize: "11px",
                      color: "#F1EFE1",
                    }}
                  />
                  <Bar dataKey="score" fill="#68E7B5" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-3 border-t border-[#2A4E42] text-[11px] text-[#AEBEB5]/70 font-mono">
            Metric direction: {activeExperiment.primary_metric_greater_is_better ? "Higher is better" : "Lower is better"}
          </div>
        </div>

        {/* Leaderboard Table (2 Cols) */}
        <div className="lg:col-span-2 rounded-2xl autonexa-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-[#F1EFE1] uppercase tracking-wider font-mono">
              Evaluated Candidates Table ({activeExperiment.models_evaluated.length})
            </h3>
            <span className="text-[10px] text-[#AEBEB5]/70 font-mono">Sorted by primary score</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-[#2A4E42] text-[10px] text-[#AEBEB5] uppercase tracking-wider">
                <tr>
                  <th className="pb-3 font-semibold">Rank</th>
                  <th className="pb-3 font-semibold">Model</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Score</th>
                  <th className="pb-3 font-semibold">CV Std (ddof=1)</th>
                  <th className="pb-3 font-semibold text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A4E42]/60 text-[#AEBEB5]">
                {activeExperiment.models_evaluated.map((m, idx) => {
                  const isWinner = m.model_id === activeExperiment.best_model;
                  const score =
                    m.cv_mean !== null && m.cv_mean !== undefined
                      ? m.cv_mean
                      : m.metrics[activeExperiment.primary_metric];

                  return (
                    <tr key={m.model_id} className={`hover:bg-[#162A23]/50 ${isWinner ? "bg-[#162A23]/80" : ""}`}>
                      <td className="py-3 font-bold">
                        {isWinner ? (
                          <span className="inline-flex items-center gap-1 text-[#68E7B5]">
                            <Trophy className="w-3.5 h-3.5 fill-current" />
                            #1
                          </span>
                        ) : (
                          <span className="text-[#AEBEB5]/70">#{idx + 1}</span>
                        )}
                      </td>
                      <td className="py-3 font-semibold text-[#F1EFE1]">
                        {m.model_name}
                        {isWinner && (
                          <span className="ml-2 text-[9px] px-1.5 py-0.2 rounded bg-[#162A23] text-[#68E7B5] border border-[#2A4E42] font-normal">
                            best_model.joblib
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            m.status === "successful"
                              ? "bg-[#68E7B5]/10 text-[#68E7B5] border border-[#68E7B5]/30"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="py-3 font-bold text-[#68E7B5]">
                        {score !== null && score !== undefined ? Number(score).toFixed(4) : "—"}
                      </td>
                      <td className="py-3 text-[#AEBEB5]">
                        {m.cv_std !== null && m.cv_std !== undefined ? `±${Number(m.cv_std).toFixed(4)}` : "—"}
                      </td>
                      <td className="py-3 text-right text-[#AEBEB5]">
                        {m.duration_seconds.toFixed(2)}s
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Evaluation Protocol Audit Card */}
      <div className="p-5 rounded-2xl autonexa-card space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#68E7B5]" />
          <h3 className="text-xs font-bold text-[#F1EFE1] uppercase tracking-wider font-mono">
            Scientific Evaluation Protocol & MLflow Lineage
          </h3>
        </div>
        <p className="text-xs text-[#AEBEB5] leading-relaxed font-sans">
          {activeExperiment.evaluation_protocol}
        </p>

        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[#2A4E42] text-[11px] font-mono text-[#AEBEB5]/70">
          <div>
            <span className="text-[#AEBEB5]/50">Experiment ID:</span>{" "}
            <span className="text-[#F1EFE1]">{activeExperiment.experiment_id}</span>
          </div>
          <div>
            <span className="text-[#AEBEB5]/50">Dataset SHA-256:</span>{" "}
            <span className="text-[#F1EFE1]">{activeExperiment.dataset_fingerprint.slice(0, 16)}...</span>
          </div>
          <div>
            <span className="text-[#AEBEB5]/50">MLflow Parent Run:</span>{" "}
            <span className="text-[#68E7B5]">{activeExperiment.mlflow_run_id || "Tracked locally"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
