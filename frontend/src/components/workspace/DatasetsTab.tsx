"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  Database,
  FileText,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Table,
  Cpu,
  Layers,
} from "lucide-react";
import { AnalysisResponse, DatasetProfileResponse } from "@/types/api";
import { SAMPLE_DATASETS } from "@/lib/sampleDatasets";
import { formatBytes, formatNumber } from "@/lib/utils";

interface DatasetsTabProps {
  datasets: DatasetProfileResponse[];
  activeDataset: DatasetProfileResponse | null;
  activeAnalysis: AnalysisResponse | null;
  onSelectDataset: (id: string) => void;
  onUploadFile: (file: File) => Promise<void>;
  onUploadSample: (sampleId: string) => Promise<void>;
  onRunAnalysis: (datasetId: string, targetColumn?: string) => Promise<void>;
  onProceedToTraining: () => void;
  isLoading: boolean;
  isAnalyzing: boolean;
}

export default function DatasetsTab({
  datasets,
  activeDataset,
  activeAnalysis,
  onSelectDataset,
  onUploadFile,
  onUploadSample,
  onRunAnalysis,
  onProceedToTraining,
  isLoading,
  isAnalyzing,
}: DatasetsTabProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith(".csv")) {
        await onUploadFile(file);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await onUploadFile(e.target.files[0]);
    }
  };

  // Safe accessors handling both strict backend schemas and client fallbacks
  const rowCount = activeDataset
    ? (activeDataset.rows ?? (activeDataset as any).row_count ?? 0)
    : 0;
  const colCount = activeDataset
    ? (typeof activeDataset.columns === "number" ? activeDataset.columns : (activeDataset as any).column_count ?? 0)
    : 0;
  const columnNames = activeDataset
    ? activeDataset.column_names || (Array.isArray((activeDataset as any).columns) ? (activeDataset as any).columns.map((c: any) => c.name) : [])
    : [];

  const totalMissing = activeDataset
    ? (activeDataset.missing_values
        ? Object.values(activeDataset.missing_values).reduce((a, b) => a + b, 0)
        : (activeDataset as any).missing_values_count ?? 0)
    : 0;

  const duplicateRows = activeDataset
    ? (activeDataset.duplicate_rows ?? (activeDataset as any).duplicate_rows_count ?? 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F1EFE1] tracking-tight font-sans">
            Dataset Ingestion & Profiling
          </h1>
          <p className="text-xs sm:text-sm text-[#AEBEB5] mt-0.5">
            Stream tabular CSV files with automatic schema inference, data quality audits, and task detection.
          </p>
        </div>

        {activeDataset && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onRunAnalysis(activeDataset.dataset_id)}
              disabled={isAnalyzing}
              className="px-4 py-2 rounded-xl btn-autonexa-secondary text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isAnalyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#68E7B5]" /> : <Sparkles className="w-3.5 h-3.5 text-[#68E7B5]" />}
              <span>{isAnalyzing ? "Analyzing Intelligence..." : "Run Dataset Intelligence"}</span>
            </button>
            <button
              onClick={onProceedToTraining}
              className="px-4 py-2 rounded-xl btn-autonexa-primary text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-[#68E7B5]/15"
            >
              <span>AutoML Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Upload Dropzone & Quick Samples Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drag and Drop Box */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`lg:col-span-2 rounded-2xl p-8 border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
            dragOver
              ? "border-[#68E7B5] bg-[#68E7B5]/10 scale-[1.01]"
              : "border-[#2A4E42] bg-[#12201C] hover:border-[#68E7B5]/50 hover:bg-[#162A23]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="w-14 h-14 rounded-2xl bg-[#0D1815] border border-[#2A4E42] flex items-center justify-center text-[#68E7B5] mb-4 shadow-lg shadow-[#68E7B5]/10">
            {isLoading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
          </div>

          <h3 className="text-base font-semibold text-[#F1EFE1] mb-1">
            {isLoading ? "Ingesting & Profiling CSV..." : "Click or drag & drop CSV file"}
          </h3>
          <p className="text-xs text-[#AEBEB5] max-w-sm mb-4">
            Supports tabular CSV files up to 10 MB. Preprocessing executes strictly in memory with zero leakage.
          </p>
          <span className="text-[11px] font-mono px-3 py-1 rounded-md bg-[#070D0C] border border-[#2A4E42] text-[#AEBEB5]">
            .csv format • UTF-8 encoded
          </span>
        </div>

        {/* 1-Click Sample Datasets Box */}
        <div className="rounded-2xl autonexa-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-[#68E7B5]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#F1EFE1] font-mono">
                Instant Benchmark Data
              </h3>
            </div>
            <p className="text-xs text-[#AEBEB5] mb-4">
              Don&apos;t have a file ready? Load one of our curated research datasets with a single click:
            </p>

            <div className="space-y-2.5">
              {SAMPLE_DATASETS.map((s) => (
                <button
                  key={s.id}
                  disabled={isLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUploadSample(s.id);
                  }}
                  className="w-full text-left p-2.5 rounded-xl bg-[#0D1815] border border-[#2A4E42] hover:border-[#68E7B5]/60 hover:bg-[#162A23] transition-all flex items-center justify-between group disabled:opacity-50 cursor-pointer"
                >
                  <div>
                    <span className="text-xs font-semibold text-[#F1EFE1] group-hover:text-[#68E7B5] transition-colors">
                      {s.name}
                    </span>
                    <p className="text-[10px] text-[#AEBEB5]/80 font-mono">
                      {s.rowsCount} rows • {s.colsCount} cols • {s.taskType}
                    </p>
                  </div>
                  <span className="text-[10px] text-[#68E7B5] opacity-0 group-hover:opacity-100 font-mono transition-opacity">
                    Load →
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#2A4E42] text-[11px] text-[#AEBEB5]/70 font-mono">
            Directly calls POST /api/v1/datasets/upload
          </div>
        </div>
      </div>

      {/* Dataset Selector if multiple datasets exist */}
      {datasets.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <span className="text-xs font-mono text-[#AEBEB5] shrink-0">Uploaded:</span>
          {datasets.map((d) => (
            <button
              key={d.dataset_id}
              onClick={() => onSelectDataset(d.dataset_id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                activeDataset?.dataset_id === d.dataset_id
                  ? "bg-[#162A23] text-[#68E7B5] border border-[#68E7B5]"
                  : "bg-[#12201C] text-[#AEBEB5] border border-[#2A4E42] hover:text-[#F1EFE1]"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{d.filename}</span>
              <span className="text-[10px] text-[#AEBEB5]/70">
                ({d.rows ?? (d as any).row_count ?? 0} rows)
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Active Dataset Detailed Profile */}
      {activeDataset ? (
        <div className="space-y-6">
          {/* Metrics summary bar */}
          <div className="rounded-2xl autonexa-card p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs font-mono">
              <div>
                <span className="text-[#AEBEB5]/70 uppercase text-[10px] block">Dataset ID</span>
                <span className="text-[#F1EFE1] font-semibold truncate block" title={activeDataset.dataset_id}>
                  {activeDataset.dataset_id.slice(0, 12)}...
                </span>
              </div>
              <div>
                <span className="text-[#AEBEB5]/70 uppercase text-[10px] block">File Size</span>
                <span className="text-[#F1EFE1] font-semibold block">{formatBytes(activeDataset.file_size_bytes)}</span>
              </div>
              <div>
                <span className="text-[#AEBEB5]/70 uppercase text-[10px] block">Total Rows</span>
                <span className="text-[#F1EFE1] font-semibold block">{formatNumber(rowCount)}</span>
              </div>
              <div>
                <span className="text-[#AEBEB5]/70 uppercase text-[10px] block">Total Columns</span>
                <span className="text-[#F1EFE1] font-semibold block">{colCount} features</span>
              </div>
              <div>
                <span className="text-[#AEBEB5]/70 uppercase text-[10px] block">Missing Cells</span>
                <span className="text-[#EDC54C] font-semibold block">{totalMissing}</span>
              </div>
              <div>
                <span className="text-[#AEBEB5]/70 uppercase text-[10px] block">Duplicate Rows</span>
                <span className="text-[#68E7B5] font-semibold block">{duplicateRows}</span>
              </div>
            </div>
          </div>

          {/* Dataset Intelligence Section if analyzed */}
          {activeAnalysis && (
            <div className="rounded-2xl autonexa-card-elevated p-6 border border-[#2A4E42] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0D1815] border border-[#2A4E42] flex items-center justify-center text-[#68E7B5]">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[#F1EFE1] font-sans">Dataset Intelligence Diagnostics</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#12201C] text-[#68E7B5] border border-[#2A4E42]">
                        {activeAnalysis.task_recommendation?.confidence || "Audited"} Confidence
                      </span>
                    </div>
                    <p className="text-xs text-[#AEBEB5]">
                      Heuristic task inference, quality warnings, and candidate targets.
                    </p>
                  </div>
                </div>

                {activeAnalysis.task_recommendation && (
                  <div className="px-4 py-2 rounded-xl bg-[#070D0C] border border-[#2A4E42] text-xs font-mono">
                    <span className="text-[#AEBEB5]">Recommended Task: </span>
                    <span className="text-[#68E7B5] font-bold uppercase">
                      {activeAnalysis.task_recommendation.task_type.replace("_", " ")}
                    </span>
                    <span className="text-[#AEBEB5]/70"> on `{activeAnalysis.task_recommendation.target_column}`</span>
                  </div>
                )}
              </div>

              {/* Rationale explanation */}
              {activeAnalysis.task_recommendation?.rationale && (
                <div className="p-3.5 rounded-xl bg-[#070D0C] border border-[#2A4E42] text-xs text-[#AEBEB5] font-mono">
                  <span className="text-[#68E7B5] font-bold">Analysis Rationale: </span>
                  {activeAnalysis.task_recommendation.rationale}
                </div>
              )}

              {/* Quality Warnings list */}
              {activeAnalysis.quality_warnings.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-mono uppercase text-[#AEBEB5] block font-semibold">
                    Data Quality Diagnostics ({activeAnalysis.quality_warnings.length}):
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeAnalysis.quality_warnings.map((w, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border flex items-start gap-3 text-xs font-mono ${
                          w.severity === "critical"
                            ? "bg-rose-950/40 border-rose-800/80 text-rose-300"
                            : w.severity === "warning"
                            ? "bg-[#EDC54C]/10 border-[#EDC54C]/40 text-[#EDC54C]"
                            : "bg-[#070D0C] border-[#2A4E42] text-[#AEBEB5]"
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold uppercase tracking-wider text-[10px]">{w.code}</span>
                            {w.column && <span className="text-[#AEBEB5]/70 text-[10px]">({w.column})</span>}
                          </div>
                          <p className="text-[11px] opacity-90 leading-relaxed">{w.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tabular Preview & Columns Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Raw Data Preview (2 cols) */}
            <div className="lg:col-span-2 rounded-2xl autonexa-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-[#68E7B5]" />
                  <h3 className="text-xs font-bold text-[#F1EFE1] uppercase tracking-wider font-mono">
                    Tabular Data Preview
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-[#AEBEB5]/70">
                  {activeDataset.preview_rows?.length
                    ? `First ${activeDataset.preview_rows.length} rows`
                    : "Non-sensitive schema view"}
                </span>
              </div>

              {activeDataset.preview_rows && activeDataset.preview_rows.length > 0 ? (
                <div className="overflow-x-auto max-h-80 border border-[#2A4E42] rounded-xl">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-[#0D1815] border-b border-[#2A4E42] text-[10px] text-[#AEBEB5] uppercase">
                      <tr>
                        {Object.keys(activeDataset.preview_rows[0] || {}).map((col) => (
                          <th key={col} className="p-2.5 font-semibold whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2A4E42]/60 text-[#AEBEB5]">
                      {activeDataset.preview_rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-[#162A23]/50">
                          {Object.values(row).map((val, cIdx) => (
                            <td key={cIdx} className="p-2.5 whitespace-nowrap">
                              {String(val ?? "null")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-[#070D0C] border border-[#2A4E42] text-center font-mono text-xs text-[#AEBEB5] space-y-2">
                  <p>Dataset verified on server disk ({formatBytes(activeDataset.file_size_bytes)}).</p>
                  <div className="flex flex-wrap gap-2 justify-center pt-2">
                    {columnNames.map((c) => (
                      <span key={c} className="px-2 py-1 rounded bg-[#12201C] border border-[#2A4E42] text-[11px] text-[#F1EFE1]">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Column Schema Summary (1 col) */}
            <div className="rounded-2xl autonexa-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-[#F1EFE1] uppercase tracking-wider font-mono">
                  Columns Schema ({columnNames.length})
                </h3>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {columnNames.map((colName) => {
                  const summary = activeAnalysis?.column_summaries.find((s) => s.name === colName);
                  const dtype = summary?.inferred_type || activeDataset.data_types?.[colName] || "object";
                  const nulls = summary?.missing_count ?? activeDataset.missing_values?.[colName] ?? 0;
                  const role = summary?.role;

                  return (
                    <div
                      key={colName}
                      className="p-2.5 rounded-lg bg-[#070D0C] border border-[#2A4E42]/60 flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#F1EFE1] font-medium block truncate max-w-[130px]">{colName}</span>
                          {role && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-[#162A23] text-[#68E7B5] uppercase">
                              {role}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#AEBEB5]/70">
                          {summary ? `${summary.unique_count} distinct • ` : ""}{nulls} nulls
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-[#12201C] border border-[#2A4E42] text-[#AEBEB5]">
                        {dtype}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center rounded-2xl autonexa-card text-[#AEBEB5] text-xs">
          No dataset uploaded yet. Drag & drop a CSV file above or select a 1-click benchmark dataset.
        </div>
      )}
    </div>
  );
}
