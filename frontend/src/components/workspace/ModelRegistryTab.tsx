"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Layers,
  ShieldCheck,
  Download,
  CheckCircle2,
  ExternalLink,
  Cpu,
  ArrowRight,
  Sparkles,
  Zap,
  Server,
  Play,
  RotateCcw,
  Plus,
  RefreshCw,
  GitCompare,
  AlertTriangle,
  History,
  Tag,
  Check,
  X,
  FileText,
  Sliders,
} from "lucide-react";
import {
  ArtifactVerificationResponse,
  LifecycleStage,
  ModelRegistrationRequest,
  ModelRegistryListResponse,
  ModelVersionRecord,
  RegisteredModelSummary,
  TrainingResponse,
} from "@/types/api";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { WorkspaceTab } from "@/lib/store";

interface ModelRegistryTabProps {
  experiments: TrainingResponse[];
  activeExperiment: TrainingResponse | null;
  onNavigateTab: (tab: WorkspaceTab) => void;
}

export default function ModelRegistryTab({
  experiments,
  activeExperiment,
  onNavigateTab,
}: ModelRegistryTabProps) {
  // Registry state
  const [modelSummaries, setModelSummaries] = useState<RegisteredModelSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModelName, setSelectedModelName] = useState<string | null>(null);
  const [versions, setVersions] = useState<ModelVersionRecord[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Verification state: versionTag -> ArtifactVerificationResponse
  const [verifications, setVerifications] = useState<Record<string, ArtifactVerificationResponse>>({});
  const [verifyingVersion, setVerifyingVersion] = useState<number | null>(null);

  // Stage transition modal
  const [stageModalTarget, setStageModalTarget] = useState<ModelVersionRecord | null>(null);
  const [targetStage, setTargetStage] = useState<LifecycleStage>("production");
  const [transitionReason, setTransitionReason] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  // Registration modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedExpIdForReg, setSelectedExpIdForReg] = useState(activeExperiment?.experiment_id || "");
  const [newModelName, setNewModelName] = useState("");
  const [newModelDesc, setNewModelDesc] = useState("");
  const [newModelTags, setNewModelTags] = useState("");
  const [newModelInitialStage, setNewModelInitialStage] = useState<LifecycleStage>("development");
  const [registering, setRegistering] = useState(false);

  // Version comparison
  const [compareData, setCompareData] = useState<Record<string, any> | null>(null);
  const [comparing, setComparing] = useState(false);

  // Notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch registered models from backend
  const fetchRegisteredModels = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.listRegisteredModels();
      setModelSummaries(res.models);
      if (res.models.length > 0 && !selectedModelName) {
        setSelectedModelName(res.models[0].model_name);
      }
    } catch (err: any) {
      console.warn("Failed to load registered models:", err);
      setErrorMsg("Failed to load models from registry: " + (err.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, [selectedModelName]);

  useEffect(() => {
    fetchRegisteredModels();
  }, [fetchRegisteredModels]);

  // Fetch versions when selectedModelName changes
  useEffect(() => {
    if (!selectedModelName) {
      setVersions([]);
      return;
    }

    let isMounted = true;
    setLoadingVersions(true);
    setCompareData(null);

    api
      .getModelVersions(selectedModelName)
      .then((records) => {
        if (isMounted) setVersions(records);
      })
      .catch((err) => {
        if (isMounted) {
          console.warn(`Failed to fetch versions for ${selectedModelName}:`, err);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingVersions(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedModelName]);

  // Handle Model Registration
  const handleRegisterModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpIdForReg || !newModelName.trim()) {
      setErrorMsg("Please select an experiment and provide a model name.");
      return;
    }

    setRegistering(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const tagsList = newModelTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const record = await api.registerModel({
        experiment_id: selectedExpIdForReg,
        model_name: newModelName.trim(),
        description: newModelDesc.trim() || undefined,
        tags: tagsList,
        initial_stage: newModelInitialStage,
      });

      setSuccessMsg(`Successfully registered '${record.model_name}' version ${record.version_tag}!`);
      setShowRegisterModal(false);
      setSelectedModelName(record.model_name);
      setNewModelName("");
      setNewModelDesc("");
      setNewModelTags("");
      await fetchRegisteredModels();
    } catch (err: any) {
      setErrorMsg("Registration failed: " + (err.detail || err.message));
    } finally {
      setRegistering(false);
    }
  };

  // Handle Stage Transition
  const handleStageTransitionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageModalTarget) return;

    setTransitioning(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const updated = await api.transitionModelStage(
        stageModalTarget.model_name,
        stageModalTarget.version,
        {
          new_stage: targetStage,
          reason: transitionReason.trim() || undefined,
        }
      );

      setSuccessMsg(`Model ${updated.model_name} ${updated.version_tag} transitioned to ${updated.stage}.`);
      setStageModalTarget(null);
      setTransitionReason("");

      // Refresh versions & catalog
      const refreshed = await api.getModelVersions(stageModalTarget.model_name);
      setVersions(refreshed);
      await fetchRegisteredModels();
    } catch (err: any) {
      setErrorMsg("Stage transition failed: " + (err.detail || err.message));
    } finally {
      setTransitioning(false);
    }
  };

  // Verify specific version artifact
  const handleVerifyVersion = async (modelName: string, version: number) => {
    setVerifyingVersion(version);
    setErrorMsg(null);
    try {
      const res = await api.verifyVersionArtifact(modelName, version);
      setVerifications((prev) => ({ ...prev, [`v${version}`]: res }));
    } catch (err: any) {
      setErrorMsg("Verification failed: " + (err.detail || err.message));
    } finally {
      setVerifyingVersion(null);
    }
  };

  // Download genuine model binary
  const handleDownloadVersion = async (modelName: string, version: number) => {
    try {
      const { blob, filename } = await api.downloadVersionArtifact(modelName, version);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMsg("Artifact download failed: " + (err.detail || err.message));
    }
  };

  // Compare versions of selected model family
  const handleCompareVersions = async () => {
    if (!selectedModelName || versions.length < 2) return;
    setComparing(true);
    try {
      const data = await api.compareModelVersions(selectedModelName);
      setCompareData(data);
    } catch (err: any) {
      setErrorMsg("Failed to compare model versions: " + (err.detail || err.message));
    } finally {
      setComparing(false);
    }
  };

  // KPI calculations from real catalog
  const prodCount = modelSummaries.filter((m) => m.production_version !== null && m.production_version !== undefined).length;
  const stagingCount = modelSummaries.filter((m) => m.staging_version !== null && m.staging_version !== undefined).length;
  const totalModels = modelSummaries.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] mb-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#334155] font-semibold">
              PRODUCTION MODEL REGISTRY
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight font-sans">
            Model Registry &amp; Lifecycle
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Manage versioned machine learning pipelines, execute auditable stage promotions, verify cryptographic SHA-256 checksums, and stream verified artifacts.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              if (activeExperiment) {
                setSelectedExpIdForReg(activeExperiment.experiment_id);
                setNewModelName(`autonexa_${activeExperiment.target_column}_model`);
              }
              setShowRegisterModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Model</span>
          </button>
          <button
            onClick={() => onNavigateTab("prediction")}
            className="px-4 py-2 rounded-xl bg-white border border-[#CBD5E1] hover:border-[#1D4ED8] text-[#0F172A] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs hover:bg-[#EFF6FF] transition-all"
          >
            <Zap className="w-3.5 h-3.5 text-[#1D4ED8]" />
            <span>Inference Sandbox</span>
          </button>
        </div>
      </div>

      {/* Alert Banners */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="cursor-pointer text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="cursor-pointer text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
          <span className="text-[10px] uppercase font-mono text-[#64748B] block font-semibold">
            Active in Production
          </span>
          <div className="text-2xl font-bold text-[#15803D] font-mono mt-1">
            {prodCount} Models
          </div>
          <span className="text-[11px] text-[#64748B] font-mono">
            High-availability deployment
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
          <span className="text-[10px] uppercase font-mono text-[#64748B] block font-semibold">
            Candidates in Staging
          </span>
          <div className="text-2xl font-bold text-[#1D4ED8] font-mono mt-1">
            {stagingCount} Models
          </div>
          <span className="text-[11px] text-[#64748B] font-mono">
            Under verification review
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
          <span className="text-[10px] uppercase font-mono text-[#64748B] block font-semibold">
            Total Model Families
          </span>
          <div className="text-2xl font-bold text-[#0F172A] font-mono mt-1">
            {totalModels}
          </div>
          <span className="text-[11px] text-[#64748B] font-mono">
            Immutable versioned trees
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
          <span className="text-[10px] uppercase font-mono text-[#64748B] block font-semibold">
            Artifact Integrity
          </span>
          <div className="text-2xl font-bold text-[#0F172A] font-mono mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <span>SHA-256</span>
          </div>
          <span className="text-[11px] text-[#64748B] font-mono">
            Cryptographically audited
          </span>
        </div>
      </div>

      {/* Main Layout: Models Sidebar / Versions Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Model Families List */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#1D4ED8]" />
              <span>Registered Families</span>
            </h3>
            <button
              onClick={fetchRegisteredModels}
              disabled={loading}
              className="p-1 rounded hover:bg-[#F1F5F9] text-[#64748B] cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#1D4ED8]" : ""}`} />
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-[#64748B]">
              <RefreshCw className="w-4 h-4 animate-spin mx-auto text-[#1D4ED8] mb-2" />
              Loading catalog...
            </div>
          ) : modelSummaries.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#64748B] space-y-2">
              <p>No models registered yet.</p>
              <button
                onClick={() => setShowRegisterModal(true)}
                className="px-3 py-1.5 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-xs font-semibold cursor-pointer"
              >
                + Register First Model
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {modelSummaries.map((m) => {
                const isSelected = m.model_name === selectedModelName;

                return (
                  <div
                    key={m.model_name}
                    onClick={() => setSelectedModelName(m.model_name)}
                    className={`p-3.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#EFF6FF] border-[#BFDBFE] shadow-xs"
                        : "bg-white border-[#E2E8F0] hover:bg-[#F8FAFC]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0F172A] truncate max-w-[170px]" title={m.model_name}>
                        {m.model_name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white border border-[#CBD5E1] text-[#475569]">
                        v{m.latest_version} ({m.versions_count})
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-[#64748B]">
                      <span>{m.task_type}</span>
                      {m.latest_score !== null && m.latest_score !== undefined && (
                        <span className="font-bold text-[#1D4ED8]">
                          {m.latest_primary_metric}: {m.latest_score.toFixed(3)}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-1.5">
                      {m.production_version && (
                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]">
                          Prod: v{m.production_version}
                        </span>
                      )}
                      {m.staging_version && (
                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Stage: v{m.staging_version}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Versions Table & Management */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedModelName ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-[#E2E8F0] text-xs text-[#64748B]">
              Select a model family from the left panel to inspect version history and promote stages.
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
              {/* Family Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#64748B] font-semibold block">
                    MODEL REPOSITORY
                  </span>
                  <h2 className="text-xl font-bold text-[#0F172A] font-mono mt-0.5">
                    {selectedModelName}
                  </h2>
                </div>

                {versions.length >= 2 && (
                  <button
                    onClick={handleCompareVersions}
                    disabled={comparing}
                    className="px-3 py-1.5 rounded-xl bg-white border border-[#CBD5E1] hover:border-[#1D4ED8] text-[#1D4ED8] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs hover:bg-[#EFF6FF] transition-all"
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    <span>Compare {versions.length} Versions</span>
                  </button>
                )}
              </div>

              {/* Version Comparison Modal/Card if open */}
              {compareData && (
                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0F172A]">Version Comparison Matrix</span>
                    <button
                      onClick={() => setCompareData(null)}
                      className="cursor-pointer text-[#64748B] hover:text-[#0F172A]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-blue-200 bg-white">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="bg-blue-50/70 border-b border-blue-200 text-[10px] uppercase text-[#475569]">
                          <th className="py-2 px-3 font-semibold">Dimension</th>
                          {compareData.versions_compared.map((vTag: string) => (
                            <th key={vTag} className="py-2 px-3 font-semibold">
                              {vTag}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-100">
                        <tr>
                          <td className="py-2 px-3 font-bold text-[#475569]">Lifecycle Stage</td>
                          {compareData.versions_compared.map((vTag: string) => (
                            <td key={vTag} className="py-2 px-3 font-bold uppercase text-[#1D4ED8]">
                              {compareData.stages[vTag]}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-bold text-[#475569]">Algorithm</td>
                          {compareData.versions_compared.map((vTag: string) => (
                            <td key={vTag} className="py-2 px-3 text-[#0F172A]">
                              {compareData.algorithms[vTag]}
                            </td>
                          ))}
                        </tr>
                        {Object.entries(compareData.metric_comparison || {}).map(([metricName, vals]: [string, any]) => (
                          <tr key={metricName}>
                            <td className="py-2 px-3 font-bold text-[#0F172A]">{metricName}</td>
                            {compareData.versions_compared.map((vTag: string) => (
                              <td key={vTag} className="py-2 px-3 font-bold text-[#1D4ED8]">
                                {vals[vTag] !== null && vals[vTag] !== undefined ? Number(vals[vTag]).toFixed(4) : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Versions Table */}
              <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] text-[#64748B] uppercase tracking-wider">
                      <th className="py-2.5 px-3 font-semibold">Version</th>
                      <th className="py-2.5 px-3 font-semibold">Stage</th>
                      <th className="py-2.5 px-3 font-semibold">Algorithm &amp; Metric</th>
                      <th className="py-2.5 px-3 font-semibold">Artifact SHA-256</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {loadingVersions ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-xs text-[#64748B]">
                          <RefreshCw className="w-4 h-4 animate-spin mx-auto text-[#1D4ED8] mb-2" />
                          Loading versions...
                        </td>
                      </tr>
                    ) : versions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-xs text-[#64748B]">
                          No versions recorded for this model.
                        </td>
                      </tr>
                    ) : (
                      versions.map((ver) => {
                        const veri = verifications[ver.version_tag];

                        return (
                          <tr key={ver.version} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="py-3 px-3 font-bold text-[#1D4ED8]">
                              {ver.version_tag}
                              <div className="text-[10px] text-[#94A3B8] font-sans font-normal">
                                {new Date(ver.created_at).toLocaleDateString()}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                                  ver.stage === "production"
                                    ? "bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]"
                                    : ver.stage === "staging"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : ver.stage === "development"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-gray-100 text-gray-700 border-gray-200"
                                }`}
                              >
                                {ver.stage}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-[#0F172A]">{ver.model_family}</div>
                              <div className="text-[11px] font-bold text-[#1D4ED8]">
                                {ver.primary_metric}: {ver.score !== null && ver.score !== undefined ? ver.score.toFixed(4) : "—"}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="truncate max-w-[130px] text-[#64748B]" title={ver.artifact_sha256}>
                                {ver.artifact_sha256}
                              </div>
                              <div className="text-[10px] text-[#94A3B8]">
                                {formatBytes(ver.artifact_size_bytes)}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    if (typeof window !== "undefined") {
                                      sessionStorage.setItem("autonexa_active_serving_model", ver.model_name);
                                      sessionStorage.setItem("autonexa_active_serving_version", String(ver.version));
                                    }
                                    onNavigateTab("prediction");
                                  }}
                                  className="px-2.5 py-1 rounded bg-[#1D4ED8] border border-[#1E40AF] text-white hover:bg-[#1E40AF] text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                                  title="Serve and run real-time inference"
                                >
                                  <Zap className="w-3 h-3 text-amber-300" />
                                  <span>Serve</span>
                                </button>
                                <button
                                  onClick={() => handleVerifyVersion(ver.model_name, ver.version)}
                                  disabled={verifyingVersion === ver.version}
                                  className="px-2.5 py-1 rounded bg-white border border-[#CBD5E1] text-[#0F172A] hover:border-emerald-600 hover:text-emerald-700 text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Verify cryptographic checksum"
                                >
                                  <ShieldCheck className={`w-3 h-3 ${verifyingVersion === ver.version ? "animate-spin text-emerald-600" : ""}`} />
                                  <span>Verify</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setStageModalTarget(ver);
                                    setTargetStage(ver.stage === "production" ? "staging" : "production");
                                  }}
                                  className="px-2.5 py-1 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] hover:bg-[#DBEAFE] text-[10.5px] font-semibold cursor-pointer transition-colors"
                                  title="Promote or change stage"
                                >
                                  Stage →
                                </button>
                                <button
                                  onClick={() => handleDownloadVersion(ver.model_name, ver.version)}
                                  className="p-1 rounded bg-white border border-[#CBD5E1] text-[#475569] hover:border-[#1D4ED8] hover:text-[#1D4ED8] cursor-pointer transition-colors"
                                  title="Download verified .joblib binary"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Real-time verification badge */}
                              {veri && (
                                <div className="mt-1 text-[10px] font-sans">
                                  {veri.verified ? (
                                    <span className="text-emerald-600 font-bold inline-flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Checksum Verified
                                    </span>
                                  ) : (
                                    <span className="text-red-600 font-bold inline-flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" /> Checksum Mismatch
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* Register Model Modal                                     */}
      {/* ======================================================== */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-[#CBD5E1]">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#1D4ED8]" />
                <h3 className="text-base font-bold text-[#0F172A]">Register New Model Version</h3>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="cursor-pointer text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterModel} className="space-y-3.5 text-xs font-mono">
              <div>
                <label className="block text-[11px] font-bold text-[#334155] uppercase mb-1">
                  Source Experiment
                </label>
                <select
                  value={selectedExpIdForReg}
                  onChange={(e) => setSelectedExpIdForReg(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                >
                  <option value="">Select a completed experiment...</option>
                  {experiments.map((e) => (
                    <option key={e.experiment_id} value={e.experiment_id}>
                      {e.experiment_id.slice(0, 8)} ({e.target_column} - {e.best_model || "model"}, score: {Number(e.best_score || 0).toFixed(3)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#334155] uppercase mb-1">
                  Model Family Identifier
                </label>
                <input
                  type="text"
                  placeholder="e.g. customer_churn_detector"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  pattern="^[a-zA-Z0-9_\-]+$"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                />
                <span className="text-[10px] text-[#94A3B8] font-sans">
                  Alphanumeric, hyphens, and underscores only.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#334155] uppercase mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Model architecture notes, intended serving deployment, etc."
                  value={newModelDesc}
                  onChange={(e) => setNewModelDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#334155] uppercase mb-1">
                    Tags (Comma Separated)
                  </label>
                  <input
                    type="text"
                    placeholder="production, v1, scikit"
                    value={newModelTags}
                    onChange={(e) => setNewModelTags(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#334155] uppercase mb-1">
                    Initial Lifecycle Stage
                  </label>
                  <select
                    value={newModelInitialStage}
                    onChange={(e) => setNewModelInitialStage(e.target.value as LifecycleStage)}
                    className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                  >
                    <option value="development">Development</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  disabled={registering}
                  className="px-4 py-2 rounded-xl border border-[#CBD5E1] text-[#475569] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registering}
                  className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold cursor-pointer shadow-xs transition-all"
                >
                  {registering ? "Registering..." : "Register Model Version"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Stage Transition Modal                                   */}
      {/* ======================================================== */}
      {stageModalTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-[#CBD5E1]">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#1D4ED8]" />
                <h3 className="text-base font-bold text-[#0F172A]">Transition Model Stage</h3>
              </div>
              <button
                onClick={() => setStageModalTarget(null)}
                className="cursor-pointer text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleStageTransitionSubmit} className="space-y-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <div>Model: <strong className="text-[#0F172A]">{stageModalTarget.model_name}</strong></div>
                <div>Version: <strong className="text-[#1D4ED8]">{stageModalTarget.version_tag}</strong></div>
                <div>Current Stage: <strong className="uppercase text-[#0F172A]">{stageModalTarget.stage}</strong></div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#334155] uppercase mb-1">
                  Target Stage
                </label>
                <select
                  value={targetStage}
                  onChange={(e) => setTargetStage(e.target.value as LifecycleStage)}
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                >
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                  <option value="archived">Archived</option>
                </select>
                {targetStage === "production" && (
                  <p className="text-[10px] text-amber-700 font-sans mt-1">
                    Note: Promoting to Production automatically demotes any currently active production version of this model family to Archived.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#334155] uppercase mb-1">
                  Audit Justification / Reason
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Achieved 0.941 ROC-AUC on holdout test set with clean inference latency."
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-[#0F172A] focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setStageModalTarget(null)}
                  disabled={transitioning}
                  className="px-4 py-2 rounded-xl border border-[#CBD5E1] text-[#475569] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transitioning}
                  className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold cursor-pointer shadow-xs transition-all"
                >
                  {transitioning ? "Applying..." : "Apply Transition"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
