"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  AlertTriangle,
  Activity,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  Sliders,
  Table,
  Layers,
  ChevronDown,
  ChevronUp,
  Flame,
  Info,
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
  LineChart,
  Line,
} from "recharts";
import {
  ErrorAnalysisResponse,
  TrainingResponse,
} from "@/types/api";
import { api } from "@/lib/api";
import { WorkspaceTab } from "@/lib/store";

interface ErrorAnalysisTabProps {
  activeExperiment: TrainingResponse | null;
  experiments?: TrainingResponse[];
  onNavigateTab: (tab: WorkspaceTab) => void;
  onSelectExperiment?: (id: string) => void;
}

export default function ErrorAnalysisTab({
  activeExperiment,
  experiments = [],
  onNavigateTab,
  onSelectExperiment,
}: ErrorAnalysisTabProps) {
  const [split, setSplit] = useState<"test" | "train">("test");
  const [maxExamples, setMaxExamples] = useState<number>(10);
  const [analysisData, setAnalysisData] = useState<ErrorAnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedInstance, setExpandedInstance] = useState<number | null>(null);

  // Fetch error diagnostics
  const runDiagnostics = useCallback(async () => {
    if (!activeExperiment?.experiment_id) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await api.analyzeErrors(activeExperiment.experiment_id, {
        split,
        max_error_examples: maxExamples,
      });
      setAnalysisData(res);
    } catch (err) {
      console.error("Failed to run error analysis:", err);
      const msg =
        (err as { detail?: string; message?: string })?.detail ||
        (err as { message?: string })?.message ||
        "Failed to run error diagnostics.";
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  }, [activeExperiment, split, maxExamples]);

  // Trigger diagnostics on experiment or split change
  useEffect(() => {
    if (activeExperiment?.experiment_id) {
      runDiagnostics();
    }
  }, [activeExperiment?.experiment_id, split, runDiagnostics]);

  if (!activeExperiment) {
    return (
      <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
        <AlertTriangle className="w-10 h-10 text-[#D97706] mx-auto opacity-80" />
        <h3 className="text-lg font-bold text-[#0F172A]">No Trained Model Available</h3>
        <p className="text-xs text-[#64748B] max-w-sm mx-auto font-sans leading-relaxed">
          Train an AutoML model in the Studio to generate confusion matrix breakdown, Brier score calibration, residual distributions, and feature-error correlations.
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

  const isClassification = !!analysisData?.classification_analysis;
  const isRegression = !!analysisData?.regression_analysis;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-50 text-[#D97706] border border-amber-200">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-[#0F172A] tracking-tight">
                Prediction Error Analysis &amp; Failure Modes
              </h1>
              <p className="text-xs text-[#64748B] font-sans">
                Confusion Matrices, Brier Calibration, Residuals (e = y &minus; &ycirc;), and Error Drivers
              </p>
            </div>
          </div>

          {/* Diagnostics Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 bg-[#F1F5F9] p-1 rounded-xl border border-[#CBD5E1]">
              <span className="text-[10px] text-[#64748B] font-mono px-2">Partition:</span>
              <button
                onClick={() => setSplit("test")}
                className={`px-3 py-1 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  split === "test"
                    ? "bg-white text-[#15803D] font-bold shadow-xs border border-[#86EFAC]"
                    : "text-[#475569] hover:text-[#0F172A]"
                }`}
              >
                Holdout Test (Zero Leakage)
              </button>
              <button
                onClick={() => setSplit("train")}
                className={`px-3 py-1 rounded-lg text-xs font-medium font-mono transition-all cursor-pointer ${
                  split === "train"
                    ? "bg-white text-rose-700 font-bold shadow-xs border border-rose-300"
                    : "text-[#475569] hover:text-[#0F172A]"
                }`}
              >
                Train Split (Caution)
              </button>
            </div>

            <button
              onClick={runDiagnostics}
              disabled={isLoading}
              className="px-3.5 py-1.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-[#94A3B8] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>{isLoading ? "Running..." : "Refresh Diagnostics"}</span>
            </button>
          </div>
        </div>

        {/* Leakage Warning Badge if Train Split Selected */}
        {split === "train" && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <span className="font-bold">Evaluation Leakage Caution:</span> The training partition was used for model fitting. Error metrics on this partition will underestimate true generalization loss. Switch to <b>Holdout Test</b> for unbiased verification.
            </div>
          </div>
        )}

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

          {analysisData && (
            <div className={`px-2.5 py-1 rounded-md font-mono text-[11px] flex items-center gap-1 border ${
              analysisData.is_independent_test_evaluation
                ? "bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]"
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}>
              {analysisData.is_independent_test_evaluation ? (
                <>
                  <ShieldCheck className="w-3 h-3 text-[#15803D]" />
                  <span>Verified Holdout Evaluation (N={analysisData.sample_size})</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3 h-3 text-amber-600" />
                  <span>Train Split Evaluation (N={analysisData.sample_size})</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isLoading && !analysisData && (
        <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
          <RefreshCw className="w-8 h-8 text-[#1D4ED8] animate-spin mx-auto mb-3" />
          <p className="text-xs text-[#64748B] font-mono">Computing failure modes, calibration, and residuals...</p>
        </div>
      )}

      {/* CLASSIFICATION DIAGNOSTICS */}
      {isClassification && analysisData?.classification_analysis && (
        <div className="space-y-6">
          {/* Top KPI Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">Accuracy</span>
              <span className="text-lg font-bold text-[#0F172A] font-mono">
                {(analysisData.classification_analysis.accuracy * 100).toFixed(1)}%
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">Balanced Acc</span>
              <span className="text-lg font-bold text-[#1D4ED8] font-mono">
                {analysisData.classification_analysis.balanced_accuracy !== null && analysisData.classification_analysis.balanced_accuracy !== undefined
                  ? `${(analysisData.classification_analysis.balanced_accuracy * 100).toFixed(1)}%`
                  : "—"}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">Weighted F1</span>
              <span className="text-lg font-bold text-[#15803D] font-mono">
                {analysisData.classification_analysis.f1_weighted?.toFixed(4) ?? "—"}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">Brier Score Loss</span>
              <span className="text-lg font-bold text-[#0F172A] font-mono">
                {analysisData.classification_analysis.brier_score_loss !== null && analysisData.classification_analysis.brier_score_loss !== undefined
                  ? analysisData.classification_analysis.brier_score_loss.toFixed(4)
                  : "—"}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">Error Rate</span>
              <span className="text-lg font-bold text-rose-600 font-mono">
                {(analysisData.classification_analysis.error_rate * 100).toFixed(1)}%
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">Failures / Total</span>
              <span className="text-lg font-bold text-[#0F172A] font-mono">
                {analysisData.classification_analysis.misclassified_count} / {analysisData.classification_analysis.total_samples}
              </span>
            </div>
          </div>

          {/* Confusion Matrix & Calibration Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Confusion Matrix Card */}
            <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Confusion Matrix Heatmap</h3>
                  <p className="text-[11px] text-[#64748B]">
                    Rows: True Ground Truth &middot; Columns: Model Predictions
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] font-mono">
                  {analysisData.classification_analysis.class_labels.length} Classes
                </span>
              </div>

              {/* Grid representation */}
              <div className="overflow-x-auto">
                <div className="min-w-[320px] p-2">
                  {/* Top Predicted Labels Header */}
                  <div className="text-center font-mono text-[10px] text-[#64748B] mb-2 uppercase tracking-wider">
                    Predicted Class
                  </div>
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `auto repeat(${analysisData.classification_analysis.class_labels.length}, 1fr)`,
                    }}
                  >
                    {/* Empty top-left cell */}
                    <div className="p-2 text-[10px] font-mono text-[#64748B] flex items-end justify-end">
                      Actual &darr;
                    </div>

                    {/* Column Headers */}
                    {analysisData.classification_analysis.class_labels.map((colLabel) => (
                      <div
                        key={`col-${colLabel}`}
                        className="p-2 text-center text-xs font-bold font-mono text-[#0F172A] bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] truncate"
                        title={colLabel}
                      >
                        {colLabel}
                      </div>
                    ))}

                    {/* Matrix Rows */}
                    {analysisData.classification_analysis.confusion_matrix.map((row, rIdx) => {
                      const rowLabel = analysisData.classification_analysis!.class_labels[rIdx];
                      const rowTotal = row.reduce((a, b) => a + b, 0);

                      return (
                        <React.Fragment key={`row-${rIdx}`}>
                          {/* Row Header */}
                          <div
                            className="p-2 text-xs font-bold font-mono text-[#0F172A] bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex items-center justify-end truncate"
                            title={rowLabel}
                          >
                            {rowLabel}
                          </div>

                          {/* Row Cells */}
                          {row.map((cellCount, cIdx) => {
                            const isDiagonal = rIdx === cIdx;
                            const pct = rowTotal > 0 ? (cellCount / rowTotal) * 100 : 0;

                            return (
                              <div
                                key={`cell-${rIdx}-${cIdx}`}
                                className={`p-4 rounded-xl text-center border transition-all ${
                                  isDiagonal
                                    ? "bg-[#DCFCE7]/70 border-[#86EFAC] text-[#15803D]"
                                    : cellCount > 0
                                    ? "bg-rose-50 border-rose-200 text-rose-800"
                                    : "bg-[#F8FAFC] border-[#E2E8F0] text-[#94A3B8]"
                                }`}
                              >
                                <div className="text-base font-bold font-mono">{cellCount}</div>
                                <div className="text-[10px] opacity-75 font-mono">{pct.toFixed(0)}%</div>
                              </div>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Per-Class Metrics Table */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] mb-3">Per-Class Error Diagnostics</h3>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] text-[#64748B] font-mono uppercase text-[10px] sticky top-0">
                      <tr>
                        <th className="py-2 px-2.5">Class</th>
                        <th className="py-2 px-2.5 text-right">Support</th>
                        <th className="py-2 px-2.5 text-right">Prec</th>
                        <th className="py-2 px-2.5 text-right">Recall</th>
                        <th className="py-2 px-2.5 text-right">F1</th>
                        <th className="py-2 px-2.5 text-right">FP / FN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {analysisData.classification_analysis.class_metrics.map((cm) => (
                        <tr key={cm.class_label} className="hover:bg-[#F8FAFC]">
                          <td className="py-2 px-2.5 font-bold text-[#0F172A]">{cm.class_label}</td>
                          <td className="py-2 px-2.5 text-right font-mono text-[#64748B]">{cm.support}</td>
                          <td className="py-2 px-2.5 text-right font-mono font-semibold text-[#0F172A]">
                            {cm.precision !== null && cm.precision !== undefined ? cm.precision.toFixed(3) : "—"}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-semibold text-[#0F172A]">
                            {cm.recall !== null && cm.recall !== undefined ? cm.recall.toFixed(3) : "—"}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-bold text-[#1D4ED8]">
                            {cm.f1_score !== null && cm.f1_score !== undefined ? cm.f1_score.toFixed(3) : "—"}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono text-[11px] text-[#64748B]">
                            <span className="text-rose-600">{cm.false_positives}</span> /{" "}
                            <span className="text-amber-600">{cm.false_negatives}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Confidence Calibration Bar Chart */}
              {analysisData.classification_analysis.confidence_buckets &&
                analysisData.classification_analysis.confidence_buckets.length > 0 && (
                  <div className="pt-4 mt-4 border-t border-[#E2E8F0]">
                    <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono mb-2">
                      Reliability Calibration Curve (Confidence vs Accuracy)
                    </h4>
                    <div className="h-32 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={analysisData.classification_analysis.confidence_buckets}
                          margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="bin_range" tick={{ fontSize: 9, fill: "#64748B" }} />
                          <YAxis domain={[0, 1]} tick={{ fontSize: 9, fill: "#64748B" }} />
                          <Tooltip
                            formatter={(val: any, name: any) => [
                              `${(Number(val) * 100).toFixed(1)}%`,
                              name === "observed_accuracy" ? "Observed Acc" : "Mean Conf",
                            ]}
                            contentStyle={{
                              backgroundColor: "#0F172A",
                              color: "#FFFFFF",
                              borderRadius: "8px",
                              fontSize: "11px",
                              border: "none",
                            }}
                          />
                          <Bar dataKey="observed_accuracy" fill="#10B981" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="mean_confidence" fill="#94A3B8" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
            </div>
          </div>

          {/* Top Misclassified Instances Table */}
          {analysisData.classification_analysis.top_misclassified_examples.length > 0 && (
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Prioritized Misclassified Instances</h3>
                  <p className="text-[11px] text-[#64748B]">
                    Highest confidence failure modes requiring model inspection or data relabeling.
                  </p>
                </div>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                  {analysisData.classification_analysis.top_misclassified_examples.length} High-Loss Records
                </span>
              </div>

              <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl overflow-hidden">
                {analysisData.classification_analysis.top_misclassified_examples.map((item, idx) => {
                  const isExpanded = expandedInstance === item.record_index;

                  return (
                    <div key={item.record_index} className="p-3.5 hover:bg-[#F8FAFC] transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono font-bold text-[#64748B]">
                            #{idx + 1} (Row {item.record_index})
                          </span>

                          <div className="flex items-center gap-2 text-xs">
                            <span className="px-2 py-0.5 rounded bg-[#DCFCE7] text-[#15803D] font-mono border border-[#86EFAC]">
                              True: <b>{item.true_label}</b>
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#94A3B8]" />
                            <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-mono border border-rose-200">
                              Predicted: <b>{item.predicted_label}</b>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {item.confidence !== null && item.confidence !== undefined && (
                            <span className="text-xs font-mono text-[#D97706] font-bold">
                              {(item.confidence * 100).toFixed(1)}% Conf
                            </span>
                          )}

                          <button
                            onClick={() => setExpandedInstance(isExpanded ? null : item.record_index)}
                            className="text-xs text-[#1D4ED8] hover:underline font-mono flex items-center gap-1 cursor-pointer"
                          >
                            <span>{isExpanded ? "Hide Features" : "Inspect Features"}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 p-3 rounded-lg bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-mono grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {Object.entries(item.input_features).map(([k, v]) => (
                            <div key={k} className="p-1.5 rounded bg-white border border-[#E2E8F0]">
                              <span className="text-[10px] text-[#64748B] block truncate" title={k}>
                                {k}
                              </span>
                              <span className="font-bold text-[#0F172A] truncate block" title={String(v)}>
                                {String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* REGRESSION DIAGNOSTICS */}
      {isRegression && analysisData?.regression_analysis && (
        <div className="space-y-6">
          {/* Top KPI Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">MAE</span>
              <span className="text-lg font-bold text-[#1D4ED8] font-mono">
                {analysisData.regression_analysis.residual_summary.mae.toFixed(4)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">RMSE</span>
              <span className="text-lg font-bold text-[#0F172A] font-mono">
                {analysisData.regression_analysis.residual_summary.rmse.toFixed(4)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">Median AE</span>
              <span className="text-lg font-bold text-[#15803D] font-mono">
                {analysisData.regression_analysis.residual_summary.median_absolute_error.toFixed(4)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">R&sup2; Score</span>
              <span className="text-lg font-bold text-[#0F172A] font-mono">
                {analysisData.regression_analysis.residual_summary.r2_score !== null && analysisData.regression_analysis.residual_summary.r2_score !== undefined
                  ? analysisData.regression_analysis.residual_summary.r2_score.toFixed(4)
                  : "—"}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">Max Error</span>
              <span className="text-lg font-bold text-rose-600 font-mono">
                {analysisData.regression_analysis.residual_summary.max_absolute_error.toFixed(4)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs">
              <span className="text-[10px] uppercase font-mono text-[#64748B] block">Evaluated Split</span>
              <span className="text-lg font-bold text-[#0F172A] font-mono">
                N={analysisData.regression_analysis.total_samples}
              </span>
            </div>
          </div>

          {/* Residual Distribution & Feature Error Correlations */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Residual Statistics Card */}
            <div className="lg:col-span-6 p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">Residual Distribution Percentiles</h3>
                <p className="text-[11px] text-[#64748B]">
                  Convention: <span className="font-mono text-[#1D4ED8]">e = y &minus; &ycirc;</span> (positive = underpredicted, negative = overpredicted)
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] text-[#64748B] font-mono block">Min (Largest Over)</span>
                  <span className="text-xs font-bold font-mono text-rose-600">
                    {analysisData.regression_analysis.residual_summary.min_residual.toFixed(3)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] text-[#64748B] font-mono block">25th Percentile</span>
                  <span className="text-xs font-bold font-mono text-[#0F172A]">
                    {analysisData.regression_analysis.residual_summary.p25_residual.toFixed(3)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] text-[#64748B] font-mono block">Median Residual</span>
                  <span className="text-xs font-bold font-mono text-[#1D4ED8]">
                    {analysisData.regression_analysis.residual_summary.median_residual.toFixed(3)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[10px] text-[#64748B] font-mono block">75th Percentile</span>
                  <span className="text-xs font-bold font-mono text-[#0F172A]">
                    {analysisData.regression_analysis.residual_summary.p75_residual.toFixed(3)}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-mono flex items-center justify-between">
                <span>Mean Residual: <b>{analysisData.regression_analysis.residual_summary.mean_residual.toFixed(4)}</b></span>
                <span>Std Dev: <b>&plusmn;{analysisData.regression_analysis.residual_summary.std_residual.toFixed(4)}</b></span>
              </div>
            </div>

            {/* Feature Error Correlations Card */}
            <div className="lg:col-span-6 p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">Feature Error Correlations</h3>
                <p className="text-[11px] text-[#64748B]">
                  Measures correlation between numeric features and absolute error |e|.
                </p>
              </div>

              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] text-[#64748B] font-mono uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Feature Name</th>
                      <th className="py-2 px-3 text-right">Corr with |e|</th>
                      <th className="py-2 px-3">Interpretation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {analysisData.regression_analysis.feature_error_correlations.map((fc) => (
                      <tr key={fc.feature_name} className="hover:bg-[#F8FAFC]">
                        <td className="py-1.5 px-3 font-semibold text-[#0F172A]">{fc.feature_name}</td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold text-[#1D4ED8]">
                          {fc.correlation_with_absolute_error > 0
                            ? `+${fc.correlation_with_absolute_error.toFixed(3)}`
                            : fc.correlation_with_absolute_error.toFixed(3)}
                        </td>
                        <td className="py-1.5 px-3 text-[11px] text-[#64748B]">{fc.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Categorical Error Slices if available */}
          {analysisData.regression_analysis.categorical_slices &&
            analysisData.regression_analysis.categorical_slices.length > 0 && (
              <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-3">
                <h3 className="text-sm font-bold text-[#0F172A]">Categorical Error Slices</h3>
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] text-[#64748B] font-mono uppercase text-[10px]">
                      <tr>
                        <th className="py-2 px-3">Feature</th>
                        <th className="py-2 px-3">Subgroup Value</th>
                        <th className="py-2 px-3 text-right">Sample Count</th>
                        <th className="py-2 px-3 text-right">Subgroup MAE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {analysisData.regression_analysis.categorical_slices.map((cs, idx) => (
                        <tr key={idx} className="hover:bg-[#F8FAFC]">
                          <td className="py-1.5 px-3 font-semibold text-[#0F172A]">{cs.feature_name}</td>
                          <td className="py-1.5 px-3 font-mono">{cs.category_value}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-[#64748B]">{cs.sample_count}</td>
                          <td className="py-1.5 px-3 text-right font-mono font-bold text-[#1D4ED8]">
                            {cs.mae.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* Top Outlier Residuals Table */}
          {analysisData.regression_analysis.top_error_examples.length > 0 && (
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Top Residual Outliers (Worst Predictions)</h3>
                  <p className="text-[11px] text-[#64748B]">
                    Instances with largest absolute errors |e| = |y &minus; &ycirc;|
                  </p>
                </div>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                  {analysisData.regression_analysis.top_error_examples.length} Outliers
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] text-[#64748B] font-mono uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Row Index</th>
                      <th className="py-2 px-3 text-right">Ground Truth (y)</th>
                      <th className="py-2 px-3 text-right">Predicted (&ycirc;)</th>
                      <th className="py-2 px-3 text-right">Residual (e)</th>
                      <th className="py-2 px-3 text-right">Absolute Error |e|</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {analysisData.regression_analysis.top_error_examples.map((item) => (
                      <tr key={item.record_index} className="hover:bg-[#F8FAFC]">
                        <td className="py-2 px-3 font-mono font-bold text-[#64748B]">#{item.record_index}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-[#0F172A]">
                          {item.true_value.toFixed(3)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[#1D4ED8]">
                          {item.predicted_value.toFixed(3)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-mono font-bold ${
                            item.residual >= 0 ? "text-amber-700" : "text-rose-700"
                          }`}
                        >
                          {item.residual > 0 ? `+${item.residual.toFixed(3)}` : item.residual.toFixed(3)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-rose-600">
                          {item.absolute_error.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evaluation Notice Footer */}
      {analysisData?.evaluation_notice && (
        <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-[#475569] text-xs flex items-center gap-2">
          <Info className="w-4 h-4 text-[#1D4ED8] shrink-0" />
          <span className="font-mono">{analysisData.evaluation_notice}</span>
        </div>
      )}
    </div>
  );
}
