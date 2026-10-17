"use client";

import React, { useState } from "react";
import { Sparkles, Menu, X, ArrowRight, Cpu, FileText, Layers } from "lucide-react";

interface NavbarProps {
  onLaunchWorkspace: () => void;
  apiConnected: boolean | null;
}

export default function Navbar({ onLaunchWorkspace, apiConnected }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-[#080d11]/85 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Brand Logo */}
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Sparkles className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            </div>
            <span className="text-base font-bold tracking-tight text-white font-mono">
              AUTONEXA
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-6">
            <button
              onClick={() => onLaunchWorkspace()}
              className="text-sm text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              Workspace
            </button>
            <button
              onClick={() => scrollTo("workflow")}
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5" />
              Documentation
            </button>
            <button
              onClick={() => scrollTo("features")}
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              Features
            </button>
          </div>

          {/* Action CTAs & Status */}
          <div className="hidden md:flex items-center gap-3">
            {/* Backend connection pill — tri-state: loading, connected, disconnected */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-[11px] font-mono">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  apiConnected === true
                    ? "bg-emerald-400 shadow-sm shadow-emerald-400"
                    : apiConnected === false
                    ? "bg-amber-400"
                    : "bg-slate-500 animate-pulse"
                }`}
              />
              <span className="text-slate-400">
                {apiConnected === true
                  ? "Connected to FastAPI"
                  : apiConnected === false
                  ? "Disconnected"
                  : "Checking…"}
              </span>
            </div>

            <button
              onClick={onLaunchWorkspace}
              className="px-3.5 py-1.5 rounded-lg btn-gold text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-amber-500/10 cursor-pointer"
            >
              Launch Workspace
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Mobile hamburger button */}
          <div className="md:hidden flex items-center gap-2">
            {/* Compact connection dot for mobile */}
            <span
              className={`w-2 h-2 rounded-full ${
                apiConnected === true
                  ? "bg-emerald-400"
                  : apiConnected === false
                  ? "bg-amber-400"
                  : "bg-slate-500 animate-pulse"
              }`}
              title={
                apiConnected === true
                  ? "Connected to FastAPI"
                  : apiConnected === false
                  ? "Disconnected"
                  : "Checking API…"
              }
            />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white bg-slate-900/60 border border-slate-800"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0a1117] border-b border-white/10 px-4 pt-3 pb-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
            <span className="text-slate-400">Backend API:</span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiConnected === true
                    ? "bg-emerald-400"
                    : apiConnected === false
                    ? "bg-amber-400"
                    : "bg-slate-500 animate-pulse"
                }`}
              />
              {apiConnected === true
                ? "Connected"
                : apiConnected === false
                ? "Disconnected"
                : "Checking…"}
            </span>
          </div>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onLaunchWorkspace();
            }}
            className="w-full text-left py-2 text-sm font-medium text-amber-400 flex items-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            Launch Workspace
          </button>
          <button
            onClick={() => scrollTo("workflow")}
            className="block w-full text-left py-2 text-sm text-slate-300 hover:text-white"
          >
            Documentation
          </button>
          <button
            onClick={() => scrollTo("features")}
            className="block w-full text-left py-2 text-sm text-slate-300 hover:text-white"
          >
            Features
          </button>
          <button
            onClick={() => scrollTo("pipeline")}
            className="block w-full text-left py-2 text-sm text-slate-300 hover:text-white"
          >
            Pipeline Stages
          </button>
        </div>
      )}
    </nav>
  );
}
