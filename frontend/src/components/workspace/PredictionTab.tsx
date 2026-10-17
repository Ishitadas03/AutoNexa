"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Upload,
  Download,
  Send,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  BarChart3,
  RefreshCw,
  Table,
} from "lucide-react";
import {
  PredictionRequest,
  PredictionResponse,
  TrainingResponse,
} from "@/types/api";
import { api } from "@/lib/api";

interface PredictionTabProps {
  activeExperiment: TrainingResponse | null;
}

export default function PredictionTab({ activeExperiment }: PredictionTabProps) {
  const [mode, setMode] = useState<"single" | "batch">("single");

  // Single Record Form State: map feature name to string value
  const [recordValues, setRecordValues] = useState<Record<string, string>>({});
  const [predictionResult, setPredictionResult] = useState<PredictionResponse | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  // Batch CSV State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isBatchPredicting, setIsBatchPredicting] = useState(false);
  const [batchResultBlob, setBatchResultBlob] = useState<{ blob: Blob; filename: string } | null>(null);
  const [batchPreviewRows, setBatchPreviewRows] = useState<string[][]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Initialize input fields based on expected features
  useEffect(() => {
    if (!activeExperiment) return;

    const features = activeExperiment.feature_names || [];
    const initial: Record<string, string> = {};

    features.forEach((feat) => {
      // Sensible default values for testing
      const fLower = feat.toLowerCase();
      if (fLower.includes("age")) initial[feat] = "35";
      else if (fLower.includes("income") || fLower.includes("charge")) initial[feat] = "50000";
      else if (fLower.includes("sqft")) initial[feat] = "1500";
      else if (fLower.includes("bedroom") || fLower.includes("room")) initial[feat] = "3";
      else if (fLower.includes("city")) initial[feat] = "Kolkata";
      else if (fLower.includes("contract")) initial[feat] = "month-to-month";
      else if (fLower.includes("delay")) initial[feat] = "15";
      else if (fLower.includes("carrier")) initial[feat] = "CarrierA";
      else initial[feat] = "10";
    });

    setRecordValues(initial);
    setPredictionResult(null);
    setPredictError(null);
  }, [activeExperiment]);

  const handleInputChange = (field: string, val: string) => {
    setRecordValues((prev) => ({ ...prev, [field]: val }));
  };

  const handleSinglePredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeExperiment) return;

    setIsPredicting(true);
    setPredictError(null);

    // Convert values to numbers where applicable
    const parsedRecord: Record<string, unknown> = {};
    Object.entries(recordValues).forEach(([k, v]) => {
      const trimmed = v.trim();
      const num = Number(trimmed);
      if (!isNaN(num) && trimmed !== "") {
        parsedRecord[k] = num;
      } else {
        parsedRecord[k] = trimmed;
      }
    });

    try {
      const payload: PredictionRequest = {
        records: [parsedRecord],
      };
      const res = await api.predictRecords(activeExperiment.experiment_id, payload);
      setPredictionResult(res);
    } catch (err: any) {
      console.error("Prediction failed:", err);
      setPredictError(err.detail || err.message || "Prediction execution failed.");
    } finally {
      setIsPredicting(false);
    }
  };

  const handleBatchPredict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeExperiment || !csvFile) return;

    setIsBatchPredicting(true);
    setBatchError(null);
    setBatchResultBlob(null);

    try {
      const { blob, filename } = await api.predictCsv(activeExperiment.experiment_id, csvFile);
      setBatchResultBlob({ blob, filename });

      // Parse first few rows of CSV blob for preview
      const text = await blob.text();
      const lines = text
        .trim()
        .split("\n")
        .slice(0, 6)
        .map((l) => l.split(","));
      setBatchPreviewRows(lines);
    } catch (err: any) {
      console.error("Batch prediction failed:", err);
      setBatchError(err.detail || err.message || "Batch prediction failed.");
    } finally {
      setIsBatchPredicting(false);
    }
  };

  const downloadBatchCsv = () => {
    if (!batchResultBlob) return;
    const url = window.URL.createObjectURL(batchResultBlob.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = batchResultBlob.filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (!activeExperiment) {
    return (
      <div className="p-12 text-center rounded-2xl glass-panel border border-white/5 space-y-4">
        <Activity className="w-10 h-10 text-amber-400 mx-auto opacity-70" />
        <h3 className="text-lg font-bold text-white">No Trained Pipeline Available</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Please train an AutoML model in the Studio first so a winning pipeline is exported for inference.
        </p>
      </div>
    );
  }

  const expectedFeatures = activeExperiment.feature_names || Object.keys(recordValues);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-sans">
            Prediction Playground
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Execute low-latency tabular predictions on new records using the fitted winning pipeline.
          </p>
        </div>

        {/* Tab switch between Single Record and CSV Batch */}
        <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-1 self-start sm:self-auto">
          <button
            onClick={() => setMode("single")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
              mode === "single"
                ? "bg-amber-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Single Record (JSON)
          </button>
          <button
            onClick={() => setMode("batch")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
              mode === "batch"
                ? "bg-amber-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Batch Prediction (CSV)
          </button>
        </div>
      </div>

      {/* Model Spec Pill */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl glass-panel text-xs font-mono">
        <div>
          <span className="text-slate-500">Pipeline:</span>{" "}
          <span className="text-white font-bold">{activeExperiment.best_model}</span>
        </div>
        <span className="text-slate-700">•</span>
        <div>
          <span className="text-slate-500">Target:</span>{" "}
          <span className="text-amber-400 font-bold">{activeExperiment.target_column}</span>
        </div>
        <span className="text-slate-700">•</span>
        <div>
          <span className="text-slate-500">Task:</span>{" "}
          <span className="text-slate-300 capitalize">{activeExperiment.task_type}</span>
        </div>
        <span className="text-slate-700">•</span>
        <div className="ml-auto flex items-center gap-1.5 text-emerald-400 text-[11px]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Zero Retraining Guard Active</span>
        </div>
      </div>

      {mode === "single" ? (
        /* Single Record Mode */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Dynamic Form (2 Cols) */}
          <div className="lg:col-span-2 rounded-2xl glass-panel p-6 border border-white/5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 font-mono">
                  Input Record Features ({expectedFeatures.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pre-populated with sample values. Edit fields and submit for instant inference.
                </p>
              </div>
            </div>

            <form onSubmit={handleSinglePredict} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {expectedFeatures.map((feat) => (
                  <div key={feat}>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 font-mono truncate" title={feat}>
                      {feat}
                    </label>
                    <input
                      type="text"
                      value={recordValues[feat] ?? ""}
                      onChange={(e) => handleInputChange(feat, e.target.value)}
                      placeholder={`Enter ${feat}...`}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>
                ))}
              </div>

              {predictError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{predictError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isPredicting}
                className="w-full py-3.5 rounded-xl btn-gold text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/15 disabled:opacity-50"
              >
                {isPredicting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Pipeline Inference...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Generate Tabular Prediction</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Prediction Result Display (1 Col) */}
          <div className="rounded-2xl glass-panel-glow border border-amber-500/30 p-6 flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 font-mono">
                  Inference Output
                </span>
                <span className="text-[10px] font-mono text-slate-500">POST /predict</span>
              </div>

              {predictionResult ? (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-center space-y-1">
                    <span className="text-[10px] text-slate-500 uppercase font-mono">
                      Predicted {predictionResult.target_column}
                    </span>
                    <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono">
                      {String(predictionResult.predictions[0])}
                    </div>
                  </div>

                  {/* Class Probabilities Bar Preview (if available) */}
                  {predictionResult.probabilities && predictionResult.probabilities[0] && (
                    <div className="space-y-3 pt-2 border-t border-slate-900">
                      <span className="text-xs font-bold text-white font-mono block">
                        Class Probability Distributions
                      </span>
                      <div className="space-y-2">
                        {Object.entries(predictionResult.probabilities[0]).map(([cls, prob]) => {
                          const numProb = typeof prob === "number" ? prob : Number(prob) || 0;
                          const pct = (numProb * 100).toFixed(1);
                          return (
                            <div key={cls} className="space-y-1">
                              <div className="flex justify-between text-xs font-mono">
                                <span className="text-slate-300">Class &quot;{cls}&quot;</span>
                                <span className="text-amber-400 font-bold">{pct}%</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="p-2.5 rounded-lg bg-slate-950/40 text-[10px] font-mono text-slate-400 space-y-1">
                    <div>Status: 200 OK</div>
                    <div>Evaluator: {predictionResult.selected_model}</div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs font-mono space-y-2">
                  <Activity className="w-8 h-8 mx-auto opacity-40 text-amber-400" />
                  <p>Click &quot;Generate Tabular Prediction&quot; to test your model.</p>
                </div>
              )}
            </div>

            <div className="text-[10px] text-slate-500 font-mono pt-4 border-t border-slate-900">
              Transformations: Imputation + Scaling + OneHot applied by fitted Pipeline.
            </div>
          </div>
        </div>
      ) : (
        /* Batch CSV Mode */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* File Picker & Upload (1 Col) */}
          <div className="rounded-2xl glass-panel p-6 border border-white/5 space-y-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 font-mono">
              Upload Inference CSV
            </h3>

            <form onSubmit={handleBatchPredict} className="space-y-4">
              <div className="p-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 text-center space-y-2">
                <Upload className="w-8 h-8 text-amber-400 mx-auto" />
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-mono file:bg-slate-900 file:text-amber-400 hover:file:bg-slate-800"
                />
                <p className="text-[10px] text-slate-500 font-mono">
                  Target column is optional; if present, it is ignored safely.
                </p>
              </div>

              {batchError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  {batchError}
                </div>
              )}

              <button
                type="submit"
                disabled={!csvFile || isBatchPredicting}
                className="w-full py-3 rounded-xl btn-gold text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/15 disabled:opacity-50"
              >
                {isBatchPredicting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Batch Prediction...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4" />
                    <span>Run Batch CSV Prediction</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Results Preview & Download (2 Cols) */}
          <div className="lg:col-span-2 rounded-2xl glass-panel p-6 border border-white/5 space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                  Batch Output Preview
                </h3>
                {batchResultBlob && (
                  <button
                    onClick={downloadBatchCsv}
                    className="px-3 py-1.5 rounded-lg btn-gold text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                )}
              </div>

              {batchPreviewRows.length > 0 ? (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#0b1218] border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                      <tr>
                        {batchPreviewRows[0].map((h, i) => (
                          <th key={i} className="p-2.5 font-bold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {batchPreviewRows.slice(1).map((r, rI) => (
                        <tr key={rI} className="hover:bg-slate-800/30">
                          {r.map((val, cI) => (
                            <td key={cI} className="p-2.5 whitespace-nowrap">
                              {val}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-16 text-center text-slate-500 text-xs font-mono space-y-2">
                  <FileText className="w-8 h-8 mx-auto opacity-40 text-amber-400" />
                  <p>Upload a CSV file to generate predictions and download enriched output.</p>
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-500 font-mono pt-4 border-t border-slate-900">
              Downloadable CSV attaches original features plus <span className="text-amber-400 font-bold">predicted_{activeExperiment.target_column}</span> column.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
