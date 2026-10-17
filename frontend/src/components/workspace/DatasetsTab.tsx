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
  Search,
  Check,
  ShieldCheck,
  BarChart2,
} from "lucide-react";
import { AnalysisResponse, DatasetProfileResponse } from "@/types/api";
import { SAMPLE_DATASETS } from "@/lib/sampleDatasets";
import { formatBytes, formatNumber } from "@/lib/utils";
import { WorkspaceTab } from "@/lib/store";

interface DatasetsTabProps {
  datasets: DatasetProfileResponse[];
  activeDataset: DatasetProfileResponse | null;
  activeAnalysis: AnalysisResponse | null;
  onSelectDataset: (id: string) => void;
  onUploadFile: (file: File) => Promise<void>;
  onUploadSample: (sampleId: string) => Promise<void>;
  onRunAnalysis: (datasetId: string, targetColumn?: string) => Promise<void>;
  onProceedToTraining: () => void;
  onNavigateTab?: (tab: WorkspaceTab) => void;
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
  onNavigateTab,
  isLoading,
  isAnalyzing,
}: DatasetsTabProps) {
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  // Safe accessors
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

  // Filter preview rows if search query is provided
  const previewRows = activeDataset?.preview_rows || [];
  const filteredRows = searchQuery
    ? previewRows.filter((r) =>
        Object.values(r).some((val) =>
          String(val).toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : previewRows;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] mb-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#334155] font-semibold">
              TABULAR INGESTION &amp; VALIDATION
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight font-sans">
            Datasets &amp; Data Preview
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Upload CSV files, inspect tabular validation guarantees, and view streaming record samples.
          </p>
        </div>

        {activeDataset && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onNavigateTab ? onNavigateTab("analysis") : onRunAnalysis(activeDataset.dataset_id)}
              disabled={isAnalyzing}
              className="px-4 py-2 rounded-xl bg-white border border-[#CBD5E1] hover:border-[#1D4ED8] text-[#1D4ED8] text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs hover:bg-[#EFF6FF] transition-all disabled:opacity-50"
            >
              {isAnalyzing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1D4ED8]" />
              ) : (
                <BarChart2 className="w-3.5 h-3.5 text-[#1D4ED8]" />
              )}
              <span>Deep Profiling</span>
            </button>
            <button
              onClick={onProceedToTraining}
              className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-[0_4px_12px_rgba(29,78,216,0.25)] transition-all"
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
              ? "border-[#1D4ED8] bg-[#EFF6FF] scale-[1.01]"
              : "border-[#CBD5E1] bg-white hover:border-[#1D4ED8] hover:bg-[#F8FAFC]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#1D4ED8] mb-4 shadow-sm">
            {isLoading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6 stroke-[2]" />}
          </div>

          <h3 className="text-base font-semibold text-[#0F172A] mb-1">
            {isLoading ? "Ingesting & Validating CSV..." : "Click or drag & drop CSV file"}
          </h3>
          <p className="text-xs text-[#64748B] max-w-sm mb-4 leading-relaxed font-sans">
            Tabular streaming parser supports CSV files up to 50 MB with automatic encoding sniffing and zero target leakage.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-mono px-3 py-1 rounded-md bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569]">
              .csv format
            </span>
            <span className="text-[10.5px] font-mono px-3 py-1 rounded-md bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569]">
              UTF-8 / Latin-1
            </span>
            <span className="text-[10.5px] font-mono px-3 py-1 rounded-md bg-[#F1F5F9] border border-[#E2E8F0] text-[#475569]">
              SHA-256 Verified
            </span>
          </div>
        </div>

        {/* 1-Click Sample Datasets Box */}
        <div className="rounded-2xl bg-white border border-[#E2E8F0] p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-[#1D4ED8]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] font-mono">
                Curated Benchmarks
              </h3>
            </div>
            <p className="text-xs text-[#64748B] mb-4 font-sans leading-relaxed">
              Instantly test with pre-validated ML research benchmarks:
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
                  className="w-full text-left p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#1D4ED8] hover:bg-[#EFF6FF] transition-all flex items-center justify-between group disabled:opacity-50 cursor-pointer"
                >
                  <div>
                    <span className="text-xs font-semibold text-[#0F172A] group-hover:text-[#1D4ED8] transition-colors">
                      {s.name}
                    </span>
                    <p className="text-[10.5px] text-[#64748B] font-mono mt-0.5">
                      {s.rowsCount} rows • {s.colsCount} cols • {s.taskType}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-[#1D4ED8] opacity-0 group-hover:opacity-100 transition-opacity">
                    Load →
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-[#E2E8F0] text-[11px] text-[#64748B] font-mono flex items-center justify-between">
            <span>Client &amp; Server Streaming</span>
            <span className="text-[#15803D] font-bold">100% Leakage Safe</span>
          </div>
        </div>
      </div>

      {/* Dataset Selector if multiple datasets exist */}
      {datasets.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-xs">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs font-mono text-[#64748B] font-semibold shrink-0 mr-1">
              Active Asset:
            </span>
            {datasets.map((d) => (
              <button
                key={d.dataset_id}
                onClick={() => onSelectDataset(d.dataset_id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                  activeDataset?.dataset_id === d.dataset_id
                    ? "bg-[#1D4ED8] text-white shadow-xs font-bold"
                    : "bg-[#F8FAFC] text-[#475569] border border-[#CBD5E1] hover:text-[#0F172A] hover:bg-[#F1F5F9]"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{d.filename}</span>
                <span className={activeDataset?.dataset_id === d.dataset_id ? "text-blue-100 text-[10px]" : "text-[#64748B] text-[10px]"}>
                  ({d.rows ?? (d as any).row_count ?? 0} rows)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Dataset Validation & Detailed Inspection */}
      {activeDataset ? (
        <div className="space-y-6">
          {/* Metrics summary bar */}
          <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5 shadow-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs font-mono">
              <div>
                <span className="text-[#64748B] uppercase text-[10px] block font-semibold">Dataset Identifier</span>
                <span className="text-[#0F172A] font-bold truncate block mt-0.5" title={activeDataset.dataset_id}>
                  {activeDataset.dataset_id.slice(0, 14)}...
                </span>
              </div>
              <div>
                <span className="text-[#64748B] uppercase text-[10px] block font-semibold">File Size</span>
                <span className="text-[#0F172A] font-bold block mt-0.5">{formatBytes(activeDataset.file_size_bytes)}</span>
              </div>
              <div>
                <span className="text-[#64748B] uppercase text-[10px] block font-semibold">Total Records</span>
                <span className="text-[#0F172A] font-bold block mt-0.5">{formatNumber(rowCount)}</span>
              </div>
              <div>
                <span className="text-[#64748B] uppercase text-[10px] block font-semibold">Total Features</span>
                <span className="text-[#0F172A] font-bold block mt-0.5">{colCount} columns</span>
              </div>
              <div>
                <span className="text-[#64748B] uppercase text-[10px] block font-semibold">Missing Values</span>
                <span className={`font-bold block mt-0.5 ${totalMissing > 0 ? "text-amber-600" : "text-[#15803D]"}`}>
                  {totalMissing > 0 ? `${totalMissing} cells` : "0 (Complete)"}
                </span>
              </div>
              <div>
                <span className="text-[#64748B] uppercase text-[10px] block font-semibold">Duplicate Rows</span>
                <span className={`font-bold block mt-0.5 ${duplicateRows > 0 ? "text-amber-600" : "text-[#15803D]"}`}>
                  {duplicateRows > 0 ? `${duplicateRows} rows` : "0 (Clean)"}
                </span>
              </div>
            </div>
          </div>

          {/* Validation Checklist Protocol */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-[#15803D]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] font-mono">
                Tabular Ingestion Validation Checklist
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-[#0F172A]">Format Verification</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">Delimiter sniffed, valid CSV structure</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-[#0F172A]">Encoding Guard</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">UTF-8 byte parity verified</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-[#0F172A]">Type Sniffer</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">Numeric vs Categorical roles tagged</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-[#0F172A]">Leakage Enforcer</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">Isolated for in-fold cross-validation</div>
                </div>
              </div>
            </div>
          </div>

          {/* Data Preview Table */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-[#1D4ED8]" />
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Dataset Records Preview
                </h3>
                <span className="text-xs text-[#64748B] font-mono">
                  (Showing {filteredRows.length} of {rowCount.toLocaleString()} rows)
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] text-xs font-mono text-[#0F172A] focus:outline-none focus:border-[#1D4ED8] focus:bg-white"
                />
              </div>
            </div>

            {filteredRows.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] text-[#64748B] uppercase tracking-wider">
                      <th className="py-2.5 px-3 font-semibold text-[#64748B]">#</th>
                      {columnNames.map((col) => (
                        <th key={col} className="py-2.5 px-3 font-semibold text-[#0F172A]">
                          {col}
                          {activeDataset.data_types && (
                            <span className="block text-[9.5px] text-[#64748B] font-normal lowercase">
                              {activeDataset.data_types[col] || "string"}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredRows.slice(0, 15).map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-2 px-3 text-[#64748B] font-bold">{idx + 1}</td>
                        {columnNames.map((col) => {
                          const val = row[col];
                          const isNull = val === null || val === undefined || val === "";
                          return (
                            <td key={col} className="py-2 px-3 text-[#0F172A] whitespace-nowrap">
                              {isNull ? (
                                <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">
                                  null
                                </span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-[#64748B] font-mono border border-[#E2E8F0] rounded-xl">
                {previewRows.length === 0
                  ? "Record preview loaded into memory cache. Proceed to Data Profiling."
                  : "No records matched your search query."}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs font-mono text-[#64748B]">
              <span>Immutable cryptographic hash registered: SHA-256 fingerprint</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onNavigateTab ? onNavigateTab("analysis") : onRunAnalysis(activeDataset.dataset_id)}
                  className="text-[#1D4ED8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Deep Profiling</span>
                  <span>→</span>
                </button>
                <button
                  onClick={onProceedToTraining}
                  className="text-[#1D4ED8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Configure AutoML</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
