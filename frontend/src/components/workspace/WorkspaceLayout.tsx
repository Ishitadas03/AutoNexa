"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Home,
  Database,
  BarChart2,
  SlidersHorizontal,
  Trophy,
  History,
  Activity,
  Layers,
  BookOpen,
  Settings,
  ArrowLeft,
  Menu,
  X,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  GitCompare,
  Gauge,
  GitBranch,
  LogOut,
} from "lucide-react";
import { WorkspaceTab } from "@/lib/store";
import { api } from "@/lib/api";
import { UserPublicProfile } from "@/types/api";

interface WorkspaceLayoutProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onExitWorkspace: () => void;
  apiConnected: boolean | null;
  children: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: { id: WorkspaceTab; label: string; icon: React.ElementType }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Data Assets",
    items: [
      { id: "overview", label: "Dashboard", icon: Home },
      { id: "datasets", label: "Datasets & Preview", icon: Database },
      { id: "analysis", label: "Data Profiling", icon: BarChart2 },
    ],
  },
  {
    title: "AutoML Engine",
    items: [
      { id: "training", label: "AutoML Studio", icon: SlidersHorizontal },
      { id: "pipelines", label: "Pipeline Orchestration", icon: GitBranch },
      { id: "leaderboard", label: "Model Evaluation", icon: Trophy },
      { id: "experiments", label: "Experiments", icon: History },
      { id: "prediction", label: "Prediction Playground", icon: Activity },
      { id: "models", label: "Model Registry", icon: Layers },
      { id: "monitoring", label: "Model Monitoring", icon: Gauge },
    ],
  },
  {
    title: "Explainability & Research",
    items: [
      { id: "explainability", label: "Model Explainability", icon: Sparkles },
      { id: "error_analysis", label: "Error Diagnostics", icon: AlertTriangle },
      { id: "benchmarks", label: "Research Benchmarks", icon: GitCompare },
    ],
  },
  {
    title: "Platform",
    items: [
      { id: "docs", label: "Documentation", icon: BookOpen },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function WorkspaceLayout({
  activeTab,
  onTabChange,
  onExitWorkspace,
  apiConnected,
  children,
}: WorkspaceLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserPublicProfile | null>(null);

  useEffect(() => {
    api
      .getMe()
      .then((res) => {
        if (res && res.user) {
          setCurrentUser(res.user);
        }
      })
      .catch(() => {
        setCurrentUser(null);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
      setCurrentUser(null);
    } catch {
      setCurrentUser(null);
    }
  };

  // Normalize details tab to experiments
  const effectiveTab = activeTab === "details" ? "experiments" : activeTab;

  return (
    <div className="min-h-screen bg-[#F2F6F9] text-[#0F172A] flex flex-col font-sans">
      {/* Top Banner Bar */}
      <header className="border-b border-[#E2E8F0] bg-white/95 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between z-40 sticky top-0 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onExitWorkspace}
            className="p-1.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] hover:border-[#1D4ED8] transition-colors flex items-center gap-1.5 text-xs font-mono cursor-pointer"
            title="Return to Landing Page"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Landing</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[#1D4ED8] font-sans tracking-wide">AUTONEXA</span>
            <span className="text-xs text-[#64748B] hidden sm:inline font-mono">/ Studio Workspace</span>
          </div>
        </div>

        {/* Right side status indicators */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC] text-xs font-medium font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>FastAPI Operational</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#475569] bg-white px-3 py-1 rounded-full border border-[#CBD5E1] shadow-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                apiConnected === true
                  ? "bg-[#10B981] animate-pulse shadow-[0_0_6px_#10B981]"
                  : apiConnected === false
                  ? "bg-[#F59E0B]"
                  : "bg-[#94A3B8]"
              }`}
            />
            <span className="text-[11px] font-mono font-medium">
              {apiConnected === true ? "API Online" : apiConnected === false ? "Local Demo" : "Connecting..."}
            </span>
          </div>

          {/* User Session Pill or Sign In Link */}
          {currentUser ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] text-xs shadow-xs">
              <div className="w-5 h-5 rounded-full bg-[#1D4ED8] text-white flex items-center justify-center text-[10px] font-bold">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold text-[#0F172A] hidden md:inline max-w-[100px] truncate">
                {currentUser.name}
              </span>
              {currentUser.role === "admin" && (
                <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-[#1D4ED8] text-[9.5px] font-mono font-bold">
                  Admin
                </span>
              )}
              <button
                onClick={handleLogout}
                title="Sign out of session"
                className="p-1 hover:text-rose-600 text-[#64748B] transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="px-3.5 py-1 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold shadow-xs transition-colors"
            >
              Sign In
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#475569] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto p-3 sm:p-5 lg:p-6 gap-5 lg:gap-6">
        {/* Left Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col justify-between w-64 rounded-2xl bg-white p-4 shrink-0 h-[calc(100vh-6rem)] sticky top-20 border border-[#E2E8F0] shadow-sm overflow-y-auto">
          <div>
            {/* Logo in Sidebar */}
            <div className="mb-4 pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
                  <path d="M7 31 L18 5 L29 31" stroke="#1D4ED8" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="11" y="20" width="14" height="3.6" rx="1.8" fill="#0F172A" />
                </svg>
                <span className="text-base font-bold text-[#0F172A] tracking-tight">AutoNexa</span>
              </div>
              <p className="text-[10px] text-[#64748B] tracking-wide font-mono mt-0.5">Research AutoML Suite</p>
            </div>

            {/* Navigation Groups */}
            <nav className="space-y-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="space-y-1">
                  <div className="text-[9.5px] uppercase font-bold tracking-wider text-[#94A3B8] font-mono px-2.5 mb-1">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = effectiveTab === item.id;
                    return (
                      <button
                        key={item.id}
                        id={`nav-tab-${item.id}`}
                        onClick={() => onTabChange(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                          isActive
                            ? "bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] shadow-xs font-bold"
                            : "text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#1D4ED8]" : "text-[#64748B]"}`} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>

          {/* Sidebar Footer with Connection Status */}
          <div className="pt-3 mt-4 border-t border-[#E2E8F0]">
            <div className="flex items-center gap-2 text-xs text-[#475569]">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiConnected === true ? "bg-[#10B981] animate-pulse shadow-[0_0_6px_#10B981]" : "bg-[#F59E0B]"
                }`}
              />
              <span className="text-[10.5px] font-mono">FastAPI Engine (Port 8000)</span>
            </div>
            <p className="text-[9.5px] text-[#94A3B8] mt-0.5 font-mono">v1.0.0 // scikit-learn // joblib</p>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex">
            <div className="w-72 bg-white p-5 flex flex-col justify-between h-full border-r border-[#CBD5E1] shadow-2xl overflow-y-auto">
              <div>
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#E2E8F0]">
                  <span className="text-lg font-bold text-[#1D4ED8]">AutoNexa</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="text-[#64748B] hover:text-[#0F172A]">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="space-y-4">
                  {NAV_GROUPS.map((group) => (
                    <div key={group.title} className="space-y-1">
                      <div className="text-[9.5px] uppercase font-bold tracking-wider text-[#94A3B8] font-mono px-2 mb-1">
                        {group.title}
                      </div>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = effectiveTab === item.id;
                        return (
                          <button
                            key={item.id}
                            id={`mobile-nav-tab-${item.id}`}
                            onClick={() => {
                              onTabChange(item.id);
                              setMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                              isActive
                                ? "bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] font-bold"
                                : "text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
                            }`}
                          >
                            <Icon className={`w-4 h-4 ${isActive ? "text-[#1D4ED8]" : "text-[#64748B]"}`} />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </nav>
              </div>

              <div className="pt-4 mt-4 border-t border-[#E2E8F0]">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onExitWorkspace();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[#F1F5F9] border border-[#CBD5E1] text-xs font-mono text-[#0F172A]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Landing Page</span>
                </button>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Tab View Container */}
        <main className="flex-1 overflow-x-hidden min-w-0">{children}</main>
      </div>
    </div>
  );
}
