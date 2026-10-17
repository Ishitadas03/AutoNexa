"use client";

import React, { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

interface NavbarProps {
  onLaunchWorkspace: () => void;
  apiConnected: boolean | null;
}

export default function Navbar({ onLaunchWorkspace, apiConnected }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeLink, setActiveLink] = useState<"home" | "pipeline" | "how-it-works" | "features" | "workspace">("home");

  const scrollTo = (id: string, link: "home" | "pipeline" | "how-it-works" | "features" | "workspace") => {
    setActiveLink(link);
    setMobileMenuOpen(false);
    if (id === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full bg-[#06090c]/90 backdrop-blur-md border-b border-[#14221c]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-15">
          {/* Brand Logo - Minimal geometric mark + AutoNexa */}
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none group"
            onClick={() => scrollTo("top", "home")}
          >
            <div className="w-7 h-7 relative flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <path
                  d="M16 4 L6 24 L11 24 L16 13 L21 24 L26 24 Z"
                  fill="url(#navEmeraldGrad)"
                />
                <path
                  d="M12 18 L20 18 L18 21 L14 21 Z"
                  fill="#10b981"
                />
                <defs>
                  <linearGradient id="navEmeraldGrad" x1="6" y1="4" x2="26" y2="24" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#34d399" />
                    <stop offset="1" stopColor="#059669" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="text-base font-semibold tracking-tight text-white font-sans group-hover:text-emerald-300 transition-colors">
              AutoNexa
            </span>
            <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-wider text-emerald-400/80 px-2 py-0.5 rounded-full border border-emerald-900/60 bg-[#07150f]">
              v1.0
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-7 text-xs font-medium">
            <button
              onClick={() => scrollTo("top", "home")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "home" ? "text-emerald-400 font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Home
            </button>
            <button
              onClick={() => scrollTo("pipeline", "pipeline")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "pipeline" ? "text-emerald-400 font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Pipeline
            </button>
            <button
              onClick={() => scrollTo("how-it-works", "how-it-works")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "how-it-works" ? "text-emerald-400 font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              How It Works
            </button>
            <button
              onClick={() => scrollTo("features", "features")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "features" ? "text-emerald-400 font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Features
            </button>
            <button
              onClick={() => {
                setActiveLink("workspace");
                onLaunchWorkspace();
              }}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "workspace" ? "text-emerald-400 font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Workspace
            </button>
          </div>

          {/* Right Action CTAs: Backend Status Pill + Launch Workspace Button */}
          <div className="hidden md:flex items-center gap-3">
            {/* Status Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#08120d] border border-[#14291f] text-[11px] font-mono">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  apiConnected === true
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                    : apiConnected === false
                    ? "bg-amber-400"
                    : "bg-slate-500 animate-pulse"
                }`}
              />
              <span className="text-slate-400">
                {apiConnected === true
                  ? "API Connected"
                  : apiConnected === false
                  ? "Simulation Mode"
                  : "Checking API..."}
              </span>
            </div>

            {/* Launch Workspace Button - Ramotion glowing pill */}
            <button
              onClick={onLaunchWorkspace}
              className="btn-ramotion px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile hamburger button */}
          <div className="md:hidden flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#08120d] border border-[#14291f] text-[10px] font-mono">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  apiConnected === true ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <span className="text-slate-400">
                {apiConnected === true ? "API" : "Sim"}
              </span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded text-slate-400 hover:text-white"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#14221c] bg-[#06090c] px-4 py-3 space-y-2 text-xs">
          <button
            onClick={() => scrollTo("top", "home")}
            className="block w-full text-left py-1.5 text-slate-300 hover:text-emerald-400 font-medium"
          >
            Home
          </button>
          <button
            onClick={() => scrollTo("pipeline", "pipeline")}
            className="block w-full text-left py-1.5 text-slate-400 hover:text-emerald-400 font-medium"
          >
            Pipeline
          </button>
          <button
            onClick={() => scrollTo("how-it-works", "how-it-works")}
            className="block w-full text-left py-1.5 text-slate-400 hover:text-emerald-400 font-medium"
          >
            How It Works
          </button>
          <button
            onClick={() => scrollTo("features", "features")}
            className="block w-full text-left py-1.5 text-slate-400 hover:text-emerald-400 font-medium"
          >
            Features
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onLaunchWorkspace();
            }}
            className="block w-full text-left py-1.5 text-slate-400 hover:text-emerald-400 font-medium"
          >
            Workspace
          </button>
          <div className="pt-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onLaunchWorkspace();
              }}
              className="btn-ramotion w-full py-2 text-xs flex items-center justify-center gap-1.5"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
