"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 bg-[#F2F6F9]">
      {/* Back to Home Link */}
      <div className="w-full max-w-md mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-[#64748B] hover:text-[#1D4ED8] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to AutoNexa</span>
        </Link>
      </div>

      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="w-9 h-9 relative flex items-center justify-center shrink-0">
              <svg width="32" height="32" viewBox="0 0 36 36" fill="none" className="transition-transform group-hover:scale-105">
                <path d="M7 31 L18 5 L29 31" stroke="#1D4ED8" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="11" y="20" width="14" height="3.6" rx="1.8" fill="#0F172A" />
              </svg>
            </div>
            <span className="text-2xl font-bold tracking-tight text-[#0F172A] font-sans group-hover:text-[#1D4ED8] transition-colors">
              AutoNexa
            </span>
          </Link>
          <h2 className="mt-4 text-xl font-bold text-[#0F172A] tracking-tight">{title}</h2>
          <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p>
        </div>

        {/* Auth Card Container */}
        <div className="bg-white border border-[#E2E8F0] shadow-sm rounded-2xl p-6 sm:p-8">
          {children}
        </div>

        {/* Footer Links */}
        {footer && <div className="mt-6 text-center text-xs text-[#64748B]">{footer}</div>}
      </div>
    </div>
  );
}

