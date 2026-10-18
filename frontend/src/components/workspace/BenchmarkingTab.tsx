"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  GitCompare,
  Trophy,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Copy,
  Check,
  Download,
  FileCode,
  Layers,
  Sparkles,
  Info,
} from "lucide-react";
import {
  BenchmarkComparisonResponse,
  TrainingResponse,
} from "@/types/api";
import { api } from "@/lib/api";
import { WorkspaceTab } from "@/lib/store";

interface BenchmarkingTabProps {
  experiments: TrainingResponse[];
  activeExperiment: TrainingResponse | null;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onSelectExperiment?: (id: string) => void;
}

export default function BenchmarkingTab({
  experiments = [],
  activeExperiment,
  onNavigateTab,
  onSelectExperiment,
}: BenchmarkingTabProps) {
  // Selected experiment IDs for comparison
  const [selectedExpIds, setSelectedExpIds] = useState<string[]>([]);
  const [baselineExpId, setBaselineExpId] = useState<string>("");
  const [sortMetric, setSortMetric] = useState<string>("");

  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLatex, setCopiedLatex] = useState(false);

  // Initialize selected experiment IDs from available experiments
  useEffect(() => {
    if (experiments.length > 0) {
      const ids = experiments.map((e) => e.experiment_id);
      setSelectedExpIds(ids);

      // Default baseline to activeExperiment or first
      if (activeExperiment && ids.includes(activeExperiment.experiment_id)) {
        setBaselineExpId(activeExperiment.experiment_id);
      } else {
        setBaselineExpId(ids[0]);
      }
    }
  }, [experiments, activeExperiment]);

  // Handle run benchmark
  const runBenchmark = useCallback(async () => {
    if (selectedExpIds.length < 1) {
      setErrorMsg("Please select at least 1 experiment to benchmark.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await api.compareBenchmarks({
        experiment_ids: selectedExpIds,
        baseline_experiment_id: baselineExpId || undefined,
        sort_metric: sortMetric || undefined,
      });
      setBenchmarkResult(res);
    } catch (err) {
      console.error("Benchmark comparison failed:", err);
      const msg =
        (err as { detail?: string; message?: string })?.detail ||
        (err as { message?: string })?.message ||
        "Failed to run comparative research benchmark.";
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  }, [selectedExpIds, baselineExpId, sortMetric]);

  // Auto-run if experiments available and not yet loaded
  useEffect(() => {
    if (experiments.length >= 1 && !benchmarkResult && !isLoading) {
      runBenchmark();
    }
  }, [experiments.length, benchmarkResult, isLoading, runBenchmark]);

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedExpIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedExpIds(experiments.map((e) => e.experiment_id));
  };

  const deselectAll = () => {
    setSelectedExpIds([]);
  };

  // Generate LaTeX table code for research publication
  const generateLatex = () => {
    if (!benchmarkResult) return "";

    const lines = [
      "% AutoNexa Research Benchmark Table (Generated for LaTeX / NeurIPS / ICML)",
      "\\begin{table}[htbp]",
      "\\centering",
      "\\small",
      "\\begin{tabular}{lcccc}",
      "\\toprule",
      `Model & Primary Metric (${benchmarkResult.sort_metric}) & $\\Delta$ Baseline & Status & Duration (s) \\\\`,
      "\\midrule",
    ];

    benchmarkResult.leaderboard.forEach((entry) => {
      const score = entry.primary_metric_score !== null && entry.primary_metric_score !== undefined
        ? entry.primary_metric_score.toFixed(4)
        : "N/A";

      let deltaStr = "--";
      if (entry.is_baseline) {
        deltaStr = "\\textbf{Baseline}";
      } else if (entry.delta_primary_metric !== null && entry.delta_primary_metric !== undefined) {
        const sign = entry.delta_primary_metric >= 0 ? "+" : "";
        deltaStr = `${sign}${entry.delta_primary_metric.toFixed(4)} (${sign}${(entry.delta_percentage || 0).toFixed(1)}\\%)`;
      }

      const dur = entry.training_duration_seconds ? entry.training_duration_seconds.toFixed(2) : "0.00";
      lines.push(`${entry.model_name} & ${score} & ${deltaStr} & ${entry.is_baseline ? "Baseline" : "Competitor"} & ${dur} \\\\`);
    });

    lines.push("\\bottomrule");
    lines.push("\\end{tabular}");
    lines.push(`\\caption{Empirical model benchmarking against baseline on dataset fingerprint ${benchmarkResult.leaderboard[0]?.dataset_fingerprint?.slice(0, 10)}...}`);
    lines.push("\\label{tab:autonexa_benchmarks}");
    lines.push("\\end{table}");

    return lines.join("\n");
  };

  const handleCopyLatex = () => {
    const code = generateLatex();
    navigator.clipboard.writeText(code);
    setCopiedLatex(true);
    setTimeout(() => setCopiedLatex(false), 2000);
  };

  const handleDownloadJson = () => {
    if (!benchmarkResult) return;
    const blob = new Blob([JSON.stringify(benchmarkResult, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autonexa_benchmark_${benchmarkResult.benchmark_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (experiments.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
        <GitCompare className="w-10 h-10 text-[#1D4ED8] mx-auto opacity-80" />
        <h3 className="text-lg font-bold text-[#0F172A]">No Experiments to Benchmark</h3>
        <p className="text-xs text-[#64748B] max-w-sm mx-auto font-sans leading-relaxed">
          Train two or more AutoML models to unlock reproducible research benchmarking, comparability verification, baseline delta analysis, and LaTeX table export.
        </p>
        <button
          onClick={() => onNavigateTab("training")}
          className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
        >
          <span>Go to AutoML Studio</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
              <GitCompare className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-[#0F172A] tracking-tight">
                Reproducible Research Benchmarking
              </h1>
              <p className="text-xs text-[#64748B] font-sans">
                Rigorous Comparability Auditing, Baseline Metric Deltas, and Publication Lineage
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyLatex}
              disabled={!benchmarkResult}
              className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors disabled:opacity-50"
            >
              {copiedLatex ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <FileCode className="w-3.5 h-3.5 text-[#1D4ED8]" />}
              <span>{copiedLatex ? "Copied LaTeX!" : "LaTeX Table"}</span>
            </button>

            <button
              onClick={handleDownloadJson}
              disabled={!benchmarkResult}
              className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={runBenchmark}
              disabled={isLoading}
              className="px-3.5 py-1.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-[#94A3B8] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>{isLoading ? "Auditing..." : "Run Benchmark"}</span>
            </button>
          </div>
        </div>

        {/* Experiment Selector Bar */}
        <div className="mt-5 pt-4 border-t border-[#E2E8F0] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#0F172A]">Compare Experiments:</span>
              <button
                onClick={selectAll}
                className="text-[11px] text-[#1D4ED8] hover:underline font-mono cursor-pointer"
              >
                Select All
              </button>
              <span className="text-[#CBD5E1]">&middot;</span>
              <button
                onClick={deselectAll}
                className="text-[11px] text-[#64748B] hover:underline font-mono cursor-pointer"
              >
                Clear
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#64748B] font-mono">Reference Baseline:</span>
                <select
                  value={baselineExpId}
                  onChange={(e) => setBaselineExpId(e.target.value)}
                  className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2 py-1 text-xs text-[#0F172A] font-mono cursor-pointer"
                >
                  <option value="">Default (First Selected)</option>
                  {experiments.map((exp) => (
                    <option key={exp.experiment_id} value={exp.experiment_id}>
                      {exp.best_model} ({exp.experiment_id.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Chips list of experiments */}
          <div className="flex flex-wrap gap-2">
            {experiments.map((exp) => {
              const isSelected = selectedExpIds.includes(exp.experiment_id);
              const isBaseline = baselineExpId === exp.experiment_id;

              return (
                <button
                  key={exp.experiment_id}
                  onClick={() => toggleSelect(exp.experiment_id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all border cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8] font-semibold shadow-xs"
                      : "bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // handled by parent button
                    className="rounded text-[#1D4ED8] focus:ring-0 cursor-pointer pointer-events-none"
                  />
                  <span>{exp.best_model}</span>
                  {isBaseline && (
                    <span className="px-1.5 py-0.2 rounded bg-[#1D4ED8] text-white text-[9px] uppercase font-mono">
                      Base
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* BENCHMARK RESULTS */}
      {benchmarkResult && (
        <div className="space-y-6">
          {/* Comparability Verdict Banner */}
          <div
            className={`p-5 rounded-2xl border shadow-xs space-y-2 ${
              benchmarkResult.comparability_verdict === "strictly_comparable"
                ? "bg-[#DCFCE7]/70 border-[#86EFAC] text-[#14532D]"
                : benchmarkResult.comparability_verdict === "conditionally_comparable"
                ? "bg-[#FEF3C7]/70 border-[#FDE68A] text-[#78350F]"
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {benchmarkResult.comparability_verdict === "strictly_comparable" ? (
                  <ShieldCheck className="w-5 h-5 text-[#15803D]" />
                ) : benchmarkResult.comparability_verdict === "conditionally_comparable" ? (
                  <AlertTriangle className="w-5 h-5 text-[#D97706]" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                )}

                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    {benchmarkResult.comparability_verdict === "strictly_comparable"
                      ? "Strictly Comparable Benchmark Protocol (Academic Grade)"
                      : benchmarkResult.comparability_verdict === "conditionally_comparable"
                      ? "Conditionally Comparable Benchmark (Protocol Discrepancies Noted)"
                      : "Non-Comparable Benchmark (Protocol Invalidation)"}
                  </h3>
                  <p className="text-xs opacity-90 font-sans mt-0.5">
                    {benchmarkResult.scientific_guidance}
                  </p>
                </div>
              </div>

              <span
                className={`text-[10px] uppercase font-mono font-bold px-2.5 py-1 rounded-full border ${
                  benchmarkResult.comparability_verdict === "strictly_comparable"
                    ? "bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]"
                    : benchmarkResult.comparability_verdict === "conditionally_comparable"
                    ? "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]"
                    : "bg-rose-100 text-rose-800 border-rose-300"
                }`}
              >
                {benchmarkResult.comparability_verdict.replace("_", " ")}
              </span>
            </div>

            {/* Warnings list if any */}
            {benchmarkResult.comparability_warnings.length > 0 && (
              <div className="mt-3 pt-3 border-t border-current/15 space-y-1.5 text-xs font-mono">
                {benchmarkResult.comparability_warnings.map((w, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="font-bold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-black/10">
                      {w.dimension} &middot; {w.severity}
                    </span>
                    <span className="leading-tight">{w.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Benchmark Leaderboard Table */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">Comparative Performance Leaderboard</h3>
                <p className="text-[11px] text-[#64748B]">
                  Ranked by primary metric: <span className="font-mono text-[#1D4ED8] font-bold">{benchmarkResult.sort_metric}</span> (higher is {benchmarkResult.sort_metric_greater_is_better ? "better" : "worse"})
                </p>
              </div>

              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] font-mono">
                {benchmarkResult.models_compared_count} Models Evaluated
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] text-[#64748B] font-mono uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3">Task / Target</th>
                    <th className="py-2.5 px-3 text-right">Score ({benchmarkResult.sort_metric})</th>
                    <th className="py-2.5 px-3 text-right">&Delta; vs Baseline</th>
                    <th className="py-2.5 px-3 text-right">Train Time</th>
                    <th className="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {benchmarkResult.leaderboard.map((item) => {
                    const isWinner = item.rank === 1;
                    const isBaseline = item.is_baseline;

                    return (
                      <tr
                        key={item.experiment_id}
                        className={`hover:bg-[#F8FAFC] transition-colors ${
                          isWinner ? "bg-[#EFF6FF]/40 font-semibold" : ""
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-3 px-3 font-bold font-mono">
                          {isWinner ? (
                            <span className="inline-flex items-center gap-1 text-[#1D4ED8]">
                              <Trophy className="w-3.5 h-3.5 fill-current" />
                              #1
                            </span>
                          ) : (
                            <span className="text-[#64748B]">#{item.rank}</span>
                          )}
                        </td>

                        {/* Model Name */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[#0F172A]">{item.model_name}</span>
                            {isBaseline && (
                              <span className="px-2 py-0.5 rounded-full bg-[#1D4ED8] text-white text-[9px] font-mono uppercase">
                                Baseline
                              </span>
                            )}
                            {isWinner && !isBaseline && (
                              <span className="px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC] text-[9px] font-mono uppercase">
                                Best
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#64748B] font-mono mt-0.5">
                            ID: {item.experiment_id.slice(0, 8)}... &middot; SHA: {item.dataset_fingerprint.slice(0, 8)}...
                          </div>
                        </td>

                        {/* Task / Target */}
                        <td className="py-3 px-3 font-mono text-[11px] text-[#64748B]">
                          <span className="capitalize">{item.task_type}</span> &middot;{" "}
                          <b className="text-[#0F172A]">{item.target_column}</b>
                        </td>

                        {/* Score */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-sm text-[#0F172A]">
                          {item.primary_metric_score !== null && item.primary_metric_score !== undefined
                            ? Number(item.primary_metric_score).toFixed(4)
                            : "—"}
                        </td>

                        {/* Delta vs Baseline */}
                        <td className="py-3 px-3 text-right font-mono">
                          {isBaseline ? (
                            <span className="text-[#94A3B8] text-[11px]">Reference</span>
                          ) : item.delta_primary_metric !== null && item.delta_primary_metric !== undefined ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[11px] ${
                                item.delta_primary_metric >= 0
                                  ? "bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}
                            >
                              {item.delta_primary_metric >= 0 ? `+${item.delta_primary_metric.toFixed(4)}` : item.delta_primary_metric.toFixed(4)}
                              {item.delta_percentage !== null && item.delta_percentage !== undefined && (
                                <span className="opacity-80 text-[10px]">
                                  ({item.delta_percentage >= 0 ? `+${item.delta_percentage.toFixed(1)}%` : `${item.delta_percentage.toFixed(1)}%`})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[#94A3B8]">—</span>
                          )}
                        </td>

                        {/* Training Time */}
                        <td className="py-3 px-3 text-right font-mono text-[#64748B]">
                          {item.training_duration_seconds ? `${item.training_duration_seconds.toFixed(2)}s` : "—"}
                        </td>

                        {/* Action Link */}
                        <td className="py-3 px-3">
                          <button
                            onClick={() => {
                              if (onSelectExperiment) onSelectExperiment(item.experiment_id);
                              onNavigateTab("explainability");
                            }}
                            className="text-[#1D4ED8] hover:underline font-mono text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <span>Explain</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reproducibility Manifest Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#1D4ED8]" />
              <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono">
                Reproducibility &amp; Lineage Manifest
              </h3>
            </div>
            <p className="text-xs text-[#64748B] font-sans">
              Scientific parameters captured for exact artifact replication and independent peer review.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <span className="text-[10px] text-[#64748B] uppercase block">Benchmark ID</span>
                <span className="font-bold text-[#0F172A] truncate block" title={benchmarkResult.benchmark_id}>
                  {benchmarkResult.benchmark_id}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <span className="text-[10px] text-[#64748B] uppercase block">Sort Metric Strategy</span>
                <span className="font-bold text-[#1D4ED8] block">
                  {benchmarkResult.sort_metric} ({benchmarkResult.sort_metric_greater_is_better ? "Greater Better" : "Lower Better"})
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <span className="text-[10px] text-[#64748B] uppercase block">Base Experiment</span>
                <span className="font-bold text-[#0F172A] truncate block">
                  {benchmarkResult.baseline_experiment_id?.slice(0, 12) || "Default Top Model"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <span className="text-[10px] text-[#64748B] uppercase block">Audit Status</span>
                <span className="font-bold text-[#15803D] block">
                  {benchmarkResult.is_strictly_comparable ? "Validated Identical Data" : "Cross-Protocol Audit"}
                </span>
              </div>
            </div>

            {/* Structured manifest JSON inspect */}
            <div className="p-3 rounded-xl bg-[#0F172A] text-[#E2E8F0] font-mono text-[11px] overflow-x-auto max-h-48 overflow-y-auto">
              <pre>{JSON.stringify(benchmarkResult.reproducibility_manifest, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
