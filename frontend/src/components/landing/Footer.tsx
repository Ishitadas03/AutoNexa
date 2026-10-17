"use client";

import React from "react";
import { Sparkles } from "lucide-react";

interface FooterProps {
  onLaunchWorkspace: () => void;
  apiConnected: boolean | null;
}

export default function Footer({ onLaunchWorkspace, apiConnected }: FooterProps) {
  return (
    <footer className="border-t border-white/5 bg-[#060a0e] text-slate-400 py-10 px-4 sm:px-6 lg:px-8 text-xs">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="text-sm font-bold text-white font-mono">AUTONEXA</span>
            <span className="text-slate-500 ml-2">AI Research Lab</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-slate-400">
          <button onClick={onLaunchWorkspace} className="hover:text-amber-400 transition-colors cursor-pointer">
            Workspace
          </button>
          <a href="#workflow" className="hover:text-white transition-colors">
            Workflow
          </a>
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#pipeline" className="hover:text-white transition-colors">
            Pipeline
          </a>
          <a href="#architecture" className="hover:text-white transition-colors">
            Architecture
          </a>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
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
              ? "FastAPI Connected"
              : apiConnected === false
              ? "FastAPI Disconnected"
              : "Checking API…"}
          </span>
          <span>•</span>
          <span>Apache 2.0 License</span>
        </div>
      </div>
    </footer>
  );
}
