"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Lock, ArrowRight, UserCheck, KeyRound, Mail, User, ShieldCheck } from "lucide-react";
import { loginUser, registerUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) throw new Error("Please enter your name");
        await registerUser(name.trim(), email.trim(), password);
      } else {
        await loginUser(email.trim(), password);
      }
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setIsRegister(false);
    setEmail("demo@smartvault.app");
    setPassword("demo1234");
    setError(null);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-8">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-300/40 border border-slate-200/80 p-7 sm:p-9">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#0B1730] text-[#08C5B3] mx-auto flex items-center justify-center shadow-lg shadow-[#0B1730]/20 mb-3 border border-[#1E3258]">
            <Shield className="w-7 h-7 text-[#08C5B3]" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#0B1730] tracking-tight">Smart Vault</h1>
          <p className="text-xs text-slate-500 mt-1">
            Family Document Management & Emergency Safeguard
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">
            <Lock className="w-3 h-3 text-[#08C5B3]" /> AES-256-GCM Encrypted Storage
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-6 border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              !isRegister ? "bg-white text-[#0B1730] shadow-xs" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              isRegister ? "bg-white text-[#0B1730] shadow-xs" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Create Vault
          </button>
        </div>

        {/* Quick Demo Login Shortcut */}
        {!isRegister && (
          <div className="mb-5 p-3 rounded-2xl bg-teal-50/70 border border-teal-200 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-teal-900">Hackathon Demo Credentials</p>
              <p className="text-[10px] text-teal-700 font-mono">demo@smartvault.app / demo1234</p>
            </div>
            <button
              type="button"
              onClick={fillDemoCredentials}
              className="text-xs font-bold bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] px-3 py-1.5 rounded-xl transition-colors shadow-2xs flex items-center gap-1"
            >
              <UserCheck className="w-3.5 h-3.5" /> 1-Click Fill
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">Full Name *</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3] focus:border-[#08C5B3] transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">Email Address *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3] focus:border-[#08C5B3] transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">Password *</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3] focus:border-[#08C5B3] transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-[#0B1730] hover:bg-[#162749] text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 group disabled:opacity-70"
          >
            {loading ? (
              <span className="inline-block animate-spin mr-1">⟳</span>
            ) : null}
            {isRegister ? "Create My Vault" : "Unlock Vault"}
            <ArrowRight className="w-4 h-4 text-[#08C5B3] group-hover:translate-x-0.5 transition-transform" />
          </button>
        </form>
      </div>
    </div>
  );
}
