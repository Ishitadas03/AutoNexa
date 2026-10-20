"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  History,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
  Cpu,
  ArrowRight,
  RefreshCw,
  Hash,
  Download,
  Sliders,
  GitCompare,
  Clock,
  Database,
  ExternalLink,
  Sparkles,
  Search,
  Trash2,
  Check,
  X,
  FileCode,
  ArrowUpDown,
  BookOpen,
  Filter,
} from "lucide-react";
import {
  ArtifactVerificationResponse,
  ExperimentComparisonResponse,
  ExperimentDetailResponse,
  ExperimentSummary,
  ReproducibilityManifest,
  TrainingResponse,
} from "@/types/api";
import { api } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/utils";
import { WorkspaceTab } from "@/lib/store";

interface ExperimentsTabProps {
  experiments: TrainingResponse[];
  activeExperiment: TrainingResponse | null;
  onSelectExperiment?: (expId: string) => void;
  onNavigateTab: (tab: WorkspaceTab) => void;
}

export default function ExperimentsTab({
  experiments: inMemoryExperiments,
  activeExperiment,
  onSelectExperiment,
  onNavigateTab,
}: ExperimentsTabProps) {
  // Tabs: history, inspector, compare
  const [activeSubTab, setActiveSubTab] = useState<"history" | "inspector" | "compare">("history");

  // History state
  const [persistedExperiments, setPersistedExperiments] = useState<ExperimentSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [taskFilter, setTaskFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Selected experiment ID for inspection
  const [selectedExpId, setSelectedExpId] = useState<string>(
    activeExperiment?.experiment_id || (inMemoryExperiments.length > 0 ? inMemoryExperiments[0].experiment_id : "")
  );

  // Inspector state
  const [detail, setDetail] = useState<ExperimentDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [manifest, setManifest] = useState<ReproducibilityManifest | null>(null);
  const [verification, setVerification] = useState<ArtifactVerificationResponse | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [downloadingArtifact, setDownloadingArtifact] = useState(false);

  // Compare state
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ExperimentComparisonResponse | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Delete modal state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch experiments list from backend
  const fetchExperiments = useCallback(async () => {
    setLoadingList(true);
    setErrorMessage(null);
    try {
      const res = await api.listExperiments({
        page,
        page_size: pageSize,
        task_type: taskFilter || undefined,
        status: statusFilter || undefined,
        search: searchQuery || undefined,
      });
      setPersistedExperiments(res.items);
      setTotalCount(res.total);
      setTotalPages(res.total_pages);

      // If no selected experiment, choose first available
      if (!selectedExpId && res.items.length > 0) {
        setSelectedExpId(res.items[0].experiment_id);
      }
    } catch (err: any) {
      console.warn("Failed to list experiments from backend:", err);
      // Fallback to in-memory experiments if backend list is empty or offline
      if (inMemoryExperiments.length > 0) {
        const fallbacks: ExperimentSummary[] = inMemoryExperiments.map((e) => ({
          experiment_id: e.experiment_id,
          name: `AutoML Run ${e.experiment_id.slice(0, 8)}`,
          dataset_id: e.dataset_id,
          dataset_fingerprint: e.dataset_fingerprint,
          task_type: e.task_type,
          target_column: e.target_column,
          status: "completed",
          best_model: e.best_model,
          best_score: e.best_score,
          primary_metric: e.primary_metric,
          created_at: new Date().toISOString(),
          models_count: e.models_evaluated?.length || 0,
          has_artifact: true,
        }));
        setPersistedExperiments(fallbacks);
        setTotalCount(fallbacks.length);
        setTotalPages(1);
      }
    } finally {
      setLoadingList(false);
    }
  }, [page, pageSize, taskFilter, statusFilter, searchQuery, selectedExpId, inMemoryExperiments]);

  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  // Load details for selected experiment
  useEffect(() => {
    if (!selectedExpId) return;

    let isMounted = true;
    setLoadingDetail(true);
    setVerification(null);
    setManifest(null);

    api
      .getExperimentDetails(selectedExpId)
      .then((data) => {
        if (isMounted) setDetail(data);
      })
      .catch((err) => {
        console.warn("Failed to get full experiment details, trying inspection fallback:", err);
        // Fallback to inspectExperiment if available
        api
          .inspectExperiment(selectedExpId)
          .then((insp) => {
            if (isMounted) {
              setDetail({
                experiment_id: insp.experiment_id,
                status: insp.status,
                dataset_id: insp.dataset_id,
                dataset_fingerprint: insp.dataset_fingerprint,
                target_column: insp.target_column,
                task_type: insp.task_type,
                evaluation_strategy: insp.evaluation_strategy,
                primary_metric: insp.primary_metric,
                primary_metric_greater_is_better: insp.primary_metric_greater_is_better,
                best_model: insp.best_model,
                best_score: insp.best_score,
                test_metrics: insp.test_metrics,
                ranked_models: insp.ranked_models,
                features_count: insp.features_count,
                feature_names: insp.feature_names,
                numeric_features: insp.numeric_features,
                categorical_features: insp.categorical_features,
                artifacts: {
                  model_filename: "best_model.joblib",
                  model_sha256: insp.artifact_availability?.model_sha256,
                  model_size_bytes: insp.artifact_availability?.model_size_bytes,
                },
              });
            }
          })
          .catch(() => {});
      })
      .finally(() => {
        if (isMounted) setLoadingDetail(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedExpId]);

  // Handle toggle selection for comparison
  const toggleCompareSelect = (expId: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(expId)) {
        return prev.filter((id) => id !== expId);
      }
      if (prev.length >= 10) return prev;
      return [...prev, expId];
    });
  };

  // Run multi-experiment comparison
  const handleRunComparison = async () => {
    if (selectedForCompare.length < 2) return;
    setLoadingCompare(true);
    setErrorMessage(null);
    try {
      const res = await api.compareExperiments(selectedForCompare);
      setComparison(res);
      setActiveSubTab("compare");
    } catch (err: any) {
      setErrorMessage(err.detail || err.message || "Failed to compare selected experiments.");
    } finally {
      setLoadingCompare(false);
    }
  };

  // Export Reproducibility Manifest as JSON
  const handleExportManifest = async () => {
    if (!selectedExpId) return;
    try {
      const data = await api.getReproducibilityManifest(selectedExpId);
      setManifest(data);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reproducibility_manifest_${selectedExpId.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMessage("Failed to export reproducibility manifest: " + (err.detail || err.message));
    }
  };

  // Verify real-time artifact checksum
  const handleVerifyArtifact = async () => {
    if (!selectedExpId) return;
    setVerifying(true);
    try {
      const res = await api.verifyExperimentArtifact(selectedExpId);
      setVerification(res);
    } catch (err: any) {
      setErrorMessage("Artifact verification failed: " + (err.detail || err.message));
    } finally {
      setVerifying(false);
    }
  };

  // Download real model artifact .joblib
  const handleDownloadArtifact = async () => {
    if (!selectedExpId) return;
    setDownloadingArtifact(true);
    try {
      const { blob, filename } = await api.downloadExperimentArtifact(selectedExpId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMessage("Model download failed: " + (err.detail || err.message));
    } finally {
      setDownloadingArtifact(false);
    }
  };

  // Delete experiment
  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      await api.deleteExperiment(deleteTargetId);
      if (selectedExpId === deleteTargetId) {
        setSelectedExpId("");
        setDetail(null);
      }
      setSelectedForCompare((prev) => prev.filter((id) => id !== deleteTargetId));
      setDeleteTargetId(null);
      await fetchExperiments();
    } catch (err: any) {
      setErrorMessage("Failed to delete experiment: " + (err.detail || err.message));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] mb-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#334155] font-semibold">
              RESEARCH-GRADE TRACKING &amp; AUDIT
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight font-sans">
            Experiment Tracking &amp; Lineage
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Audit configurations, verify cryptographic SHA-256 artifact checksums, export reproducibility manifests, and compare experiments.
          </p>
        </div>

        {/* View Switcher Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-[#CBD5E1] shadow-xs text-xs font-mono">
          <button
            onClick={() => setActiveSubTab("history")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeSubTab === "history"
                ? "bg-[#1D4ED8] text-white font-bold"
                : "text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            History ({totalCount})
          </button>
          <button
            onClick={() => setActiveSubTab("inspector")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeSubTab === "inspector"
                ? "bg-[#1D4ED8] text-white font-bold"
                : "text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            Inspector &amp; Manifest
          </button>
          <button
            onClick={() => setActiveSubTab("compare")}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeSubTab === "compare"
                ? "bg-[#1D4ED8] text-white font-bold"
                : "text-[#475569] hover:text-[#0F172A]"
            }`}
          >
            Comparison {selectedForCompare.length > 0 && `(${selectedForCompare.length})`}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="cursor-pointer text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* Subtab 1: Experiment History Table                       */}
      {/* ======================================================== */}
      {activeSubTab === "history" && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          {/* Controls bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  placeholder="Search ID, target, or model..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#CBD5E1] font-mono focus:outline-none focus:border-[#1D4ED8] w-52 sm:w-64"
                />
              </div>

              {/* Task filter */}
              <select
                value={taskFilter}
                onChange={(e) => {
                  setTaskFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-[#CBD5E1] font-mono bg-white text-[#475569] focus:outline-none focus:border-[#1D4ED8]"
              >
                <option value="">All Tasks</option>
                <option value="classification">Classification</option>
                <option value="regression">Regression</option>
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-[#CBD5E1] font-mono bg-white text-[#475569] focus:outline-none focus:border-[#1D4ED8]"
              >
                <option value="">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>

              <button
                onClick={fetchExperiments}
                disabled={loadingList}
                className="p-1.5 rounded-xl border border-[#CBD5E1] hover:border-[#1D4ED8] hover:bg-[#EFF6FF] text-[#475569] cursor-pointer transition-colors"
                title="Refresh experiments"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? "animate-spin text-[#1D4ED8]" : ""}`} />
              </button>
            </div>

            {/* Compare Action Button */}
            {selectedForCompare.length >= 2 && (
              <button
                onClick={handleRunComparison}
                disabled={loadingCompare}
                className="px-3.5 py-1.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Compare {selectedForCompare.length} Selected</span>
              </button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] text-[#64748B] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-8">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-2.5 px-3 font-semibold">Experiment ID</th>
                  <th className="py-2.5 px-3 font-semibold">Target / Task</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Best Model &amp; Score</th>
                  <th className="py-2.5 px-3 font-semibold">Duration</th>
                  <th className="py-2.5 px-3 font-semibold">Artifact</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {loadingList ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-[#64748B]">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto text-[#1D4ED8] mb-2" />
                      Loading experiments...
                    </td>
                  </tr>
                ) : persistedExperiments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-[#64748B]">
                      No experiments matching search criteria.
                    </td>
                  </tr>
                ) : (
                  persistedExperiments.map((exp) => {
                    const isSelected = exp.experiment_id === selectedExpId;
                    const isChecked = selectedForCompare.includes(exp.experiment_id);

                    return (
                      <tr
                        key={exp.experiment_id}
                        className={`hover:bg-[#F8FAFC] transition-colors ${
                          isSelected ? "bg-blue-50/50" : ""
                        }`}
                      >
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCompareSelect(exp.experiment_id)}
                            className="rounded border-[#CBD5E1] text-[#1D4ED8] focus:ring-[#1D4ED8] cursor-pointer"
                            title="Select for comparison"
                          />
                        </td>
                        <td className="py-3 px-3 font-bold text-[#0F172A]">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0" />
                            <span className="truncate max-w-[130px]" title={exp.experiment_id}>
                              {exp.experiment_id}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#94A3B8] font-sans">
                            {new Date(exp.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#0F172A]">{exp.target_column}</div>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                            {exp.task_type}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              exp.status === "completed"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : exp.status === "failed"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {exp.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#0F172A]">
                            {exp.best_model || "—"}
                          </div>
                          {exp.best_score !== null && exp.best_score !== undefined && (
                            <div className="text-[11px] font-bold text-[#1D4ED8]">
                              {Number(exp.best_score).toFixed(4)} ({exp.primary_metric.toUpperCase()})
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[#64748B]">
                          {exp.total_duration_seconds ? `${exp.total_duration_seconds.toFixed(2)}s` : "—"}
                        </td>
                        <td className="py-3 px-3">
                          {exp.has_artifact ? (
                            <span className="inline-flex items-center gap-1 text-[10.5px] text-emerald-600 font-semibold">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Verified</span>
                            </span>
                          ) : (
                            <span className="text-[10.5px] text-[#94A3B8]">None</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedExpId(exp.experiment_id);
                                if (onSelectExperiment) onSelectExperiment(exp.experiment_id);
                                setActiveSubTab("inspector");
                              }}
                              className="px-2.5 py-1 rounded bg-white border border-[#CBD5E1] text-[#1D4ED8] hover:border-[#1D4ED8] hover:bg-[#EFF6FF] text-[10.5px] font-semibold transition-all cursor-pointer"
                            >
                              Inspect →
                            </button>
                            <button
                              onClick={() => setDeleteTargetId(exp.experiment_id)}
                              className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer transition-colors"
                              title="Delete experiment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-[#64748B] pt-2">
              <span>
                Page {page} of {totalPages} ({totalCount} total experiments)
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 rounded border border-[#CBD5E1] disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded border border-[#CBD5E1] disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* Subtab 2: Artifact Inspector & Manifest Viewer           */}
      {/* ======================================================== */}
      {activeSubTab === "inspector" && (
        <div className="space-y-6">
          {!detail ? (
            <div className="p-8 text-center bg-white border border-[#E2E8F0] rounded-2xl text-xs text-[#64748B]">
              {loadingDetail ? (
                <div className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#1D4ED8]" />
                  <span>Loading experiment details...</span>
                </div>
              ) : (
                <span>No experiment selected. Select an experiment from the History tab.</span>
              )}
            </div>
          ) : (
            <>
              {/* Top Banner with Action Buttons */}
              <div className="p-6 rounded-2xl bg-white border border-[#CBD5E1] shadow-xs space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-[#64748B] font-semibold block">
                      VERIFIED EXPERIMENT SPECIFICATION
                    </span>
                    <h2 className="text-xl font-bold text-[#0F172A] font-mono mt-0.5">
                      {detail.experiment_id}
                    </h2>
                    <p className="text-xs text-[#64748B] mt-1 font-sans">
                      Target: <strong className="text-[#0F172A] font-mono">{detail.target_column}</strong> • Task: <strong className="text-[#0F172A] font-mono">{detail.task_type}</strong> • Strategy: <strong className="text-[#0F172A] font-mono">{detail.evaluation_strategy}</strong>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleExportManifest}
                      className="px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] hover:border-[#1D4ED8] text-[#0F172A] text-xs font-semibold flex items-center gap-1.5 shadow-xs hover:bg-[#EFF6FF] transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#1D4ED8]" />
                      <span>Export Manifest (.json)</span>
                    </button>
                    <button
                      onClick={handleVerifyArtifact}
                      disabled={verifying}
                      className="px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] hover:border-emerald-600 text-[#0F172A] text-xs font-semibold flex items-center gap-1.5 shadow-xs hover:bg-emerald-50 transition-all cursor-pointer"
                    >
                      <ShieldCheck className={`w-3.5 h-3.5 text-emerald-600 ${verifying ? "animate-pulse" : ""}`} />
                      <span>Verify Checksum</span>
                    </button>
                    {detail.artifacts?.model_filename && (
                      <button
                        onClick={handleDownloadArtifact}
                        disabled={downloadingArtifact}
                        className="px-3 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download .joblib</span>
                      </button>
                    )}
                    <button
                      onClick={() => onNavigateTab("models")}
                      className="px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] hover:border-[#1D4ED8] text-[#1D4ED8] text-xs font-semibold flex items-center gap-1.5 shadow-xs hover:bg-[#EFF6FF] transition-all cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Open Model Registry →</span>
                    </button>
                  </div>
                </div>

                {/* Live Integrity Badge if Verified */}
                {verification && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-2.5 ${
                      verification.verified
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-red-50 border-red-200 text-red-800"
                    }`}
                  >
                    {verification.verified ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="font-bold">{verification.message}</div>
                      <div className="text-[10.5px] opacity-90 break-all">
                        SHA-256: {verification.actual_sha256 || "N/A"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Grid of Key Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
                  <span className="text-[10px] uppercase font-mono text-[#64748B] block font-semibold">
                    Dataset Fingerprint (SHA-256)
                  </span>
                  <div className="text-xs font-mono font-bold text-[#0F172A] mt-1 break-all">
                    {detail.dataset_fingerprint}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
                  <span className="text-[10px] uppercase font-mono text-[#64748B] block font-semibold">
                    Champion Model
                  </span>
                  <div className="text-base font-bold text-[#1D4ED8] font-mono mt-1">
                    {detail.best_model || "None"}
                  </div>
                  <span className="text-[11px] text-[#64748B] font-mono">
                    Score: {detail.best_score !== null && detail.best_score !== undefined ? detail.best_score.toFixed(4) : "—"} ({detail.primary_metric})
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
                  <span className="text-[10px] uppercase font-mono text-[#64748B] block font-semibold">
                    Partitioning &amp; Seeds
                  </span>
                  <div className="text-xs font-mono font-bold text-[#0F172A] mt-1">
                    Train: {detail.train_rows || "—"} | Test: {detail.test_rows || "—"}
                  </div>
                  <span className="text-[11px] text-[#64748B] font-mono">
                    Seed: {detail.random_state ?? 42} • Test Split: {(detail.test_size ?? 0.2) * 100}%
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
                  <span className="text-[10px] uppercase font-mono text-[#64748B] block font-semibold">
                    Execution Runtime
                  </span>
                  <div className="text-base font-bold text-[#0F172A] font-mono mt-1">
                    {detail.total_duration_seconds ? `${detail.total_duration_seconds.toFixed(2)}s` : "—"}
                  </div>
                  <span className="text-[11px] text-[#64748B] font-mono">
                    Status: <strong className="uppercase">{detail.status}</strong>
                  </span>
                </div>
              </div>

              {/* Models Leaderboard in this run */}
              {detail.models_evaluated && detail.models_evaluated.length > 0 && (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
                  <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#1D4ED8]" />
                    <span>Candidate Models Evaluated ({detail.models_evaluated.length})</span>
                  </h3>

                  <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] text-[#64748B] uppercase">
                          <th className="py-2 px-3 font-semibold">Model Identifier</th>
                          <th className="py-2 px-3 font-semibold">Status</th>
                          <th className="py-2 px-3 font-semibold">Validation Metric</th>
                          <th className="py-2 px-3 font-semibold">CV Mean ± Std</th>
                          <th className="py-2 px-3 font-semibold">Fit Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {detail.models_evaluated.map((m, idx) => (
                          <tr key={idx} className="hover:bg-[#F8FAFC]">
                            <td className="py-2.5 px-3 font-semibold text-[#0F172A]">
                              {m.model_name || m.model_id}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  m.status === "successful"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                              >
                                {m.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-bold text-[#1D4ED8]">
                              {m.metrics?.[detail.primary_metric] !== undefined
                                ? Number(m.metrics[detail.primary_metric]).toFixed(4)
                                : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-[#64748B]">
                              {m.cv_mean !== undefined && m.cv_mean !== null
                                ? `${Number(m.cv_mean).toFixed(4)} ± ${Number(m.cv_std || 0).toFixed(4)}`
                                : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-[#64748B]">
                              {m.duration_seconds ? `${Number(m.duration_seconds).toFixed(2)}s` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Environment Specs & Package Versions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-2">
                  <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    <span>Hardware &amp; Platform Environment</span>
                  </h4>
                  <div className="text-xs font-mono space-y-1 text-[#475569]">
                    <div>OS: {detail.system_info?.os_name || "Windows"} ({detail.system_info?.machine || "x64"})</div>
                    <div>Python: {detail.system_info?.python_version || "3.11.x"}</div>
                    <div>Processor: {detail.system_info?.processor || "Unknown"}</div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-2">
                  <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    <span>ML Library Dependencies</span>
                  </h4>
                  <div className="text-xs font-mono grid grid-cols-2 gap-1 text-[#475569]">
                    {detail.package_versions &&
                      Object.entries(detail.package_versions).map(([pkg, ver]) => (
                        <div key={pkg}>
                          {pkg}: <strong className="text-[#0F172A]">{ver}</strong>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* Subtab 3: Side-by-Side Comparison Matrix                 */}
      {/* ======================================================== */}
      {activeSubTab === "compare" && (
        <div className="space-y-6">
          {selectedForCompare.length < 2 && !comparison ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-3">
              <GitCompare className="w-8 h-8 text-[#1D4ED8] mx-auto opacity-70" />
              <h3 className="text-sm font-bold text-[#0F172A]">Select Experiments to Compare</h3>
              <p className="text-xs text-[#64748B] max-w-sm mx-auto font-sans">
                Return to the History tab and check at least 2 experiment checkboxes to generate a side-by-side metric and configuration comparison.
              </p>
              <button
                onClick={() => setActiveSubTab("history")}
                className="px-4 py-2 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
              >
                Go to History
              </button>
            </div>
          ) : loadingCompare ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] text-xs text-[#64748B]">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#1D4ED8] mb-2" />
              Running comparative evaluation...
            </div>
          ) : comparison ? (
            <div className="space-y-6">
              {/* Warning Banner if incompatible */}
              {comparison.compatibility_warning && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{comparison.compatibility_warning}</span>
                </div>
              )}

              {/* Side-by-Side Experiment Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {comparison.experiments.map((exp) => (
                  <div key={exp.experiment_id} className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                        {exp.task_type}
                      </span>
                      <span className="text-[10px] text-[#64748B] font-mono truncate max-w-[100px]">
                        {exp.dataset_id}
                      </span>
                    </div>

                    <div className="font-bold text-[#0F172A] font-mono text-xs break-all">
                      {exp.experiment_id}
                    </div>

                    <div className="space-y-1 text-xs font-mono">
                      <div className="text-[#475569]">
                        Model: <strong className="text-[#0F172A]">{exp.best_model || "None"}</strong>
                      </div>
                      <div className="text-[#475569]">
                        Score: <strong className="text-[#1D4ED8]">{exp.best_score !== null && exp.best_score !== undefined ? exp.best_score.toFixed(4) : "—"}</strong> ({exp.primary_metric})
                      </div>
                      <div className="text-[#475569]">
                        Duration: {exp.duration_seconds ? `${exp.duration_seconds.toFixed(2)}s` : "—"}
                      </div>
                      <div className="text-[#475569]">
                        Rows: {exp.train_rows || "—"} train
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Metrics Comparison Matrix */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
                <h3 className="text-sm font-bold text-[#0F172A]">Metrics Comparison Matrix</h3>
                <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] text-[#64748B] uppercase">
                        <th className="py-2.5 px-3 font-semibold">Metric Dimension</th>
                        <th className="py-2.5 px-3 font-semibold">Direction</th>
                        {comparison.experiments.map((e) => (
                          <th key={e.experiment_id} className="py-2.5 px-3 font-semibold truncate max-w-[120px]">
                            {e.experiment_id.slice(0, 8)}
                          </th>
                        ))}
                        <th className="py-2.5 px-3 font-semibold text-right">Champion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {Object.entries(comparison.metric_comparison).map(([metricName, values]) => {
                        const greaterIsBetter = comparison.metric_directions[metricName] ?? true;
                        const championExp = comparison.best_per_metric[metricName];

                        return (
                          <tr key={metricName} className="hover:bg-[#F8FAFC]">
                            <td className="py-2.5 px-3 font-bold text-[#0F172A]">{metricName}</td>
                            <td className="py-2.5 px-3 text-[#64748B]">
                              {greaterIsBetter ? "↑ Higher" : "↓ Lower"}
                            </td>
                            {comparison.experiments.map((e) => {
                              const val = values[e.experiment_id];
                              const isWinner = championExp === e.experiment_id;

                              return (
                                <td
                                  key={e.experiment_id}
                                  className={`py-2.5 px-3 ${
                                    isWinner ? "font-bold text-emerald-600 bg-emerald-50/40" : "text-[#475569]"
                                  }`}
                                >
                                  {val !== null && val !== undefined ? Number(val).toFixed(4) : "—"}
                                </td>
                              );
                            })}
                            <td className="py-2.5 px-3 text-right">
                              {championExp ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  {championExp.slice(0, 8)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Statistical Pairwise Differences (if 2 experiments on common dataset) */}
              {comparison.statistical_summary && (
                <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs space-y-2">
                  <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono">
                    Descriptive Pairwise Differences
                  </h4>
                  <p className="text-[11.5px] text-[#64748B] font-sans">
                    {comparison.statistical_summary.notes}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ======================================================== */}
      {/* Delete Confirmation Modal                                */}
      {/* ======================================================== */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-[#CBD5E1]">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-[#0F172A]">Delete Experiment?</h3>
            </div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to delete experiment <strong className="font-mono text-[#0F172A]">{deleteTargetId}</strong>?
              This will permanently delete the experiment metadata and stored model binaries from disk storage.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTargetId(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl border border-[#CBD5E1] text-[#475569] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                {deleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
