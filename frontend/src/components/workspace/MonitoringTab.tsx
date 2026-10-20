"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Gauge,
  Info,
  Layers,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  DriftAnalysisResponse,
  FeatureDriftResult,
  MonitoringAlertRecord,
  MonitoringOverviewResponse,
  MonitoringWindowResponse,
  PerformanceMetricReport,
  ReferenceProfileResponse,
  RetrainingJobRecord,
  ServingModelSummary,
  DatasetProfileResponse,
} from "@/types/api";

interface MonitoringTabProps {
  onNavigateTab: (tab: any) => void;
  datasets?: DatasetProfileResponse[];
}

type MonitoringSubView =
  | "overview"
  | "drift"
  | "profiles"
  | "performance"
  | "alerts"
  | "retraining";

export default function MonitoringTab({ onNavigateTab, datasets: propDatasets = [] }: MonitoringTabProps) {
  const [subView, setSubView] = useState<MonitoringSubView>("overview");
  const [adminApiKey, setAdminApiKey] = useState<string>("autonexa-admin-key-secret");

  // Overview data
  const [overview, setOverview] = useState<MonitoringOverviewResponse | null>(null);
  const [telemetryEvents, setTelemetryEvents] = useState<any[]>([]);
  const [servingModels, setServingModels] = useState<ServingModelSummary[]>([]);
  const [datasets, setDatasets] = useState<DatasetProfileResponse[]>([]);

  // Sub-view data
  const [referenceProfiles, setReferenceProfiles] = useState<ReferenceProfileResponse[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ReferenceProfileResponse | null>(null);
  const [driftReports, setDriftReports] = useState<DriftAnalysisResponse[]>([]);
  const [selectedDriftReport, setSelectedDriftReport] = useState<DriftAnalysisResponse | null>(null);
  const [windows, setWindows] = useState<MonitoringWindowResponse[]>([]);
  const [alerts, setAlerts] = useState<MonitoringAlertRecord[]>([]);
  const [performanceReports, setPerformanceReports] = useState<PerformanceMetricReport[]>([]);
  const [retrainingJobs, setRetrainingJobs] = useState<RetrainingJobRecord[]>([]);

  // Loading & Action states
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Modal / Form states
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [newProfileModel, setNewProfileModel] = useState<string>("");
  const [newProfileDataset, setNewProfileDataset] = useState<string>("");
  const [newProfileSplit, setNewProfileSplit] = useState<string>("training");

  const [showRetrainModal, setShowRetrainModal] = useState<boolean>(false);
  const [retrainModel, setRetrainModel] = useState<string>("");
  const [retrainDataset, setRetrainDataset] = useState<string>("");
  const [retrainPolicy, setRetrainPolicy] = useState<"manual" | "sustained_drift" | "performance_degradation">("manual");

  // Initial load
  const loadAllMonitoringData = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const [
        overviewRes,
        telemetryRes,
        modelsRes,
        profilesRes,
        driftRes,
        alertsRes,
        perfRes,
        jobsRes,
      ] = await Promise.allSettled([
        api.getMonitoringOverview(adminApiKey),
        api.getMonitoringTelemetry(50, adminApiKey),
        api.listServingModels(adminApiKey),
        api.listReferenceProfiles(undefined, adminApiKey),
        api.listDriftReports(undefined, adminApiKey),
        api.listMonitoringAlerts(undefined, undefined, adminApiKey),
        api.listPerformanceReports(undefined, adminApiKey),
        api.listRetrainingJobs(undefined, adminApiKey),
      ]);

      if (overviewRes.status === "fulfilled") setOverview(overviewRes.value);
      if (telemetryRes.status === "fulfilled") setTelemetryEvents(telemetryRes.value);
      if (modelsRes.status === "fulfilled") setServingModels(modelsRes.value);
      setDatasets(propDatasets);
      if (profilesRes.status === "fulfilled") {
        setReferenceProfiles(profilesRes.value);
        if (profilesRes.value.length > 0 && !selectedProfile) {
          setSelectedProfile(profilesRes.value[0]);
        }
      }
      if (driftRes.status === "fulfilled") {
        setDriftReports(driftRes.value);
        if (driftRes.value.length > 0 && !selectedDriftReport) {
          setSelectedDriftReport(driftRes.value[0]);
        }
      }
      if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value);
      if (perfRes.status === "fulfilled") setPerformanceReports(perfRes.value);
      if (jobsRes.status === "fulfilled") setRetrainingJobs(jobsRes.value);
    } catch (err: any) {
      console.warn("Failed to load monitoring data:", err);
      setStatusMessage({ type: "error", text: "Failed to connect to monitoring service. Verify API keys." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllMonitoringData();
  }, []);

  // Action: Create Reference Profile
  const handleCreateProfile = async () => {
    if (!newProfileModel || !newProfileDataset) {
      setStatusMessage({ type: "error", text: "Please select both a model family and a dataset." });
      return;
    }
    setActionLoading(true);
    setStatusMessage(null);
    try {
      const created = await api.createReferenceProfile(
        {
          model_name: newProfileModel,
          dataset_id: newProfileDataset,
          split_source: newProfileSplit,
        },
        adminApiKey
      );
      setStatusMessage({
        type: "success",
        text: `Reference profile established: ${created.profile_id} (${created.sample_count} samples)`,
      });
      setShowProfileModal(false);
      await loadAllMonitoringData();
      setSelectedProfile(created);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err?.detail || err?.message || "Failed to create reference profile." });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Trigger Retraining
  const handleTriggerRetrain = async () => {
    if (!retrainModel || !retrainDataset) {
      setStatusMessage({ type: "error", text: "Please select both a model and an updated dataset." });
      return;
    }
    setActionLoading(true);
    setStatusMessage(null);
    try {
      const job = await api.triggerRetraining(
        {
          model_name: retrainModel,
          dataset_id: retrainDataset,
          trigger_policy: retrainPolicy,
        },
        adminApiKey
      );
      setStatusMessage({
        type: "success",
        text: `Retraining job triggered: ${job.job_id} (Status: ${job.status}). Validation gate evaluated.`,
      });
      setShowRetrainModal(false);
      await loadAllMonitoringData();
      setSubView("retraining");
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err?.detail || err?.message || "Failed to trigger retraining." });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Acknowledge Alert
  const handleAcknowledgeAlert = async (alertId: string) => {
    setActionLoading(true);
    try {
      await api.acknowledgeMonitoringAlert(alertId, { acknowledged_by: "admin", note: "Acknowledged via dashboard" }, adminApiKey);
      setStatusMessage({ type: "success", text: `Alert ${alertId} acknowledged.` });
      await loadAllMonitoringData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err?.detail || "Failed to acknowledge alert." });
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Promote Candidate
  const handlePromoteCandidate = async (jobId: string) => {
    if (!confirm("Are you sure you want to promote this retrained candidate model to PRODUCTION?")) {
      return;
    }
    setActionLoading(true);
    try {
      const updated = await api.promoteRetrainedCandidate(jobId, { target_stage: "production", operator: "admin" }, adminApiKey);
      setStatusMessage({
        type: "success",
        text: `Candidate promoted to production: ${updated.model_name} v${updated.candidate_version}`,
      });
      await loadAllMonitoringData();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err?.detail || "Promotion failed." });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#CBD5E1]/60">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#1D4ED8]/10 text-[#1D4ED8] rounded-xl border border-[#1D4ED8]/20">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
                Production Model Monitoring & Retraining
                <span className="text-[10px] font-mono uppercase bg-[#1D4ED8]/10 text-[#1D4ED8] px-2 py-0.5 rounded-full font-semibold">
                  Phase 14
                </span>
              </h1>
              <p className="text-xs text-[#64748B]">
                Drift detection, delayed ground-truth performance evaluation, operational alerts, and controlled automated retraining
              </p>
            </div>
          </div>
        </div>

        {/* API Key controls and refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1 shadow-xs text-xs">
            <Lock className="w-3.5 h-3.5 text-[#64748B]" />
            <span className="text-[#64748B] font-mono text-[11px]">Key:</span>
            <input
              type="password"
              value={adminApiKey}
              onChange={(e) => setAdminApiKey(e.target.value)}
              placeholder="Admin API Key"
              className="text-xs font-mono bg-transparent outline-none w-28 text-[#0F172A]"
              title="Admin API Key for privileged actions"
            />
          </div>

          <button
            onClick={loadAllMonitoringData}
            disabled={loading || actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#CBD5E1] text-[#0F172A] rounded-lg text-xs font-medium hover:bg-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#1D4ED8]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between transition-all ${
            statusMessage.type === "success"
              ? "bg-[#10B981]/10 border-[#10B981]/30 text-[#065F46]"
              : statusMessage.type === "error"
              ? "bg-[#EF4444]/10 border-[#EF4444]/30 text-[#991B1B]"
              : "bg-[#1D4ED8]/10 border-[#1D4ED8]/30 text-[#1E40AF]"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : statusMessage.type === "error" ? (
              <XCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Info className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-xs font-semibold underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Sub-view Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#CBD5E1]/60 overflow-x-auto pb-2">
        {[
          { id: "overview", label: "Operational Telemetry", icon: Activity },
          { id: "drift", label: "Distribution Drift", icon: TrendingUp },
          { id: "profiles", label: "Reference Profiles", icon: Database },
          { id: "performance", label: "Ground-Truth Performance", icon: BarChart2 },
          { id: "alerts", label: `Alerts (${alerts.filter((a) => a.status === "active").length})`, icon: ShieldAlert },
          { id: "retraining", label: "Automated Retraining", icon: RotateCcw },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = subView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubView(tab.id as MonitoringSubView)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? "bg-[#1D4ED8] text-white shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A] hover:bg-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =========================================================================
          SUB-VIEW 1: OVERVIEW & TELEMETRY
          ========================================================================= */}
      {subView === "overview" && (
        <div className="space-y-6">
          {/* Top KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-[#CBD5E1]/70 shadow-xs">
              <div className="flex items-center justify-between text-[#64748B] text-xs font-mono mb-2">
                <span>TELEMETRY EVENTS</span>
                <Activity className="w-4 h-4 text-[#1D4ED8]" />
              </div>
              <div className="text-2xl font-bold text-[#0F172A] font-mono">
                {overview?.total_telemetry_events ?? telemetryEvents.length}
              </div>
              <p className="text-[11px] text-[#64748B] mt-1">Logged production inference calls</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-[#CBD5E1]/70 shadow-xs">
              <div className="flex items-center justify-between text-[#64748B] text-xs font-mono mb-2">
                <span>MONITORED MODELS</span>
                <Layers className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div className="text-2xl font-bold text-[#0F172A] font-mono">
                {overview?.models_monitored_count ?? referenceProfiles.length}
              </div>
              <p className="text-[11px] text-[#64748B] mt-1">With active baseline reference profiles</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-[#CBD5E1]/70 shadow-xs">
              <div className="flex items-center justify-between text-[#64748B] text-xs font-mono mb-2">
                <span>ACTIVE ALERTS</span>
                <ShieldAlert className="w-4 h-4 text-[#F59E0B]" />
              </div>
              <div className="text-2xl font-bold text-[#F59E0B] font-mono">
                {overview?.active_alerts_count ?? alerts.filter((a) => a.status === "active").length}
              </div>
              <p className="text-[11px] text-[#64748B] mt-1">Unacknowledged drift or quality issues</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-[#CBD5E1]/70 shadow-xs">
              <div className="flex items-center justify-between text-[#64748B] text-xs font-mono mb-2">
                <span>DRIFTED FAMILIES</span>
                <TrendingDown className="w-4 h-4 text-[#EF4444]" />
              </div>
              <div className="text-2xl font-bold text-[#EF4444] font-mono">
                {overview?.drift_detected_models_count ?? 0}
              </div>
              <p className="text-[11px] text-[#64748B] mt-1">Models with critical drift flagged</p>
            </div>
          </div>

          {/* Telemetry stream */}
          <div className="bg-white rounded-xl border border-[#CBD5E1]/70 shadow-xs p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">Runtime Serving Telemetry</h3>
                <p className="text-xs text-[#64748B]">
                  Privacy-preserving bounded event logging (Zero customer raw features or credentials stored)
                </p>
              </div>
              <span className="text-[11px] font-mono bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-1 rounded text-[#64748B]">
                Rolling Window: 2,000 max
              </span>
            </div>

            {telemetryEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B] bg-[#F8FAFC] rounded-lg border border-dashed border-[#CBD5E1]">
                No inference telemetry events logged yet. Inferences executed via Model Serving will stream here automatically.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#64748B] font-mono text-[11px] uppercase">
                      <th className="py-2 px-3">Timestamp</th>
                      <th className="py-2 px-3">Model</th>
                      <th className="py-2 px-3">Version</th>
                      <th className="py-2 px-3">Stage</th>
                      <th className="py-2 px-3">Batch Size</th>
                      <th className="py-2 px-3">Latency</th>
                      <th className="py-2 px-3">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {telemetryEvents.slice(0, 15).map((evt: any, idx) => (
                      <tr key={evt.event_id || idx} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-2 px-3 text-[#64748B] font-mono text-[11px]">
                          {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : "—"}
                        </td>
                        <td className="py-2 px-3 font-semibold text-[#0F172A]">{evt.model_name}</td>
                        <td className="py-2 px-3 font-mono text-[#64748B]">v{evt.version}</td>
                        <td className="py-2 px-3">
                          <span className="text-[10px] font-mono uppercase bg-[#1D4ED8]/10 text-[#1D4ED8] px-2 py-0.5 rounded">
                            {evt.stage}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono">{evt.record_count}</td>
                        <td className="py-2 px-3 font-mono">{evt.latency_ms} ms</td>
                        <td className="py-2 px-3">
                          <span
                            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                              evt.outcome === "success"
                                ? "bg-[#10B981]/10 text-[#065F46]"
                                : "bg-[#EF4444]/10 text-[#991B1B]"
                            }`}
                          >
                            {evt.outcome}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          SUB-VIEW 2: DISTRIBUTION DRIFT
          ========================================================================= */}
      {subView === "drift" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-[#CBD5E1]/70">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">Distribution Drift Reports</h3>
              <p className="text-xs text-[#64748B]">
                Population Stability Index (PSI), Kolmogorov-Smirnov test, and categorical shift detection
              </p>
            </div>
            {referenceProfiles.length === 0 ? (
              <button
                onClick={() => setSubView("profiles")}
                className="px-3 py-1.5 bg-[#1D4ED8] text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-[#1E40AF]"
              >
                Create Baseline Profile First
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={selectedDriftReport?.report_id || ""}
                  onChange={(e) => {
                    const r = driftReports.find((x) => x.report_id === e.target.value);
                    if (r) setSelectedDriftReport(r);
                  }}
                  className="bg-[#F8FAFC] border border-[#CBD5E1] text-xs rounded-lg px-2.5 py-1.5 text-[#0F172A]"
                >
                  {driftReports.map((r) => (
                    <option key={r.report_id} value={r.report_id}>
                      {r.model_name} v{r.version} — {new Date(r.timestamp).toLocaleTimeString()} ({r.overall_status})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {selectedDriftReport ? (
            <div className="space-y-4">
              {/* Report Summary Card */}
              <div className="bg-white p-5 rounded-xl border border-[#CBD5E1]/70 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-[#0F172A]">
                        {selectedDriftReport.model_name} (v{selectedDriftReport.version})
                      </h4>
                      <span
                        className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full font-bold ${
                          selectedDriftReport.overall_status === "no_drift"
                            ? "bg-[#10B981]/10 text-[#065F46] border border-[#10B981]/30"
                            : selectedDriftReport.overall_status === "warning"
                            ? "bg-[#F59E0B]/10 text-[#B45309] border border-[#F59E0B]/30"
                            : selectedDriftReport.overall_status === "drift_detected"
                            ? "bg-[#EF4444]/10 text-[#991B1B] border border-[#EF4444]/30"
                            : "bg-[#64748B]/10 text-[#475569] border border-[#64748B]/30"
                        }`}
                      >
                        {selectedDriftReport.overall_status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Evaluated against reference: <span className="font-mono">{selectedDriftReport.reference_profile_id}</span>
                    </p>
                  </div>
                  <div className="text-right text-xs font-mono text-[#64748B]">
                    <div>Sample Count: <span className="font-bold text-[#0F172A]">{selectedDriftReport.sample_count}</span></div>
                    <div>Drift Share: <span className="font-bold text-[#0F172A]">{Math.round(selectedDriftReport.drift_share * 100)}%</span></div>
                  </div>
                </div>

                {/* Warnings if any */}
                {selectedDriftReport.data_quality_warnings.length > 0 && (
                  <div className="mt-3 p-3 bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-lg text-xs text-[#B45309] space-y-1">
                    {selectedDriftReport.data_quality_warnings.map((w, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Multivariate Check */}
                {selectedDriftReport.multivariate_result && (
                  <div className="mt-4 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-[#1D4ED8]" />
                        Multivariate Joint Correlation Drift (Frobenius Shift)
                      </span>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded ${
                          selectedDriftReport.multivariate_result.drift_detected
                            ? "bg-[#EF4444]/10 text-[#991B1B]"
                            : "bg-[#10B981]/10 text-[#065F46]"
                        }`}
                      >
                        Shift: {selectedDriftReport.multivariate_result.statistic} (Threshold: {selectedDriftReport.multivariate_result.threshold})
                      </span>
                    </div>
                    <p className="text-[#64748B]">{selectedDriftReport.multivariate_result.explanation}</p>
                  </div>
                )}
              </div>

              {/* Per-Feature Drift Table */}
              <div className="bg-white rounded-xl border border-[#CBD5E1]/70 shadow-xs overflow-hidden">
                <div className="px-5 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] text-xs font-bold text-[#0F172A]">
                  Per-Feature Statistical Evaluation ({selectedDriftReport.feature_results.length} Features)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[#64748B] font-mono text-[11px] uppercase bg-[#FAFAFA]">
                        <th className="py-2.5 px-3">Feature</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Method</th>
                        <th className="py-2.5 px-3">Computed Statistic</th>
                        <th className="py-2.5 px-3">Threshold</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Missing Rate Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {selectedDriftReport.feature_results.map((feat) => (
                        <tr key={feat.feature_name} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-[#0F172A]">{feat.feature_name}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-[10px] text-[#64748B] uppercase">{feat.feature_type}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B]">{feat.drift_method}</td>
                          <td className="py-2.5 px-3 font-mono">
                            <span className="font-bold">{feat.statistic}</span>
                            {feat.p_value !== null && feat.p_value !== undefined && (
                              <span className="text-[#64748B] text-[10px] ml-1">(p={feat.p_value})</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[#64748B]">{feat.threshold}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                                feat.drift_status === "no_drift"
                                  ? "bg-[#10B981]/10 text-[#065F46]"
                                  : feat.drift_status === "warning"
                                  ? "bg-[#F59E0B]/10 text-[#B45309]"
                                  : feat.drift_status === "drift_detected"
                                  ? "bg-[#EF4444]/10 text-[#991B1B]"
                                  : "bg-[#64748B]/10 text-[#475569]"
                              }`}
                            >
                              {feat.drift_status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            {feat.missing_rate_delta > 0 ? `+${Math.round(feat.missing_rate_delta * 100)}%` : `${Math.round(feat.missing_rate_delta * 100)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#64748B] bg-white rounded-xl border border-[#CBD5E1]/70">
              No drift reports generated yet. Establish a reference profile and run inference to generate drift reports.
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          SUB-VIEW 3: REFERENCE PROFILES
          ========================================================================= */}
      {subView === "profiles" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-[#CBD5E1]/70">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">Baseline Reference Profiles</h3>
              <p className="text-xs text-[#64748B]">
                Explicit training or validation dataset distributions used as ground truth for drift testing
              </p>
            </div>
            <button
              onClick={() => setShowProfileModal(true)}
              className="px-3.5 py-1.5 bg-[#1D4ED8] text-white rounded-lg text-xs font-medium hover:bg-[#1E40AF] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Create Reference Profile</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Profile List */}
            <div className="space-y-3 md:col-span-1">
              <h4 className="text-xs font-mono uppercase text-[#64748B]">Registered Profiles ({referenceProfiles.length})</h4>
              {referenceProfiles.length === 0 ? (
                <div className="p-6 bg-white rounded-xl border border-[#CBD5E1]/70 text-center text-xs text-[#64748B]">
                  No reference profiles established yet.
                </div>
              ) : (
                referenceProfiles.map((prof) => (
                  <div
                    key={prof.profile_id}
                    onClick={() => setSelectedProfile(prof)}
                    className={`p-4 rounded-xl border text-xs cursor-pointer transition-all ${
                      selectedProfile?.profile_id === prof.profile_id
                        ? "bg-[#1D4ED8]/5 border-[#1D4ED8] shadow-xs"
                        : "bg-white border-[#CBD5E1]/70 hover:border-[#1D4ED8]/50"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-[#0F172A]">
                      <span>{prof.model_name} (v{prof.version})</span>
                      <span className="text-[10px] font-mono bg-[#1D4ED8]/10 text-[#1D4ED8] px-2 py-0.5 rounded">
                        {prof.split_source}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#64748B] mt-1 font-mono">
                      {prof.sample_count} rows &bull; {prof.feature_names.length} features
                    </div>
                    <div className="text-[10px] text-[#94A3B8] font-mono mt-2 truncate">
                      ID: {prof.profile_id}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Profile Detail */}
            <div className="md:col-span-2">
              {selectedProfile ? (
                <div className="bg-white p-5 rounded-xl border border-[#CBD5E1]/70 shadow-xs space-y-4">
                  <div className="pb-3 border-b border-[#E2E8F0]">
                    <h4 className="text-sm font-bold text-[#0F172A]">
                      Profile Details: {selectedProfile.profile_id}
                    </h4>
                    <p className="text-xs text-[#64748B]">
                      Dataset: <span className="font-mono">{selectedProfile.dataset_id}</span> &bull; Fingerprint:{" "}
                      <span className="font-mono">{selectedProfile.dataset_fingerprint?.slice(0, 16)}...</span>
                    </p>
                  </div>

                  {/* Numerical features stats */}
                  <div>
                    <h5 className="text-xs font-bold text-[#0F172A] mb-2 uppercase font-mono">
                      Numerical Features ({Object.keys(selectedProfile.numerical_features).length})
                    </h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-sans">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] text-[#64748B] font-mono text-[10px] uppercase">
                            <th className="py-2 px-2">Feature</th>
                            <th className="py-2 px-2">Mean</th>
                            <th className="py-2 px-2">Std</th>
                            <th className="py-2 px-2">Min</th>
                            <th className="py-2 px-2">Median</th>
                            <th className="py-2 px-2">Max</th>
                            <th className="py-2 px-2">Missing %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F1F5F9] font-mono text-[11px]">
                          {Object.values(selectedProfile.numerical_features).map((num) => (
                            <tr key={num.feature_name}>
                              <td className="py-2 px-2 font-bold text-[#0F172A]">{num.feature_name}</td>
                              <td className="py-2 px-2">{num.mean}</td>
                              <td className="py-2 px-2">{num.std}</td>
                              <td className="py-2 px-2">{num.min}</td>
                              <td className="py-2 px-2">{num.p50}</td>
                              <td className="py-2 px-2">{num.max}</td>
                              <td className="py-2 px-2">{Math.round(num.missing_rate * 100)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Categorical features stats */}
                  {Object.keys(selectedProfile.categorical_features).length > 0 && (
                    <div className="pt-3 border-t border-[#E2E8F0]">
                      <h5 className="text-xs font-bold text-[#0F172A] mb-2 uppercase font-mono">
                        Categorical Features ({Object.keys(selectedProfile.categorical_features).length})
                      </h5>
                      <div className="space-y-2">
                        {Object.values(selectedProfile.categorical_features).map((cat) => (
                          <div key={cat.feature_name} className="p-3 bg-[#F8FAFC] rounded-lg text-xs">
                            <div className="flex items-center justify-between font-bold text-[#0F172A] mb-1">
                              <span>{cat.feature_name}</span>
                              <span className="font-mono text-[11px] text-[#64748B]">
                                {cat.distinct_categories} categories &bull; {Math.round(cat.missing_rate * 100)}% missing
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(cat.category_frequencies).slice(0, 8).map(([cName, freq]) => (
                                <span
                                  key={cName}
                                  className="text-[10px] font-mono bg-white border border-[#CBD5E1] px-2 py-0.5 rounded text-[#475569]"
                                >
                                  {cName}: {Math.round(freq * 100)}%
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-[#64748B] bg-white rounded-xl border border-[#CBD5E1]/70">
                  Select a reference profile to view distribution parameters.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SUB-VIEW 4: GROUND-TRUTH PERFORMANCE
          ========================================================================= */}
      {subView === "performance" && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-[#CBD5E1]/70">
            <h3 className="text-sm font-bold text-[#0F172A]">Ground-Truth Performance Monitoring</h3>
            <p className="text-xs text-[#64748B]">
              Delayed empirical performance evaluation when ground-truth actuals become available. Detects real model degradation.
            </p>
          </div>

          {performanceReports.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#64748B] bg-white rounded-xl border border-[#CBD5E1]/70 space-y-2">
              <BarChart2 className="w-8 h-8 text-[#94A3B8] mx-auto" />
              <p className="font-semibold text-[#0F172A]">No Ground-Truth Evaluations Recorded Yet</p>
              <p className="max-w-md mx-auto text-[#64748B]">
                Ingest actual outcome labels via API endpoint <span className="font-mono text-[#1D4ED8]">POST /api/v1/monitoring/ground-truth</span> to compute empirical accuracy, ROC-AUC, or MAE and test against baseline.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {performanceReports.map((report) => (
                <div key={report.report_id} className="bg-white p-5 rounded-xl border border-[#CBD5E1]/70 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#0F172A]">{report.model_name} (v{report.version})</span>
                        <span className="text-[10px] font-mono uppercase bg-[#1D4ED8]/10 text-[#1D4ED8] px-2 py-0.5 rounded">
                          {report.task_type}
                        </span>
                        {report.degradation_detected ? (
                          <span className="text-[10px] font-mono uppercase bg-[#EF4444]/10 text-[#991B1B] border border-[#EF4444]/30 px-2 py-0.5 rounded font-bold">
                            Degradation Confirmed ({report.degradation_percentage}%)
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono uppercase bg-[#10B981]/10 text-[#065F46] border border-[#10B981]/30 px-2 py-0.5 rounded font-bold">
                            Performance Stable
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        Evaluated {report.sample_size} records on {new Date(report.evaluated_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="text-right text-xs font-mono">
                      <div>Baseline {report.baseline_metric_name}: <span className="font-bold">{report.baseline_metric_score}</span></div>
                      <div>Production {report.baseline_metric_name}: <span className="font-bold text-[#1D4ED8]">{report.current_metric_score}</span></div>
                    </div>
                  </div>

                  {/* Metric Chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(report.metrics).map(([mKey, mVal]) => {
                      if (typeof mVal !== "number") return null;
                      return (
                        <div key={mKey} className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
                          <div className="text-[10px] font-mono text-[#64748B] uppercase">{mKey.replace("_", " ")}</div>
                          <div className="text-base font-bold text-[#0F172A] font-mono">{mVal}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          SUB-VIEW 5: ALERTS
          ========================================================================= */}
      {subView === "alerts" && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-[#CBD5E1]/70 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">Operational Monitoring Alerts</h3>
              <p className="text-xs text-[#64748B]">
                Deduplicated alerts for critical feature drift, confirmed degradation, and data quality degradation
              </p>
            </div>
            <span className="text-xs font-mono text-[#64748B]">
              Active: <span className="font-bold text-[#F59E0B]">{alerts.filter((a) => a.status === "active").length}</span>
            </span>
          </div>

          {alerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B] bg-white rounded-xl border border-[#CBD5E1]/70">
              <CheckCircle2 className="w-8 h-8 text-[#10B981] mx-auto mb-2" />
              All systems healthy. No operational alerts currently raised.
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alt) => (
                <div
                  key={alt.alert_id}
                  className={`p-4 rounded-xl border text-xs shadow-xs transition-all ${
                    alt.severity === "critical"
                      ? "bg-[#FEF2F2] border-[#EF4444]/40"
                      : alt.severity === "warning"
                      ? "bg-[#FFFBEB] border-[#F59E0B]/40"
                      : "bg-[#F8FAFC] border-[#CBD5E1]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                            alt.severity === "critical"
                              ? "bg-[#EF4444] text-white"
                              : "bg-[#F59E0B] text-white"
                          }`}
                        >
                          {alt.severity}
                        </span>
                        <span className="font-bold text-[#0F172A]">{alt.model_name} (v{alt.version})</span>
                        <span className="text-[11px] font-mono text-[#64748B]">{alt.alert_type}</span>
                      </div>
                      <p className="text-xs text-[#0F172A] font-medium">{alt.message}</p>
                      <p className="text-[10px] text-[#64748B] font-mono">
                        Raised at: {new Date(alt.created_at).toLocaleString()} &bull; ID: {alt.alert_id}
                      </p>
                    </div>

                    <div>
                      {alt.status === "active" ? (
                        <button
                          onClick={() => handleAcknowledgeAlert(alt.alert_id)}
                          disabled={actionLoading}
                          className="px-3 py-1 bg-white border border-[#CBD5E1] text-[#0F172A] rounded-lg text-xs font-semibold hover:bg-[#F1F5F9] transition-colors cursor-pointer"
                        >
                          Acknowledge
                        </button>
                      ) : (
                        <span className="text-[11px] font-mono text-[#10B981] font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged ({alt.acknowledged_by})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          SUB-VIEW 6: AUTOMATED RETRAINING
          ========================================================================= */}
      {subView === "retraining" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-[#CBD5E1]/70">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">Controlled Automated Retraining</h3>
              <p className="text-xs text-[#64748B]">
                Trigger-governed retraining with mandatory candidate validation gates against active production
              </p>
            </div>
            <button
              onClick={() => setShowRetrainModal(true)}
              className="px-3.5 py-1.5 bg-[#1D4ED8] text-white rounded-lg text-xs font-medium hover:bg-[#1E40AF] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Trigger Retraining Job</span>
            </button>
          </div>

          {retrainingJobs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B] bg-white rounded-xl border border-[#CBD5E1]/70">
              No retraining jobs recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {retrainingJobs.map((job) => (
                <div key={job.job_id} className="bg-white p-5 rounded-xl border border-[#CBD5E1]/70 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#0F172A]">{job.model_name} (Source: v{job.source_version})</span>
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                            job.status === "completed"
                              ? "bg-[#10B981]/10 text-[#065F46]"
                              : job.status === "failed"
                              ? "bg-[#EF4444]/10 text-[#991B1B]"
                              : "bg-[#1D4ED8]/10 text-[#1D4ED8]"
                          }`}
                        >
                          {job.status}
                        </span>
                        <span className="text-[10px] font-mono bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 rounded text-[#64748B]">
                          Policy: {job.trigger_policy}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B] mt-0.5">{job.trigger_reason}</p>
                    </div>

                    <div className="text-right text-xs font-mono text-[#64748B]">
                      <div>Dataset: <span className="text-[#0F172A] font-bold">{job.dataset_id}</span></div>
                      <div>Job ID: {job.job_id}</div>
                    </div>
                  </div>

                  {/* Candidate Validation Gate Card */}
                  {job.candidate_validation && (
                    <div
                      className={`p-3.5 rounded-lg border text-xs ${
                        job.candidate_validation.passed
                          ? "bg-[#10B981]/5 border-[#10B981]/30 text-[#065F46]"
                          : "bg-[#EF4444]/5 border-[#EF4444]/30 text-[#991B1B]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5 font-bold">
                        <span className="flex items-center gap-1.5">
                          {job.candidate_validation.passed ? (
                            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                          ) : (
                            <ShieldAlert className="w-4 h-4 text-[#EF4444]" />
                          )}
                          Candidate Validation Gate: {job.candidate_validation.status.toUpperCase()}
                        </span>
                        <span className="font-mono">
                          Candidate Score: {job.candidate_validation.candidate_score} vs Baseline: {job.candidate_validation.baseline_score}
                        </span>
                      </div>
                      <div className="space-y-0.5 text-[11px]">
                        {job.candidate_validation.reasons.map((r, idx) => (
                          <div key={idx}>&bull; {r}</div>
                        ))}
                      </div>

                      {/* Promotion Controls */}
                      {job.candidate_validation.passed && (
                        <div className="mt-3 pt-2.5 border-t border-[#10B981]/20 flex items-center justify-between">
                          <span className="text-[11px] font-mono text-[#065F46]">
                            {job.promoted_to_stage
                              ? `Promoted to ${job.promoted_to_stage.toUpperCase()} on ${new Date(job.promotion_timestamp || "").toLocaleDateString()}`
                              : `Eligible for production promotion (Candidate registered as v${job.candidate_version})`}
                          </span>

                          {!job.promoted_to_stage && (
                            <button
                              onClick={() => handlePromoteCandidate(job.job_id)}
                              disabled={actionLoading}
                              className="px-3 py-1 bg-[#10B981] text-white rounded text-xs font-semibold hover:bg-[#059669] transition-colors cursor-pointer"
                            >
                              Promote to Production
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {job.error_message && (
                    <div className="p-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded text-xs text-[#991B1B]">
                      Error: {job.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAL: CREATE REFERENCE PROFILE
          ========================================================================= */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#CBD5E1] space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">Establish Baseline Reference Profile</h3>
            <p className="text-xs text-[#64748B]">
              Extract distribution parameters from training or validation data. Holdout test sets are never utilized.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Target Model Family</label>
                <select
                  value={newProfileModel}
                  onChange={(e) => setNewProfileModel(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs rounded-lg p-2 text-[#0F172A]"
                >
                  <option value="">-- Select Registered Model --</option>
                  {servingModels.map((m) => (
                    <option key={m.model_name} value={m.model_name}>
                      {m.model_name} ({m.task_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Source Dataset</label>
                <select
                  value={newProfileDataset}
                  onChange={(e) => setNewProfileDataset(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs rounded-lg p-2 text-[#0F172A]"
                >
                  <option value="">-- Select Uploaded Dataset --</option>
                  {datasets.map((d) => (
                    <option key={d.dataset_id} value={d.dataset_id}>
                      {d.filename} ({d.rows} rows, {d.columns} cols)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Partition Split Source</label>
                <select
                  value={newProfileSplit}
                  onChange={(e) => setNewProfileSplit(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs rounded-lg p-2 text-[#0F172A]"
                >
                  <option value="training">Training Partition (Standard)</option>
                  <option value="validation">Validation Partition</option>
                  <option value="baseline">Approved Historical Baseline</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProfile}
                disabled={actionLoading}
                className="px-4 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "Profiling..." : "Create Profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: TRIGGER RETRAINING
          ========================================================================= */}
      {showRetrainModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#CBD5E1] space-y-4">
            <h3 className="text-base font-bold text-[#0F172A]">Initiate Controlled Model Retraining</h3>
            <p className="text-xs text-[#64748B]">
              Retrains candidate models using the full AutoML pipeline and validates candidates against production baseline.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Model Family</label>
                <select
                  value={retrainModel}
                  onChange={(e) => setRetrainModel(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs rounded-lg p-2 text-[#0F172A]"
                >
                  <option value="">-- Select Model to Retrain --</option>
                  {servingModels.map((m) => (
                    <option key={m.model_name} value={m.model_name}>
                      {m.model_name} ({m.task_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">New Ingested Dataset</label>
                <select
                  value={retrainDataset}
                  onChange={(e) => setRetrainDataset(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs rounded-lg p-2 text-[#0F172A]"
                >
                  <option value="">-- Select Updated Training Dataset --</option>
                  {datasets.map((d) => (
                    <option key={d.dataset_id} value={d.dataset_id}>
                      {d.filename} ({d.rows} rows, {d.columns} cols)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Trigger Policy</label>
                <select
                  value={retrainPolicy}
                  onChange={(e: any) => setRetrainPolicy(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs rounded-lg p-2 text-[#0F172A]"
                >
                  <option value="manual">Manual Authorized Trigger</option>
                  <option value="sustained_drift">Sustained Drift Policy</option>
                  <option value="performance_degradation">Performance Degradation Policy</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                onClick={() => setShowRetrainModal(false)}
                className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerRetrain}
                disabled={actionLoading}
                className="px-4 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-medium hover:bg-[#1E40AF] cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "Executing Retraining..." : "Launch Retraining"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
