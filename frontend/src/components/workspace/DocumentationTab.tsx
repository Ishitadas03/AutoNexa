"use client";

import React, { useState } from "react";
import {
  BookOpen,
  Terminal,
  ShieldCheck,
  Layers,
  Code2,
  Cpu,
  Database,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  FileText,
} from "lucide-react";

export default function DocumentationTab() {
  const [activeSection, setActiveSection] = useState<"quickstart" | "architecture" | "api" | "metrics">("quickstart");
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEndpoint(id);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] mb-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#334155] font-semibold">
              RESEARCH LAB &amp; API MANUAL
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight font-sans">
            Platform Documentation
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Architectural reference, cross-validation guarantees, and REST API integration guides.
          </p>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-[#CBD5E1] shadow-xs text-xs font-mono">
          <button
            onClick={() => setActiveSection("quickstart")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeSection === "quickstart"
                ? "bg-[#1D4ED8] text-white font-bold"
                : "text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            Quickstart
          </button>
          <button
            onClick={() => setActiveSection("architecture")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeSection === "architecture"
                ? "bg-[#1D4ED8] text-white font-bold"
                : "text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            Architecture
          </button>
          <button
            onClick={() => setActiveSection("api")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeSection === "api"
                ? "bg-[#1D4ED8] text-white font-bold"
                : "text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            REST API
          </button>
          <button
            onClick={() => setActiveSection("metrics")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeSection === "metrics"
                ? "bg-[#1D4ED8] text-white font-bold"
                : "text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            Metrics
          </button>
        </div>
      </div>

      {/* Section 1: Quickstart */}
      {activeSection === "quickstart" && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">
              Getting Started with AutoNexa (4-Step Workflow)
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed font-sans">
              AutoNexa automates the tabular machine learning lifecycle from ingestion to production serving without target leakage.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#1D4ED8] text-white font-mono text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <h4 className="font-bold text-xs text-[#0F172A]">Ingest Tabular Data</h4>
                </div>
                <p className="text-[11.5px] text-[#64748B] leading-relaxed pl-8">
                  Upload custom CSV files or launch verified research benchmarks (e.g., Telco Churn or California Housing) in the Datasets tab. AutoNexa generates cryptographic SHA-256 fingerprints.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#1D4ED8] text-white font-mono text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <h4 className="font-bold text-xs text-[#0F172A]">Inspect Data Profiling</h4>
                </div>
                <p className="text-[11.5px] text-[#64748B] leading-relaxed pl-8">
                  Examine missingness ratios, numerical distributions, categorical cardinalities, and pairwise Pearson correlations. Automated heuristics alert you to potential target leakage.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#1D4ED8] text-white font-mono text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <h4 className="font-bold text-xs text-[#0F172A]">Compile in AutoML Studio</h4>
                </div>
                <p className="text-[11.5px] text-[#64748B] leading-relaxed pl-8">
                  Select your target column, objective metric, and candidate algorithms. Stratified 5-Fold cross-validation fits all scalers strictly within folds.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#1D4ED8] text-white font-mono text-xs font-bold flex items-center justify-center">
                    4
                  </span>
                  <h4 className="font-bold text-xs text-[#0F172A]">Evaluate &amp; Serve</h4>
                </div>
                <p className="text-[11.5px] text-[#64748B] leading-relaxed pl-8">
                  Review the ranked leaderboard, confusion matrix, and ROC-AUC curve. Test inputs interactively or download packaged .joblib pipelines for deployment.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 2: Architecture */}
      {activeSection === "architecture" && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">
              Scientific Architecture &amp; Leakage Prevention
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed font-sans">
              Unlike generic AutoML platforms that fit scalers globally before partitioning, AutoNexa enforces strict mathematical isolation to avoid optimistic bias.
            </p>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] space-y-3 font-mono text-xs">
              <div className="flex items-center gap-2 text-[#15803D] font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Strict In-Fold Cross-Validation Protocol</span>
              </div>
              <p className="text-[#334155] leading-relaxed font-sans text-xs">
                For every fold <code className="text-[#1D4ED8] bg-blue-50 px-1 rounded">k ∈ [1..K]</code>:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-[#334155] pl-2">
                <li>Split dataset into Train Fold (80%) and Validation Fold (20%).</li>
                <li>Fit median/mode imputers strictly on Train Fold.</li>
                <li>Fit StandardScaler / One-Hot encoders strictly on Train Fold.</li>
                <li>Transform Validation Fold using parameters learned from Train Fold only.</li>
                <li>Compute unbiased evaluation score.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: REST API */}
      {activeSection === "api" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">
              AutoNexa FastAPI REST API Reference
            </h3>
            <p className="text-xs text-[#64748B]">
              All core platform capabilities are exposed via standardized JSON endpoints running on port 8000.
            </p>

            <div className="space-y-3 pt-2">
              {/* Endpoint 1 */}
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      POST
                    </span>
                    <strong className="text-[#0F172A]">/api/v1/datasets/upload</strong>
                  </div>
                  <button
                    onClick={() => copyToClipboard("curl -X POST http://localhost:8000/api/v1/datasets/upload -F 'file=@data.csv'", "ep1")}
                    className="text-[#64748B] hover:text-[#0F172A] flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    {copiedEndpoint === "ep1" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedEndpoint === "ep1" ? "Copied" : "Copy cURL"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-[#64748B] font-sans">
                  Multipart streaming tabular upload. Returns unique dataset_id, row counts, and feature types.
                </p>
              </div>

              {/* Endpoint 2 */}
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                      POST
                    </span>
                    <strong className="text-[#0F172A]">/api/v1/train</strong>
                  </div>
                  <button
                    onClick={() => copyToClipboard("curl -X POST http://localhost:8000/api/v1/train -H 'Content-Type: application/json' -d '{\"dataset_id\":\"ds-1\",\"target_column\":\"churn\"}'", "ep2")}
                    className="text-[#64748B] hover:text-[#0F172A] flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    {copiedEndpoint === "ep2" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedEndpoint === "ep2" ? "Copied" : "Copy cURL"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-[#64748B] font-sans">
                  Trigger multi-estimator training pipeline with Stratified K-Fold cross validation.
                </p>
              </div>

              {/* Endpoint 3 */}
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                      POST
                    </span>
                    <strong className="text-[#0F172A]">/api/v1/predict/&#123;experiment_id&#125;</strong>
                  </div>
                  <button
                    onClick={() => copyToClipboard("curl -X POST http://localhost:8000/api/v1/predict/exp-id -H 'Content-Type: application/json' -d '{\"records\":[{\"tenure\":12}]}'", "ep3")}
                    className="text-[#64748B] hover:text-[#0F172A] flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    {copiedEndpoint === "ep3" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedEndpoint === "ep3" ? "Copied" : "Copy cURL"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-[#64748B] font-sans">
                  Execute low-latency single or batch predictions against serialized champion pipelines.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 4: Metrics */}
      {activeSection === "metrics" && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-[#0F172A]">
            Direction-Aware Evaluation Metrics
          </h3>
          <p className="text-xs text-[#64748B] leading-relaxed">
            AutoNexa automatically selects direction-aware ranking criteria matching your task formulation:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs font-mono">
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5">
              <span className="text-[#1D4ED8] font-bold block">ROC-AUC (Area Under Curve)</span>
              <p className="text-[11px] text-[#64748B] font-sans">
                Measures true positive rate versus false positive rate across all discrimination thresholds. Invariant to class prevalence.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5">
              <span className="text-[#1D4ED8] font-bold block">F1-Weighted Score</span>
              <p className="text-[11px] text-[#64748B] font-sans">
                Harmonic mean of precision and recall weighted by true instances for each label. Optimal for imbalanced tabular targets.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5">
              <span className="text-[#1D4ED8] font-bold block">R² Score (Coefficient of Determination)</span>
              <p className="text-[11px] text-[#64748B] font-sans">
                Proportion of variation in target variable predictable from features. Baseline model predicting mean yields 0.0.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5">
              <span className="text-[#1D4ED8] font-bold block">Root Mean Squared Error (RMSE)</span>
              <p className="text-[11px] text-[#64748B] font-sans">
                Square root of mean squared error. Penalizes large regression outliers heavily. Direction: Lower is better.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
