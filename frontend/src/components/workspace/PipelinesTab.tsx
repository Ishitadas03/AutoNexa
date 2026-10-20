"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  GitBranch,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Ban,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Database,
  Layers,
  Gauge,
  Sliders,
  Terminal,
  FileCheck,
  ShieldAlert,
  X,
  ArrowRight,
  Cpu,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  PipelineResponse,
  PipelineCreateRequest,
  PipelineEvent,
  PipelineStatus,
  PipelineStage,
  PromotionPolicy,
  DatasetProfileResponse,
} from "@/types/api";
import { WorkspaceTab } from "@/lib/store";
import RobotMascot from "@/components/landing/RobotMascot";

interface PipelinesTabProps {
  datasets: DatasetProfileResponse[];
  onNavigateTab: (tab: WorkspaceTab) => void;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  dataset_validation: "Dataset Validation",
  provenance_initialization: "Provenance Init",
  training: "AutoML Training",
  evaluation: "Model Evaluation",
  experiment_manifest: "Experiment Manifest",
  registry_registration: "Model Registry",
  promotion_gate: "Promotion Gate",
  monitoring_initialization: "Monitoring Baseline",
  completed: "Execution Completed",
};

export default function PipelinesTab({ datasets, onNavigateTab }: PipelinesTabProps) {
  const [pipelines, setPipelines] = useState<PipelineResponse[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<PipelineResponse | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<PipelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLauncherOpen, setIsLauncherOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form State for Pipeline Launcher
  const [formData, setFormData] = useState<PipelineCreateRequest>({
    dataset_id: datasets[0]?.dataset_id || "",
    target_column: "",
    task_type: null,
    model_name: "prod_candidate_model",
    description: "",
    auto_register: true,
    initial_registry_stage: "development",
    promotion_policy: "auto_production",
    candidate_tolerance_pct: 5.0,
    create_reference_profile: true,
    monitoring_split_source: "training",
    random_seed: 42,
  });

  // Sync default dataset when datasets prop updates
  useEffect(() => {
    if (datasets.length > 0 && !formData.dataset_id) {
      setFormData((prev) => ({
        ...prev,
        dataset_id: datasets[0].dataset_id,
        target_column: datasets[0].column_names ? datasets[0].column_names[datasets[0].column_names.length - 1] : "",
      }));
    }
  }, [datasets, formData.dataset_id]);

  // Update target column when dataset changes
  const handleDatasetChange = (dsId: string) => {
    const ds = datasets.find((d) => d.dataset_id === dsId);
    setFormData((prev) => ({
      ...prev,
      dataset_id: dsId,
      target_column: ds?.column_names ? ds.column_names[ds.column_names.length - 1] : prev.target_column,
    }));
  };

  // Fetch Pipelines list
  const fetchPipelines = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const resp = await api.listPipelines({
        status: statusFilter !== "all" ? statusFilter : undefined,
        model_name: searchQuery.trim() || undefined,
        limit: 50,
      });
      setPipelines(resp.pipelines || []);
    } catch (err: any) {
      console.error("Failed to load pipelines:", err);
      setActionError(err.detail || err.message || "Failed to load pipelines.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  // Polling for active pipelines
  useEffect(() => {
    const hasActive = pipelines.some((p) => p.status === "pending" || p.status === "running");
    if (!hasActive) return;

    const interval = setInterval(() => {
      fetchPipelines(false);
      if (selectedPipeline && (selectedPipeline.status === "pending" || selectedPipeline.status === "running")) {
        api.getPipeline(selectedPipeline.pipeline_id)
          .then((updated) => {
            setSelectedPipeline(updated);
            return api.getPipelineEvents(updated.pipeline_id);
          })
          .then(setSelectedEvents)
          .catch((err) => console.warn("Background detail refresh error:", err));
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [pipelines, selectedPipeline, fetchPipelines]);

  // Load details and events when selecting a pipeline
  const handleSelectPipeline = async (p: PipelineResponse) => {
    setSelectedPipeline(p);
    try {
      const [detail, events] = await Promise.all([
        api.getPipeline(p.pipeline_id),
        api.getPipelineEvents(p.pipeline_id),
      ]);
      setSelectedPipeline(detail);
      setSelectedEvents(events || []);
    } catch (err: any) {
      console.error("Failed to load pipeline events:", err);
    }
  };

  // Handle Pipeline Launch
  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.dataset_id || !formData.target_column || !formData.model_name) {
      setActionError("Please provide dataset, target column, and model name.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const launched = await api.createPipeline(formData);
      setActionSuccess(`Pipeline '${launched.pipeline_id}' successfully initiated!`);
      setIsLauncherOpen(false);
      await fetchPipelines(true);
      handleSelectPipeline(launched);
    } catch (err: any) {
      console.error("Failed to initiate pipeline:", err);
      setActionError(err.detail || err.message || "Failed to launch pipeline execution.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Pipeline Cancellation
  const handleCancel = async (pipelineId: string) => {
    if (!confirm(`Are you sure you want to request cancellation for pipeline ${pipelineId}?`)) return;
    try {
      const res = await api.cancelPipeline(pipelineId);
      setActionSuccess(`Cancellation requested for pipeline ${pipelineId}.`);
      await fetchPipelines(false);
      if (selectedPipeline?.pipeline_id === pipelineId) {
        setSelectedPipeline(res);
      }
    } catch (err: any) {
      setActionError(err.detail || err.message || "Failed to cancel pipeline.");
    }
  };

  // Handle Pipeline Retry
  const handleRetry = async (pipelineId: string) => {
    try {
      const res = await api.retryPipeline(pipelineId);
      setActionSuccess(`Pipeline ${pipelineId} requeued for execution.`);
      await fetchPipelines(false);
      handleSelectPipeline(res);
    } catch (err: any) {
      setActionError(err.detail || err.message || "Failed to retry pipeline.");
    }
  };

  const getStatusBadge = (status: PipelineStatus) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 animate-pulse" /> Pending
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin text-blue-600" /> Running
          </span>
        );
      case "succeeded":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Succeeded
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" /> Failed
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
            <Ban className="w-3 h-3 text-slate-500" /> Cancelled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Hero */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-full opacity-10 pointer-events-none bg-gradient-to-l from-[#1D4ED8] to-transparent" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#1D4ED8] shadow-inner shrink-0">
              <GitBranch className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">
                  Pipeline Orchestration & Reproducibility
                </h1>
                <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-blue-100 text-[#1D4ED8] rounded-full border border-blue-200">
                  Phase 15 Production Engine
                </span>
              </div>
              <p className="text-sm text-[#64748B] mt-1 max-w-2xl leading-relaxed">
                Connect dataset validation, AutoML model training, experiment tracking, model registry candidate gating,
                and production monitoring baseline profiling into an asynchronous, fully traceable end-to-end pipeline.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => fetchPipelines(true)}
              disabled={isRefreshing}
              className="p-2.5 rounded-xl border border-[#CBD5E1] bg-white text-[#475569] hover:text-[#0F172A] hover:bg-slate-50 transition-colors shadow-xs"
              title="Refresh Pipeline Runs"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-[#1D4ED8]" : ""}`} />
            </button>
            <button
              onClick={() => setIsLauncherOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>New Pipeline Run</span>
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {actionError && (
          <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="text-rose-500 hover:text-rose-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {actionSuccess && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-500 hover:text-emerald-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-[#CBD5E1] shadow-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search model name or pipeline ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3.5 py-1.5 text-xs rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#1D4ED8] focus:bg-white w-full sm:w-64"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#1D4ED8]"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="text-xs text-[#64748B] flex items-center gap-2 self-end sm:self-center">
          <Cpu className="w-3.5 h-3.5 text-blue-600" />
          <span>Asynchronous Local Queue (Bounded Concurrency: 2)</span>
        </div>
      </div>

      {/* Main Content Area: Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Pipeline List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold text-[#475569] uppercase tracking-wider">
              Pipeline Executions ({pipelines.length})
            </h2>
            <span className="text-[11px] text-[#94A3B8]">Click to inspect lifecycle & timeline</span>
          </div>

          {isLoading ? (
            <div className="bg-white rounded-xl border border-[#CBD5E1] p-12 text-center text-xs text-[#64748B] space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#1D4ED8]" />
              <p>Loading pipeline execution logs...</p>
            </div>
          ) : pipelines.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#CBD5E1] p-8 text-center space-y-4">
              <RobotMascot state="idle" size="md" message="No pipelines initiated yet!" showMessage={true} />
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">No Pipelines Found</p>
                <p className="text-xs text-[#64748B] mt-1">
                  Launch a new pipeline run to execute AutoML training and candidate registration.
                </p>
              </div>
              <button
                onClick={() => setIsLauncherOpen(true)}
                className="px-4 py-2 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white rounded-lg text-xs font-medium shadow-xs"
              >
                Launch First Pipeline
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
              {pipelines.map((p) => {
                const isSelected = selectedPipeline?.pipeline_id === p.pipeline_id;
                const completedStagesCount = p.stages?.filter((s) => s.status === "succeeded" || s.status === "skipped").length || 0;
                return (
                  <div
                    key={p.pipeline_id}
                    onClick={() => handleSelectPipeline(p)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer text-left relative ${
                      isSelected
                        ? "bg-blue-50/60 border-[#1D4ED8] shadow-xs ring-1 ring-[#1D4ED8]"
                        : "bg-white border-[#CBD5E1] hover:border-blue-300 hover:shadow-xs"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[#0F172A] truncate">
                            {p.model_name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {p.task_type}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-[#64748B] mt-0.5 truncate">
                          {p.pipeline_id}
                        </p>
                      </div>
                      <div className="shrink-0">{getStatusBadge(p.status)}</div>
                    </div>

                    {/* Progress Bar & Stage Indicator */}
                    <div className="mt-3">
                      <div className="flex justify-between items-center text-[10px] text-[#64748B] mb-1">
                        <span>Stage: {STAGE_LABELS[p.current_stage] || p.current_stage}</span>
                        <span>{completedStagesCount}/9 Completed</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            p.status === "failed"
                              ? "bg-rose-500"
                              : p.status === "succeeded"
                              ? "bg-emerald-500"
                              : "bg-[#1D4ED8]"
                          }`}
                          style={{ width: `${Math.round((completedStagesCount / 9) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Metric and Timestamp footer */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-[#64748B]">
                      <span>
                        {p.primary_metric && p.metric_value !== null ? (
                          <span className="font-medium text-[#0F172A]">
                            {p.primary_metric}: {Number(p.metric_value).toFixed(4)}
                          </span>
                        ) : (
                          "Awaiting metric"
                        )}
                      </span>
                      <span>
                        {p.duration_seconds ? `${p.duration_seconds}s` : new Date(p.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Detailed Pipeline Inspection (7 cols) */}
        <div className="lg:col-span-7">
          {selectedPipeline ? (
            <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 shadow-xs space-y-6">
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-[#0F172A]">
                      {selectedPipeline.model_name}
                    </h2>
                    {getStatusBadge(selectedPipeline.status)}
                  </div>
                  <p className="text-xs font-mono text-[#64748B] mt-0.5">
                    Pipeline ID: {selectedPipeline.pipeline_id}
                  </p>
                </div>

                {/* Cancellation & Retry Actions */}
                <div className="flex items-center gap-2">
                  {(selectedPipeline.status === "pending" || selectedPipeline.status === "running") && (
                    <button
                      onClick={() => handleCancel(selectedPipeline.pipeline_id)}
                      className="px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5" /> Cancel
                    </button>
                  )}
                  {(selectedPipeline.status === "failed" || selectedPipeline.status === "cancelled") && (
                    <button
                      onClick={() => handleRetry(selectedPipeline.pipeline_id)}
                      className="px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-[#1D4ED8] text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Retry Execution
                    </button>
                  )}
                </div>
              </div>

              {/* Failure Alert Banner if any */}
              {selectedPipeline.failure_reason && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Pipeline Execution Terminated</span>
                  </div>
                  <p className="font-mono text-[11px] pl-6 leading-relaxed">
                    {selectedPipeline.failure_reason}
                  </p>
                </div>
              )}

              {/* Quick Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[#64748B] block text-[11px]">Dataset ID</span>
                  <span className="font-mono font-medium text-[#0F172A] truncate block mt-0.5">
                    {selectedPipeline.dataset_id}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[#64748B] block text-[11px]">Target Column</span>
                  <span className="font-mono font-medium text-[#0F172A] truncate block mt-0.5">
                    {selectedPipeline.target_column}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[#64748B] block text-[11px]">Promotion Policy</span>
                  <span className="font-medium text-[#0F172A] capitalize block mt-0.5">
                    {(selectedPipeline.promotion_policy || "Standard").replace("_", " ")}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[#64748B] block text-[11px]">Total Duration</span>
                  <span className="font-medium text-[#0F172A] block mt-0.5">
                    {selectedPipeline.duration_seconds ? `${selectedPipeline.duration_seconds} sec` : "In progress"}
                  </span>
                </div>
              </div>

              {/* 9-Stage Timeline */}
              <div>
                <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-3">
                  Execution Stage Timeline (9 Sequential Stages)
                </h3>
                <div className="space-y-2 border border-[#E2E8F0] rounded-xl p-3 bg-[#F8FAFC]">
                  {selectedPipeline.stages?.map((st, idx) => {
                    const isCurrent = selectedPipeline.current_stage === st.stage && selectedPipeline.status === "running";
                    return (
                      <div
                        key={st.stage}
                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                          isCurrent
                            ? "bg-blue-50 border-blue-300 ring-1 ring-blue-300"
                            : st.status === "succeeded"
                            ? "bg-white border-emerald-200"
                            : st.status === "failed"
                            ? "bg-white border-rose-200"
                            : "bg-white/60 border-slate-200 opacity-70"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] text-[#94A3B8] w-4 text-center">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-semibold text-[#0F172A]">
                              {STAGE_LABELS[st.stage] || st.stage}
                            </span>
                            {st.message && (
                              <p className="text-[11px] text-[#64748B] mt-0.5">
                                {st.message}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {st.duration_seconds && (
                            <span className="text-[10px] font-mono text-[#94A3B8]">
                              {st.duration_seconds}s
                            </span>
                          )}
                          {st.status === "succeeded" && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          )}
                          {st.status === "failed" && (
                            <XCircle className="w-4 h-4 text-rose-600" />
                          )}
                          {st.status === "skipped" && (
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                              Skipped
                            </span>
                          )}
                          {st.status === "running" && (
                            <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                          )}
                          {st.status === "pending" && (
                            <Clock className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cross-Service Integration Links */}
              <div>
                <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-2">
                  Linked Downstream Artifacts
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {selectedPipeline.experiment_id ? (
                    <button
                      onClick={() => onNavigateTab("experiments")}
                      className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100/60 text-left transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="text-[11px] text-[#1D4ED8] font-medium block">Experiment</span>
                        <span className="font-mono text-xs text-[#0F172A] truncate block">
                          {selectedPipeline.experiment_id.slice(0, 14)}...
                        </span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-[#1D4ED8]" />
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-xs">
                      No linked experiment
                    </div>
                  )}

                  {selectedPipeline.model_version ? (
                    <button
                      onClick={() => onNavigateTab("models")}
                      className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/60 text-left transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="text-[11px] text-indigo-700 font-medium block">Model Registry</span>
                        <span className="font-mono text-xs text-[#0F172A] block">
                          v{selectedPipeline.model_version} ({selectedPipeline.model_stage})
                        </span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-indigo-700" />
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-xs">
                      Not registered in registry
                    </div>
                  )}

                  {selectedPipeline.reference_profile_id ? (
                    <button
                      onClick={() => onNavigateTab("monitoring")}
                      className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/60 text-left transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="text-[11px] text-emerald-700 font-medium block">Monitoring Baseline</span>
                        <span className="font-mono text-xs text-[#0F172A] truncate block">
                          {selectedPipeline.reference_profile_id.slice(0, 14)}...
                        </span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-emerald-700" />
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-xs">
                      No monitoring baseline
                    </div>
                  )}
                </div>
              </div>

              {/* Provenance Card */}
              {selectedPipeline.provenance && (
                <div className="border border-[#CBD5E1] rounded-xl p-4 bg-slate-50 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                    <FileCheck className="w-4 h-4 text-blue-600" />
                    <span>Cryptographic Provenance Manifest</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-[#475569]">
                    <div>
                      <span className="text-[#94A3B8]">Config Fingerprint: </span>
                      <span className="text-[#0F172A]">{selectedPipeline.provenance.config_fingerprint.slice(0, 16)}...</span>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Artifact SHA-256: </span>
                      <span className="text-[#0F172A]">
                        {selectedPipeline.artifact_checksum ? `${selectedPipeline.artifact_checksum.slice(0, 16)}...` : "None"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Deterministic Seed: </span>
                      <span className="text-[#0F172A]">{selectedPipeline.provenance.random_state ?? 42}</span>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Platform: </span>
                      <span className="text-[#0F172A]">
                        {selectedPipeline.provenance.environment_info?.os || "Windows"} / Python {selectedPipeline.provenance.environment_info?.python_version || "3.11"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Event Audit Stream */}
              {selectedEvents.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-blue-600" />
                    <span>Live Audit Event Stream ({selectedEvents.length})</span>
                  </h3>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px]">
                    {selectedEvents.map((ev) => (
                      <div key={ev.event_id} className="flex items-start gap-2">
                        <span className="text-slate-500 shrink-0">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>
                        <span
                          className={`font-semibold shrink-0 uppercase text-[10px] px-1 rounded ${
                            ev.event_type === "error"
                              ? "bg-rose-900 text-rose-300"
                              : ev.event_type === "warning"
                              ? "bg-amber-900 text-amber-300"
                              : "bg-blue-900 text-blue-300"
                          }`}
                        >
                          {ev.event_type}
                        </span>
                        <span className="text-slate-300">{ev.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-[#CBD5E1] rounded-2xl p-12 text-center text-xs text-[#64748B] space-y-4">
              <RobotMascot state="thinking" size="md" message="Select an execution to view details!" showMessage={true} />
              <p className="font-semibold text-sm text-[#0F172A]">No Pipeline Selected</p>
              <p className="max-w-sm mx-auto text-[#64748B]">
                Click on any pipeline execution on the left panel to inspect its 9-stage timeline, cryptographic checksums,
                and provenance manifest.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Launcher Modal */}
      {isLauncherOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#CBD5E1] shadow-2xl max-w-xl w-full p-6 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 text-[#1D4ED8] flex items-center justify-center">
                  <Play className="w-4 h-4 fill-[#1D4ED8]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0F172A]">Launch New Pipeline Run</h3>
                  <p className="text-xs text-[#64748B]">Automated end-to-end training and candidate registration</p>
                </div>
              </div>
              <button
                onClick={() => setIsLauncherOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLaunch} className="space-y-4 text-xs">
              {/* Dataset Selection */}
              <div>
                <label className="block font-semibold text-[#0F172A] mb-1">Source Dataset</label>
                <select
                  value={formData.dataset_id}
                  onChange={(e) => handleDatasetChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  required
                >
                  {datasets.map((d) => (
                    <option key={d.dataset_id} value={d.dataset_id}>
                      {d.filename} ({d.rows} rows, {d.columns} cols)
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Column & Model Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Target Column</label>
                  <input
                    type="text"
                    value={formData.target_column}
                    onChange={(e) => setFormData({ ...formData, target_column: e.target.value })}
                    placeholder="e.g. churn or price"
                    className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Registered Model Name</label>
                  <input
                    type="text"
                    value={formData.model_name}
                    onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                    placeholder="e.g. churn_classifier"
                    className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    required
                  />
                </div>
              </div>

              {/* Promotion Policy */}
              <div>
                <label className="block font-semibold text-[#0F172A] mb-1">Candidate Promotion Policy</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "manual", title: "Manual", desc: "Keep as candidate in Development stage." },
                    { id: "auto_staging", title: "Auto Staging", desc: "Promote to Staging if evaluation succeeds." },
                    { id: "auto_production", title: "Auto Production", desc: "Promote only if beating incumbent production model." },
                  ].map((p) => (
                    <label
                      key={p.id}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                        formData.promotion_policy === p.id
                          ? "bg-blue-50 border-[#1D4ED8] ring-1 ring-[#1D4ED8]"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="promotion_policy"
                        value={p.id}
                        checked={formData.promotion_policy === p.id}
                        onChange={() => setFormData({ ...formData, promotion_policy: p.id as PromotionPolicy })}
                        className="sr-only"
                      />
                      <span className="font-bold text-xs text-[#0F172A] block">{p.title}</span>
                      <span className="text-[10px] text-[#64748B] block mt-0.5 leading-tight">{p.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Candidate Tolerance if Auto Production */}
              {formData.promotion_policy === "auto_production" && (
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
                  <label className="block font-semibold text-blue-900 mb-1">
                    Candidate Degradation Tolerance (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={formData.candidate_tolerance_pct}
                    onChange={(e) => setFormData({ ...formData, candidate_tolerance_pct: parseFloat(e.target.value) || 0 })}
                    className="w-28 px-2.5 py-1 text-xs rounded border border-blue-300 bg-white"
                  />
                  <span className="text-[11px] text-blue-700 ml-2">
                    Allow candidate within {formData.candidate_tolerance_pct}% of incumbent score.
                  </span>
                </div>
              )}

              {/* Toggles */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.auto_register}
                    onChange={(e) => setFormData({ ...formData, auto_register: e.target.checked })}
                    className="rounded text-[#1D4ED8]"
                  />
                  <span className="text-[#0F172A] font-medium">Auto-register winning AutoML model into Model Registry</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.create_reference_profile}
                    onChange={(e) => setFormData({ ...formData, create_reference_profile: e.target.checked })}
                    className="rounded text-[#1D4ED8]"
                  />
                  <span className="text-[#0F172A] font-medium">
                    Automatically create Model Monitoring baseline distribution profile
                  </span>
                </label>
              </div>

              {/* Footer actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLauncherOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white rounded-lg text-xs font-medium flex items-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validating & Launching...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Start Pipeline Execution</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
