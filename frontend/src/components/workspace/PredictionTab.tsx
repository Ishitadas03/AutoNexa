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
      <div className="p-12 text-center rounded-2xl autonexa-card space-y-4">
        <Activity className="w-10 h-10 text-[#68E7B5] mx-auto opacity-70" />
        <h3 className="text-lg font-bold text-[#F1EFE1]">No Trained Pipeline Available</h3>
        <p className="text-xs text-[#AEBEB5] max-w-sm mx-auto">
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
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F1EFE1] tracking-tight font-sans">
            Prediction Playground
          </h1>
          <p className="text-xs sm:text-sm text-[#AEBEB5] mt-0.5">
            Execute low-latency tabular predictions on new records using the fitted winning pipeline.
          </p>
        </div>

        {/* Tab switch between Single Record and CSV Batch */}
        <div className="p-1 rounded-xl bg-[#0D1815] border border-[#2A4E42] flex items-center gap-1 self-start sm:self-auto">
          <button
            onClick={() => setMode("single")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
              mode === "single"
                ? "bg-[#68E7B5] text-[#070D0C] shadow-sm font-bold"
                : "text-[#AEBEB5] hover:text-[#F1EFE1]"
            }`}
          >
            Single Record (JSON)
          </button>
          <button
            onClick={() => setMode("batch")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
              mode === "batch"
                ? "bg-[#68E7B5] text-[#070D0C] shadow-sm font-bold"
                : "text-[#AEBEB5] hover:text-[#F1EFE1]"
            }`}
          >
            Batch Prediction (CSV)
          </button>
        </div>
      </div>

      {/* Model Spec Pill */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl autonexa-card text-xs font-mono">
        <div>
          <span className="text-[#AEBEB5]/70">Pipeline:</span>{" "}
          <span className="text-[#F1EFE1] font-bold">{activeExperiment.best_model}</span>
        </div>
        <span className="text-[#2A4E42]">•</span>
        <div>
          <span className="text-[#AEBEB5]/70">Target:</span>{" "}
          <span className="text-[#68E7B5] font-bold">{activeExperiment.target_column}</span>
        </div>
        <span className="text-[#2A4E42]">•</span>
        <div>
          <span className="text-[#AEBEB5]/70">Task:</span>{" "}
          <span className="text-[#F1EFE1] capitalize">{activeExperiment.task_type}</span>
        </div>
        <span className="text-[#2A4E42]">•</span>
        <div className="ml-auto flex items-center gap-1.5 text-[#68E7B5] text-[11px]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Zero Retraining Guard Active</span>
        </div>
      </div>

      {mode === "single" ? (
        /* Single Record Mode */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Dynamic Form (2 Cols) */}
          <div className="lg:col-span-2 rounded-2xl autonexa-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#68E7B5] font-mono">
                  Input Record Features ({expectedFeatures.length})
                </h3>
                <p className="text-xs text-[#AEBEB5] mt-0.5">
                  Pre-populated with sample values. Edit fields and submit for instant inference.
                </p>
              </div>
            </div>

            <form onSubmit={handleSinglePredict} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {expectedFeatures.map((feat) => (
                  <div key={feat}>
                    <label className="block text-xs font-semibold text-[#F1EFE1] mb-1 font-mono truncate" title={feat}>
                      {feat}
                    </label>
                    <input
                      type="text"
                      value={recordValues[feat] ?? ""}
                      onChange={(e) => handleInputChange(feat, e.target.value)}
                      placeholder={`Enter ${feat}...`}
                      className="w-full px-3 py-2 rounded-xl bg-[#070D0C] border border-[#2A4E42] text-xs text-[#F1EFE1] focus:outline-none focus:border-[#68E7B5] font-mono"
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
                className="w-full py-3.5 rounded-xl btn-autonexa-primary text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#68E7B5]/15 disabled:opacity-50"
              >
                {isPredicting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#070D0C]" />
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
          <div className="rounded-2xl autonexa-card-elevated border border-[#2A4E42] p-6 flex flex-col justify-between space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#68E7B5] font-mono">
                  Inference Output
                </span>
                <span className="text-[10px] font-mono text-[#AEBEB5]/70">POST /predict</span>
              </div>

              {predictionResult ? (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-[#070D0C] border border-[#2A4E42] text-center space-y-1">
                    <span className="text-[10px] text-[#AEBEB5]/70 uppercase font-mono">
                      Predicted {predictionResult.target_column}
                    </span>
                    <div className="text-2xl sm:text-3xl font-extrabold text-[#68E7B5] font-mono">
                      {String(predictionResult.predictions[0])}
                    </div>
                  </div>

                  {/* Class Probabilities Bar Preview (if available) */}
                  {predictionResult.probabilities && predictionResult.probabilities[0] && (
                    <div className="space-y-3 pt-2 border-t border-[#2A4E42]">
                      <span className="text-xs font-bold text-[#F1EFE1] font-mono block">
                        Class Probability Distributions
                      </span>
                      <div className="space-y-2">
                        {Object.entries(predictionResult.probabilities[0]).map(([cls, prob]) => {
                          const numProb = typeof prob === "number" ? prob : Number(prob) || 0;
                          const pct = (numProb * 100).toFixed(1);
                          return (
                            <div key={cls} className="space-y-1">
                              <div className="flex justify-between text-xs font-mono">
                                <span className="text-[#AEBEB5]">Class &quot;{cls}&quot;</span>
                                <span className="text-[#68E7B5] font-bold">{pct}%</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-[#070D0C] border border-[#2A4E42] overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-[#2A916E] to-[#68E7B5] rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="p-2.5 rounded-lg bg-[#070D0C] border border-[#2A4E42] text-[10px] font-mono text-[#AEBEB5] space-y-1">
                    <div>Status: 200 OK</div>
                    <div>Evaluator: {predictionResult.selected_model}</div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-[#AEBEB5]/60 text-xs font-mono space-y-2">
                  <Activity className="w-8 h-8 mx-auto opacity-40 text-[#68E7B5]" />
                  <p>Click &quot;Generate Tabular Prediction&quot; to test your model.</p>
                </div>
              )}
            </div>

            <div className="text-[10px] text-[#AEBEB5]/70 font-mono pt-4 border-t border-[#2A4E42]">
              Transformations: Imputation + Scaling + OneHot applied by fitted Pipeline.
            </div>
          </div>
        </div>
      ) : (
        /* Batch CSV Mode */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* File Picker & Upload (1 Col) */}
          <div className="rounded-2xl autonexa-card p-6 space-y-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#68E7B5] font-mono">
              Upload Inference CSV
            </h3>

            <form onSubmit={handleBatchPredict} className="space-y-4">
              <div className="p-6 rounded-xl border border-dashed border-[#2A4E42] bg-[#070D0C] text-center space-y-2">
                <Upload className="w-8 h-8 text-[#68E7B5] mx-auto" />
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className="text-xs text-[#AEBEB5] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-mono file:bg-[#162A23] file:text-[#68E7B5] hover:file:bg-[#12201C] file:cursor-pointer"
                />
                <p className="text-[10px] text-[#AEBEB5]/70 font-mono">
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
                className="w-full py-3 rounded-xl btn-autonexa-primary text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#68E7B5]/15 disabled:opacity-50"
              >
                {isBatchPredicting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#070D0C]" />
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
          <div className="lg:col-span-2 rounded-2xl autonexa-card p-6 space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F1EFE1] font-mono">
                  Batch Output Preview
                </h3>
                {batchResultBlob && (
                  <button
                    onClick={downloadBatchCsv}
                    className="px-3 py-1.5 rounded-lg btn-autonexa-primary text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#68E7B5]/20 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                )}
              </div>

              {batchPreviewRows.length > 0 ? (
                <div className="overflow-x-auto border border-[#2A4E42] rounded-xl">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#0D1815] border-b border-[#2A4E42] text-[10px] text-[#AEBEB5] uppercase">
                      <tr>
                        {batchPreviewRows[0].map((h, i) => (
                          <th key={i} className="p-2.5 font-bold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2A4E42]/60 text-[#AEBEB5]">
                      {batchPreviewRows.slice(1).map((r, rI) => (
                        <tr key={rI} className="hover:bg-[#162A23]/50">
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
                <div className="py-16 text-center text-[#AEBEB5]/60 text-xs font-mono space-y-2">
                  <FileText className="w-8 h-8 mx-auto opacity-40 text-[#68E7B5]" />
                  <p>Upload a CSV file to generate predictions and download enriched output.</p>
                </div>
              )}
            </div>

            <div className="text-[11px] text-[#AEBEB5]/70 font-mono pt-4 border-t border-[#2A4E42]">
              Downloadable CSV attaches original features plus <span className="text-[#68E7B5] font-bold">predicted_{activeExperiment.target_column}</span> column.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
