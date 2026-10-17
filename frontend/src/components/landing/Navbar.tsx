"use client";

import React, { useState } from "react";
import { Sparkles, Database, Menu, X, ArrowRight, Cpu, Activity } from "lucide-react";

interface NavbarProps {
  onLaunchWorkspace: () => void;
  apiConnected: boolean | null;
}

export default function Navbar({ onLaunchWorkspace, apiConnected }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-[#080d11]/85 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Sparkles className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white font-mono">AUTONEXA</span>
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  AI Lab
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium tracking-wide">Automated Machine Learning</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            <button
              onClick={() => onLaunchWorkspace()}
              className="text-sm text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Cpu className="w-4 h-4 text-amber-400" />
              Workspace
            </button>
            <a href="#features" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
              Features
            </a>
            <a href="#workflow" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
              Workflow
            </a>
            <a href="#architecture" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
              Architecture
            </a>
          </div>

          {/* Action CTAs & Status */}
          <div className="hidden md:flex items-center gap-4">
            {/* Backend connection pill */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiConnected === true
                    ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400"
                    : apiConnected === false
                    ? "bg-amber-400"
                    : "bg-slate-500 animate-pulse"
                }`}
              />
              <span className="text-[11px]">
                {apiConnected === true ? "FastAPI Connected" : apiConnected === false ? "Local / Demo Mode" : "Checking API..."}
              </span>
            </div>

            <button
              onClick={onLaunchWorkspace}
              className="px-4 py-2 rounded-lg btn-gold text-xs font-semibold flex items-center gap-2 shadow-lg shadow-amber-500/10 cursor-pointer"
            >
              Launch Workspace
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile hamburger button */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white bg-slate-900/60 border border-slate-800"
              aria-label="Toggle menu"
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
            <span className="text-slate-400">Backend API Status:</span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className={`w-2 h-2 rounded-full ${apiConnected ? "bg-emerald-400" : "bg-amber-400"}`} />
              {apiConnected ? "FastAPI Connected" : "Local / Demo Mode"}
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
            Launch AutoML Workspace
          </button>
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm text-slate-300 hover:text-white"
          >
            Features & Capabilities
          </a>
          <a
            href="#workflow"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm text-slate-300 hover:text-white"
          >
            Interactive Workflow
          </a>
          <a
            href="#architecture"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm text-slate-300 hover:text-white"
          >
            System Architecture
          </a>
        </div>
      )}
    </nav>
  );
}
