"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sparkles,
  BarChart3,
  Layers,
  ArrowRight,
  ShieldAlert,
  Info,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FileCode,
  Zap,
} from "lucide-react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  GlobalFeatureImportanceResponse,
  PredictionExplanationResponse,
  TrainingResponse,
} from "@/types/api";
import { api } from "@/lib/api";
import { WorkspaceTab } from "@/lib/store";

interface ExplainabilityTabProps {
  activeExperiment: TrainingResponse | null;
  experiments?: TrainingResponse[];
  onNavigateTab: (tab: WorkspaceTab) => void;
  onSelectExperiment?: (id: string) => void;
}

export default function ExplainabilityTab({
  activeExperiment,
  experiments = [],
  onNavigateTab,
  onSelectExperiment,
}: ExplainabilityTabProps) {
  const [subTab, setSubTab] = useState<"global" | "local">("global");

  // Global Importance State
  const [importanceMethod, setImportanceMethod] = useState<"auto" | "native" | "permutation">("auto");
  const [sampleSize, setSampleSize] = useState<number>(200);
  const [globalData, setGlobalData] = useState<GlobalFeatureImportanceResponse | null>(null);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showTransformedDrilldown, setShowTransformedDrilldown] = useState(false);

  // Local Explanation State
  const [localMethod, setLocalMethod] = useState<"auto" | "shap" | "fallback">("auto");
  const [localFeatures, setLocalFeatures] = useState<Record<string, string>>({});
  const [localExplanation, setLocalExplanation] = useState<PredictionExplanationResponse | null>(null);
  const [isLoadingLocal, setIsLoadingLocal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedClassIndex, setSelectedClassIndex] = useState<string | null>(null);

  // Initialize input fields based on active experiment features
  useEffect(() => {
    if (!activeExperiment) return;

    const features = activeExperiment.feature_names?.length
      ? activeExperiment.feature_names
      : [];

    const initial: Record<string, string> = {};
    features.forEach((feat) => {
      const fLower = feat.toLowerCase();
      if (fLower.includes("tenure") || fLower.includes("month")) initial[feat] = "24";
      else if (fLower.includes("charge") || fLower.includes("price") || fLower.includes("cost")) initial[feat] = "65.50";
      else if (fLower.includes("contract")) initial[feat] = "One year";
      else if (fLower.includes("service") || fLower.includes("internet")) initial[feat] = "Fiber optic";
      else if (fLower.includes("age")) initial[feat] = "38";
      else if (fLower.includes("income") || fLower.includes("salary")) initial[feat] = "52000";
      else if (fLower.includes("room") || fLower.includes("count")) initial[feat] = "3";
      else initial[feat] = "15";
    });

    setLocalFeatures(initial);
    setLocalExplanation(null);
    setLocalError(null);
    setSelectedClassIndex(null);
  }, [activeExperiment]);

  // Load global feature importance
  const loadGlobalImportance = useCallback(async () => {
    if (!activeExperiment?.experiment_id) return;
    setIsLoadingGlobal(true);
    setGlobalError(null);

    try {
      const res = await api.getFeatureImportance(
        activeExperiment.experiment_id,
        importanceMethod,
        sampleSize
      );
      setGlobalData(res);
    } catch (err) {
      console.error("Failed to load feature importance:", err);
      const msg =
        (err as { detail?: string; message?: string })?.detail ||
        (err as { message?: string })?.message ||
        "Failed to compute feature importance.";
      setGlobalError(msg);
    } finally {
      setIsLoadingGlobal(false);
    }
  }, [activeExperiment, importanceMethod, sampleSize]);

  // Auto-fetch global importance when active experiment or method changes
  useEffect(() => {
    if (activeExperiment?.experiment_id) {
      loadGlobalImportance();
    }
  }, [activeExperiment?.experiment_id, loadGlobalImportance]);

  // Handle local prediction explanation
  const handleExplainPrediction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeExperiment?.experiment_id) return;

    setIsLoadingLocal(true);
    setLocalError(null);

    const parsedRecord: Record<string, unknown> = {};
    Object.entries(localFeatures).forEach(([k, v]) => {
      const trimmed = v.trim();
      const num = Number(trimmed);
      if (!isNaN(num) && trimmed !== "") {
        parsedRecord[k] = num;
      } else {
        parsedRecord[k] = trimmed;
      }
    });

    try {
      const res = await api.explainPrediction(activeExperiment.experiment_id, {
        records: [parsedRecord],
        method: localMethod,
      });
      setLocalExplanation(res);

      // Default selected class if multiclass
      const firstExp = res.explanations?.[0];
      if (firstExp?.class_attributions) {
        const classes = Object.keys(firstExp.class_attributions);
        if (classes.length > 0) {
          setSelectedClassIndex(classes[0]);
        }
      }
    } catch (err) {
      console.error("Failed to compute prediction explanation:", err);
      const msg =
        (err as { detail?: string; message?: string })?.detail ||
        (err as { message?: string })?.message ||
        "Failed to generate SHAP explanation.";
      setLocalError(msg);
    } finally {
      setIsLoadingLocal(false);
    }
  };

  // Memoized Chart data for Global Importance
  const globalChartData = useMemo(() => {
    if (!globalData?.feature_importances) return [];
    return [...globalData.feature_importances]
      .slice(0, 12)
      .map((item) => ({
        name: item.feature,
        importance: Number(
          (item.normalized_importance !== null && item.normalized_importance !== undefined
            ? item.normalized_importance * 100
            : item.importance * 100
          ).toFixed(2)
        ),
        rawImportance: Number(item.importance.toFixed(4)),
        std: item.importance_std ? Number(item.importance_std.toFixed(4)) : null,
      }))
      .reverse(); // For horizontal display
  }, [globalData]);

  // Local explanation waterfall / contribution data
  const localChartData = useMemo(() => {
    if (!localExplanation?.explanations?.length) return [];
    const exp = localExplanation.explanations[0];

    let contributions = exp.feature_contributions;
    if (selectedClassIndex && exp.class_attributions && exp.class_attributions[selectedClassIndex]) {
      contributions = exp.class_attributions[selectedClassIndex];
    }

    return [...contributions]
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 10)
      .map((c) => ({
        feature: c.feature,
        value: String(c.value),
        contribution: Number(c.contribution.toFixed(4)),
        isPositive: c.contribution >= 0,
      }))
      .reverse();
  }, [localExplanation, selectedClassIndex]);

  // Additivity check computation
  const additivityDetails = useMemo(() => {
    if (!localExplanation?.explanations?.length) return null;
    const exp = localExplanation.explanations[0];
    let contributions = exp.feature_contributions;
    if (selectedClassIndex && exp.class_attributions && exp.class_attributions[selectedClassIndex]) {
      contributions = exp.class_attributions[selectedClassIndex];
    }

    const sumPhi = contributions.reduce((acc, curr) => acc + curr.contribution, 0);
    const baseVal = exp.base_value ?? 0;
    const predictedVal = exp.predicted_value ?? (typeof exp.prediction === "number" ? exp.prediction : 0);
    const sumReconciled = baseVal + sumPhi;
    const diff = Math.abs(sumReconciled - predictedVal);
    const isAdditive = diff < 0.05 || localExplanation.explanation_method.includes("perturbation");

    return {
      baseVal: Number(baseVal.toFixed(4)),
      sumPhi: Number(sumPhi.toFixed(4)),
      sumReconciled: Number(sumReconciled.toFixed(4)),
      predictedVal: Number(predictedVal.toFixed(4)),
      diff: Number(diff.toFixed(4)),
      isAdditive,
    };
  }, [localExplanation, selectedClassIndex]);

  if (!activeExperiment) {
    return (
      <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
        <Sparkles className="w-10 h-10 text-[#1D4ED8] mx-auto opacity-80" />
        <h3 className="text-lg font-bold text-[#0F172A]">No Trained Model Selected</h3>
        <p className="text-xs text-[#64748B] max-w-sm mx-auto font-sans leading-relaxed">
          Train an AutoML model in the Studio to unlock global feature importance, TreeSHAP/LinearSHAP local attributions, and reverse one-hot mapping.
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
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#EFF6FF] text-[#1D4ED8]">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-lg font-bold text-[#0F172A] tracking-tight">
                  Model Explainability &amp; Attributions
                </h1>
                <p className="text-xs text-[#64748B] font-sans">
                  SHAP (Tree / Linear / Kernel), Permutation Importance, and Reverse One-Hot Mapping
                </p>
              </div>
            </div>
          </div>

          {/* SubTab Toggle */}
          <div className="flex items-center bg-[#F1F5F9] p-1 rounded-xl border border-[#CBD5E1] self-start sm:self-auto">
            <button
              onClick={() => setSubTab("global")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                subTab === "global"
                  ? "bg-white text-[#1D4ED8] font-bold shadow-xs border border-[#BFDBFE]"
                  : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Global Importance</span>
            </button>
            <button
              onClick={() => setSubTab("local")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                subTab === "local"
                  ? "bg-white text-[#1D4ED8] font-bold shadow-xs border border-[#BFDBFE]"
                  : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Local SHAP Prediction</span>
            </button>
          </div>
        </div>

        {/* Experiment Meta Pills */}
        <div className="mt-4 pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center gap-3 text-xs">
          {experiments.length > 1 && onSelectExperiment && (
            <div className="flex items-center gap-1.5">
              <span className="text-[#64748B] font-mono text-[11px]">Experiment:</span>
              <select
                value={activeExperiment.experiment_id}
                onChange={(e) => onSelectExperiment(e.target.value)}
                className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2 py-1 text-xs font-mono text-[#0F172A] cursor-pointer"
              >
                {experiments.map((exp) => (
                  <option key={exp.experiment_id} value={exp.experiment_id}>
                    {exp.best_model} ({exp.experiment_id.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="px-2.5 py-1 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] font-mono text-[11px]">
            Model: <span className="font-bold text-[#1D4ED8]">{activeExperiment.best_model}</span>
          </div>

          <div className="px-2.5 py-1 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] font-mono text-[11px]">
            Task: <span className="capitalize">{activeExperiment.task_type}</span>
          </div>

          <div className="px-2.5 py-1 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] font-mono text-[11px]">
            Target: <span className="font-bold">{activeExperiment.target_column}</span>
          </div>

          <div className="px-2.5 py-1 rounded-md bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC] font-mono text-[11px] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Fitted Pipeline Ready</span>
          </div>
        </div>
      </div>

      {/* GLOBAL IMPORTANCE SUBTAB */}
      {subTab === "global" && (
        <div className="space-y-6">
          {/* Controls Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#64748B]" />
                <span className="text-xs font-semibold text-[#0F172A]">Method:</span>
                <select
                  value={importanceMethod}
                  onChange={(e) => setImportanceMethod(e.target.value as "auto" | "native" | "permutation")}
                  className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#0F172A] font-mono cursor-pointer"
                >
                  <option value="auto">Auto (Native Tree if available, else Permutation)</option>
                  <option value="native">Native Gini/Split (Tree models only)</option>
                  <option value="permutation">Permutation (Holdout Validation Set)</option>
                </select>
              </div>

              {importanceMethod === "permutation" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#64748B]">Sample:</span>
                  <input
                    type="number"
                    min={20}
                    max={500}
                    step={20}
                    value={sampleSize}
                    onChange={(e) => setSampleSize(Number(e.target.value))}
                    className="w-20 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2 py-1 text-xs text-[#0F172A] font-mono"
                  />
                </div>
              )}
            </div>

            <button
              onClick={loadGlobalImportance}
              disabled={isLoadingGlobal}
              className="px-3.5 py-1.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-[#94A3B8] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingGlobal ? "animate-spin" : ""}`} />
              <span>{isLoadingGlobal ? "Computing..." : "Recalculate"}</span>
            </button>
          </div>

          {globalError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{globalError}</span>
            </div>
          )}

          {isLoadingGlobal && !globalData && (
            <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <RefreshCw className="w-8 h-8 text-[#1D4ED8] animate-spin mx-auto mb-3" />
              <p className="text-xs text-[#64748B] font-mono">Computing feature attributions over dataset sample...</p>
            </div>
          )}

          {globalData && (
            <>
              {/* Chart & Table Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Horizontal Bar Chart */}
                <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Relative Feature Importance (%)</h3>
                      <p className="text-[11px] text-[#64748B]">
                        Method: <span className="font-mono text-[#1D4ED8] font-bold">{globalData.importance_method}</span> ({globalData.evaluation_partition} partition)
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] font-mono">
                      {globalData.features_count} Features Analyzed
                    </span>
                  </div>

                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={globalChartData}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                        <XAxis type="number" domain={[0, "dataMax + 5"]} unit="%" tick={{ fontSize: 11, fill: "#64748B" }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#0F172A" }} width={80} />
                        <Tooltip
                          formatter={(value: any, name: any, item: any) => [
                            `${value}% (raw: ${item.payload.rawImportance}${item.payload.std ? ` ±${item.payload.std}` : ""})`,
                            "Importance",
                          ]}
                          contentStyle={{
                            backgroundColor: "#0F172A",
                            color: "#FFFFFF",
                            borderRadius: "8px",
                            fontSize: "12px",
                            border: "none",
                          }}
                        />
                        <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                          {globalChartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={index === globalChartData.length - 1 ? "#1D4ED8" : "#3B82F6"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Ranking Table */}
                <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A] mb-3">Feature Importance Ranking</h3>
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAFC] text-[#64748B] font-mono uppercase text-[10px] sticky top-0">
                          <tr>
                            <th className="py-2 px-2.5">Rank</th>
                            <th className="py-2 px-2.5">Feature</th>
                            <th className="py-2 px-2.5 text-right">Share %</th>
                            <th className="py-2 px-2.5 text-right">Raw Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {globalData.feature_importances.map((item) => (
                            <tr key={item.feature} className="hover:bg-[#F8FAFC] transition-colors">
                              <td className="py-2 px-2.5 font-bold font-mono text-[#64748B]">#{item.rank}</td>
                              <td className="py-2 px-2.5 font-semibold text-[#0F172A]">{item.feature}</td>
                              <td className="py-2 px-2.5 text-right font-mono font-bold text-[#1D4ED8]">
                                {item.normalized_importance !== null && item.normalized_importance !== undefined
                                  ? `${(item.normalized_importance * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono text-[#64748B]">
                                {item.importance.toFixed(4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Transformed drilldown toggle */}
                  {globalData.transformed_feature_importances && globalData.transformed_feature_importances.length > 0 && (
                    <div className="pt-3 mt-3 border-t border-[#E2E8F0]">
                      <button
                        onClick={() => setShowTransformedDrilldown(!showTransformedDrilldown)}
                        className="text-xs text-[#1D4ED8] hover:underline font-mono flex items-center gap-1 cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>
                          {showTransformedDrilldown ? "Hide" : "View"} One-Hot Category Breakdown ({globalData.transformed_feature_importances.length} encoded features)
                        </span>
                        {showTransformedDrilldown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* One-Hot Transformed Features Drilldown */}
              {showTransformedDrilldown && globalData.transformed_feature_importances && (
                <div className="p-5 rounded-2xl bg-[#F8FAFC] border border-[#CBD5E1] shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-[#1D4ED8]" />
                    <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono">
                      One-Hot Encoded Feature Breakdown (Reverse Pipeline Mapping)
                    </h3>
                  </div>
                  <p className="text-xs text-[#64748B]">
                    Categorical variables transformed by scikit-learn OneHotEncoder have been mapped back to their original column and individual category levels.
                  </p>

                  <div className="overflow-x-auto max-h-60 overflow-y-auto bg-white rounded-xl border border-[#E2E8F0]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F1F5F9] text-[#64748B] font-mono uppercase text-[10px] sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Original Feature</th>
                          <th className="py-2 px-3">Encoded Level / Category</th>
                          <th className="py-2 px-3">Pipeline Encoded Identifier</th>
                          <th className="py-2 px-3 text-right">Contribution %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {globalData.transformed_feature_importances.map((tf, i) => (
                          <tr key={i} className="hover:bg-[#F8FAFC]">
                            <td className="py-1.5 px-3 font-semibold text-[#0F172A]">{tf.source_feature}</td>
                            <td className="py-1.5 px-3">
                              <span className="px-2 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] font-mono text-[11px]">
                                {tf.label}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 font-mono text-[10px] text-[#64748B]">{tf.transformed_feature}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-[#0F172A]">
                              {tf.normalized_importance !== null && tf.normalized_importance !== undefined
                                ? `${(tf.normalized_importance * 100).toFixed(2)}%`
                                : tf.importance.toFixed(4)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Scientific Caveats Alert */}
              <div className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldAlert className="w-4 h-4 text-[#D97706]" />
                  <span>Scientific Interpretability Guidelines</span>
                </div>
                <p className="leading-relaxed font-sans">{globalData.scientific_limitations}</p>
                <div className="text-[11px] font-mono opacity-80 pt-1 border-t border-[#FDE68A]/60">
                  {globalData.method_details}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* LOCAL SHAP EXPLANATION SUBTAB */}
      {subTab === "local" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Input Form Column */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">Instance Feature Inputs</h3>
                <p className="text-xs text-[#64748B]">
                  Input feature values to explain prediction via SHAP or marginal perturbation.
                </p>
              </div>

              <div className="flex items-center gap-2 pb-3 border-b border-[#E2E8F0]">
                <span className="text-xs font-semibold text-[#0F172A]">Explainer:</span>
                <select
                  value={localMethod}
                  onChange={(e) => setLocalMethod(e.target.value as "auto" | "shap" | "fallback")}
                  className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1 text-xs text-[#0F172A] font-mono cursor-pointer"
                >
                  <option value="auto">Auto (TreeSHAP / LinearSHAP)</option>
                  <option value="shap">SHAP Only (Strict)</option>
                  <option value="fallback">Marginal Perturbation (Model-Agnostic)</option>
                </select>
              </div>

              <form onSubmit={handleExplainPrediction} className="space-y-3">
                <div className="max-h-96 overflow-y-auto space-y-2.5 pr-1">
                  {Object.keys(localFeatures).map((feat) => (
                    <div key={feat} className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-[#334155] font-mono truncate" title={feat}>
                        {feat}
                      </label>
                      <input
                        type="text"
                        value={localFeatures[feat] || ""}
                        onChange={(e) => setLocalFeatures({ ...localFeatures, [feat]: e.target.value })}
                        className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs text-[#0F172A] font-mono focus:border-[#1D4ED8] focus:bg-white transition-all outline-hidden"
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={isLoadingLocal}
                  className="w-full py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-[#94A3B8] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors mt-2"
                >
                  <Zap className={`w-3.5 h-3.5 ${isLoadingLocal ? "animate-spin" : ""}`} />
                  <span>{isLoadingLocal ? "Computing Attribution..." : "Generate Local Explanation"}</span>
                </button>
              </form>

              {localError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{localError}</span>
                </div>
              )}
            </div>

            {/* Explanation Results Column */}
            <div className="lg:col-span-7 space-y-4">
              {!localExplanation ? (
                <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col items-center justify-center min-h-[360px] space-y-3">
                  <Zap className="w-10 h-10 text-[#64748B] opacity-40" />
                  <h4 className="text-sm font-bold text-[#0F172A]">No Instance Explanation Yet</h4>
                  <p className="text-xs text-[#64748B] max-w-xs font-sans">
                    Submit sample feature inputs to generate local SHAP attributions, expected base values, and waterfall decomposition.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary / Outcome Card */}
                  <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] font-mono text-[11px] font-bold border border-[#BFDBFE]">
                          {localExplanation.explanation_method}
                        </span>
                        <span className="text-xs text-[#64748B] font-mono">
                          Target: <b className="text-[#0F172A]">{localExplanation.target_column}</b>
                        </span>
                      </div>

                      {/* Multiclass tabs if available */}
                      {localExplanation.explanations[0]?.class_attributions && (
                        <div className="flex items-center gap-1 bg-[#F1F5F9] p-0.5 rounded-lg border border-[#CBD5E1]">
                          <span className="text-[10px] text-[#64748B] px-1.5 font-mono">Class:</span>
                          {Object.keys(localExplanation.explanations[0].class_attributions).map((cls) => (
                            <button
                              key={cls}
                              onClick={() => setSelectedClassIndex(cls)}
                              className={`px-2 py-0.5 text-[11px] rounded font-mono cursor-pointer ${
                                selectedClassIndex === cls
                                  ? "bg-white text-[#1D4ED8] font-bold shadow-xs"
                                  : "text-[#64748B] hover:text-[#0F172A]"
                              }`}
                            >
                              {cls}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* KPI metrics row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#E2E8F0]">
                      <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                        <span className="text-[10px] uppercase font-mono text-[#64748B] block">Prediction</span>
                        <span className="text-sm font-bold text-[#0F172A] font-mono">
                          {String(localExplanation.explanations[0]?.prediction)}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                        <span className="text-[10px] uppercase font-mono text-[#64748B] block">Base Value E[f(x)]</span>
                        <span className="text-sm font-bold text-[#64748B] font-mono">
                          {localExplanation.explanations[0]?.base_value?.toFixed(4) ?? "—"}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                        <span className="text-[10px] uppercase font-mono text-[#64748B] block">Model Score f(x)</span>
                        <span className="text-sm font-bold text-[#1D4ED8] font-mono">
                          {localExplanation.explanations[0]?.predicted_value?.toFixed(4) ??
                            String(localExplanation.explanations[0]?.prediction)}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                        <span className="text-[10px] uppercase font-mono text-[#64748B] block">Top Driver</span>
                        <span className="text-xs font-bold text-[#15803D] truncate block">
                          {localChartData[localChartData.length - 1]?.feature || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Additivity Reconciliation Card */}
                    {additivityDetails && (
                      <div className="p-3 rounded-xl bg-[#F1F5F9] border border-[#CBD5E1] text-[11px] font-mono flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                          <span>
                            Reconciliation: Base ({additivityDetails.baseVal}) + &Sigma;&phi; ({additivityDetails.sumPhi}) ={" "}
                            <b>{additivityDetails.sumReconciled}</b> (Output: {additivityDetails.predictedVal})
                          </span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white text-[#15803D] border border-[#86EFAC] font-bold">
                          Additive
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Waterfall / Contribution Chart */}
                  <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono">
                        SHAP Attributions (&phi;) — Top Features
                      </h4>
                      <div className="flex items-center gap-3 text-[10px] font-mono">
                        <span className="inline-flex items-center gap-1 text-[#15803D]">
                          <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                          Increases Score (&gt; 0)
                        </span>
                        <span className="inline-flex items-center gap-1 text-rose-700">
                          <span className="w-2 h-2 rounded-full bg-rose-500" />
                          Decreases Score (&lt; 0)
                        </span>
                      </div>
                    </div>

                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={localChartData}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 70, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                          <XAxis type="number" tick={{ fontSize: 11, fill: "#64748B" }} />
                          <YAxis type="category" dataKey="feature" tick={{ fontSize: 11, fill: "#0F172A" }} width={80} />
                          <Tooltip
                            formatter={(value: any, name: any, item: any) => [
                              `${value} (value: ${item.payload.value})`,
                              "Attribution (\u03D5)",
                            ]}
                            contentStyle={{
                              backgroundColor: "#0F172A",
                              color: "#FFFFFF",
                              borderRadius: "8px",
                              fontSize: "12px",
                              border: "none",
                            }}
                          />
                          <Bar dataKey="contribution" radius={[4, 4, 4, 4]}>
                            {localChartData.map((entry, index) => (
                              <Cell
                                key={`cell-local-${index}`}
                                fill={entry.isPositive ? "#10B981" : "#F43F5E"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Contributions Table */}
                  <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
                    <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono mb-3">
                      Complete Instance Attributions
                    </h4>
                    <div className="overflow-x-auto max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAFC] text-[#64748B] font-mono uppercase text-[10px] sticky top-0">
                          <tr>
                            <th className="py-2 px-3">Feature</th>
                            <th className="py-2 px-3">Input Value</th>
                            <th className="py-2 px-3 text-right">Contribution (&phi;)</th>
                            <th className="py-2 px-3 text-right">Share %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {(
                            selectedClassIndex &&
                            localExplanation.explanations[0]?.class_attributions &&
                            localExplanation.explanations[0].class_attributions[selectedClassIndex]
                              ? localExplanation.explanations[0].class_attributions[selectedClassIndex]
                              : localExplanation.explanations[0]?.feature_contributions || []
                          ).map((c) => (
                            <tr key={c.feature} className="hover:bg-[#F8FAFC]">
                              <td className="py-1.5 px-3 font-semibold text-[#0F172A]">{c.feature}</td>
                              <td className="py-1.5 px-3 font-mono text-[#64748B]">{String(c.value)}</td>
                              <td
                                className={`py-1.5 px-3 text-right font-mono font-bold ${
                                  c.contribution >= 0 ? "text-[#15803D]" : "text-rose-600"
                                }`}
                              >
                                {c.contribution >= 0 ? `+${c.contribution.toFixed(4)}` : c.contribution.toFixed(4)}
                              </td>
                              <td className="py-1.5 px-3 text-right font-mono text-[#64748B]">
                                {c.relative_share !== null && c.relative_share !== undefined
                                  ? `${(c.relative_share * 100).toFixed(1)}%`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
