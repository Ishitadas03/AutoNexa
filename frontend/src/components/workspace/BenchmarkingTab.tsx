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
  Activity,
  Cpu,
  Clock,
  BarChart3,
  Database,
  Zap,
  Sliders,
  TrendingUp,
  Target,
  Scale,
  XCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  Cell,
  ZAxis,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  BenchmarkComparisonResponse,
  TrainingResponse,
  RepeatedRunGroupResponse,
  BaselineComparisonResult,
  RepeatedRunRequest,
  HPOExperimentResponse,
  HPOExperimentRequest,
  HyperparameterSpace,
  HPOTrialRecord,
  MultiObjectiveExperimentRequest,
  MultiObjectiveExperimentResponse,
  MultiObjectiveSelectionRequest,
  MultiObjectiveSelectionResult,
  ParetoCandidateResult,
  SelectionPolicy,
  DatasetCatalogEntry,
  RobustBenchmarkRequest,
  RobustBenchmarkResponse,
  PairedComparisonResult,
  MethodAggregateStatistics,
  SeedRunRecord,
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
  // Navigation sub-tabs within Benchmarking
  const [subTab, setSubTab] = useState<"comparison" | "repeated_runs" | "baselines" | "hpo_search" | "multi_objective" | "robust">("comparison");

  // Phase 11: Robust Benchmarking State
  const [catalogEntries, setCatalogEntries] = useState<DatasetCatalogEntry[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [robustDatasetId, setRobustDatasetId] = useState<string>("wine_multiclass");
  const [robustSeedCount, setRobustSeedCount] = useState<number>(5);
  const [robustCandidates, setRobustCandidates] = useState<string[]>([
    "decision_tree",
    "random_forest",
    "hist_gradient_boosting",
  ]);
  const [robustBaseline, setRobustBaseline] = useState<string>("decision_tree");
  const [robustCvFolds, setRobustCvFolds] = useState<number>(3);
  const [robustResult, setRobustResult] = useState<RobustBenchmarkResponse | null>(null);
  const [isRobustLoading, setIsRobustLoading] = useState(false);
  const [robustError, setRobustError] = useState<string | null>(null);

  // Multi-Model comparison state
  const [selectedExpIds, setSelectedExpIds] = useState<string[]>([]);
  const [baselineExpId, setBaselineExpId] = useState<string>("");
  const [sortMetric, setSortMetric] = useState<string>("");
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLatex, setCopiedLatex] = useState(false);

  // Phase 9: Repeated Runs state
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [seedCount, setSeedCount] = useState<number>(3);
  const [fixedSplit, setFixedSplit] = useState<boolean>(false);
  const [primaryMetricOverride, setPrimaryMetricOverride] = useState<string>("");
  const [bootstrapResamples, setBootstrapResamples] = useState<number>(1000);
  const [repeatedRunsResult, setRepeatedRunsResult] = useState<RepeatedRunGroupResponse | null>(null);
  const [isRepeatedLoading, setIsRepeatedLoading] = useState(false);
  const [repeatedError, setRepeatedError] = useState<string | null>(null);
  const [copiedRepeatedLatex, setCopiedRepeatedLatex] = useState(false);

  // Phase 9: Baseline Comparison state
  const [selectedBaselineExpId, setSelectedBaselineExpId] = useState<string>("");
  const [baselineResults, setBaselineResults] = useState<BaselineComparisonResult[] | null>(null);
  const [isBaselineLoading, setIsBaselineLoading] = useState(false);
  const [baselineError, setBaselineError] = useState<string | null>(null);

  // Phase 10A: Controlled HPO Search state
  const [hpoDatasetId, setHpoDatasetId] = useState<string>("");
  const [hpoTargetCol, setHpoTargetCol] = useState<string>("");
  const [hpoModelId, setHpoModelId] = useState<string>("random_forest");
  const [hpoTrialBudget, setHpoTrialBudget] = useState<number>(20);
  const [hpoSeedsStr, setHpoSeedsStr] = useState<string>("42, 123, 456");
  const [hpoEvalStrategy, setHpoEvalStrategy] = useState<"cross_validation" | "holdout">("cross_validation");
  const [hpoCvFolds, setHpoCvFolds] = useState<number>(3);
  const [hpoResult, setHpoResult] = useState<HPOExperimentResponse | null>(null);
  const [isHpoLoading, setIsHpoLoading] = useState(false);
  const [hpoError, setHpoError] = useState<string | null>(null);
  const [hpoTrialFilter, setHpoTrialFilter] = useState<"all" | "random_search" | "bayesian_optimization">("all");

  // Phase 10B: Multi-Objective & Resource-Aware Selection state
  const [moDatasetId, setMoDatasetId] = useState<string>("");
  const [moTargetCol, setMoTargetCol] = useState<string>("");
  const [moTaskType, setMoTaskType] = useState<string>("classification");
  const [moIncludeHpo, setMoIncludeHpo] = useState<boolean>(true);
  const [moCvFolds, setMoCvFolds] = useState<number>(3);
  const [moTestSize, setMoTestSize] = useState<number>(0.2);
  const [moPrimaryMetric, setMoPrimaryMetric] = useState<string>("");
  const [moRandomState, setMoRandomState] = useState<number>(42);
  // Resource budget constraints
  const [moMaxLatency, setMoMaxLatency] = useState<string>("");
  const [moMaxTrainingTime, setMoMaxTrainingTime] = useState<string>("");
  const [moMaxArtifactSize, setMoMaxArtifactSize] = useState<string>("");
  const [moMinScore, setMoMinScore] = useState<string>("");
  const [moMaxComplexity, setMoMaxComplexity] = useState<string>("");
  const [moSelectionPolicy, setMoSelectionPolicy] = useState<SelectionPolicy>("best_performance_constrained");
  // Multi-Objective Results and visualization axes
  const [moResult, setMoResult] = useState<MultiObjectiveExperimentResponse | null>(null);
  const [isMoLoading, setIsMoLoading] = useState<boolean>(false);
  const [moError, setMoError] = useState<string | null>(null);
  const [isReSelecting, setIsReSelecting] = useState<boolean>(false);
  const [paretoXAxis, setParetoXAxis] = useState<string>("inference_latency_ms");
  const [paretoYAxis, setParetoYAxis] = useState<string>("predictive_metric");
  const [candidateFilter, setCandidateFilter] = useState<"all" | "pareto" | "feasible" | "infeasible">("all");

  // Initialize selected experiment IDs from available experiments
  useEffect(() => {
    if (experiments.length > 0) {
      const ids = experiments.map((e) => e.experiment_id);
      setSelectedExpIds(ids);

      // Default baseline to activeExperiment or first
      if (activeExperiment && ids.includes(activeExperiment.experiment_id)) {
        setBaselineExpId(activeExperiment.experiment_id);
        setSelectedBaselineExpId(activeExperiment.experiment_id);
      } else {
        setBaselineExpId(ids[0]);
        setSelectedBaselineExpId(ids[0]);
      }

      if (!selectedDatasetId) {
        setSelectedDatasetId(activeExperiment?.dataset_id || experiments[0].dataset_id);
      }
      if (!hpoDatasetId) {
        setHpoDatasetId(activeExperiment?.dataset_id || experiments[0].dataset_id);
      }
      if (!hpoTargetCol) {
        setHpoTargetCol(activeExperiment?.target_column || "churn");
      }
      if (!moDatasetId) {
        setMoDatasetId(activeExperiment?.dataset_id || experiments[0].dataset_id);
      }
      if (!moTargetCol) {
        setMoTargetCol(activeExperiment?.target_column || "churn");
      }
      if (activeExperiment?.task_type) {
        setMoTaskType(activeExperiment.task_type.includes("regression") ? "regression" : "classification");
      }
    }
  }, [experiments, activeExperiment, selectedDatasetId, hpoDatasetId, hpoTargetCol, moDatasetId, moTargetCol]);


  // Handle run controlled HPO experiment
  const handleRunHpo = async () => {
    const dsId = hpoDatasetId || activeExperiment?.dataset_id || experiments[0]?.dataset_id;
    const tgt = hpoTargetCol || activeExperiment?.target_column || "target";
    if (!dsId) {
      setHpoError("Please select a valid dataset.");
      return;
    }
    const seeds = hpoSeedsStr
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (seeds.length === 0) {
      setHpoError("Please provide at least one valid integer seed.");
      return;
    }

    setIsHpoLoading(true);
    setHpoError(null);

    try {
      const res = await api.runHpoExperiment({
        dataset_id: dsId,
        target_column: tgt,
        model_id: hpoModelId,
        trial_budget: hpoTrialBudget,
        seeds,
        evaluation_strategy: hpoEvalStrategy,
        cv_folds: hpoCvFolds,
        test_size: 0.2,
      });
      setHpoResult(res);
    } catch (err: unknown) {
      console.error("HPO experiment failed:", err);
      const e = err as { detail?: string; message?: string };
      const msg = e?.detail || e?.message || "Failed to execute HPO experiment.";
      setHpoError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsHpoLoading(false);
    }
  };

  const handleLoadPrecomputedHpo = async (expId: string) => {
    setIsHpoLoading(true);
    setHpoError(null);
    try {
      const res = await api.getHpoExperiment(expId);
      setHpoResult(res);
    } catch (err: unknown) {
      const e = err as { detail?: string; message?: string };
      setHpoError(e?.detail || e?.message || "Failed to load precomputed experiment.");
    } finally {
      setIsHpoLoading(false);
    }
  };

  // Prepare convergence curve data for Recharts LineChart
  const convergenceChartData = useMemo(() => {
    if (!hpoResult) return [];
    const rCurve = hpoResult.random_search_summary.mean_convergence_curve || [];
    const bCurve = hpoResult.bayesian_summary.mean_convergence_curve || [];
    const maxLen = Math.max(rCurve.length, bCurve.length);
    return Array.from({ length: maxLen }, (_, i) => ({
      trial: i + 1,
      random_search: rCurve[i] ?? null,
      bayesian_optimization: bCurve[i] ?? null,
    }));
  }, [hpoResult]);

  // Handle Run Multi-Objective Optimization
  const handleRunMultiObjective = async () => {
    const dsId = moDatasetId || activeExperiment?.dataset_id || experiments[0]?.dataset_id;
    const tgt = moTargetCol || activeExperiment?.target_column || "target";
    if (!dsId) {
      setMoError("Please select a valid dataset.");
      return;
    }

    setIsMoLoading(true);
    setMoError(null);

    const constraints: any = {};
    if (moMaxLatency) constraints.max_inference_latency_ms = parseFloat(moMaxLatency);
    if (moMaxTrainingTime) constraints.max_training_duration_seconds = parseFloat(moMaxTrainingTime);
    if (moMaxArtifactSize) constraints.max_artifact_size_bytes = parseInt(moMaxArtifactSize, 10);
    if (moMinScore) constraints.min_predictive_score = parseFloat(moMinScore);
    if (moMaxComplexity) constraints.max_complexity = parseFloat(moMaxComplexity);

    const payload: MultiObjectiveExperimentRequest = {
      dataset_id: dsId,
      target_column: tgt,
      task_type: moTaskType,
      include_hpo_candidates: moIncludeHpo,
      evaluation_strategy: "cross_validation",
      cv_folds: moCvFolds,
      test_size: moTestSize,
      primary_metric: moPrimaryMetric || undefined,
      random_state: moRandomState,
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
      selection_policy: moSelectionPolicy,
    };

    try {
      const res = await api.runMultiObjectiveExperiment(payload);
      setMoResult(res);
    } catch (err: unknown) {
      console.error("Multi-objective experiment failed:", err);
      const e = err as { detail?: string; message?: string };
      const msg = e?.detail || e?.message || "Failed to run multi-objective optimization.";
      setMoError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsMoLoading(false);
    }
  };

  // Handle Dynamic Re-selection under new policy / constraints
  const handleReSelectModel = async () => {
    if (!moResult) return;
    setIsReSelecting(true);
    setMoError(null);

    const constraints: any = {};
    if (moMaxLatency) constraints.max_inference_latency_ms = parseFloat(moMaxLatency);
    if (moMaxTrainingTime) constraints.max_training_duration_seconds = parseFloat(moMaxTrainingTime);
    if (moMaxArtifactSize) constraints.max_artifact_size_bytes = parseInt(moMaxArtifactSize, 10);
    if (moMinScore) constraints.min_predictive_score = parseFloat(moMinScore);
    if (moMaxComplexity) constraints.max_complexity = parseFloat(moMaxComplexity);

    const payload: MultiObjectiveSelectionRequest = {
      policy: moSelectionPolicy,
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
    };

    try {
      const res = await api.selectMultiObjectiveModel(moResult.experiment_id, payload);
      setMoResult((prev) => (prev ? { ...prev, selection: res } : null));
    } catch (err: unknown) {
      console.error("Re-selection failed:", err);
      const e = err as { detail?: string; message?: string };
      const msg = e?.detail || e?.message || "Failed to re-evaluate model selection.";
      setMoError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsReSelecting(false);
    }
  };

  // Phase 11: Load Benchmark Dataset Catalog
  useEffect(() => {
    if (subTab === "robust" && catalogEntries.length === 0 && !isCatalogLoading) {
      setIsCatalogLoading(true);
      api
        .getBenchmarkDatasetCatalog()
        .then((entries) => {
          setCatalogEntries(entries);
          if (entries.length > 0 && !entries.some((e) => e.dataset_id === robustDatasetId)) {
            setRobustDatasetId(entries[0].dataset_id);
          }
        })
        .catch((err) => console.error("Failed to load dataset catalog:", err))
        .finally(() => setIsCatalogLoading(false));
    }
  }, [subTab, catalogEntries.length, isCatalogLoading, robustDatasetId]);

  const selectedCatalogEntry = useMemo(() => {
    return catalogEntries.find((c) => c.dataset_id === robustDatasetId) || null;
  }, [catalogEntries, robustDatasetId]);

  // Phase 11: Execute Robust Multi-Seed Benchmark
  const handleRunRobustBenchmark = async () => {
    if (!robustDatasetId) {
      setRobustError("Please select a benchmark dataset from the catalog.");
      return;
    }
    setIsRobustLoading(true);
    setRobustError(null);

    const baseSeeds = [42, 123, 456, 789, 1011, 1213, 1415, 1617, 1819, 2021];
    const seeds = baseSeeds.slice(0, Math.max(2, Math.min(robustSeedCount, 10)));

    const payload: RobustBenchmarkRequest = {
      dataset_id: robustDatasetId,
      seeds,
      candidate_strategies: robustCandidates.length > 0 ? robustCandidates : undefined,
      baseline_strategy: robustBaseline || undefined,
      cv_folds: robustCvFolds,
      test_size: 0.2,
      alpha: 0.05,
      bootstrap_resamples: 1000,
    };

    try {
      const res = await api.runRobustBenchmark(payload);
      setRobustResult(res);
    } catch (err: unknown) {
      console.error("Robust benchmark failed:", err);
      const e = err as { detail?: string; message?: string };
      const msg = e?.detail || e?.message || "Failed to execute robust benchmark.";
      setRobustError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setIsRobustLoading(false);
    }
  };

  // Memoized Pareto scatter plot data for Recharts ScatterChart
  const paretoScatterData = useMemo(() => {
    if (!moResult) return [];
    return moResult.candidates.map((c) => {
      const m = c.measurement;
      let xVal = 0;
      let yVal = 0;

      // Extract X value
      if (paretoXAxis === "inference_latency_ms") xVal = m.inference_latency_ms_per_sample;
      else if (paretoXAxis === "training_duration_seconds") xVal = m.training_duration_seconds;
      else if (paretoXAxis === "artifact_size_bytes") xVal = Math.round(m.model_artifact_size_bytes / 1024);
      else if (paretoXAxis === "model_complexity") xVal = m.complexity.summary_complexity_score;

      // Extract Y value
      if (paretoYAxis === "predictive_metric") yVal = m.validation_score ?? 0;
      else if (paretoYAxis === "inference_latency_ms") yVal = m.inference_latency_ms_per_sample;
      else if (paretoYAxis === "model_complexity") yVal = m.complexity.summary_complexity_score;

      return {
        candidate_id: m.candidate_id,
        model_name: m.model_name,
        x: xVal,
        y: yVal,
        is_pareto_optimal: c.is_pareto_optimal,
        is_feasible: c.is_feasible,
        status: m.status,
        validation_score: m.validation_score,
        latency_ms: m.inference_latency_ms_per_sample,
        artifact_kb: Math.round(m.model_artifact_size_bytes / 1024),
        complexity: m.complexity.summary_complexity_score,
        complexity_unit: m.complexity.complexity_unit,
        violations_count: c.constraint_violations.length,
        dominated_by_count: c.dominated_by.length,
      };
    });
  }, [moResult, paretoXAxis, paretoYAxis]);


  // Handle run multi-model benchmark
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

  // Execute Phase 9 Repeated-Seed Series
  const runRepeatedEvaluation = async () => {
    const targetExp = experiments.find((e) => e.dataset_id === selectedDatasetId) || experiments[0];
    if (!targetExp) {
      setRepeatedError("No trained experiment available for dataset.");
      return;
    }

    setIsRepeatedLoading(true);
    setRepeatedError(null);

    // Generate deterministic seed array
    const baseSeeds = [42, 101, 202, 303, 404, 505, 606, 707, 808, 909];
    const seeds = baseSeeds.slice(0, Math.max(2, Math.min(seedCount, 10)));

    const payload: RepeatedRunRequest = {
      dataset_id: targetExp.dataset_id,
      target_column: targetExp.target_column,
      task_type: targetExp.task_type.includes("classification") ? "classification" : "regression",
      seeds,
      primary_metric: primaryMetricOverride || targetExp.primary_metric,
      fixed_split: fixedSplit,
      bootstrap_resamples: bootstrapResamples,
    };

    try {
      const res = await api.runRepeatedRuns(payload);
      setRepeatedRunsResult(res);
    } catch (err) {
      console.error("Repeated runs execution failed:", err);
      const msg =
        (err as { detail?: string; message?: string })?.detail ||
        (err as { message?: string })?.message ||
        "Failed to execute repeated-seed experimental series.";
      setRepeatedError(msg);
    } finally {
      setIsRepeatedLoading(false);
    }
  };

  // Execute Phase 9 Baseline Comparison
  const runBaselineAudit = async () => {
    if (!selectedBaselineExpId) {
      setBaselineError("Please select a trained experiment to compare against baselines.");
      return;
    }

    setIsBaselineLoading(true);
    setBaselineError(null);

    try {
      const res = await api.compareBaselines({
        experiment_id: selectedBaselineExpId,
      });
      setBaselineResults(res);
    } catch (err) {
      console.error("Baseline comparison failed:", err);
      const msg =
        (err as { detail?: string; message?: string })?.detail ||
        (err as { message?: string })?.message ||
        "Failed to evaluate canonical baselines.";
      setBaselineError(msg);
    } finally {
      setIsBaselineLoading(false);
    }
  };

  // Toggle selection for comparison
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

  // Generate LaTeX table code for Phase 8 multi-model benchmark
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

  const handleCopyRepeatedLatex = async () => {
    if (!repeatedRunsResult) return;
    try {
      const res = await api.getRepeatedRunsLatex(repeatedRunsResult.run_group_id);
      navigator.clipboard.writeText(res.latex);
      setCopiedRepeatedLatex(true);
      setTimeout(() => setCopiedRepeatedLatex(false), 2000);
    } catch (err) {
      console.error("Failed to copy repeated LaTeX:", err);
    }
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

  const handleDownloadRepeatedJson = () => {
    if (!repeatedRunsResult) return;
    const blob = new Blob([JSON.stringify(repeatedRunsResult, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repeated_runs_${repeatedRunsResult.run_group_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (experiments.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
        <GitCompare className="w-10 h-10 text-[#1D4ED8] mx-auto opacity-80" />
        <h3 className="text-lg font-bold text-[#0F172A]">No Experiments to Benchmark</h3>
        <p className="text-xs text-[#64748B] max-w-sm mx-auto font-sans leading-relaxed">
          Train an AutoML model to unlock research-grade validation, repeated-seed variance analysis, canonical baseline audits, and academic LaTeX exports.
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
                Research-Grade Experimental Validation &amp; Benchmarking
              </h1>
              <p className="text-xs text-[#64748B] font-sans">
                Repeated-Seed Variance &middot; Bessel-Corrected Statistics &middot; Bootstrap 95% CIs &middot; Canonical Baselines &middot; Inference Profiling
              </p>
            </div>
          </div>

          {/* Sub-Tab Navigation Switcher */}
          <div className="flex items-center bg-[#F1F5F9] p-1 rounded-xl border border-[#CBD5E1]">
            <button
              onClick={() => setSubTab("comparison")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                subTab === "comparison"
                  ? "bg-white text-[#1D4ED8] shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              Multi-Model Audit
            </button>
            <button
              onClick={() => setSubTab("repeated_runs")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                subTab === "repeated_runs"
                  ? "bg-white text-[#1D4ED8] shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-[#1D4ED8]" />
              Repeated Seeds
            </button>
            <button
              onClick={() => setSubTab("baselines")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                subTab === "baselines"
                  ? "bg-white text-[#1D4ED8] shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-[#D97706]" />
              Baselines &amp; Latency
            </button>
            <button
              onClick={() => setSubTab("hpo_search")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                subTab === "hpo_search"
                  ? "bg-white text-[#1D4ED8] shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-[#2563EB]" />
              HPO: Random vs Bayesian
            </button>
            <button
              onClick={() => setSubTab("multi_objective")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                subTab === "multi_objective"
                  ? "bg-white text-[#1D4ED8] shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <Target className="w-3.5 h-3.5 text-[#1D4ED8]" />
              Multi-Objective &amp; Pareto
            </button>
            <button
              onClick={() => setSubTab("robust")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                subTab === "robust"
                  ? "bg-white text-[#1D4ED8] shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-[#059669]" />
              Robust Benchmarks
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: MULTI-MODEL AUDIT (PHASE 8 RETAINED)                            */}
      {/* ========================================================================= */}
      {subTab === "comparison" && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#0F172A]">Select Models:</span>
              <button onClick={selectAll} className="text-[11px] text-[#1D4ED8] hover:underline font-mono cursor-pointer">
                Select All
              </button>
              <span className="text-[#CBD5E1]">&middot;</span>
              <button onClick={deselectAll} className="text-[11px] text-[#64748B] hover:underline font-mono cursor-pointer">
                Clear
              </button>
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
                <span>{isLoading ? "Auditing..." : "Re-Run Benchmark"}</span>
              </button>
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
                    onChange={() => {}}
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

              {/* Leaderboard Table */}
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

                            <td className="py-3 px-3 font-mono text-[11px] text-[#64748B]">
                              <span className="capitalize">{item.task_type}</span> &middot;{" "}
                              <b className="text-[#0F172A]">{item.target_column}</b>
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-sm text-[#0F172A]">
                              {item.primary_metric_score !== null && item.primary_metric_score !== undefined
                                ? Number(item.primary_metric_score).toFixed(4)
                                : "—"}
                            </td>

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

                            <td className="py-3 px-3 text-right font-mono text-[#64748B]">
                              {item.training_duration_seconds ? `${item.training_duration_seconds.toFixed(2)}s` : "—"}
                            </td>

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
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: PHASE 9 REPEATED-SEED EXPERIMENTAL SERIES                       */}
      {/* ========================================================================= */}
      {subTab === "repeated_runs" && (
        <div className="space-y-6">
          {/* Configuration Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#1D4ED8]" />
                  Configure Repeated-Seed Evaluation Series
                </h3>
                <p className="text-xs text-[#64748B] font-sans mt-0.5">
                  Evaluates AutoML stability across 2 to 10 independent random seeds, computing Bessel-corrected sample standard deviations and 95% non-parametric bootstrap confidence bounds.
                </p>
              </div>

              <button
                onClick={runRepeatedEvaluation}
                disabled={isRepeatedLoading}
                className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-[#94A3B8] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs transition-colors shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRepeatedLoading ? "animate-spin" : ""}`} />
                <span>{isRepeatedLoading ? "Executing Series..." : "Start Repeated Series"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-[#E2E8F0] text-xs">
              <div>
                <label className="font-mono text-[#64748B] text-[11px] uppercase block mb-1">
                  Random Replicates (Seeds)
                </label>
                <select
                  value={seedCount}
                  onChange={(e) => setSeedCount(Number(e.target.value))}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#0F172A] font-mono cursor-pointer"
                >
                  <option value={2}>2 Seeds (Fast Check)</option>
                  <option value={3}>3 Seeds (Standard)</option>
                  <option value={5}>5 Seeds (Academic Protocol)</option>
                  <option value={10}>10 Seeds (Maximum Rigor)</option>
                </select>
              </div>

              <div>
                <label className="font-mono text-[#64748B] text-[11px] uppercase block mb-1">
                  Variability Source Design
                </label>
                <select
                  value={fixedSplit ? "fixed" : "random"}
                  onChange={(e) => setFixedSplit(e.target.value === "fixed")}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#0F172A] font-mono cursor-pointer"
                >
                  <option value="random">Varied Splits + Model Fits (Overall Pipeline)</option>
                  <option value="fixed">Fixed Partition (Fitting Stochasticity Only)</option>
                </select>
              </div>

              <div>
                <label className="font-mono text-[#64748B] text-[11px] uppercase block mb-1">
                  Primary Scoring Metric
                </label>
                <input
                  type="text"
                  placeholder="Auto-inferred (e.g. accuracy, r2)"
                  value={primaryMetricOverride}
                  onChange={(e) => setPrimaryMetricOverride(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#0F172A] font-mono"
                />
              </div>

              <div>
                <label className="font-mono text-[#64748B] text-[11px] uppercase block mb-1">
                  Bootstrap Resamples (B)
                </label>
                <input
                  type="number"
                  min={100}
                  max={5000}
                  step={100}
                  value={bootstrapResamples}
                  onChange={(e) => setBootstrapResamples(Number(e.target.value))}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#0F172A] font-mono"
                />
              </div>
            </div>
          </div>

          {repeatedError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{repeatedError}</span>
            </div>
          )}

          {/* REPEATED RUN RESULTS */}
          {repeatedRunsResult && (
            <div className="space-y-6">
              {/* Protocol Overview & Action Banner */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] font-mono text-[10px] uppercase font-bold">
                        Protocol v{repeatedRunsResult.protocol.protocol_version}
                      </span>
                      <span className="text-xs font-mono text-[#64748B]">
                        Group ID: {repeatedRunsResult.run_group_id}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#0F172A] mt-1">
                      {repeatedRunsResult.n_successful_runs} of {repeatedRunsResult.n_requested_runs} Replicates Succeeded
                      {repeatedRunsResult.n_failed_runs > 0 && (
                        <span className="text-rose-600 ml-2 font-mono text-xs">
                          ({repeatedRunsResult.n_failed_runs} failed — preserved honestly without zero-score imputation)
                        </span>
                      )}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleCopyRepeatedLatex}
                      className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                    >
                      {copiedRepeatedLatex ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <FileCode className="w-3.5 h-3.5 text-[#1D4ED8]" />}
                      <span>{copiedRepeatedLatex ? "Copied LaTeX!" : "LaTeX Table"}</span>
                    </button>

                    <a
                      href={api.getRepeatedRunsCsvUrl(repeatedRunsResult.run_group_id)}
                      download
                      className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-[#64748B]" />
                      <span>Download CSV</span>
                    </a>

                    <button
                      onClick={handleDownloadRepeatedJson}
                      className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#0F172A] text-xs font-mono font-medium flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-[#64748B]" />
                      <span>Export JSON</span>
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-sans text-[#475569] leading-relaxed">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" />
                    <div>
                      <b className="text-[#0F172A]">Methodological Notice:</b> {repeatedRunsResult.scientific_disclaimer}
                    </div>
                  </div>
                </div>
              </div>

              {/* Statistical Uncertainty Summaries */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(repeatedRunsResult.metric_summaries).map(([metricKey, stat]) => (
                  <div
                    key={metricKey}
                    className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase text-[#1D4ED8]">
                        {stat.metric_name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F1F5F9] text-[#64748B]">
                        N = {stat.valid_runs} runs
                      </span>
                    </div>

                    <div>
                      <div className="text-2xl font-bold font-mono text-[#0F172A]">
                        {stat.mean.toFixed(4)}
                        {stat.std !== null && stat.std !== undefined && (
                          <span className="text-sm font-normal text-[#64748B] ml-1.5">
                            &plusmn; {stat.std.toFixed(4)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#64748B] font-mono mt-0.5">
                        Median: {stat.median.toFixed(4)} &middot; Range: [{stat.min.toFixed(4)}, {stat.max.toFixed(4)}]
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#F1F5F9] text-[11px] font-mono">
                      <div className="flex justify-between items-center text-[#475569]">
                        <span>Student&apos;s t 95% CI:</span>
                        <span className="font-bold text-[#0F172A]">
                          {stat.ci_95_t ? `[${stat.ci_95_t[0].toFixed(4)}, ${stat.ci_95_t[1].toFixed(4)}]` : "N/A (N < 2)"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[#475569]">
                        <span>Bootstrap 95% CI:</span>
                        <span className="font-bold text-[#15803D]">
                          {stat.ci_95_bootstrap ? `[${stat.ci_95_bootstrap[0].toFixed(4)}, ${stat.ci_95_bootstrap[1].toFixed(4)}]` : "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Per-Run Replicate Records Table */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-[#0F172A]">Individual Replicate Runs</h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] text-[#64748B] font-mono uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Run</th>
                        <th className="py-2.5 px-3">Seed</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Best Model</th>
                        <th className="py-2.5 px-3 text-right">Primary Metric</th>
                        <th className="py-2.5 px-3 text-right">Duration (s)</th>
                        <th className="py-2.5 px-3 text-right">Peak Memory</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] font-mono">
                      {repeatedRunsResult.runs.map((r) => {
                        const primScore = r.test_metrics[repeatedRunsResult.primary_metric];
                        return (
                          <tr key={r.run_index} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="py-2.5 px-3 font-bold">#{r.run_index}</td>
                            <td className="py-2.5 px-3 text-[#1D4ED8] font-bold">{r.seed}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  r.status === "successful"
                                    ? "bg-[#DCFCE7] text-[#15803D]"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-sans font-medium text-[#0F172A]">
                              {r.best_model_name || "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-[#0F172A]">
                              {primScore !== undefined ? primScore.toFixed(4) : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right text-[#64748B]">
                              {r.duration_seconds.toFixed(2)}s
                            </td>
                            <td className="py-2.5 px-3 text-right text-[#64748B]">
                              {r.peak_memory_bytes
                                ? `${(r.peak_memory_bytes / (1024 * 1024)).toFixed(2)} MB`
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: PHASE 9 CANONICAL BASELINES & LATENCY PROFILING                 */}
      {/* ========================================================================= */}
      {subTab === "baselines" && (
        <div className="space-y-6">
          {/* Target Model Selector Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#D97706]" />
                  Canonical Baseline Comparison &amp; Resource Efficiency
                </h3>
                <p className="text-xs text-[#64748B] font-sans mt-0.5">
                  Evaluates simple heuristic Dummy and Linear baselines under identical holdout partitions to establish true AutoML selection quality.
                </p>
              </div>

              <button
                onClick={runBaselineAudit}
                disabled={isBaselineLoading}
                className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-[#94A3B8] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs transition-colors shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBaselineLoading ? "animate-spin" : ""}`} />
                <span>{isBaselineLoading ? "Evaluating..." : "Run Baseline Audit"}</span>
              </button>
            </div>

            <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center gap-3">
              <span className="text-xs font-mono text-[#64748B]">Target Model:</span>
              <select
                value={selectedBaselineExpId}
                onChange={(e) => setSelectedBaselineExpId(e.target.value)}
                className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs text-[#0F172A] font-mono cursor-pointer"
              >
                {experiments.map((exp) => (
                  <option key={exp.experiment_id} value={exp.experiment_id}>
                    {exp.best_model} ({exp.experiment_id.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {baselineError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{baselineError}</span>
            </div>
          )}

          {/* BASELINE COMPARISON RESULTS */}
          {baselineResults && (
            <div className="space-y-6">
              {/* Verdict Summary Card */}
              {baselineResults.length > 0 && (
                <div
                  className={`p-5 rounded-2xl border shadow-xs space-y-2 ${
                    baselineResults.every((b) => b.selection_quality === "outperformed")
                      ? "bg-[#DCFCE7]/70 border-[#86EFAC] text-[#14532D]"
                      : baselineResults.some((b) => b.selection_quality === "outperformed")
                      ? "bg-[#FEF3C7]/70 border-[#FDE68A] text-[#78350F]"
                      : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {baselineResults.every((b) => b.selection_quality === "outperformed") ? (
                      <CheckCircle2 className="w-5 h-5 text-[#15803D]" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-[#D97706]" />
                    )}
                    <div>
                      <h3 className="text-sm font-bold tracking-tight">
                        AutoML Model Selection Quality:{" "}
                        {baselineResults.every((b) => b.selection_quality === "outperformed")
                          ? "Outperformed All Baselines"
                          : baselineResults.some((b) => b.selection_quality === "outperformed")
                          ? "Partially Outperformed Baselines"
                          : "Competitive / Tied with Baselines"}
                      </h3>
                      <p className="text-xs opacity-90 font-sans mt-0.5">
                        Scientific verification that AutoML model adds measurable predictive utility beyond trivial majority-class or empirical-mean heuristics.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Baseline Table */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-[#0F172A]">Baseline Comparison Details</h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] text-[#64748B] font-mono uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Baseline Type</th>
                        <th className="py-2.5 px-3">Strategy Description</th>
                        <th className="py-2.5 px-3 text-right">Baseline Score</th>
                        <th className="py-2.5 px-3 text-right">AutoML Score</th>
                        <th className="py-2.5 px-3 text-right">&Delta; Absolute</th>
                        <th className="py-2.5 px-3 text-right">&Delta; %</th>
                        <th className="py-2.5 px-3">Quality Verdict</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {baselineResults.map((b, idx) => {
                        const prim = b.primary_metric;
                        const bScore = b.baseline_metrics[prim];
                        const mScore = b.model_metrics[prim];

                        return (
                          <tr key={idx} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="py-3 px-3 font-mono font-bold text-[#0F172A]">
                              {b.baseline_name}
                            </td>
                            <td className="py-3 px-3 text-[#64748B] text-[11px] max-w-xs leading-relaxed font-sans">
                              {b.baseline_strategy}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-[#64748B]">
                              {bScore !== undefined ? Number(bScore).toFixed(4) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-[#1D4ED8]">
                              {mScore !== undefined ? Number(mScore).toFixed(4) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-[#0F172A]">
                              {b.delta_absolute >= 0 ? `+${b.delta_absolute.toFixed(4)}` : b.delta_absolute.toFixed(4)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-[#64748B]">
                              {b.delta_percentage !== null && b.delta_percentage !== undefined
                                ? `${b.delta_percentage >= 0 ? "+" : ""}${b.delta_percentage.toFixed(1)}%`
                                : "N/A*"}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                                  b.selection_quality === "outperformed"
                                    ? "bg-[#DCFCE7] text-[#15803D]"
                                    : b.selection_quality === "tied"
                                    ? "bg-[#FEF3C7] text-[#B45309]"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {b.selection_quality}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-[10px] text-[#94A3B8] font-mono">
                  * Note: Relative percentage (&Delta; %) is omitted when baseline metric is &le; 0 to prevent distorted ratios.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: CONTROLLED HPO BENCHMARK: RANDOM SEARCH VS BAYESIAN OPTUNA      */}
      {/* ========================================================================= */}
      {subTab === "hpo_search" && (
        <div className="space-y-6">
          {/* Configuration Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F1F5F9] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                  <Sliders className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    Controlled Hyperparameter Optimization Protocol
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Strictly Matched Budgets &middot; Identical Partitions &middot; Leakage-Free Preprocessing &middot; Untouched Test Sets &middot; Paired Statistics
                  </p>
                </div>
              </div>

              {/* Pre-computed Quick Loaders */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadPrecomputedHpo("ade6d42a-4dce-41e4-86f5-e17b655693c4")}
                  className="px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[11px] font-mono font-medium text-[#475569] cursor-pointer transition-colors"
                >
                  Load Churn Clf (N=3)
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadPrecomputedHpo("ef47f7b1-b443-4683-ab77-13dda31cc593")}
                  className="px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[11px] font-mono font-medium text-[#475569] cursor-pointer transition-colors"
                >
                  Load Housing Reg (N=3)
                </button>
              </div>
            </div>

            {/* Form Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                  Model Family
                </label>
                <select
                  value={hpoModelId}
                  onChange={(e) => setHpoModelId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs font-mono text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent cursor-pointer"
                >
                  <option value="random_forest">Random Forest Classifier</option>
                  <option value="random_forest_regressor">Random Forest Regressor</option>
                  <option value="hist_gradient_boosting">Hist Gradient Boosting Classifier</option>
                  <option value="hist_gradient_boosting_regressor">Hist Gradient Boosting Regressor</option>
                  <option value="decision_tree">Decision Tree Classifier</option>
                  <option value="decision_tree_regressor">Decision Tree Regressor</option>
                  <option value="logistic_regression">Logistic Regression</option>
                  <option value="linear_regression">Ridge Linear Regression</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                  Target Column
                </label>
                <input
                  type="text"
                  value={hpoTargetCol}
                  onChange={(e) => setHpoTargetCol(e.target.value)}
                  placeholder="e.g. churn or price"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs font-mono text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                  Trial Budget per Strategy
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={hpoTrialBudget}
                  onChange={(e) => setHpoTrialBudget(Math.max(5, parseInt(e.target.value) || 20))}
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs font-mono text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent"
                />
                <span className="text-[10px] text-[#94A3B8]">Default: 20 completed trials</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                  Random Seeds List
                </label>
                <input
                  type="text"
                  value={hpoSeedsStr}
                  onChange={(e) => setHpoSeedsStr(e.target.value)}
                  placeholder="e.g. 42, 123, 456"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs font-mono text-[#0F172A] bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent"
                />
                <span className="text-[10px] text-[#94A3B8]">Comma-separated integers</span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#475569]">Strategy:</span>
                <select
                  value={hpoEvalStrategy}
                  onChange={(e) => setHpoEvalStrategy(e.target.value as "cross_validation" | "holdout")}
                  className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-mono text-[#0F172A] bg-white"
                >
                  <option value="cross_validation">3-Fold Cross-Validation</option>
                  <option value="holdout">Holdout Validation</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleRunHpo}
                disabled={isHpoLoading}
                className="px-5 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
              >
                {isHpoLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing Matched Search (20 Trials &times; N Seeds)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Run Controlled Comparison</span>
                  </>
                )}
              </button>
            </div>

            {hpoError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{hpoError}</span>
              </div>
            )}
          </div>

          {/* Results View */}
          {hpoResult && (
            <div className="space-y-6">
              {/* High-Level KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Overall Winner */}
                <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#64748B]">Overall Winner</span>
                    <Trophy className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="my-2">
                    <div className="text-base font-bold text-[#0F172A] capitalize">
                      {hpoResult.overall_winner.replace(/_/g, " ")}
                    </div>
                    <div className="text-[11px] text-[#64748B] font-mono mt-0.5">
                      Duration: {hpoResult.total_wall_clock_seconds.toFixed(2)}s
                    </div>
                  </div>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase w-fit ${
                      hpoResult.overall_winner === "bayesian_optimization"
                        ? "bg-[#DCFCE7] text-[#15803D]"
                        : hpoResult.overall_winner === "random_search"
                        ? "bg-[#EFF6FF] text-[#1D4ED8]"
                        : "bg-[#FEF3C7] text-[#B45309]"
                    }`}
                  >
                    {hpoResult.overall_winner}
                  </span>
                </div>

                {/* Validation Score Comparison */}
                <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#64748B]">Validation Score ({hpoResult.protocol.primary_metric})</span>
                    <Activity className="w-4 h-4 text-[#1D4ED8]" />
                  </div>
                  <div className="my-2 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#64748B]">Random Search:</span>
                      <span className="font-bold text-[#0F172A]">{hpoResult.random_search_summary.validation_mean.toFixed(4)} &plusmn; {hpoResult.random_search_summary.validation_std ? hpoResult.random_search_summary.validation_std.toFixed(4) : "0"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#64748B]">Bayesian Opt:</span>
                      <span className="font-bold text-[#10B981]">{hpoResult.bayesian_summary.validation_mean.toFixed(4)} &plusmn; {hpoResult.bayesian_summary.validation_std ? hpoResult.bayesian_summary.validation_std.toFixed(4) : "0"}</span>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-[#64748B]">
                    &Delta; Val: <span className="font-bold text-[#0F172A]">{hpoResult.statistical_comparison.mean_validation_difference >= 0 ? `+${hpoResult.statistical_comparison.mean_validation_difference.toFixed(4)}` : hpoResult.statistical_comparison.mean_validation_difference.toFixed(4)}</span>
                  </div>
                </div>

                {/* Independent Test Score */}
                <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#64748B]">Untouched Test Score</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="my-2 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#64748B]">Random Search:</span>
                      <span className="font-bold text-[#0F172A]">{hpoResult.random_search_summary.test_mean.toFixed(4)} &plusmn; {hpoResult.random_search_summary.test_std ? hpoResult.random_search_summary.test_std.toFixed(4) : "0"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#64748B]">Bayesian Opt:</span>
                      <span className="font-bold text-[#10B981]">{hpoResult.bayesian_summary.test_mean.toFixed(4)} &plusmn; {hpoResult.bayesian_summary.test_std ? hpoResult.bayesian_summary.test_std.toFixed(4) : "0"}</span>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-[#64748B]">
                    &Delta; Test: <span className="font-bold text-[#0F172A]">{hpoResult.statistical_comparison.mean_test_difference >= 0 ? `+${hpoResult.statistical_comparison.mean_test_difference.toFixed(4)}` : hpoResult.statistical_comparison.mean_test_difference.toFixed(4)}</span>
                  </div>
                </div>

                {/* Search Efficiency */}
                <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#64748B]">Search Efficiency</span>
                    <Clock className="w-4 h-4 text-[#64748B]" />
                  </div>
                  <div className="my-2 space-y-1 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-[#64748B]">Trial to Best:</span>
                      <span>Bayes: <strong className="text-[#10B981]">{hpoResult.bayesian_summary.avg_trial_to_best}</strong> / Rand: <strong>{hpoResult.random_search_summary.avg_trial_to_best}</strong></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#64748B]">Time to Best:</span>
                      <span>Bayes: {hpoResult.bayesian_summary.avg_time_to_best_seconds.toFixed(2)}s / Rand: {hpoResult.random_search_summary.avg_time_to_best_seconds.toFixed(2)}s</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-[#94A3B8]">
                    Evaluated across {hpoResult.replicates.length} seed replicates
                  </div>
                </div>
              </div>

              {/* Convergence Trajectory Chart */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#1D4ED8]" />
                    <h4 className="text-sm font-bold text-[#0F172A]">
                      Validation Score Convergence Trajectory
                    </h4>
                  </div>
                  <span className="text-xs text-[#64748B] font-mono">
                    Best-so-far {hpoResult.protocol.primary_metric} vs. Trial Number (Averaged across {hpoResult.replicates.length} seeds)
                  </span>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={convergenceChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="trial" stroke="#94A3B8" fontSize={11} label={{ value: "Trial Number", position: "insideBottomRight", offset: -5 }} />
                      <YAxis stroke="#94A3B8" fontSize={11} domain={["auto", "auto"]} />
                      <RechartsTooltip contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", color: "#F8FAFC", borderRadius: "8px", fontSize: "12px" }} />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "12px" }} />
                      <Line type="monotone" dataKey="random_search" name="Random Search (Mean)" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="bayesian_optimization" name="Bayesian Optuna TPE (Mean)" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Matched Replicates Comparison Table */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#1D4ED8]" />
                    <h4 className="text-sm font-bold text-[#0F172A]">
                      Matched Seed Replicates (Fair Comparison)
                    </h4>
                  </div>
                  <span className="text-xs text-[#64748B] font-mono">
                    N={hpoResult.replicates.length} paired runs
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] font-mono">
                        <th className="py-2.5 px-3">Replicate</th>
                        <th className="py-2.5 px-3">Seed</th>
                        <th className="py-2.5 px-3 text-right">Random Search Val</th>
                        <th className="py-2.5 px-3 text-right">Bayesian Opt Val</th>
                        <th className="py-2.5 px-3 text-right">&Delta; Val</th>
                        <th className="py-2.5 px-3 text-right">Random Test</th>
                        <th className="py-2.5 px-3 text-right">Bayesian Test</th>
                        <th className="py-2.5 px-3 text-right">&Delta; Test</th>
                        <th className="py-2.5 px-3 text-center">Test Winner</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {hpoResult.replicates.map((rep) => (
                        <tr key={rep.seed} className="hover:bg-[#F8FAFC]">
                          <td className="py-2.5 px-3 font-mono text-[#64748B]">#{rep.replicate_index + 1}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#0F172A]">{rep.seed}</td>
                          <td className="py-2.5 px-3 text-right font-mono">{rep.random_search.best_validation_score.toFixed(4)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#059669]">{rep.bayesian_optimization.best_validation_score.toFixed(4)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#0F172A]">
                            {rep.delta_validation >= 0 ? `+${rep.delta_validation.toFixed(4)}` : rep.delta_validation.toFixed(4)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">{rep.random_search.test_score.toFixed(4)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#059669]">{rep.bayesian_optimization.test_score.toFixed(4)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#0F172A]">
                            {rep.delta_test >= 0 ? `+${rep.delta_test.toFixed(4)}` : rep.delta_test.toFixed(4)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                                rep.test_winner === "bayesian"
                                  ? "bg-[#DCFCE7] text-[#15803D]"
                                  : rep.test_winner === "random"
                                  ? "bg-[#EFF6FF] text-[#1D4ED8]"
                                  : "bg-[#FEF3C7] text-[#B45309]"
                              }`}
                            >
                              {rep.test_winner}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Scientific Conclusion & Statistical Rigor Card */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-sm font-bold text-[#0F172A]">
                    Scientific Statistical Evaluation &amp; Evidence-Based Conclusion
                  </h4>
                </div>

                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="text-xs font-semibold text-[#0F172A]">
                    Empirical Research Finding:
                  </div>
                  <p className="text-xs text-[#334155] leading-relaxed">
                    {hpoResult.statistical_comparison.scientific_conclusion}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-600" />
                    <span>Disclosed Caveats &amp; Methodological Limitations</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed font-sans">
                    {hpoResult.statistical_comparison.uncertainty_limitations}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#F1F5F9]">
                  <div className="text-xs text-[#64748B] font-mono">
                    Protocol Version {hpoResult.protocol.protocol_version} &middot; Dataset SHA-256: {hpoResult.protocol.dataset_fingerprint.slice(0, 12)}...
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={api.getHpoCsvUrl(hpoResult.experiment_id)}
                      download
                      className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-semibold text-[#334155] inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Raw CSV</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(hpoResult, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `hpo_experiment_${hpoResult.experiment_id}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-semibold text-[#334155] inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download JSON</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 5: MULTI-OBJECTIVE & PARETO OPTIMIZATION (PHASE 10B)               */}
      {/* ========================================================================= */}
      {subTab === "multi_objective" && (
        <div className="space-y-6">
          {/* Configuration Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#F1F5F9]">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#1D4ED8]" />
                  Multi-Objective AutoML Optimization &amp; Resource-Aware Selection
                </h3>
                <p className="text-xs text-[#64748B] font-sans mt-0.5">
                  Evaluate models across predictive score, inference latency, training cost, artifact size, and model complexity. Enforce operational budgets and identify non-dominated Pareto champions.
                </p>
              </div>

              {moResult && (
                <div className="flex items-center gap-2">
                  <a
                    href={api.getMultiObjectiveCsvUrl(moResult.experiment_id)}
                    download
                    className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-semibold text-[#334155] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(moResult, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `multi_objective_${moResult.experiment_id}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-semibold text-[#334155] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Manifest</span>
                  </button>
                </div>
              )}
            </div>

            {/* Form Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">Source Dataset</label>
                <select
                  value={moDatasetId}
                  onChange={(e) => setMoDatasetId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-hidden focus:ring-2 focus:ring-[#1D4ED8]"
                >
                  {Array.from(new Set(experiments.map((e) => e.dataset_id))).map((dsId) => (
                    <option key={dsId} value={dsId}>
                      {dsId}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">Target Column</label>
                <input
                  type="text"
                  value={moTargetCol}
                  onChange={(e) => setMoTargetCol(e.target.value)}
                  placeholder="e.g. churn or price"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-hidden focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">Task Type</label>
                <select
                  value={moTaskType}
                  onChange={(e) => setMoTaskType(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-hidden focus:ring-2 focus:ring-[#1D4ED8]"
                >
                  <option value="classification">Classification (F1 / Accuracy)</option>
                  <option value="regression">Regression (RMSE / MAE / R²)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">Cross-Validation &amp; Split</label>
                <div className="flex items-center gap-2">
                  <select
                    value={moCvFolds}
                    onChange={(e) => setMoCvFolds(parseInt(e.target.value, 10))}
                    className="w-1/2 px-2.5 py-2 text-xs rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A]"
                  >
                    <option value={2}>2 Folds</option>
                    <option value={3}>3 Folds</option>
                    <option value={5}>5 Folds</option>
                  </select>
                  <span className="text-[11px] text-[#64748B]">20% Holdout</span>
                </div>
              </div>
            </div>

            {/* Resource Constraints Configuration Grid */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-[#1D4ED8]" />
                  Operational Resource Constraints (Optional Budgets)
                </span>
                <span className="text-[11px] text-[#64748B]">Leave empty to unconstrain</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#334155] mb-1">Max Latency (ms/sample)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={moMaxLatency}
                    onChange={(e) => setMoMaxLatency(e.target.value)}
                    placeholder="e.g. 2.5"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#334155] mb-1">Max Training Time (s)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={moMaxTrainingTime}
                    onChange={(e) => setMoMaxTrainingTime(e.target.value)}
                    placeholder="e.g. 15.0"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#334155] mb-1">Max Disk Size (bytes)</label>
                  <input
                    type="number"
                    step="1000"
                    min="0"
                    value={moMaxArtifactSize}
                    onChange={(e) => setMoMaxArtifactSize(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#334155] mb-1">Min Performance Score</label>
                  <input
                    type="number"
                    step="0.01"
                    value={moMinScore}
                    onChange={(e) => setMoMinScore(e.target.value)}
                    placeholder="e.g. 0.75"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#334155] mb-1">Max Complexity (nodes)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={moMaxComplexity}
                    onChange={(e) => setMoMaxComplexity(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A]"
                  />
                </div>
              </div>

              {/* Policy & HPO Toggle */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#E2E8F0]">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-[#0F172A]">Selection Policy:</label>
                  <select
                    value={moSelectionPolicy}
                    onChange={(e) => setMoSelectionPolicy(e.target.value as SelectionPolicy)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] font-semibold"
                  >
                    <option value="best_performance_constrained">Best Predictive Score (Constrained)</option>
                    <option value="lowest_latency_constrained">Lowest Inference Latency (Constrained)</option>
                    <option value="lowest_size_constrained">Lowest Disk Footprint (Constrained)</option>
                    <option value="balanced_compromise">Balanced Compromise (Distance to Utopia Point)</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#334155] font-medium">
                  <input
                    type="checkbox"
                    checked={moIncludeHpo}
                    onChange={(e) => setMoIncludeHpo(e.target.checked)}
                    className="rounded border-[#CBD5E1] text-[#1D4ED8] focus:ring-[#1D4ED8]"
                  />
                  <span>Include Tuned Hyperparameter Variants (High/Low Capacity)</span>
                </label>
              </div>
            </div>

            {/* Error banner */}
            {moError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{moError}</span>
              </div>
            )}

            {/* Launch Action */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-[#64748B]">
                Strict scientific integrity: Holdout test set evaluated strictly post-selection.
              </span>
              <button
                type="button"
                onClick={handleRunMultiObjective}
                disabled={isMoLoading}
                className="px-5 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-[#93C5FD] text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isMoLoading ? "animate-spin" : ""}`} />
                <span>{isMoLoading ? "Profiling Candidates & Computing Pareto..." : "Run Multi-Objective Optimization"}</span>
              </button>
            </div>
          </div>

          {/* Results Display */}
          {moResult && (
            <div className="space-y-6">
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
                  <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Total Candidates</div>
                  <div className="text-xl font-bold text-[#0F172A] mt-1">{moResult.candidates.length}</div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">Empirically profiled</div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 shadow-xs">
                  <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pareto-Optimal</span>
                  </div>
                  <div className="text-xl font-bold text-emerald-700 mt-1">{moResult.pareto_frontier_candidate_ids.length}</div>
                  <div className="text-[10px] text-emerald-700 mt-0.5">Non-dominated models</div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 shadow-xs">
                  <div className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Feasible Set</span>
                  </div>
                  <div className="text-xl font-bold text-blue-700 mt-1">{moResult.selection.feasible_candidates_count}</div>
                  <div className="text-[10px] text-blue-700 mt-0.5">Satisfy all constraints</div>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 shadow-xs">
                  <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Infeasible Set</span>
                  </div>
                  <div className="text-xl font-bold text-amber-700 mt-1">{moResult.selection.infeasible_candidates_count}</div>
                  <div className="text-[10px] text-amber-700 mt-0.5">Breached budget bounds</div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
                  <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">Primary Metric</div>
                  <div className="text-lg font-bold text-[#1D4ED8] mt-1 font-mono">{moResult.primary_metric}</div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">Task: {moResult.task_type}</div>
                </div>
              </div>

              {/* Champion Model Selection Card */}
              {moResult.selection.selected_candidate && (
                <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white to-[#F0FDF4] border-2 border-emerald-300 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                        <Trophy className="w-5 h-5" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-[#0F172A]">
                            {moResult.selection.selected_candidate.measurement.model_name}
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Pareto Champion
                          </span>
                        </div>
                        <p className="text-xs text-[#64748B] font-mono mt-0.5">
                          Candidate ID: {moResult.selection.selected_candidate_id} &middot; Policy: {moResult.selection.policy_used}
                        </p>
                      </div>
                    </div>

                    {/* Scientific Guarantee Badge */}
                    <span className="px-3 py-1 rounded-lg text-xs font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] inline-flex items-center gap-1.5 self-start sm:self-auto">
                      <ShieldCheck className="w-4 h-4 text-[#1D4ED8]" />
                      <span>Zero-Leakage Holdout Evaluated</span>
                    </span>
                  </div>

                  {/* Scientific Rationale */}
                  <div className="p-3.5 rounded-xl bg-white/80 border border-emerald-200 text-xs text-[#1E293B] leading-relaxed">
                    <span className="font-bold text-[#0F172A]">Selection Rationale: </span>
                    {moResult.selection.selection_explanation}
                  </div>

                  {/* Metric Badges Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    <div className="p-3 rounded-xl bg-white border border-[#E2E8F0]">
                      <div className="text-[10px] text-[#64748B] uppercase font-semibold">Validation {moResult.primary_metric}</div>
                      <div className="text-sm font-bold text-[#0F172A] mt-0.5 font-mono">
                        {moResult.selection.selected_candidate.measurement.validation_score?.toFixed(4) ?? "N/A"}
                        {moResult.selection.selected_candidate.measurement.cv_std !== null && (
                          <span className="text-[11px] text-[#64748B] font-normal">
                            {" "}± {moResult.selection.selected_candidate.measurement.cv_std?.toFixed(3)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-[#E2E8F0]">
                      <div className="text-[10px] text-[#64748B] uppercase font-semibold">Inference Latency</div>
                      <div className="text-sm font-bold text-[#0F172A] mt-0.5 font-mono">
                        {moResult.selection.selected_candidate.measurement.inference_latency_ms_per_sample.toFixed(3)} ms
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-[#E2E8F0]">
                      <div className="text-[10px] text-[#64748B] uppercase font-semibold">Throughput</div>
                      <div className="text-sm font-bold text-[#0F172A] mt-0.5 font-mono">
                        {moResult.selection.selected_candidate.measurement.inference_throughput_samples_per_sec.toFixed(0)} /sec
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-[#E2E8F0]">
                      <div className="text-[10px] text-[#64748B] uppercase font-semibold">Training Time</div>
                      <div className="text-sm font-bold text-[#0F172A] mt-0.5 font-mono">
                        {moResult.selection.selected_candidate.measurement.training_duration_seconds.toFixed(2)} s
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white border border-[#E2E8F0]">
                      <div className="text-[10px] text-[#64748B] uppercase font-semibold">Disk Footprint</div>
                      <div className="text-sm font-bold text-[#0F172A] mt-0.5 font-mono">
                        {Math.round(moResult.selection.selected_candidate.measurement.model_artifact_size_bytes / 1024)} KB
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="text-[10px] text-emerald-800 uppercase font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Untouched Test Score</span>
                      </div>
                      <div className="text-sm font-extrabold text-emerald-800 mt-0.5 font-mono">
                        {moResult.selection.selected_candidate.measurement.test_score !== null && moResult.selection.selected_candidate.measurement.test_score !== undefined
                          ? moResult.selection.selected_candidate.measurement.test_score.toFixed(4)
                          : "N/A"}
                      </div>
                    </div>
                  </div>

                  {/* Tied alternatives warning if any */}
                  {moResult.selection.tied_candidate_ids.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>
                        Note: {moResult.selection.tied_candidate_ids.length} alternative candidate(s) tied within numerical tolerance ({moResult.selection.tied_candidate_ids.join(", ")}).
                      </span>
                    </div>
                  )}

                  {/* Dynamic Re-Selection Action Bar */}
                  <div className="p-3 rounded-xl bg-white border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                      <span>Dynamic Policy Selection:</span>
                      <select
                        value={moSelectionPolicy}
                        onChange={(e) => setMoSelectionPolicy(e.target.value as SelectionPolicy)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-[#CBD5E1] bg-white font-medium"
                      >
                        <option value="best_performance_constrained">Best Performance</option>
                        <option value="lowest_latency_constrained">Lowest Latency</option>
                        <option value="lowest_size_constrained">Lowest Disk Footprint</option>
                        <option value="balanced_compromise">Balanced Utopia Compromise</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleReSelectModel}
                      disabled={isReSelecting}
                      className="px-3.5 py-1.5 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isReSelecting ? "animate-spin" : ""}`} />
                      <span>{isReSelecting ? "Re-Evaluating..." : "Re-evaluate Selection"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Interactive 2D Pareto Scatter Plot */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
                  <div>
                    <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-[#1D4ED8]" />
                      Interactive 2D Pareto Scatter Projection
                    </h4>
                    <p className="text-xs text-[#64748B] font-sans mt-0.5">
                      Visualize trade-offs between any pair of profiled dimensions. Points reflect Pareto membership in the full multi-objective space.
                    </p>
                  </div>

                  {/* Axis Selectors */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#64748B] font-semibold">X-Axis:</span>
                      <select
                        value={paretoXAxis}
                        onChange={(e) => setParetoXAxis(e.target.value)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A]"
                      >
                        <option value="inference_latency_ms">Latency (ms/sample)</option>
                        <option value="training_duration_seconds">Training Duration (s)</option>
                        <option value="artifact_size_bytes">Artifact Size (KB)</option>
                        <option value="model_complexity">Structural Complexity</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#64748B] font-semibold">Y-Axis:</span>
                      <select
                        value={paretoYAxis}
                        onChange={(e) => setParetoYAxis(e.target.value)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A]"
                      >
                        <option value="predictive_metric">Validation Score ({moResult.primary_metric})</option>
                        <option value="inference_latency_ms">Latency (ms/sample)</option>
                        <option value="model_complexity">Structural Complexity</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Recharts Scatter Chart */}
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name={paretoXAxis}
                        stroke="#64748B"
                        fontSize={11}
                        tickLine={false}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name={paretoYAxis}
                        stroke="#64748B"
                        fontSize={11}
                        tickLine={false}
                      />
                      <ZAxis type="number" range={[70, 160]} />
                      <RechartsTooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="p-3 bg-white border border-[#CBD5E1] rounded-xl shadow-lg text-xs space-y-1 z-50">
                                <div className="font-bold text-[#0F172A]">{data.model_name}</div>
                                <div className="text-[10px] text-[#64748B] font-mono">{data.candidate_id}</div>
                                <div className="pt-1 text-[#334155]">
                                  X ({paretoXAxis}): <span className="font-mono font-bold">{data.x}</span>
                                </div>
                                <div className="text-[#334155]">
                                  Y ({paretoYAxis}): <span className="font-mono font-bold">{data.y}</span>
                                </div>
                                <div className="pt-1 flex items-center gap-1.5">
                                  {data.is_pareto_optimal ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      Pareto-Optimal
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                      Dominated ({data.dominated_by_count})
                                    </span>
                                  )}
                                  {!data.is_feasible && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                                      Infeasible ({data.violations_count} breaches)
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Scatter data={paretoScatterData} fill="#1D4ED8">
                        {paretoScatterData.map((entry, index) => {
                          let fillColor = "#64748B"; // Dominated
                          if (!entry.is_feasible) fillColor = "#EF4444"; // Infeasible
                          else if (entry.is_pareto_optimal) fillColor = "#10B981"; // Pareto Optimal
                          return <Cell key={`cell-${index}`} fill={fillColor} />;
                        })}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                {/* Scatter Legend & 2D Projection Disclaimer */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs text-[#64748B] border-t border-[#F1F5F9]">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                      <span>Pareto-Optimal (Feasible)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-slate-500 inline-block" />
                      <span>Dominated (Feasible)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                      <span>Infeasible (Constraint Breach)</span>
                    </span>
                  </div>

                  <span className="text-[11px] text-[#64748B] italic">
                    Projection advisory: Points represent full 5D Pareto dominance projected into 2 dimensions.
                  </span>
                </div>
              </div>

              {/* Candidate Comparison Table */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
                  <div>
                    <h4 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#1D4ED8]" />
                      Candidate Model Multi-Objective Leaderboard
                    </h4>
                    <p className="text-xs text-[#64748B] font-sans mt-0.5">
                      Detailed profiling measurements across predictive generalization, execution speed, disk footprint, and structural complexity.
                    </p>
                  </div>

                  {/* Filter Badges */}
                  <div className="flex items-center bg-[#F1F5F9] p-1 rounded-xl border border-[#CBD5E1]">
                    <button
                      type="button"
                      onClick={() => setCandidateFilter("all")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                        candidateFilter === "all" ? "bg-white text-[#1D4ED8] shadow-xs" : "text-[#64748B]"
                      }`}
                    >
                      All ({moResult.candidates.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCandidateFilter("pareto")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                        candidateFilter === "pareto" ? "bg-white text-emerald-700 shadow-xs" : "text-[#64748B]"
                      }`}
                    >
                      Pareto ({moResult.pareto_frontier_candidate_ids.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCandidateFilter("feasible")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                        candidateFilter === "feasible" ? "bg-white text-blue-700 shadow-xs" : "text-[#64748B]"
                      }`}
                    >
                      Feasible ({moResult.selection.feasible_candidates_count})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCandidateFilter("infeasible")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                        candidateFilter === "infeasible" ? "bg-white text-red-700 shadow-xs" : "text-[#64748B]"
                      }`}
                    >
                      Infeasible ({moResult.selection.infeasible_candidates_count})
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-[#334155] border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-[#0F172A]">
                        <th className="py-2.5 px-3">Candidate / Model</th>
                        <th className="py-2.5 px-2">Feasibility</th>
                        <th className="py-2.5 px-2">Pareto Status</th>
                        <th className="py-2.5 px-3 text-right">Validation Score</th>
                        <th className="py-2.5 px-3 text-right">Latency (ms)</th>
                        <th className="py-2.5 px-3 text-right">Throughput</th>
                        <th className="py-2.5 px-3 text-right">Training (s)</th>
                        <th className="py-2.5 px-3 text-right">Size (KB)</th>
                        <th className="py-2.5 px-3 text-right">Complexity</th>
                        <th className="py-2.5 px-3 text-right">Holdout Test</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {moResult.candidates
                        .filter((c) => {
                          if (candidateFilter === "pareto") return c.is_pareto_optimal;
                          if (candidateFilter === "feasible") return c.is_feasible;
                          if (candidateFilter === "infeasible") return !c.is_feasible;
                          return true;
                        })
                        .map((c) => {
                          const m = c.measurement;
                          const isChampion = c.measurement.candidate_id === moResult.selection.selected_candidate_id;

                          return (
                            <tr
                              key={m.candidate_id}
                              className={`hover:bg-[#F8FAFC] transition-colors ${
                                isChampion ? "bg-emerald-50/40 font-semibold" : ""
                              }`}
                            >
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-[#0F172A] flex items-center gap-1.5">
                                  {isChampion && <Trophy className="w-3.5 h-3.5 text-emerald-600" />}
                                  <span>{m.model_name}</span>
                                </div>
                                <div className="text-[10px] text-[#64748B] font-mono">{m.candidate_id}</div>
                              </td>

                              <td className="py-2.5 px-2">
                                {c.is_feasible ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                    Feasible
                                  </span>
                                ) : (
                                  <span
                                    title={c.constraint_violations.map((v) => v.message).join("\n")}
                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 cursor-help"
                                  >
                                    Breach ({c.constraint_violations.length})
                                  </span>
                                )}
                              </td>

                              <td className="py-2.5 px-2">
                                {c.is_pareto_optimal ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Optimal
                                  </span>
                                ) : (
                                  <span
                                    title={c.dominated_by.length > 0 ? `Dominated by: ${c.dominated_by.join(", ")}` : "Dominated"}
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 cursor-help"
                                  >
                                    Dominated ({c.dominated_by.length})
                                  </span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-right font-mono">
                                {m.validation_score !== null && m.validation_score !== undefined
                                  ? m.validation_score.toFixed(4)
                                  : "N/A"}
                                {m.cv_std !== null && m.cv_std !== undefined && (
                                  <span className="text-[10px] text-[#64748B] block font-normal">
                                    ± {m.cv_std.toFixed(3)}
                                  </span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-right font-mono">
                                {m.inference_latency_ms_per_sample.toFixed(3)}
                              </td>

                              <td className="py-2.5 px-3 text-right font-mono">
                                {m.inference_throughput_samples_per_sec.toFixed(0)}
                              </td>

                              <td className="py-2.5 px-3 text-right font-mono">
                                {m.training_duration_seconds.toFixed(2)}
                              </td>

                              <td className="py-2.5 px-3 text-right font-mono">
                                {Math.round(m.model_artifact_size_bytes / 1024)}
                              </td>

                              <td className="py-2.5 px-3 text-right font-mono">
                                {m.complexity.summary_complexity_score.toFixed(0)}
                                <span className="text-[10px] text-[#64748B] block font-normal">
                                  {m.complexity.complexity_unit}
                                </span>
                              </td>

                              <td className="py-2.5 px-3 text-right font-mono">
                                {m.test_score !== null && m.test_score !== undefined ? (
                                  <span className="font-bold text-emerald-700">{m.test_score.toFixed(4)}</span>
                                ) : (
                                  <span className="text-[#94A3B8] italic font-normal">Unselected</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer with Explanations */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#F1F5F9] text-xs text-[#64748B]">
                  <div className="font-mono text-[11px]">
                    Dataset SHA-256: {moResult.dataset_fingerprint.slice(0, 12)}... &middot; Monotonic Clock: time.perf_counter()
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    Hover over breaches and dominated badges for granular failure rationale.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 6: ROBUST BENCHMARKING (PHASE 11)                                  */}
      {/* ========================================================================= */}
      {subTab === "robust" && (
        <div className="space-y-6">
          {/* Top Configuration & Protocol Setup Card */}
          <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F1F5F9]">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Scale className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-[#0F172A]">
                    Multi-Seed Robust AutoML Benchmarking Protocol
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Multi-Seed Matched Evaluation &middot; Bessel ddof=1 Uncertainty &middot; Paired Hypothesis Tests &middot; Zero Test-Set Leakage
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunRobustBenchmark}
                  disabled={isRobustLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-xs transition-colors disabled:opacity-50"
                >
                  {isRobustLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing Multi-Seed Protocol...</span>
                    </>
                  ) : (
                    <>
                      <Scale className="w-3.5 h-3.5" />
                      <span>Execute Robust Benchmark</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {robustError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Benchmarking Execution Failure</div>
                  <div className="mt-0.5">{robustError}</div>
                </div>
              </div>
            )}

            {/* Protocol Configuration Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Dataset Catalog & Provenance */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  <span>Benchmark Dataset Catalog &amp; Provenance</span>
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Select Curated Benchmark Dataset
                  </label>
                  <select
                    value={robustDatasetId}
                    onChange={(e) => setRobustDatasetId(e.target.value)}
                    disabled={isRobustLoading || isCatalogLoading}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    {catalogEntries.map((cat) => (
                      <option key={cat.dataset_id} value={cat.dataset_id}>
                        {cat.name} ({cat.task_type.replace("_", " ")}, {cat.n_rows} rows, {cat.n_features} features)
                      </option>
                    ))}
                    {catalogEntries.length === 0 && (
                      <option value="wine_multiclass">Wine Recognition Benchmark</option>
                    )}
                  </select>
                </div>

                {selectedCatalogEntry && (
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0F172A]">{selectedCatalogEntry.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {selectedCatalogEntry.source.replace("_", " ")}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {selectedCatalogEntry.license}
                        </span>
                      </div>
                    </div>

                    <p className="text-[#64748B] text-[11px] leading-relaxed">
                      {selectedCatalogEntry.description}
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-[#E2E8F0]">
                      <div>
                        <div className="text-[10px] text-[#64748B] uppercase">Instances</div>
                        <div className="font-bold text-[#0F172A] font-mono">{selectedCatalogEntry.n_rows}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#64748B] uppercase">Features</div>
                        <div className="font-bold text-[#0F172A] font-mono">
                          {selectedCatalogEntry.numeric_features_count} num / {selectedCatalogEntry.categorical_features_count} cat
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#64748B] uppercase">Target</div>
                        <div className="font-bold text-[#0F172A] font-mono">{selectedCatalogEntry.target_column}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#64748B] uppercase">Task Type</div>
                        <div className="font-bold text-[#0F172A] capitalize">
                          {selectedCatalogEntry.task_type.replace("_", " ")}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] text-[#64748B] uppercase">SHA-256 Fingerprint</div>
                        <div className="font-mono text-[10px] text-[#334155] truncate" title={selectedCatalogEntry.dataset_fingerprint}>
                          {selectedCatalogEntry.dataset_fingerprint}
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] text-[#64748B] italic pt-1">
                      Provenance: {selectedCatalogEntry.provenance}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Multi-Seed & Protocol Configuration */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <span>Multi-Seed Protocol &amp; Candidate Strategies</span>
                </h3>

                {/* Seed Count Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[#334155]">
                      Random Seeds Evaluated (Minimum 2, Recommended &ge; 5)
                    </label>
                    <span className="text-xs font-bold text-emerald-700 font-mono">{robustSeedCount} Seeds</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[3, 5, 7, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setRobustSeedCount(num)}
                        disabled={isRobustLoading}
                        className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                          robustSeedCount === num
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs"
                            : "bg-[#F8FAFC] text-[#64748B] border-[#CBD5E1] hover:text-[#0F172A]"
                        }`}
                      >
                        {num} Seeds {num === 5 && "(Default)"}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[42, 123, 456, 789, 1011, 1213, 1415, 1617, 1819, 2021]
                      .slice(0, robustSeedCount)
                      .map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded-md bg-[#F1F5F9] border border-[#CBD5E1] text-[10px] font-mono text-[#334155]"
                        >
                          seed={s}
                        </span>
                      ))}
                  </div>
                </div>

                {/* Candidate Strategies & Baseline */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#334155] mb-1">
                      Baseline Strategy
                    </label>
                    <select
                      value={robustBaseline}
                      onChange={(e) => setRobustBaseline(e.target.value)}
                      disabled={isRobustLoading}
                      className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="decision_tree">Decision Tree (Standard)</option>
                      <option value="logistic_regression">Logistic Regression (Linear)</option>
                      <option value="ridge">Ridge Regressor (L2 Linear)</option>
                      <option value="random_forest">Random Forest (Ensemble)</option>
                      <option value="hist_gradient_boosting">HistGradientBoosting (Boosted)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#334155] mb-1">
                      Cross-Validation Folds
                    </label>
                    <select
                      value={robustCvFolds}
                      onChange={(e) => setRobustCvFolds(parseInt(e.target.value, 10))}
                      disabled={isRobustLoading}
                      className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value={2}>2 Folds (Fast test)</option>
                      <option value={3}>3 Folds (Recommended)</option>
                      <option value={5}>5 Folds (Rigorous)</option>
                    </select>
                  </div>
                </div>

                {/* Data-Leakage Safeguard Box */}
                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Scientific Partition Integrity Guarantee</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-emerald-800/90">
                    For every seed, data is partitioned into 80% Train/Val and an untouched 20% Holdout Test set. Preprocessing is strictly fit inside fold boundaries. The test set is evaluated post-selection and never touched during hyperparameter tuning or candidate ranking.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Results Presentation Section */}
          {robustResult && (
            <div className="space-y-6">
              {/* Executive Overview Banner */}
              <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {robustResult.dataset.name}
                      </span>
                      <span className="text-xs text-[#64748B]">
                        Primary Metric: <strong className="text-[#0F172A] uppercase">{robustResult.primary_metric}</strong> ({robustResult.greater_is_better ? "Higher is better" : "Lower is better"})
                      </span>
                      <span className="text-xs text-[#64748B]">
                        Baseline: <strong className="text-[#0F172A]">{robustResult.baseline_strategy}</strong>
                      </span>
                    </div>
                    <div className="text-[11px] text-[#64748B] font-mono">
                      Benchmark ID: {robustResult.robust_benchmark_id} &middot; Seeds Evaluated: [{robustResult.seeds_evaluated.join(", ")}]
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={api.getRobustBenchmarkCsvUrl(robustResult.robust_benchmark_id)}
                      download={`robust_benchmark_${robustResult.robust_benchmark_id}.csv`}
                      className="px-3 py-1.5 rounded-xl bg-white border border-[#CBD5E1] text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] inline-flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Download Seed Runs CSV</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Statistical Uncertainty Matrix Table */}
              <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A]">
                      Method Performance &amp; Statistical Uncertainty Matrix
                    </h3>
                    <p className="text-xs text-[#64748B]">
                      Sample Mean &plusmn; Bessel Sample Std (ddof=1) &middot; Median &middot; Interquartile Range (IQR) &middot; Student-t 95% CI &middot; Bootstrap 95% CI
                    </p>
                  </div>
                  <div className="text-xs font-mono text-[#64748B]">
                    Seeds: {robustResult.seeds_evaluated.length} &middot; Alpha: 0.05
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#CBD5E1] text-[#64748B] font-semibold bg-[#F8FAFC]">
                        <th className="py-2.5 px-3">Method / Strategy</th>
                        <th className="py-2.5 px-3 text-center">Valid Seeds</th>
                        <th className="py-2.5 px-3 text-right">CV Score (Mean &plusmn; s)</th>
                        <th className="py-2.5 px-3 text-right">Median [IQR]</th>
                        <th className="py-2.5 px-3 text-center">Student-t 95% CI</th>
                        <th className="py-2.5 px-3 text-center">Bootstrap 95% CI</th>
                        <th className="py-2.5 px-3 text-right">Holdout Test Score</th>
                        <th className="py-2.5 px-3 text-right">Duration (s)</th>
                        <th className="py-2.5 px-3 text-right">Latency (ms)</th>
                        <th className="py-2.5 px-3 text-right">Peak Heap (KB)</th>
                        <th className="py-2.5 px-3 text-right">Process RSS (MB)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {Object.entries(robustResult.method_summaries).map(([mName, s]) => {
                        const isBase = mName === robustResult.baseline_strategy;
                        const vScore = s.validation_score;
                        const tScore = s.holdout_test_score;
                        const heapKb = Math.round(s.peak_heap_bytes.mean / 1024);
                        const rssMb = s.peak_process_rss_bytes ? (s.peak_process_rss_bytes.mean / (1024 * 1024)).toFixed(1) : "--";

                        return (
                          <tr key={mName} className={`hover:bg-[#F8FAFC] transition-colors ${isBase ? "bg-emerald-50/20" : ""}`}>
                            <td className="py-3 px-3">
                              <div className="font-bold text-[#0F172A] flex items-center gap-1.5">
                                <span>{mName}</span>
                                {isBase && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    Baseline
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-3 text-center font-mono">
                              <span className={s.n_seeds_failed > 0 ? "text-amber-600 font-bold" : "text-[#0F172A]"}>
                                {s.n_seeds_successful} / {s.n_seeds_requested}
                              </span>
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-[#0F172A]">
                              {vScore.mean.toFixed(4)}
                              {vScore.std !== null && vScore.std !== undefined ? (
                                <span className="font-normal text-[#64748B] text-[11px]">
                                  {" "}&plusmn; {vScore.std.toFixed(4)}
                                </span>
                              ) : null}
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-[#334155]">
                              {vScore.median.toFixed(4)}
                              {vScore.iqr !== null && vScore.iqr !== undefined && (
                                <span className="text-[10px] text-[#64748B] block">
                                  IQR: {vScore.iqr.toFixed(4)}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-3 text-center font-mono text-[11px] text-[#475569]">
                              {vScore.ci_95_t ? `[${vScore.ci_95_t[0].toFixed(4)}, ${vScore.ci_95_t[1].toFixed(4)}]` : "--"}
                            </td>

                            <td className="py-3 px-3 text-center font-mono text-[11px] text-[#475569]">
                              {vScore.ci_95_bootstrap ? `[${vScore.ci_95_bootstrap[0].toFixed(4)}, ${vScore.ci_95_bootstrap[1].toFixed(4)}]` : "--"}
                            </td>

                            <td className="py-3 px-3 text-right font-mono">
                              {tScore ? (
                                <span className="font-semibold text-emerald-700">
                                  {tScore.mean.toFixed(4)}
                                  {tScore.std ? ` ± ${tScore.std.toFixed(4)}` : ""}
                                </span>
                              ) : (
                                <span className="text-[#94A3B8] italic">--</span>
                              )}
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-[#475569]">
                              {s.training_duration_seconds.mean.toFixed(3)}s
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-[#475569]">
                              {s.inference_latency_ms.mean.toFixed(2)}
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-[#475569]">
                              {heapKb} KB
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-emerald-800 font-semibold">
                              {rssMb} MB
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-2 text-[11px] text-[#64748B] flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#F1F5F9]">
                  <div>
                    * <strong>Process RSS:</strong> Operating system resident set size via psutil (native libraries + Python process).
                    &middot; <strong>Peak Heap:</strong> Python object allocations via tracemalloc.
                  </div>
                  <div>
                    Degrees of freedom for sample standard deviation ddof=1 (Bessel's correction).
                  </div>
                </div>
              </div>

              {/* Seed-Matched Paired Difference & Hypothesis Testing Card */}
              <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Seed-Matched Paired Difference &amp; Statistical Significance Testing</span>
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Evaluates exact per-seed performance deltas &Delta;<sub>s</sub> = Score(Candidate) &minus; Score(Baseline).
                    Accounts for common random seeds, effect sizes (Cohen&apos;s d<sub>z</sub>), paired Student-t test, non-parametric Wilcoxon test, and Bonferroni FWER adjustment.
                  </p>
                </div>

                {robustResult.paired_comparisons.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#64748B] text-center">
                    No candidate strategies compared against baseline.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {robustResult.paired_comparisons.map((comp) => {
                      const verdictBadges: Record<string, { label: string; class: string }> = {
                        statistically_superior: {
                          label: "Statistically Superior",
                          class: "bg-emerald-100 text-emerald-800 border-emerald-300",
                        },
                        statistically_inferior: {
                          label: "Statistically Inferior",
                          class: "bg-red-100 text-red-800 border-red-300",
                        },
                        inconclusive_high_variance: {
                          label: "Inconclusive / High Variance",
                          class: "bg-amber-100 text-amber-800 border-amber-300",
                        },
                        statistically_equivalent: {
                          label: "Statistically Equivalent",
                          class: "bg-blue-100 text-blue-800 border-blue-300",
                        },
                        insufficient_sample_size: {
                          label: "Sample Size N < 5",
                          class: "bg-slate-100 text-slate-700 border-slate-300",
                        },
                      };
                      const vb = verdictBadges[comp.verdict] || verdictBadges.insufficient_sample_size;

                      return (
                        <div key={comp.method_a} className="p-5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-[#0F172A]">{comp.method_a}</span>
                              <span className="text-xs text-[#64748B]">vs Baseline</span>
                              <span className="font-bold text-sm text-[#334155]">{comp.method_b}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ml-2 ${vb.class}`}>
                                {vb.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-xs font-mono">
                              <div>
                                <span className="text-[#64748B]">Mean &Delta;: </span>
                                <strong className={comp.mean_difference >= 0 ? "text-emerald-700" : "text-red-700"}>
                                  {comp.mean_difference >= 0 ? "+" : ""}{comp.mean_difference.toFixed(4)}
                                </strong>
                              </div>
                              <div>
                                <span className="text-[#64748B]">Cohen&apos;s d<sub>z</sub>: </span>
                                <strong>{typeof comp.cohens_dz === "number" ? comp.cohens_dz.toFixed(2) : "0.00"}</strong>
                                <span className="text-[10px] text-[#64748B] ml-1 uppercase">({comp.cohens_dz_magnitude})</span>
                              </div>
                            </div>
                          </div>

                          {/* Statistical Metrics Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-white rounded-lg border border-[#E2E8F0] text-xs">
                            <div>
                              <div className="text-[10px] text-[#64748B] uppercase">Matched Seeds (N)</div>
                              <div className="font-bold font-mono text-[#0F172A]">{comp.n_matched_seeds}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-[#64748B] uppercase">95% CI of Difference</div>
                              <div className="font-mono text-[#0F172A]">
                                {comp.ci_95_difference ? `[${comp.ci_95_difference[0].toFixed(4)}, ${comp.ci_95_difference[1].toFixed(4)}]` : "--"}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-[#64748B] uppercase">Paired t-test p-value</div>
                              <div className="font-mono text-[#0F172A]">
                                {typeof comp.t_test_p_value === "number" ? comp.t_test_p_value.toFixed(4) : "N/A"}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-[#64748B] uppercase">Bonferroni Adj. p-value</div>
                              <div className="font-mono text-[#0F172A]">
                                {typeof comp.bonferroni_adjusted_p_value === "number" ? comp.bonferroni_adjusted_p_value.toFixed(4) : "N/A"}
                              </div>
                            </div>
                          </div>

                          {/* Scientific Interpretation Statement */}
                          <p className="text-xs text-[#334155] leading-relaxed italic bg-emerald-50/40 p-3 rounded-lg border border-emerald-100">
                            {comp.interpretation}
                          </p>

                          {/* Per-seed granular delta breakdown table */}
                          <div>
                            <div className="text-[11px] font-bold text-[#64748B] uppercase mb-1.5">
                              Per-Seed Matched Difference Trace (&Delta;<sub>s</sub> = Score<sub>A</sub> &minus; Score<sub>B</sub>)
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead>
                                  <tr className="border-b border-[#CBD5E1] text-[#64748B]">
                                    <th className="py-1 px-2 font-mono">Seed</th>
                                    <th className="py-1 px-2 font-mono">{comp.method_a} Score</th>
                                    <th className="py-1 px-2 font-mono">{comp.method_b} Score</th>
                                    <th className="py-1 px-2 font-mono text-right">Delta (&Delta;<sub>s</sub>)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {comp.per_seed_differences.map((rec) => (
                                    <tr key={rec.seed} className="border-b border-[#F1F5F9]">
                                      <td className="py-1.5 px-2 font-mono text-[#64748B]">{rec.seed}</td>
                                      <td className="py-1.5 px-2 font-mono font-semibold">{rec.score_a.toFixed(4)}</td>
                                      <td className="py-1.5 px-2 font-mono text-[#64748B]">{rec.score_b.toFixed(4)}</td>
                                      <td className="py-1.5 px-2 font-mono text-right font-bold">
                                        <span className={rec.delta >= 0 ? "text-emerald-700" : "text-red-700"}>
                                          {rec.delta >= 0 ? "+" : ""}{rec.delta.toFixed(4)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Execution Platform & Scientific Guidance Disclosure */}
              <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#CBD5E1] shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#1D4ED8]" />
                  <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Hardware Platform, Profiler Scope, &amp; Scientific Limitations
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs bg-white p-4 rounded-xl border border-[#E2E8F0]">
                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase block">Platform &amp; OS</span>
                    <strong className="text-[#0F172A]">{robustResult.execution_platform.platform}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase block">Python Version</span>
                    <strong className="text-[#0F172A] font-mono">{robustResult.execution_platform.python_version}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase block">CPU Cores</span>
                    <strong className="text-[#0F172A] font-mono">{robustResult.execution_platform.cpu_count} Physical / Logical</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#64748B] uppercase block">System Total RAM</span>
                    <strong className="text-[#0F172A] font-mono">{robustResult.execution_platform.system_total_ram_gb} GB</strong>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-xl border border-[#E2E8F0] space-y-2 text-xs">
                  <div className="font-bold text-[#0F172A] flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-[#1D4ED8]" />
                    <span>Scientific Guidance &amp; Methodological Disclosures</span>
                  </div>
                  <pre className="text-[11px] text-[#334155] whitespace-pre-wrap font-sans leading-relaxed">
                    {robustResult.scientific_guidance}
                  </pre>
                  <p className="text-[11px] text-[#64748B] pt-2 border-t border-[#F1F5F9]">
                    Memory Profiler Disclosure: {robustResult.execution_platform.resource_profiler_metadata?.memory_metric_distinction}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

