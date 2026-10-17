"use client";

import React from "react";

interface FooterProps {
  onLaunchWorkspace: () => void;
  apiConnected: boolean | null;
}

export default function Footer({ onLaunchWorkspace, apiConnected }: FooterProps) {
  const scrollTo = (id: string) => {
    if (id === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="border-t border-[#14221c] bg-[#05080b] text-slate-400 py-10 px-4 sm:px-6 lg:px-8 text-xs">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => scrollTo("top")}>
          <div className="w-7 h-7 relative flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path
                d="M16 4 L5 24 L10 24 L16 12 L22 24 L27 24 Z"
                fill="url(#footerLogoEmeraldGrad)"
              />
              <path
                d="M11 18 L21 18 L19 22 L13 22 Z"
                fill="#10b981"
              />
              <defs>
                <linearGradient id="footerLogoEmeraldGrad" x1="5" y1="4" x2="27" y2="24" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#34d399" />
                  <stop offset="1" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <span className="text-sm font-bold text-white font-sans">AutoNexa</span>
            <span className="text-emerald-400/80 ml-2 font-mono text-[11px]">AI Research Lab</span>
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-slate-400">
          <button onClick={() => scrollTo("top")} className="hover:text-emerald-400 transition-colors cursor-pointer">
            Home
          </button>
          <button onClick={() => scrollTo("pipeline")} className="hover:text-emerald-400 transition-colors cursor-pointer">
            Pipeline
          </button>
          <button onClick={() => scrollTo("how-it-works")} className="hover:text-emerald-400 transition-colors cursor-pointer">
            How It Works
          </button>
          <button onClick={() => scrollTo("features")} className="hover:text-emerald-400 transition-colors cursor-pointer">
            Features
          </button>
          <button onClick={onLaunchWorkspace} className="hover:text-emerald-400 transition-colors cursor-pointer">
            Workspace
          </button>
        </div>

        {/* Status & License */}
        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                apiConnected === true
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : apiConnected === false
                  ? "bg-amber-400"
                  : "bg-slate-500 animate-pulse"
              }`}
            />
            {apiConnected === true
              ? "API Connected"
              : apiConnected === false
              ? "Simulation Mode"
              : "Checking API…"}
          </span>
          <span>•</span>
          <span>© 2026 AutoNexa</span>
        </div>
      </div>
    </footer>
  );
}
