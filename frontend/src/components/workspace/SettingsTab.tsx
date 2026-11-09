"use client";

import React, { useState, useEffect } from "react";
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
  User,
  LogOut,
  ChevronDown,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { UserPublicProfile } from "@/types/api";

interface SettingsTabProps {
  apiConnected: boolean | null;
  onClearData?: () => void;
  onReloadBenchmarks?: () => void;
  onRefreshHealth?: () => void;
}

export default function SettingsTab({
  apiConnected,
  onClearData,
  onReloadBenchmarks,
  onRefreshHealth,
}: SettingsTabProps) {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState(() => {
    const stored = api.getStoredBaseUrl();
    if (stored) return stored;
    if (typeof window !== "undefined" && window.location.origin && window.location.origin !== "null") {
      return window.location.origin;
    }
    return api.getBaseUrl() || "http://127.0.0.1:8000";
  });
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ status: string; latencyMs: number } | null>(null);
  const [urlSavedMessage, setUrlSavedMessage] = useState<string | null>(null);

  // Default Hyperparameters
  const [defaultFolds, setDefaultFolds] = useState(5);
  const [defaultHoldout, setDefaultHoldout] = useState(0.2);
  const [defaultTimeBudget, setDefaultTimeBudget] = useState(60);
  const [defaultSeed, setDefaultSeed] = useState(42);
  const [savedSettings, setSavedSettings] = useState(false);

  // Phase 17F User Identity & Session
  const [currentUser, setCurrentUser] = useState<UserPublicProfile | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [showDevApiKeys, setShowDevApiKeys] = useState(false);

  // Legacy Developer API Authentication & RBAC Key
  const [apiKey, setApiKey] = useState(() => api.getStoredApiKey());
  const [showKey, setShowKey] = useState(false);
  const [keySavedMessage, setKeySavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchUser = async () => {
      try {
        const res = await api.getMe();
        if (mounted && res?.user) {
          setCurrentUser(res.user);
        }
      } catch {
        if (mounted) {
          setCurrentUser(null);
        }
      } finally {
        if (mounted) {
          setUserLoading(false);
        }
      }
    };
    fetchUser();
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      setCurrentUser(null);
      router.push("/login");
    }
  };

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
      if (onRefreshHealth) onRefreshHealth();
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

  const handleSaveApiUrl = () => {
    api.setStoredBaseUrl(apiUrl);
    setUrlSavedMessage(apiUrl.trim() ? "Backend URL saved to browser storage." : "Backend URL reset.");
    setTimeout(() => setUrlSavedMessage(null), 3500);
    handlePingBackend();
    if (onRefreshHealth) onRefreshHealth();
  };

  const handleResetApiUrl = () => {
    api.clearStoredBaseUrl();
    const defaultUrl =
      typeof window !== "undefined" && window.location.origin && window.location.origin !== "null"
        ? window.location.origin
        : api.getBaseUrl() || "http://127.0.0.1:8000";
    setApiUrl(defaultUrl);
    setUrlSavedMessage("Backend URL reset to system default.");
    setTimeout(() => setUrlSavedMessage(null), 3500);
    if (onRefreshHealth) onRefreshHealth();
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

  const handleLoadDemoAdminKey = () => {
    const key = "autonexa-admin-key-secret";
    setApiKey(key);
    api.setStoredApiKey(key);
    setKeySavedMessage("Demo Admin key loaded and activated.");
    setTimeout(() => setKeySavedMessage(null), 3000);
  };

  const handleLoadDemoReadKey = () => {
    const key = "autonexa-read-key-secret";
    setApiKey(key);
    api.setStoredApiKey(key);
    setKeySavedMessage("Demo Read/Inference key loaded and activated.");
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
                FastAPI Gateway URL:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="http://127.0.0.1:8000 or https://your-backend.com"
                  className="flex-1 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] text-xs font-mono focus:border-[#1D4ED8] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleSaveApiUrl}
                  className="px-3.5 py-1.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save URL</span>
                </button>
                <button
                  type="button"
                  onClick={handlePingBackend}
                  disabled={isPinging}
                  className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isPinging ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span>Ping Health</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetApiUrl}
                  className="px-3 py-1.5 rounded-xl text-xs font-mono text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors"
                  title="Reset to system default"
                >
                  Reset
                </button>
              </div>

              {urlSavedMessage && (
                <div className="mt-2 text-xs font-mono text-[#15803D] bg-[#DCFCE7] border border-[#86EFAC] px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{urlSavedMessage}</span>
                </div>
              )}

              <p className="mt-2 text-[11px] text-[#64748B] leading-relaxed">
                <strong>Vercel Cloud Access:</strong> When accessing AutoNexa via{" "}
                <span className="font-mono text-[#1D4ED8]">https://autonexa-orpin.vercel.app</span>,
                you can connect directly to your backend endpoint (local server, ngrok/localtunnel HTTPS URL, or hosted API).
              </p>
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

        {/* Card 3: User Identity & Session Status (Phase 17F Primary) */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#1D4ED8]" />
              <h3 className="text-sm font-bold text-[#0F172A]">
                User Identity &amp; Session Management
              </h3>
            </div>
            {userLoading ? (
              <span className="text-xs font-mono text-[#64748B] flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Checking...</span>
              </span>
            ) : currentUser ? (
              <span className="px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC] text-[10px] font-mono font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Active Session</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-mono font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-slate-500" />
                <span>Unauthenticated</span>
              </span>
            )}
          </div>

          {/* User Status Content */}
          <div className="space-y-3">
            {currentUser ? (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-[#1D4ED8] flex items-center justify-center font-bold text-xs font-mono">
                      {currentUser.name ? currentUser.name.slice(0, 2).toUpperCase() : currentUser.email.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#0F172A]">
                        {currentUser.name || currentUser.email}
                      </p>
                      <p className="text-[11px] font-mono text-[#64748B]">
                        {currentUser.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-mono font-semibold uppercase">
                      {currentUser.role}
                    </span>
                    {currentUser.is_email_verified ? (
                      <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium">
                        <UserCheck className="w-3 h-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3 h-3" />
                        Unverified
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] text-[#64748B]">
                    Protected via HttpOnly session cookies.
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-start gap-2.5">
                  <User className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-[#0F172A]">
                      No active user session detected
                    </p>
                    <p className="text-[11px] text-[#64748B] mt-0.5 leading-relaxed">
                      AutoNexa Phase 17F introduces secure email authentication with HttpOnly cookies. Sign in or register to authenticate without storing root admin API keys in your browser.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href="/login"
                    className="px-3.5 py-1.5 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                  >
                    Register
                  </Link>
                </div>
              </div>
            )}

            {/* Collapsible Developer Override Section */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDevApiKeys(!showDevApiKeys)}
                className="w-full flex items-center justify-between text-left text-xs font-mono text-[#64748B] hover:text-[#0F172A] py-1 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-slate-500" />
                  <span>Developer API Key Override (Local/Automated Testing)</span>
                </span>
                {showDevApiKeys ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {showDevApiKeys && (
                <form onSubmit={handleSaveApiKey} className="mt-3 space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] text-[#64748B] leading-relaxed">
                    <strong>Note:</strong> In production, users authenticate via secure sessions. Direct API keys are only required for headless API automation or local scripts. Storing admin keys in browser storage is not recommended.
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[#0F172A] font-semibold mb-1">
                      Override API Key (<code className="text-[#1D4ED8]">X-API-Key</code>):
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKey ? "text" : "password"}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Optional dev API key..."
                          className="w-full px-3 py-2 pr-10 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] text-xs font-mono focus:border-[#1D4ED8] focus:outline-none"
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
                        className="px-3.5 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                      {apiKey && (
                        <button
                          type="button"
                          onClick={handleClearApiKey}
                          className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {keySavedMessage && (
                      <p className="mt-1.5 text-xs font-mono text-[#15803D]">
                        {keySavedMessage}
                      </p>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

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
