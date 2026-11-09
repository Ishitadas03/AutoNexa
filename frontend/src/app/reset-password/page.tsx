"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Lock } from "lucide-react";
import AuthCard from "@/components/auth/AuthCard";
import { api } from "@/lib/api";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError("Password reset token is missing.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.resetPassword({
        token: token.trim(),
        new_password: newPassword,
      });
      setSuccess(res.message);
    } catch (err: any) {
      setError(err?.detail || err?.message || "Invalid or expired password reset token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Set New Password"
      subtitle="Choose a secure password for your AutoNexa account"
      footer={
        <p>
          Remember your password?{" "}
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
          <h3 className="text-sm font-bold text-[#0F172A]">Password Successfully Updated</h3>
          <p className="text-xs text-[#475569]">{success}</p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-block px-5 py-2.5 rounded-full bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] transition-colors"
            >
              Sign In With New Password
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {!tokenFromUrl && (
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                Password Reset Token
              </label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token from reset email"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-[#CBD5E1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] text-[#0F172A] font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">New Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-[#CBD5E1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] text-[#0F172A]"
              />
            </div>
            <p className="text-[10px] text-[#64748B] mt-1">Must be at least 8 characters with a letter and number.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1">Confirm New Password</label>
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
            {loading ? "Updating Password…" : "Update Password"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F2F6F9]">
          <div className="p-4 rounded-xl bg-white border border-[#CBD5E1] text-xs font-mono">
            Loading reset portal…
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

