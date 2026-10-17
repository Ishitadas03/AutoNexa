"use client";

import React, { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

interface NavbarProps {
  onLaunchWorkspace: () => void;
  apiConnected: boolean | null;
}

export default function Navbar({ onLaunchWorkspace, apiConnected }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeLink, setActiveLink] = useState<"home" | "features" | "how-it-works" | "docs" | "workspace">("home");

  const scrollTo = (id: string, link: "home" | "features" | "how-it-works" | "docs" | "workspace") => {
    setActiveLink(link);
    setMobileMenuOpen(false);
    if (id === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full bg-[#F2F6F9]/95 backdrop-blur-md border-b border-[#E2E8F0]">
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center justify-between h-18">
          
          {/* Brand Logo - Geometric open delta A mark + AutoNexa matching reference */}
          <div
            className="flex items-center gap-3 cursor-pointer select-none group"
            onClick={() => scrollTo("top", "home")}
          >
            <div className="w-8 h-8 relative flex items-center justify-center shrink-0">
              <svg width="30" height="30" viewBox="0 0 36 36" fill="none" className="transition-transform group-hover:scale-105">
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
            <span className="text-xl font-bold tracking-tight text-[#0F172A] font-sans group-hover:text-[#1D4ED8] transition-colors">
              AutoNexa
            </span>
          </div>

          {/* Center Navigation Links (Matching Reference Concept) */}
          <div className="hidden md:flex items-center gap-9 text-xs sm:text-sm font-medium">
            <button
              onClick={() => scrollTo("top", "home")}
              className={`relative py-1 cursor-pointer transition-colors ${
                activeLink === "home" ? "text-[#0F172A] font-semibold" : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              <span>Home</span>
              {activeLink === "home" && (
                <span className="absolute -bottom-1.5 left-0 w-full h-[2.5px] bg-[#1D4ED8] rounded-full shadow-[0_0_8px_rgba(29,78,216,0.4)]" />
              )}
            </button>
            <button
              onClick={() => scrollTo("features", "features")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "features" ? "text-[#1D4ED8] font-semibold" : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              Features
            </button>
            <button
              onClick={() => scrollTo("how-it-works", "how-it-works")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "how-it-works" ? "text-[#1D4ED8] font-semibold" : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              How It Works
            </button>
            <button
              onClick={() => scrollTo("pipeline", "docs")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "docs" ? "text-[#1D4ED8] font-semibold" : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              Documentation
            </button>
            <button
              onClick={() => {
                setActiveLink("workspace");
                onLaunchWorkspace();
              }}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "workspace" ? "text-[#1D4ED8] font-semibold" : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              Workspace
            </button>
          </div>

          {/* Right Action CTAs: Backend Status Pill + Launch Workspace Button */}
          <div className="hidden md:flex items-center gap-3.5">
            {/* Status Pill */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#DCFCE7] border border-[#86EFAC] text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiConnected === true
                    ? "bg-[#10B981] shadow-[0_0_8px_#10B981]"
                    : apiConnected === false
                    ? "bg-[#F59E0B]"
                    : "bg-[#10B981] shadow-[0_0_8px_#10B981]"
                }`}
              />
              <span className="text-[#15803D] text-xs font-sans font-medium">
                {apiConnected === false ? "Simulation Mode" : "API Connected"}
              </span>
            </div>

            {/* Launch Workspace Button - Cobalt pill button from reference */}
            <button
              onClick={onLaunchWorkspace}
              className="px-5 py-2.5 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-[0_4px_14px_rgba(29,78,216,0.35)] transition-all cursor-pointer"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.4]" />
            </button>
          </div>

          {/* Mobile hamburger button */}
          <div className="md:hidden flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#DCFCE7] border border-[#86EFAC] text-[10px] font-mono">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  apiConnected === true ? "bg-[#10B981]" : "bg-[#F59E0B]"
                }`}
              />
              <span className="text-[#15803D] font-medium">
                {apiConnected === true ? "Live" : "Sim"}
              </span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-[#475569] hover:text-[#0F172A] bg-white border border-[#CBD5E1]"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#CBD5E1] bg-white px-5 py-4 space-y-3 text-sm shadow-xl">
          <button
            onClick={() => scrollTo("top", "home")}
            className="block w-full text-left py-1.5 text-[#0F172A] hover:text-[#1D4ED8] font-medium"
          >
            Home
          </button>
          <button
            onClick={() => scrollTo("features", "features")}
            className="block w-full text-left py-1.5 text-[#475569] hover:text-[#1D4ED8] font-medium"
          >
            Features
          </button>
          <button
            onClick={() => scrollTo("how-it-works", "how-it-works")}
            className="block w-full text-left py-1.5 text-[#475569] hover:text-[#1D4ED8] font-medium"
          >
            How It Works
          </button>
          <button
            onClick={() => scrollTo("pipeline", "docs")}
            className="block w-full text-left py-1.5 text-[#475569] hover:text-[#1D4ED8] font-medium"
          >
            Documentation
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onLaunchWorkspace();
            }}
            className="block w-full text-left py-1.5 text-[#475569] hover:text-[#1D4ED8] font-medium"
          >
            Workspace
          </button>
          <div className="pt-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onLaunchWorkspace();
              }}
              className="w-full py-2.5 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(29,78,216,0.35)]"
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
