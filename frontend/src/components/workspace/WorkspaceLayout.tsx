"use client";

import React, { useState } from "react";
import {
  Home,
  Database,
  SlidersHorizontal,
  Trophy,
  Activity,
  FileText,
  Sparkles,
  ArrowLeft,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
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
  { id: "datasets", label: "Datasets", icon: Database },
  { id: "training", label: "AutoML Studio", icon: SlidersHorizontal },
  { id: "leaderboard", label: "Model Leaderboard", icon: Trophy },
  { id: "prediction", label: "Prediction Playground", icon: Activity },
  { id: "details", label: "Experiment Details", icon: FileText },
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
    <div className="min-h-screen bg-[#070e12] text-slate-100 flex flex-col font-sans">
      {/* Top Banner Bar */}
      <header className="border-b border-white/5 bg-[#0b1318]/90 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between z-40 sticky top-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExitWorkspace}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-mono"
            title="Return to Landing Page"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Landing</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-amber-400 font-mono tracking-wider">AUTONEXA</span>
            <span className="text-xs text-slate-500 hidden sm:inline">/ Workspace</span>
          </div>
        </div>

        {/* Right side status indicators */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-950/50 text-emerald-400 border border-emerald-800/60 text-xs font-medium font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Active System Health</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span
              className={`w-2 h-2 rounded-full ${
                apiConnected === true ? "bg-emerald-400 animate-pulse" : apiConnected === false ? "bg-amber-400" : "bg-slate-500"
              }`}
            />
            <span className="text-[11px] font-mono">
              {apiConnected === true ? "FastAPI Online" : apiConnected === false ? "Local Demo" : "Connecting..."}
            </span>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto p-2 sm:p-4 lg:p-6 gap-4 lg:gap-6">
        {/* Left Desktop Sidebar (Reference Replica) */}
        <aside className="hidden lg:flex flex-col justify-between w-64 rounded-2xl glass-panel p-5 shrink-0 h-[calc(100vh-6.5rem)] sticky top-20 border border-white/5">
          <div>
            {/* Logo in Sidebar */}
            <div className="mb-6">
              <span className="text-lg font-bold text-amber-400 tracking-wider font-mono">AUTONEXA</span>
              <p className="text-[11px] text-slate-500 tracking-wide font-mono mt-0.5">AI Research Platform</p>
            </div>

            {/* Navigation Header */}
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono mb-3">
              Navigation
            </div>

            {/* Navigation Buttons */}
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? "bg-slate-800/80 border border-slate-700/80 text-white shadow-sm font-semibold"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-amber-400" : "text-slate-500"}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer with Connection Status */}
          <div className="pt-4 border-t border-slate-900/80">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiConnected === true ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-500/50" : "bg-amber-400"
                }`}
              />
              <span className="text-[11px] font-mono">Connected to FastAPI</span>
            </div>
            <p className="text-[10px] text-slate-600 mt-1 font-mono">Port 8000 • v0.1.0</p>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex">
            <div className="w-72 bg-[#0c1419] p-5 flex flex-col justify-between h-full border-r border-slate-800">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className="text-lg font-bold text-amber-400 font-mono">AUTONEXA</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono mb-3">
                  Navigation
                </div>

                <nav className="space-y-1">
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
                            ? "bg-slate-800 border border-slate-700 text-white font-semibold"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? "text-amber-400" : "text-slate-500"}`} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="pt-4 border-t border-slate-800 text-xs text-slate-400">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onExitWorkspace();
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-slate-900 text-slate-300 font-mono text-xs flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Return to Landing Page
                </button>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Workspace Main Content View */}
        <main className="flex-1 min-w-0 flex flex-col">{children}</main>
      </div>
    </div>
  );
}
