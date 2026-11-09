"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";
import AuthCard from "@/components/auth/AuthCard";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setError(null);
    setLoading(true);
    try {
      const res = await api.forgotPassword({ email: email.trim() });
      setSuccess(res.message);
    } catch (err: any) {
      setError(err?.detail || err?.message || "Failed to process password reset request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Reset AutoNexa Password"
      subtitle="Enter your email address to receive password recovery instructions"
      footer={
        <p>
          Remembered your password?{" "}
          <Link href="/login" className="font-semibold text-[#1D4ED8] hover:underline">
            Back to Sign In
          </Link>
        </p>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {success ? (
        <div className="text-center py-4 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#0F172A]">Instructions Dispatched</h3>
          <p className="text-xs text-[#475569]">{success}</p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-block px-5 py-2 rounded-full bg-slate-100 text-[#0F172A] text-xs font-semibold hover:bg-slate-200 transition-colors"
            >
              Return to Sign In
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">Account Email</label>
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
            <p className="text-[10px] text-[#64748B] mt-1">
              If an active account matches this address, we will send a password reset link.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-slate-300 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer mt-2"
          >
            {loading ? "Sending Instructions…" : "Send Reset Instructions"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

