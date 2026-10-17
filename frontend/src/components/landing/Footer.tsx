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
    <footer className="border-t border-[#CBD5E1] bg-[#F2F6F9] text-[#64748B] py-12 px-4 sm:px-6 lg:px-12 text-xs font-sans">
      <div className="max-w-[1520px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-3 cursor-pointer select-none group" onClick={() => scrollTo("top")}>
          <div className="w-8 h-8 relative flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none" className="transition-transform group-hover:scale-105">
              <path
                d="M7 31 L18 5 L29 31"
                stroke="#1D4ED8"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                x="11"
                y="20"
                width="14"
                height="3.6"
                rx="1.8"
                fill="#0F172A"
              />
            </svg>
          </div>
          <div>
            <span className="text-base font-bold text-[#0F172A] font-sans group-hover:text-[#1D4ED8] transition-colors">
              AutoNexa
            </span>
            <span className="text-[#64748B] ml-2 font-mono text-[11px]">AI Research Lab</span>
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex flex-wrap items-center justify-center gap-7 text-[#475569] font-medium text-xs sm:text-sm">
          <button onClick={() => scrollTo("top")} className="hover:text-[#1D4ED8] transition-colors cursor-pointer">
            Home
          </button>
          <button onClick={() => scrollTo("pipeline")} className="hover:text-[#1D4ED8] transition-colors cursor-pointer">
            Pipeline
          </button>
          <button onClick={() => scrollTo("how-it-works")} className="hover:text-[#1D4ED8] transition-colors cursor-pointer">
            How It Works
          </button>
          <button onClick={() => scrollTo("features")} className="hover:text-[#1D4ED8] transition-colors cursor-pointer">
            Features
          </button>
          <button onClick={onLaunchWorkspace} className="hover:text-[#1D4ED8] transition-colors cursor-pointer font-semibold text-[#1D4ED8]">
            Workspace
          </button>
        </div>

        {/* Status & License */}
        <div className="flex items-center gap-3 text-[11px] text-[#64748B] font-mono">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] shadow-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                apiConnected === true
                  ? "bg-[#10B981] shadow-[0_0_8px_#10B981]"
                  : apiConnected === false
                  ? "bg-[#F59E0B]"
                  : "bg-[#94A3B8] animate-pulse"
              }`}
            />
            <span className="text-[#15803D] font-medium">
              {apiConnected === true
                ? "API Connected"
                : apiConnected === false
                ? "Simulation Mode"
                : "Checking API…"}
            </span>
          </span>
          <span>•</span>
          <span>© 2026 AutoNexa</span>
        </div>

      </div>
    </footer>
  );
}
