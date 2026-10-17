"use client";

import React, { useState } from "react";
import {
  Home,
  Database,
  SlidersHorizontal,
  Trophy,
  Activity,
  FileText,
  ArrowLeft,
  Menu,
  X,
  CheckCircle2,
} from "lucide-react";
import { WorkspaceTab } from "@/lib/store";

interface WorkspaceLayoutProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onExitWorkspace: () => void;
  apiConnected: boolean | null;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "datasets", label: "Datasets & Profiling", icon: Database },
  { id: "training", label: "AutoML Studio", icon: SlidersHorizontal },
  { id: "leaderboard", label: "Model Leaderboard", icon: Trophy },
  { id: "prediction", label: "Prediction Playground", icon: Activity },
  { id: "details", label: "Experiment Artifacts", icon: FileText },
];

export default function WorkspaceLayout({
  activeTab,
  onTabChange,
  onExitWorkspace,
  apiConnected,
  children,
}: WorkspaceLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
                apiConnected === true ? "bg-[#10B981] animate-pulse shadow-[0_0_6px_#10B981]" : apiConnected === false ? "bg-[#F59E0B]" : "bg-[#94A3B8]"
              }`}
            />
            <span className="text-[11px] font-mono font-medium">
              {apiConnected === true ? "API Online" : apiConnected === false ? "Local Demo" : "Connecting..."}
            </span>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#475569]"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto p-3 sm:p-5 lg:p-6 gap-5 lg:gap-6">
        {/* Left Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col justify-between w-64 rounded-2xl bg-white p-5 shrink-0 h-[calc(100vh-6.5rem)] sticky top-20 border border-[#E2E8F0] shadow-sm">
          <div>
            {/* Logo in Sidebar */}
            <div className="mb-6 pb-4 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
                  <path d="M7 31 L18 5 L29 31" stroke="#1D4ED8" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="11" y="20" width="14" height="3.6" rx="1.8" fill="#0F172A" />
                </svg>
                <span className="text-base font-bold text-[#0F172A] tracking-tight">AutoNexa</span>
              </div>
              <p className="text-[10px] text-[#64748B] tracking-wide font-mono mt-1">Research AutoML Suite</p>
            </div>

            {/* Navigation Header */}
            <div className="text-[10px] uppercase font-bold tracking-wider text-[#64748B] font-mono mb-3">
              Workspace Views
            </div>

            {/* Navigation Buttons */}
            <nav className="space-y-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? "bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] shadow-xs font-bold"
                        : "text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-[#1D4ED8]" : "text-[#64748B]"}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer with Connection Status */}
          <div className="pt-4 border-t border-[#E2E8F0]">
            <div className="flex items-center gap-2 text-xs text-[#475569]">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiConnected === true ? "bg-[#10B981] animate-pulse shadow-[0_0_6px_#10B981]" : "bg-[#F59E0B]"
                }`}
              />
              <span className="text-[11px] font-mono">FastAPI Engine (Port 8000)</span>
            </div>
            <p className="text-[10px] text-[#94A3B8] mt-1 font-mono">v1.0.0 // scikit-learn // MLflow</p>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex">
            <div className="w-72 bg-white p-5 flex flex-col justify-between h-full border-r border-[#CBD5E1] shadow-2xl">
              <div>
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#E2E8F0]">
                  <span className="text-lg font-bold text-[#1D4ED8]">AutoNexa</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="text-[#64748B] hover:text-[#0F172A]">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="text-[10px] uppercase font-bold tracking-wider text-[#64748B] font-mono mb-3">
                  Workspace Views
                </div>

                <nav className="space-y-1.5">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onTabChange(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
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
                </nav>
              </div>

              <div className="pt-4 border-t border-[#E2E8F0]">
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
