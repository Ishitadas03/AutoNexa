"use client";

import React, { useState, useEffect } from "react";
import {
  Zap,
  Sliders,
  ShieldCheck,
  Clock,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Layers,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { DatasetProfileResponse, TrainingRequest } from "@/types/api";

interface TrainingTabProps {
  activeDataset: DatasetProfileResponse | null;
  onRunTraining: (request: TrainingRequest) => Promise<void>;
  isTraining: boolean;
  trainingDuration: number;
}

const CLASSIFICATION_MODELS = [
  { id: "logistic_regression", label: "Logistic Regression", tag: "Linear" },
  { id: "random_forest", label: "Random Forest Classifier", tag: "Ensemble" },
  { id: "decision_tree", label: "Decision Tree Classifier", tag: "Tree" },
  { id: "dummy", label: "Dummy Stratified Baseline", tag: "Baseline" },
];

const REGRESSION_MODELS = [
  { id: "linear_regression", label: "Linear Regression (OLS)", tag: "Linear" },
  { id: "ridge", label: "Ridge Regression (L2)", tag: "Linear" },
  { id: "random_forest", label: "Random Forest Regressor", tag: "Ensemble" },
  { id: "decision_tree", label: "Decision Tree Regressor", tag: "Tree" },
  { id: "dummy", label: "Dummy Mean Baseline", tag: "Baseline" },
];

export default function TrainingTab({
  activeDataset,
  onRunTraining,
  isTraining,
  trainingDuration,
}: TrainingTabProps) {
  // Form State
  const [targetColumn, setTargetColumn] = useState<string>("");
  const [taskType, setTaskType] = useState<"classification" | "regression">("classification");
  const [evaluationStrategy, setEvaluationStrategy] = useState<"holdout" | "cross_validation">("cross_validation");
  const [cvFolds, setCvFolds] = useState<number>(5);
  const [cvRareClassFallback, setCvRareClassFallback] = useState<boolean>(true);
  const [holdoutTest, setHoldoutTest] = useState<boolean>(true);
  const [testSize, setTestSize] = useState<number>(0.2);
  const [randomState, setRandomState] = useState<number>(42);
  const [timeBudget, setTimeBudget] = useState<number>(60);
  const [primaryMetric, setPrimaryMetric] = useState<string>("f1_weighted");
  const [selectedModels, setSelectedModels] = useState<string[]>(["logistic_regression", "random_forest"]);

  const colNames =
    activeDataset?.column_names ||
    (Array.isArray((activeDataset as any)?.columns)
      ? (activeDataset as any).columns.map((c: any) => c.name)
      : []);

  // Auto-select target column when active dataset changes
  useEffect(() => {
    if (!activeDataset || colNames.length === 0) return;
    const lastCol = colNames[colNames.length - 1];
    setTargetColumn(lastCol);

    // Guess task type based on name or dtype
    const lower = lastCol.toLowerCase();
    if (
      lower.includes("price") ||
      lower.includes("income") ||
      lower.includes("cost") ||
      lower.includes("charges") ||
      lower.includes("delay")
    ) {
      setTaskType("regression");
      setPrimaryMetric("rmse");
      setSelectedModels(["linear_regression", "random_forest"]);
    } else {
      setTaskType("classification");
      setPrimaryMetric("f1_weighted");
      setSelectedModels(["logistic_regression", "random_forest"]);
    }
  }, [activeDataset]);

  const handleTaskTypeChange = (newType: "classification" | "regression") => {
    setTaskType(newType);
    if (newType === "classification") {
      setPrimaryMetric("f1_weighted");
      setSelectedModels(["logistic_regression", "random_forest"]);
    } else {
      setPrimaryMetric("rmse");
      setSelectedModels(["linear_regression", "random_forest"]);
    }
  };

  const handleToggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetColumn) return;

    const payload: TrainingRequest = {
      target_column: targetColumn,
      task_type: taskType,
      evaluation_strategy: evaluationStrategy,
      cv_folds: evaluationStrategy === "cross_validation" ? cvFolds : undefined,
      cv_rare_class_fallback: cvRareClassFallback,
      holdout_test: holdoutTest,
      test_size: testSize,
      random_state: randomState,
      time_budget_seconds: timeBudget,
      models: selectedModels.length > 0 ? selectedModels : null,
      primary_metric: primaryMetric,
    };

    await onRunTraining(payload);
  };

  if (!activeDataset) {
    return (
      <div className="p-12 text-center rounded-2xl glass-panel border border-white/5 space-y-4">
        <Sliders className="w-10 h-10 text-amber-400 mx-auto opacity-70" />
        <h3 className="text-lg font-bold text-white">No Dataset Selected</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Please upload a CSV dataset or select a pre-loaded sample dataset first before training models.
        </p>
      </div>
    );
  }

  const modelOptions = taskType === "classification" ? CLASSIFICATION_MODELS : REGRESSION_MODELS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-sans">
            AutoML Training Studio
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Configure candidate estimators, cross-validation parameters, and resource-bounded training.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
          <span className="text-slate-500">Dataset:</span>
          <span className="text-amber-400 font-semibold">{activeDataset.filename}</span>
          <span className="text-slate-500">
            ({activeDataset.rows ?? (activeDataset as any).row_count ?? 0} rows)
          </span>
        </div>
      </div>

      {/* Main Training Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 & 2: Primary Training Parameters */}
          <div className="lg:col-span-2 space-y-6">
            {/* Target & Task Card */}
            <div className="p-6 rounded-2xl glass-panel border border-white/5 space-y-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 font-mono">
                1. Target & Supervised Task Definition
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Target Column Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                    Target Column (Y)
                  </label>
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  >
                    {colNames.map((cName: string) => (
                      <option key={cName} value={cName}>
                        {cName} ({activeDataset.data_types?.[cName] || "feature"})
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    The variable you want the AutoML pipeline to predict.
                  </span>
                </div>

                {/* Task Type Switch */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                    Supervised Task Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleTaskTypeChange("classification")}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold font-mono transition-all ${
                        taskType === "classification"
                          ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                          : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      Classification
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTaskTypeChange("regression")}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold font-mono transition-all ${
                        taskType === "regression"
                          ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                          : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      Regression
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {taskType === "classification" ? "Binary or multiclass labels" : "Continuous numeric values"}
                  </span>
                </div>
              </div>

              {/* Primary Metric Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                  Primary Ranking Metric
                </label>
                <div className="flex flex-wrap gap-2">
                  {taskType === "classification" ? (
                    <>
                      {["f1_weighted", "roc_auc", "accuracy", "precision_weighted", "recall_weighted"].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPrimaryMetric(m)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                            primaryMetric === m
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold"
                              : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      {["rmse", "mae", "r2"].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPrimaryMetric(m)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                            primaryMetric === m
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold"
                              : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {m.toUpperCase()}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Validation Strategy Card */}
            <div className="p-6 rounded-2xl glass-panel border border-white/5 space-y-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 font-mono">
                2. Evaluation Protocol & Split Strategy
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-mono">
                    Evaluation Strategy
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEvaluationStrategy("cross_validation")}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold font-mono transition-all ${
                        evaluationStrategy === "cross_validation"
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/50 font-bold"
                          : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      K-Fold CV
                    </button>
                    <button
                      type="button"
                      onClick={() => setEvaluationStrategy("holdout")}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold font-mono transition-all ${
                        evaluationStrategy === "holdout"
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/50 font-bold"
                          : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      Single Holdout
                    </button>
                  </div>
                </div>

                {evaluationStrategy === "cross_validation" && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-300 font-mono">
                        CV Folds: <span className="text-amber-400">{cvFolds} folds</span>
                      </label>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={10}
                      step={1}
                      value={cvFolds}
                      onChange={(e) => setCvFolds(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                      <span>2 folds</span>
                      <span>5 (standard)</span>
                      <span>10 folds</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Sliders for Test Split & Time Budget */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-900">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-slate-300 font-mono">
                      Holdout Test Split: <span className="text-amber-400">{(testSize * 100).toFixed(0)}%</span>
                    </label>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.4}
                    step={0.05}
                    value={testSize}
                    onChange={(e) => setTestSize(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <span className="text-[10px] text-slate-500 font-mono">
                    Untouched independent holdout for unbiased final test estimate.
                  </span>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-slate-300 font-mono">
                      Max Time Budget: <span className="text-amber-400">{timeBudget}s</span>
                    </label>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={300}
                    step={15}
                    value={timeBudget}
                    onChange={(e) => setTimeBudget(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <span className="text-[10px] text-slate-500 font-mono">
                    Per-experiment wall-clock budget ceiling (5 to 300 seconds).
                  </span>
                </div>
              </div>
            </div>

            {/* Candidate Estimators Multi-Select */}
            <div className="p-6 rounded-2xl glass-panel border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 font-mono">
                  3. Candidate Estimators ({selectedModels.length} selected)
                </h3>
                <span className="text-[10px] font-mono text-slate-400">Isolated Pipeline per Candidate</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {modelOptions.map((m) => {
                  const isChecked = selectedModels.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      onClick={() => handleToggleModel(m.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isChecked
                          ? "bg-amber-500/10 border-amber-500/40 text-white"
                          : "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="accent-amber-500 rounded"
                        />
                        <span className="text-xs font-semibold font-mono">{m.label}</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                        {m.tag}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Column 3: Execution Control & Live Status Card */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl glass-panel-glow border border-amber-500/30 space-y-5">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400 fill-current" />
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                  Execution Center
                </h3>
              </div>

              <div className="space-y-2 text-xs font-mono text-slate-300">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-500">Target:</span>
                  <span className="text-amber-400 font-semibold">{targetColumn}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-500">Task:</span>
                  <span className="text-white capitalize">{taskType}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-500">Strategy:</span>
                  <span className="text-white">
                    {evaluationStrategy === "cross_validation" ? `${cvFolds}-Fold CV` : "Holdout Split"}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-500">Primary Metric:</span>
                  <span className="text-white font-semibold">{primaryMetric}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Estimators:</span>
                  <span className="text-white">{selectedModels.length} candidate(s)</span>
                </div>
              </div>

              {/* Security guarantees */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5 text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Leakage-free preprocessing</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Atomic joblib artifact save</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Hierarchical MLflow logging</span>
                </div>
              </div>

              {/* Launch Button / Spinner */}
              <button
                type="submit"
                disabled={isTraining || selectedModels.length === 0}
                className="w-full py-4 rounded-xl btn-gold text-sm font-bold flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 cursor-pointer disabled:opacity-50"
              >
                {isTraining ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Training AutoML ({trainingDuration}s)...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    <span>Launch AutoML Training</span>
                  </>
                )}
              </button>

              {isTraining && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center animate-pulse text-xs text-amber-300 font-mono">
                  Evaluating candidates across folds under strict time budget...
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
