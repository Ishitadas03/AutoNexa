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
  Terminal,
  Cpu,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import { DatasetProfileResponse, TrainingRequest } from "@/types/api";
import RobotMascot from "@/components/landing/RobotMascot";

interface TrainingTabProps {
  activeDataset: DatasetProfileResponse | null;
  onRunTraining: (request: TrainingRequest) => Promise<void>;
  isTraining: boolean;
  trainingDuration: number;
}

const CLASSIFICATION_MODELS = [
  { id: "random_forest", label: "Random Forest Classifier", tag: "Ensemble", desc: "100 trees, bootstrap sampling, non-linear feature interactions" },
  { id: "hist_gradient_boosting", label: "Hist. Gradient Boosting", tag: "Gradient Boost", desc: "LightGBM-style histogram binned trees, fast & robust" },
  { id: "logistic_regression", label: "Logistic Regression (L2)", tag: "Linear", desc: "Calibrated probabilities, L2 regularization, fast convergence" },
  { id: "decision_tree", label: "Decision Tree Classifier", tag: "Tree", desc: "Interpretable split rules, greedy entropy reduction" },
];

const REGRESSION_MODELS = [
  { id: "random_forest", label: "Random Forest Regressor", tag: "Ensemble", desc: "Bootstrap aggregated decision trees, non-linear regression" },
  { id: "hist_gradient_boosting", label: "Hist. Gradient Boosting", tag: "Gradient Boost", desc: "High-efficiency gradient boosted decision trees" },
  { id: "ridge", label: "Ridge Regression (L2)", tag: "Linear", desc: "Tikhonov regularization, optimal for multicollinear data" },
  { id: "linear_regression", label: "Linear Regression (OLS)", tag: "Linear", desc: "Ordinary Least Squares baseline estimator" },
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
  const [holdoutTest, setHoldoutTest] = useState<boolean>(true);
  const [testSize, setTestSize] = useState<number>(0.2);
  const [randomState, setRandomState] = useState<number>(42);
  const [timeBudget, setTimeBudget] = useState<number>(60);
  const [primaryMetric, setPrimaryMetric] = useState<string>("f1_weighted");
  const [selectedModels, setSelectedModels] = useState<string[]>(["random_forest", "hist_gradient_boosting", "logistic_regression"]);

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

    const lower = lastCol.toLowerCase();
    if (
      lower.includes("price") ||
      lower.includes("income") ||
      lower.includes("cost") ||
      lower.includes("charges") ||
      lower.includes("value") ||
      lower.includes("delay")
    ) {
      setTaskType("regression");
      setPrimaryMetric("r2");
      setSelectedModels(["random_forest", "hist_gradient_boosting", "ridge"]);
    } else {
      setTaskType("classification");
      setPrimaryMetric("roc_auc");
      setSelectedModels(["random_forest", "hist_gradient_boosting", "logistic_regression"]);
    }
  }, [activeDataset]);

  const handleTaskTypeChange = (newType: "classification" | "regression") => {
    setTaskType(newType);
    if (newType === "classification") {
      setPrimaryMetric("roc_auc");
      setSelectedModels(["random_forest", "hist_gradient_boosting", "logistic_regression"]);
    } else {
      setPrimaryMetric("r2");
      setSelectedModels(["random_forest", "hist_gradient_boosting", "ridge"]);
    }
  };

  const handleToggleModel = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      if (selectedModels.length > 1) {
        setSelectedModels(selectedModels.filter((id) => id !== modelId));
      }
    } else {
      setSelectedModels([...selectedModels, modelId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDataset || !targetColumn) return;

    await onRunTraining({
      target_column: targetColumn,
      task_type: taskType,
      evaluation_strategy: evaluationStrategy,
      cv_folds: cvFolds,
      holdout_test: holdoutTest,
      test_size: testSize,
      random_state: randomState,
      time_budget_seconds: timeBudget,
      primary_metric: primaryMetric,
      models: selectedModels,
    });
  };

  const modelOptions = taskType === "classification" ? CLASSIFICATION_MODELS : REGRESSION_MODELS;

  if (!activeDataset) {
    return (
      <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
        <Cpu className="w-10 h-10 text-[#1D4ED8] mx-auto mb-3 opacity-80" />
        <h2 className="text-lg font-bold text-[#0F172A]">No Dataset Selected</h2>
        <p className="text-xs text-[#64748B] max-w-md mx-auto mt-1 mb-4 leading-relaxed font-sans">
          Please upload or select a dataset from the Datasets tab before configuring the AutoML training studio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] mb-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#334155] font-semibold">
              AUTOMATED PIPELINE COMPILER
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight font-sans">
            AutoML Studio
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Configure target objectives, in-fold cross-validation, and candidate estimators for <span className="font-mono font-semibold text-[#0F172A]">{activeDataset.filename}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] text-xs font-mono font-medium flex items-center gap-1.5 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] animate-pulse" />
            <span>Strict In-Fold CV Guarantees</span>
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main 2-Column Configuration Body */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: Target Variable & Task Objective */}
            <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-xs font-mono font-bold flex items-center justify-center">
                    1
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] font-mono">
                    Target Variable &amp; Task Objective
                  </h3>
                </div>
                <span className="text-[10.5px] font-mono text-[#64748B]">Auto-Detected</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Target Column Selection */}
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] font-mono mb-1.5">
                    Target Column (y):
                  </label>
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] text-xs font-mono focus:border-[#1D4ED8] focus:bg-white focus:outline-none cursor-pointer"
                  >
                    {colNames.map((c: string) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[#64748B] mt-1 font-sans">
                    The variable your model will learn to predict.
                  </p>
                </div>

                {/* Task Objective Selector */}
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] font-mono mb-1.5">
                    Objective Protocol:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleTaskTypeChange("classification")}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer ${
                        taskType === "classification"
                          ? "bg-[#1D4ED8] text-white border border-[#1D4ED8] shadow-xs font-bold"
                          : "bg-[#F8FAFC] border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A]"
                      }`}
                    >
                      Classification
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTaskTypeChange("regression")}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer ${
                        taskType === "regression"
                          ? "bg-[#1D4ED8] text-white border border-[#1D4ED8] shadow-xs font-bold"
                          : "bg-[#F8FAFC] border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A]"
                      }`}
                    >
                      Regression
                    </button>
                  </div>
                  <p className="text-[11px] text-[#64748B] mt-1 font-sans">
                    {taskType === "classification"
                      ? "Discrete classes (e.g. churn yes/no, tier 1/2/3)"
                      : "Continuous numerical values (e.g. price, charges)"}
                  </p>
                </div>
              </div>

              {/* Primary Optimization Metric Selection */}
              <div className="pt-3 border-t border-[#E2E8F0]">
                <label className="block text-xs font-semibold text-[#0F172A] font-mono mb-1.5">
                  Primary Leaderboard Metric:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  {taskType === "classification" ? (
                    <>
                      {["roc_auc", "f1_weighted", "accuracy", "precision_weighted"].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPrimaryMetric(m)}
                          className={`py-1.5 px-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                            primaryMetric === m
                              ? "bg-[#EFF6FF] border-[#1D4ED8] text-[#1D4ED8] font-bold"
                              : "bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:text-[#0F172A]"
                          }`}
                        >
                          {m.toUpperCase().replace("_", "-")}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      {["r2", "rmse", "mae"].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPrimaryMetric(m)}
                          className={`py-1.5 px-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                            primaryMetric === m
                              ? "bg-[#EFF6FF] border-[#1D4ED8] text-[#1D4ED8] font-bold"
                              : "bg-[#F8FAFC] border-[#CBD5E1] text-[#64748B] hover:text-[#0F172A]"
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

            {/* Step 2: Validation Scheme & Partition Guards */}
            <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-xs font-mono font-bold flex items-center justify-center">
                    2
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] font-mono">
                    Validation Scheme &amp; Partition Strategy
                  </h3>
                </div>
                <span className="text-[10.5px] font-mono text-[#15803D] font-bold">100% In-Fold Fitted</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] font-mono mb-1.5">
                    Cross-Validation Folds: <span className="text-[#1D4ED8]">{cvFolds} folds</span>
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={10}
                    step={1}
                    value={cvFolds}
                    onChange={(e) => setCvFolds(Number(e.target.value))}
                    className="w-full accent-[#1D4ED8] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#64748B] font-mono mt-1">
                    <span>2 folds</span>
                    <span className="font-bold text-[#1D4ED8]">5 (Standard)</span>
                    <span>10 folds</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] font-mono mb-1.5">
                    Untouched Holdout Partition: <span className="text-[#1D4ED8]">{Math.round(testSize * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min={0.1}
                    max={0.4}
                    step={0.05}
                    value={testSize}
                    onChange={(e) => setTestSize(Number(e.target.value))}
                    className="w-full accent-[#1D4ED8] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#64748B] font-mono mt-1">
                    <span>10%</span>
                    <span className="font-bold text-[#1D4ED8]">20% (Recommended)</span>
                    <span>40%</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between text-xs font-mono text-[#64748B] gap-2">
                <span>Random Seed: <strong className="text-[#0F172A]">{randomState}</strong> (Bitwise Deterministic)</span>
                <span>Time Budget: <strong className="text-[#0F172A]">{timeBudget}s</strong> max execution</span>
              </div>
            </div>

            {/* Step 3: Candidate Estimator Selection */}
            <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-xs font-mono font-bold flex items-center justify-center">
                    3
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] font-mono">
                    Candidate Estimators ({selectedModels.length} selected)
                  </h3>
                </div>
                <span className="text-[10.5px] font-mono text-[#64748B]">Multi-Architecture Competition</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {modelOptions.map((m) => {
                  const isChecked = selectedModels.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      onClick={() => handleToggleModel(m.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isChecked
                          ? "bg-[#EFF6FF] border-[#1D4ED8] shadow-xs"
                          : "bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#CBD5E1]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="accent-[#1D4ED8] rounded cursor-pointer mt-0.5"
                          />
                          <span className={`text-xs font-bold font-mono ${isChecked ? "text-[#1D4ED8]" : "text-[#0F172A]"}`}>
                            {m.label}
                          </span>
                        </div>
                        <span className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-white border border-[#CBD5E1] text-[#475569] shrink-0">
                          {m.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#64748B] pl-5 leading-snug font-sans">
                        {m.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right Column: Execution Center & Mascot */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white border border-[#CBD5E1] shadow-lg space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[#1D4ED8]" />
                  <h3 className="text-sm font-bold text-[#0F172A] font-mono uppercase tracking-wide">
                    Execution Center
                  </h3>
                </div>

                <div className="relative w-12 h-12 flex items-center justify-center">
                  <RobotMascot
                    size="xs"
                    state={isTraining ? "working" : "thinking"}
                    isInteractive={false}
                    showMessage={false}
                  />
                </div>
              </div>

              {/* Execution Config Details */}
              <div className="space-y-2.5 text-xs font-mono text-[#475569]">
                <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                  <span className="text-[#64748B]">Dataset:</span>
                  <span className="text-[#0F172A] font-semibold truncate max-w-[140px]">{activeDataset.filename}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                  <span className="text-[#64748B]">Target (y):</span>
                  <span className="text-[#1D4ED8] font-bold truncate max-w-[140px]">{targetColumn}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                  <span className="text-[#64748B]">Validation:</span>
                  <span className="text-[#0F172A] font-semibold">{cvFolds}-Fold Stratified CV</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                  <span className="text-[#64748B]">Metric:</span>
                  <span className="text-[#0F172A] font-semibold">{primaryMetric.toUpperCase()}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#64748B]">Estimators:</span>
                  <span className="text-[#1D4ED8] font-bold">{selectedModels.length} models</span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isTraining}
                className="w-full py-3.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(29,78,216,0.35)] transition-all cursor-pointer disabled:opacity-50"
              >
                {isTraining ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Compiling Models ({trainingDuration}s)...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-white text-white" />
                    <span>Launch AutoML Search</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Live Terminal Simulation */}
              <div className="rounded-xl bg-[#0F172A] p-3.5 text-[11px] font-mono text-slate-300 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-400 border-b border-slate-700/80 pb-1.5 mb-1.5">
                  <Terminal className="w-3 h-3 text-[#38BDF8]" />
                  <span>scikit-learn runtime console</span>
                </div>
                {isTraining ? (
                  <>
                    <p className="text-[#38BDF8]">&gt; Initializing StratifiedKFold(n_splits={cvFolds})...</p>
                    <p className="text-[#34D399]">&gt; Preprocessing fold partitions strictly in-fold...</p>
                    <p className="text-amber-300 animate-pulse">&gt; Fitting {selectedModels.length} candidate estimators ({trainingDuration}s elapsed)...</p>
                  </>
                ) : (
                  <>
                    <p className="text-slate-400">&gt; Engine idle. Ready to fit pipelines.</p>
                    <p className="text-slate-500">&gt; Zero leakage guarantees armed.</p>
                  </>
                )}
              </div>
            </div>

            {/* Scientific Reproducibility Guarantee Card */}
            <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs space-y-2 text-xs">
              <div className="flex items-center gap-2 text-[#15803D] font-mono font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Zero Target Leakage</span>
              </div>
              <p className="text-[11.5px] text-[#64748B] leading-relaxed font-sans">
                Feature scalers and categorical encoders are strictly fitted on the training split of each CV fold. The holdout partition is preserved untouched until final evaluation.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
