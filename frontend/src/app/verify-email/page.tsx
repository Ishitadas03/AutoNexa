"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Mail, Send } from "lucide-react";
import AuthCard from "@/components/auth/AuthCard";
import { api } from "@/lib/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [token, setToken] = useState(tokenFromUrl);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resend state
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (tokenFromUrl && !verified) {
      setToken(tokenFromUrl);
    }
  }, [tokenFromUrl, verified]);

  const handleVerify = async (tokenToVerify: string) => {
    if (!tokenToVerify.trim()) {
      setError("Please enter a valid verification token.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await api.verifyEmail({ token: tokenToVerify.trim() });
      setVerified(true);
    } catch (err: any) {
      setError(err?.detail || err?.message || "Invalid or expired verification link.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;

    setResendLoading(true);
    setResendMessage(null);
    try {
      const res = await api.resendVerification({ email: resendEmail.trim() });
      setResendMessage(res.message);
    } catch (err: any) {
      setResendMessage(err?.detail || "If an account exists, a verification email has been sent.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <AuthCard
      title="Verify Email Address"
      subtitle="Activate your AutoNexa account to enable session login"
      footer={
        <p>
          Need to sign in?{" "}
          <Link href="/login" className="font-semibold text-[#1D4ED8] hover:underline">
            Back to Sign In
          </Link>
        </p>
      }
    >
      {verified ? (
        <div className="text-center py-4 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#0F172A]">Account Verified</h3>
          <p className="text-xs text-[#475569]">
            Your email address has been successfully confirmed. You may now sign in to your AutoNexa workspace.
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-block px-5 py-2.5 rounded-full bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-[#1E40AF] transition-colors"
            >
              Sign In Now
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {tokenFromUrl ? (
            <div className="text-center py-2 space-y-3">
              <p className="text-xs text-[#475569]">
                Click the button below to confirm your email verification link:
              </p>
              <button
                onClick={() => handleVerify(tokenFromUrl)}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-slate-300 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
              >
                {loading ? "Verifying…" : "Confirm Verification Link"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Verification Token
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste token from verification email"
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 border border-[#CBD5E1] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] text-[#0F172A] font-mono"
                />
              </div>

              <button
                onClick={() => handleVerify(token)}
                disabled={loading || !token.trim()}
                className="w-full py-2.5 px-4 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:bg-slate-300 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer"
              >
                {loading ? "Verifying…" : "Verify Account"}
              </button>
            </div>
          )}

          {/* Resend Verification Section */}
          <div className="pt-4 border-t border-[#E2E8F0]">
            <h4 className="text-xs font-bold text-[#0F172A] mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <span>Did not receive a verification link?</span>
            </h4>
            <p className="text-[11px] text-[#64748B] mb-2.5">
              Enter your registration email to request a new verification token.
            </p>

            {resendMessage && (
              <div className="mb-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-[#334155]">
                {resendMessage}
              </div>
            )}

            <form onSubmit={handleResend} className="flex gap-2">
              <input
                type="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="name@university.edu"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-slate-50 border border-[#CBD5E1] focus:bg-white focus:outline-none text-[#0F172A]"
              />
              <button
                type="submit"
                disabled={resendLoading}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F172A] font-semibold text-xs flex items-center gap-1 transition-colors shrink-0"
              >
                <Send className="w-3 h-3" />
                <span>{resendLoading ? "Sending…" : "Resend"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F2F6F9]">
          <div className="p-4 rounded-xl bg-white border border-[#CBD5E1] text-xs font-mono">
            Loading verification portal…
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

