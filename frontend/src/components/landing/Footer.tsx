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
    <footer className="border-t border-[#2A4E42]/60 bg-[#070D0C] text-[#AEBEB5] py-12 px-4 sm:px-6 lg:px-8 text-xs font-sans">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => scrollTo("top")}>
          <div className="w-8 h-8 relative flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <path
                d="M16 4 L6 24 L11 24 L16 13 L21 24 L26 24 Z"
                fill="url(#footerLogoEmeraldGrad)"
              />
              <path
                d="M12 18 L20 18 L18 21 L14 21 Z"
                fill="#68E7B5"
              />
              <defs>
                <linearGradient id="footerLogoEmeraldGrad" x1="6" y1="4" x2="26" y2="24" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#68E7B5" />
                  <stop offset="1" stopColor="#2A916E" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <span className="text-base font-bold text-[#F1EFE1] font-sans">AutoNexa</span>
            <span className="text-[#AEBEB5] ml-2 font-mono text-[11px]">AI Research Lab</span>
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-[#AEBEB5]">
          <button onClick={() => scrollTo("top")} className="hover:text-[#68E7B5] transition-colors cursor-pointer">
            Home
          </button>
          <button onClick={() => scrollTo("features")} className="hover:text-[#68E7B5] transition-colors cursor-pointer">
            Features
          </button>
          <button onClick={() => scrollTo("how-it-works")} className="hover:text-[#68E7B5] transition-colors cursor-pointer">
            How It Works
          </button>
          <button onClick={() => scrollTo("pipeline")} className="hover:text-[#68E7B5] transition-colors cursor-pointer">
            Documentation
          </button>
          <button onClick={onLaunchWorkspace} className="hover:text-[#68E7B5] transition-colors cursor-pointer font-semibold text-[#68E7B5]">
            Workspace
          </button>
        </div>

        {/* Status & License */}
        <div className="flex items-center gap-3 text-[11px] text-[#AEBEB5] font-mono">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                apiConnected === true
                  ? "bg-[#68E7B5] shadow-[0_0_8px_#68E7B5]"
                  : apiConnected === false
                  ? "bg-[#EDC54C]"
                  : "bg-[#AEBEB5] animate-pulse"
              }`}
            />
            <span>
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
