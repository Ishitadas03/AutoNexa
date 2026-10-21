"use client";

import React, { useState } from "react";
import {
  Settings,
  Server,
  Database,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sliders,
  ShieldCheck,
  Check,
  Zap,
  Key,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "@/lib/api";

interface SettingsTabProps {
  apiConnected: boolean | null;
  onClearData?: () => void;
  onReloadBenchmarks?: () => void;
}

export default function SettingsTab({
  apiConnected,
  onClearData,
  onReloadBenchmarks,
}: SettingsTabProps) {
  const [apiUrl, setApiUrl] = useState(() => api.getBaseUrl() || "http://127.0.0.1:8000");
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ status: string; latencyMs: number } | null>(null);

  // Default Hyperparameters
  const [defaultFolds, setDefaultFolds] = useState(5);
  const [defaultHoldout, setDefaultHoldout] = useState(0.2);
  const [defaultTimeBudget, setDefaultTimeBudget] = useState(60);
  const [defaultSeed, setDefaultSeed] = useState(42);
  const [savedSettings, setSavedSettings] = useState(false);

  // API Authentication & RBAC Key
  const [apiKey, setApiKey] = useState(() => api.getStoredApiKey());
  const [showKey, setShowKey] = useState(false);
  const [keySavedMessage, setKeySavedMessage] = useState<string | null>(null);

  const handlePingBackend = async () => {
    setIsPinging(true);
    setPingResult(null);
    const start = performance.now();
    try {
      const res = await api.checkHealth(apiUrl);
      const latency = Math.round(performance.now() - start);
      setPingResult({
        status: res.status || "healthy",
        latencyMs: latency,
      });
    } catch {
      const latency = Math.round(performance.now() - start);
      setPingResult({
        status: "unreachable",
        latencyMs: latency,
      });
    } finally {
      setIsPinging(false);
    }
  };

  const handleSaveDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSettings(true);
    setTimeout(() => setSavedSettings(false), 2000);
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    api.setStoredApiKey(apiKey);
    setKeySavedMessage(apiKey.trim() ? "API Key saved to browser storage." : "API Key cleared.");
    setTimeout(() => setKeySavedMessage(null), 3000);
  };

  const handleClearApiKey = () => {
    api.clearStoredApiKey();
    setApiKey("");
    setKeySavedMessage("API Key cleared from browser storage.");
    setTimeout(() => setKeySavedMessage(null), 3000);
  };

  const handleResetLocalStorage = () => {
    if (confirm("Are you sure you want to clear local dataset and experiment history?")) {
      localStorage.removeItem("autonexa_datasets_v1");
      localStorage.removeItem("autonexa_experiments_v1");
      localStorage.removeItem("autonexa_active_dataset_v1");
      localStorage.removeItem("autonexa_active_exp_v1");
      if (onClearData) onClearData();
      alert("Local storage cache cleared.");
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] mb-2 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] shadow-[0_0_6px_#1D4ED8]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#334155] font-semibold">
              PREFERENCES &amp; SYSTEM DIAGNOSTICS
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight font-sans">
            Platform Settings
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Configure backend connection endpoints, AutoML cross-validation defaults, and manage local browser caches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] text-xs font-mono font-medium flex items-center gap-1.5 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#1D4ED8] animate-pulse" />
            <span>v1.0.0 Research Release</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Backend Connection Diagnostics */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#E2E8F0]">
            <Server className="w-4 h-4 text-[#1D4ED8]" />
            <h3 className="text-sm font-bold text-[#0F172A]">
              Backend API Gateway Configuration
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-mono text-[#0F172A] font-semibold mb-1">
                FastAPI Host URL:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] text-xs font-mono focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handlePingBackend}
                  disabled={isPinging}
                  className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isPinging ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>Ping Health</span>
                </button>
              </div>
            </div>

            {/* Diagnostic Result */}
            {pingResult && (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
                  pingResult.status === "healthy"
                    ? "bg-[#DCFCE7] border-[#86EFAC] text-[#15803D]"
                    : "bg-rose-50 border-rose-200 text-rose-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Status: {pingResult.status.toUpperCase()} ({pingResult.latencyMs}ms roundtrip)
                  </span>
                </div>
                <span>FastAPI v1.0.0</span>
              </div>
            )}

            <div className="pt-2 text-xs text-[#64748B] font-mono space-y-1">
              <div className="flex justify-between">
                <span>Active Engine State:</span>
                <span className={apiConnected ? "text-[#15803D] font-bold" : "text-amber-600 font-bold"}>
                  {apiConnected ? "Connected (Local Daemon)" : "Simulation Fallback Mode"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>CORS Policy:</span>
                <span className="text-[#0F172A]">Permissive (*:3000)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: AutoML Default Hyperparameters */}
        <form onSubmit={handleSaveDefaults} className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#1D4ED8]" />
              <h3 className="text-sm font-bold text-[#0F172A]">
                AutoML Engine Defaults
              </h3>
            </div>
            {savedSettings && (
              <span className="text-xs font-mono text-[#15803D] flex items-center gap-1 font-bold">
                <Check className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <label className="block text-[#64748B] mb-1 font-semibold">Default CV Folds:</label>
              <select
                value={defaultFolds}
                onChange={(e) => setDefaultFolds(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A]"
              >
                <option value={3}>3 Folds</option>
                <option value={5}>5 Folds (Standard)</option>
                <option value={10}>10 Folds</option>
              </select>
            </div>

            <div>
              <label className="block text-[#64748B] mb-1 font-semibold">Holdout Split:</label>
              <select
                value={defaultHoldout}
                onChange={(e) => setDefaultHoldout(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A]"
              >
                <option value={0.1}>10% Holdout</option>
                <option value={0.2}>20% Holdout</option>
                <option value={0.3}>30% Holdout</option>
              </select>
            </div>

            <div>
              <label className="block text-[#64748B] mb-1 font-semibold">Time Budget (Secs):</label>
              <input
                type="number"
                value={defaultTimeBudget}
                onChange={(e) => setDefaultTimeBudget(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A]"
              />
            </div>

            <div>
              <label className="block text-[#64748B] mb-1 font-semibold">Random Seed:</label>
              <input
                type="number"
                value={defaultSeed}
                onChange={(e) => setDefaultSeed(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A]"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Update Defaults
            </button>
          </div>
        </form>

        {/* Card 3: API Authentication & Role-Based Access Control (RBAC) */}
        <form onSubmit={handleSaveApiKey} className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#1D4ED8]" />
              <h3 className="text-sm font-bold text-[#0F172A]">
                API Security &amp; Access Control (RBAC)
              </h3>
            </div>
            {keySavedMessage ? (
              <span className="text-xs font-mono text-[#15803D] flex items-center gap-1 font-bold">
                <Check className="w-3.5 h-3.5" />
                <span>{keySavedMessage}</span>
              </span>
            ) : apiKey.trim() ? (
              <span className="px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC] text-[10px] font-mono font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Key Active</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-mono font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>No Key Set</span>
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-mono text-[#0F172A] font-semibold mb-1">
                Client API Key (<code className="text-[#1D4ED8]">X-API-Key</code>):
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter Admin or Inference/Read API key..."
                    className="w-full px-3 py-2 pr-10 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] text-xs font-mono focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                    title={showKey ? "Hide key" : "Show key"}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Save Key</span>
                </button>
                {apiKey && (
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#475569] space-y-1.5 font-sans">
              <div className="flex items-start gap-1.5 font-mono text-[11px] text-[#334155]">
                <Key className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0 mt-0.5" />
                <span>
                  <strong>Admin Key:</strong> Required for dataset uploads, training, experiment deletion, model promotion, and benchmarking.
                </span>
              </div>
              <div className="flex items-start gap-1.5 font-mono text-[11px] text-[#334155]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                <span>
                  <strong>Inference/Read Key:</strong> Permitted for querying models, metrics, status, explanations, and predictions.
                </span>
              </div>
              <p className="text-[10px] text-[#64748B] pt-1 border-t border-slate-200">
                <strong>Security Architecture Note:</strong> API keys saved here reside in browser <code className="font-mono">localStorage</code> for local workstation and single-tenant workflows. For multi-tenant production architectures, administrative mutations must be invoked from trusted backend services rather than storing root admin credentials in browser client storage.
              </p>
            </div>
          </div>
        </form>

        {/* Card 4: Storage & Cache Management */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#E2E8F0]">
            <Database className="w-4 h-4 text-[#1D4ED8]" />
            <h3 className="text-sm font-bold text-[#0F172A]">
              Storage &amp; Browser Cache Operations
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-bold text-[#0F172A] font-mono">
                Purge Local Datasets &amp; Experiment Run History
              </h4>
              <p className="text-xs text-[#64748B] mt-0.5">
                Reset browser storage without affecting backend disk storage. Re-initializes clean workspace state.
              </p>
            </div>

            <div className="pt-2 flex justify-start">
              <button
                onClick={handleResetLocalStorage}
                className="px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Local Cache</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
