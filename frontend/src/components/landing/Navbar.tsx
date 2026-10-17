"use client";

import React, { useState } from "react";
import { ArrowRight, Menu, X, CheckCircle2 } from "lucide-react";

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
    <nav className="sticky top-0 z-50 w-full bg-[#070D0C]/90 backdrop-blur-md border-b border-[#2A4E42]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo - Geometric mark + AutoNexa */}
          <div
            className="flex items-center gap-3 cursor-pointer select-none group"
            onClick={() => scrollTo("top", "home")}
          >
            <div className="w-8 h-8 relative flex items-center justify-center">
              <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
                <path
                  d="M16 4 L6 24 L11 24 L16 13 L21 24 L26 24 Z"
                  fill="url(#navEmeraldGrad)"
                />
                <path
                  d="M12 18 L20 18 L18 21 L14 21 Z"
                  fill="#68E7B5"
                />
                <defs>
                  <linearGradient id="navEmeraldGrad" x1="6" y1="4" x2="26" y2="24" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#68E7B5" />
                    <stop offset="1" stopColor="#2A916E" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-[#F1EFE1] font-sans group-hover:text-[#68E7B5] transition-colors">
              AutoNexa
            </span>
          </div>

          {/* Center Navigation Links (Matching Reference Concept) */}
          <div className="hidden md:flex items-center gap-8 text-xs sm:text-sm font-medium">
            <button
              onClick={() => scrollTo("top", "home")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "home" ? "text-[#68E7B5] font-semibold" : "text-[#AEBEB5] hover:text-[#F1EFE1]"
              }`}
            >
              Home
            </button>
            <button
              onClick={() => scrollTo("features", "features")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "features" ? "text-[#68E7B5] font-semibold" : "text-[#AEBEB5] hover:text-[#F1EFE1]"
              }`}
            >
              Features
            </button>
            <button
              onClick={() => scrollTo("how-it-works", "how-it-works")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "how-it-works" ? "text-[#68E7B5] font-semibold" : "text-[#AEBEB5] hover:text-[#F1EFE1]"
              }`}
            >
              How It Works
            </button>
            <button
              onClick={() => scrollTo("pipeline", "docs")}
              className={`transition-colors py-1 cursor-pointer ${
                activeLink === "docs" ? "text-[#68E7B5] font-semibold" : "text-[#AEBEB5] hover:text-[#F1EFE1]"
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
                activeLink === "workspace" ? "text-[#68E7B5] font-semibold" : "text-[#AEBEB5] hover:text-[#F1EFE1]"
              }`}
            >
              Workspace
            </button>
          </div>

          {/* Right Action CTAs: Backend Status Pill + Launch Workspace Button */}
          <div className="hidden md:flex items-center gap-3.5">
            {/* Status Pill */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1815] border border-[#2A4E42] text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiConnected === true
                    ? "bg-[#68E7B5] shadow-[0_0_8px_#68E7B5]"
                    : apiConnected === false
                    ? "bg-[#EDC54C]"
                    : "bg-[#AEBEB5] animate-pulse"
                }`}
              />
              <span className="text-[#AEBEB5]">
                {apiConnected === true
                  ? "API Connected"
                  : apiConnected === false
                  ? "Simulation Mode"
                  : "Checking API..."}
              </span>
            </div>

            {/* Launch Workspace Button - Mint pill button from reference */}
            <button
              onClick={onLaunchWorkspace}
              className="btn-autonexa-primary px-5 py-2 text-xs sm:text-sm flex items-center gap-2 cursor-pointer font-semibold"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.2]" />
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
