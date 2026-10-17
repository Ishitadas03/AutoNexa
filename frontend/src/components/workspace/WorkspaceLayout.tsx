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
    <div className="min-h-screen bg-[#070D0C] text-[#F1EFE1] flex flex-col font-sans">
      {/* Top Banner Bar */}
      <header className="border-b border-[#2A4E42] bg-[#0D1815]/95 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between z-40 sticky top-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExitWorkspace}
            className="p-1.5 rounded-lg bg-[#070D0C] border border-[#2A4E42] text-[#AEBEB5] hover:text-[#F1EFE1] hover:border-[#68E7B5] transition-colors flex items-center gap-1.5 text-xs font-mono cursor-pointer"
            title="Return to Landing Page"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Landing</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[#68E7B5] font-sans tracking-wide">AUTONEXA</span>
            <span className="text-xs text-[#AEBEB5] hidden sm:inline font-mono">/ Studio Workspace</span>
          </div>
        </div>

        {/* Right side status indicators */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#070D0C] text-[#68E7B5] border border-[#2A4E42] text-xs font-medium font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>FastAPI Operational</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#AEBEB5] bg-[#070D0C] px-3 py-1 rounded-full border border-[#2A4E42]">
            <span
              className={`w-2 h-2 rounded-full ${
                apiConnected === true ? "bg-[#68E7B5] animate-pulse shadow-[0_0_8px_#68E7B5]" : apiConnected === false ? "bg-[#EDC54C]" : "bg-[#AEBEB5]"
              }`}
            />
            <span className="text-[11px] font-mono">
              {apiConnected === true ? "API Online" : apiConnected === false ? "Local Demo" : "Connecting..."}
            </span>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-lg bg-[#070D0C] border border-[#2A4E42] text-[#AEBEB5]"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto p-3 sm:p-5 lg:p-6 gap-5 lg:gap-6">
        {/* Left Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col justify-between w-64 rounded-2xl bg-[#0D1815] p-5 shrink-0 h-[calc(100vh-6.5rem)] sticky top-20 border border-[#2A4E42]">
          <div>
            {/* Logo in Sidebar */}
            <div className="mb-6 pb-4 border-b border-[#2A4E42]/60">
              <div className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                  <path d="M16 4 L6 24 L11 24 L16 13 L21 24 L26 24 Z" fill="#68E7B5" />
                  <path d="M12 18 L20 18 L18 21 L14 21 Z" fill="#2A916E" />
                </svg>
                <span className="text-base font-bold text-[#F1EFE1] tracking-tight">AutoNexa</span>
              </div>
              <p className="text-[10px] text-[#AEBEB5] tracking-wide font-mono mt-1">Research AutoML Suite</p>
            </div>

            {/* Navigation Header */}
            <div className="text-[10px] uppercase font-bold tracking-wider text-[#AEBEB5] font-mono mb-3">
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
                        ? "bg-[#162A23] border border-[#2A4E42] text-[#68E7B5] shadow-sm font-semibold"
                        : "text-[#AEBEB5] hover:text-[#F1EFE1] hover:bg-[#12201C]"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-[#68E7B5]" : "text-[#AEBEB5]"}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer with Connection Status */}
          <div className="pt-4 border-t border-[#2A4E42]/60">
            <div className="flex items-center gap-2 text-xs text-[#AEBEB5]">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiConnected === true ? "bg-[#68E7B5] animate-pulse shadow-[0_0_6px_#68E7B5]" : "bg-[#EDC54C]"
                }`}
              />
              <span className="text-[11px] font-mono">FastAPI Engine (Port 8000)</span>
            </div>
            <p className="text-[10px] text-[#AEBEB5]/70 mt-1 font-mono">v1.0.0 // scikit-learn // MLflow</p>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex">
            <div className="w-72 bg-[#0D1815] p-5 flex flex-col justify-between h-full border-r border-[#2A4E42]">
              <div>
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#2A4E42]">
                  <span className="text-lg font-bold text-[#68E7B5]">AutoNexa</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="text-[#AEBEB5] hover:text-[#F1EFE1]">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="text-[10px] uppercase font-bold tracking-wider text-[#AEBEB5] font-mono mb-3">
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
                            ? "bg-[#162A23] border border-[#2A4E42] text-[#68E7B5] font-semibold"
                            : "text-[#AEBEB5] hover:text-[#F1EFE1]"
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? "text-[#68E7B5]" : "text-[#AEBEB5]"}`} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="pt-4 border-t border-[#2A4E42]">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onExitWorkspace();
                  }}
                  className="w-full py-2 rounded-lg bg-[#070D0C] border border-[#2A4E42] text-xs text-[#AEBEB5] hover:text-[#F1EFE1] flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Landing</span>
                </button>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Main Content Stage */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
