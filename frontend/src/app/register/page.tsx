"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Lock, Mail, User, ShieldAlert } from "lucide-react";
import AuthCard from "@/components/auth/AuthCard";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.register({ name, email, password });
      setSuccessMessage(res.message);
    } catch (err: any) {
      setError(err?.detail || err?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create AutoNexa Account"
      subtitle="Establish your user identity for the AutoML Research Suite"
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#1D4ED8] hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {/* Phase 17F / 17G Security Architecture Notice */}
      <div className="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2 font-sans">
        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-[11px] leading-relaxed">
          <strong>Security Note:</strong> AutoNexa is currently evaluating multi-tenant isolation.
          Self-registration is managed under the Phase 17F identity foundation.
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {successMessage ? (
        <div className="text-center py-4 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#0F172A]">Check your inbox</h3>
          <p className="text-xs text-[#475569]">{successMessage}</p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-block px-5 py-2 rounded-full bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] transition-colors"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Jane Doe"
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-[#CBD5E1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] text-[#0F172A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@university.edu"
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-[#CBD5E1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] text-[#0F172A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-[#CBD5E1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] text-[#0F172A]"
              />
            </div>
            <p className="text-[10px] text-[#64748B] mt-1">Must be at least 8 characters with a letter and number.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">Confirm Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-[#CBD5E1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] text-[#0F172A]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-slate-300 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer mt-2"
          >
            {loading ? "Registering…" : "Create Account"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
