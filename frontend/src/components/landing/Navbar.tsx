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
    <nav className="sticky top-0 z-50 w-full bg-[#021414]/95 backdrop-blur-md border-b border-[#0E4A40]/70">
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
                  stroke="#4EECBF"
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
                  fill="#4EECBF"
                />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-[#F1EFE1] font-sans group-hover:text-[#4EECBF] transition-colors">
              AutoNexa
            </span>
          </div>

          {/* Center Navigation Links (Matching Reference Concept) */}
          <div className="hidden md:flex items-center gap-9 text-xs sm:text-sm font-medium">
            <button
              onClick={() => scrollTo("top", "home")}
              className={`relative py-1 cursor-pointer transition-colors ${
                activeLink === "home" ? "text-[#F1EFE1] font-semibold" : "text-[#9AB3A8] hover:text-[#F1EFE1]"
              }`}
            >
              <span>Home</span>
              {activeLink === "home" && (
                <span className="absolute -bottom-1.5 left-0 w-full h-[2.5px] bg-[#4EECBF] rounded-full shadow-[0_0_8px_#4EECBF]" />
              )}
            </button>
            <button
              onClick={() => scrollTo("features", "features")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "features" ? "text-[#4EECBF] font-semibold" : "text-[#9AB3A8] hover:text-[#F1EFE1]"
              }`}
            >
              Features
            </button>
            <button
              onClick={() => scrollTo("how-it-works", "how-it-works")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "how-it-works" ? "text-[#4EECBF] font-semibold" : "text-[#9AB3A8] hover:text-[#F1EFE1]"
              }`}
            >
              How It Works
            </button>
            <button
              onClick={() => scrollTo("pipeline", "docs")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "docs" ? "text-[#4EECBF] font-semibold" : "text-[#9AB3A8] hover:text-[#F1EFE1]"
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
                activeLink === "workspace" ? "text-[#4EECBF] font-semibold" : "text-[#9AB3A8] hover:text-[#F1EFE1]"
              }`}
            >
              Workspace
            </button>
          </div>

          {/* Right Action CTAs: Backend Status Pill + Launch Workspace Button */}
          <div className="hidden md:flex items-center gap-3.5">
            {/* Status Pill */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#031C18]/90 border border-[#0E4A40] text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiConnected === true
                    ? "bg-[#4EECBF] shadow-[0_0_8px_#4EECBF]"
                    : apiConnected === false
                    ? "bg-[#EDC54C]"
                    : "bg-[#4EECBF] shadow-[0_0_8px_#4EECBF]"
                }`}
              />
              <span className="text-[#E2EDE8] text-xs font-sans">
                {apiConnected === false ? "Simulation Mode" : "API Connected"}
              </span>
            </div>

            {/* Launch Workspace Button - Mint pill button from reference */}
            <button
              onClick={onLaunchWorkspace}
              className="px-5 py-2 rounded-full bg-[#4EECBF] hover:bg-[#3dd8ab] text-[#051512] font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-[0_0_20px_rgba(78,236,191,0.35)] transition-all cursor-pointer"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.4]" />
            </button>
          </div>

          {/* Mobile hamburger button */}
          <div className="md:hidden flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0D1815] border border-[#2A4E42] text-[10px] font-mono">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  apiConnected === true ? "bg-[#68E7B5]" : "bg-[#EDC54C]"
                }`}
              />
              <span className="text-[#AEBEB5]">
                {apiConnected === true ? "Live" : "Sim"}
              </span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-[#AEBEB5] hover:text-[#F1EFE1] bg-[#0D1815] border border-[#2A4E42]"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#2A4E42] bg-[#070D0C] px-5 py-4 space-y-3 text-sm">
          <button
            onClick={() => scrollTo("top", "home")}
            className="block w-full text-left py-1.5 text-[#F1EFE1] hover:text-[#68E7B5] font-medium"
          >
            Home
          </button>
          <button
            onClick={() => scrollTo("features", "features")}
            className="block w-full text-left py-1.5 text-[#AEBEB5] hover:text-[#68E7B5] font-medium"
          >
            Features
          </button>
          <button
            onClick={() => scrollTo("how-it-works", "how-it-works")}
            className="block w-full text-left py-1.5 text-[#AEBEB5] hover:text-[#68E7B5] font-medium"
          >
            How It Works
          </button>
          <button
            onClick={() => scrollTo("pipeline", "docs")}
            className="block w-full text-left py-1.5 text-[#AEBEB5] hover:text-[#68E7B5] font-medium"
          >
            Documentation
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onLaunchWorkspace();
            }}
            className="block w-full text-left py-1.5 text-[#AEBEB5] hover:text-[#68E7B5] font-medium"
          >
            Workspace
          </button>
          <div className="pt-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onLaunchWorkspace();
              }}
              className="btn-autonexa-primary w-full py-2.5 text-xs flex items-center justify-center gap-2"
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
