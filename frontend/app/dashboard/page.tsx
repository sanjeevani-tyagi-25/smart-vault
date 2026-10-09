"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield,
  ShieldAlert,
  Car,
  Home,
  User as UserIcon,
  Folder,
  Plus,
  Search,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  ArrowRight,
  ShieldX,
  FileText,
  ShieldCheck,
  Check,
  History,
  AlertCircle,
  Info,
  Calendar,
} from "lucide-react";
import {
  getDashboard,
  getCurrentAccessRequest,
  vetoAccessRequest,
  approveAccessRequest,
  createAsset,
  searchVault,
  getToken,
} from "@/lib/api";
import { DashboardData, AccessRequest, SearchResponse } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [accessReq, setAccessReq] = useState<AccessRequest | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);

  // Add Asset modal state
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetType, setNewAssetType] = useState<"vehicle" | "property" | "person" | "other">("vehicle");
  const [assetSubmitting, setAssetSubmitting] = useState(false);

  // Feedback notification toast
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const loadData = async () => {
    try {
      const [dash, req] = await Promise.all([getDashboard(), getCurrentAccessRequest()]);
      setData(dash);
      if (req && req.status === "pending") {
        setAccessReq(req);
        setCountdown(req.seconds_remaining);
      } else {
        setAccessReq(null);
      }
    } catch (err: any) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [router]);

  // Live countdown timer for active emergency requests
  useEffect(() => {
    if (!accessReq || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          loadData();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [accessReq, countdown]);

  const handleVeto = async () => {
    if (!accessReq) return;
    if (!confirm("Veto this emergency access request? The nominee will remain blocked from viewing documents.")) return;
    setActionLoading(true);
    try {
      await vetoAccessRequest(accessReq.id);
      setAccessReq(null);
      showToast("Emergency access request was successfully vetoed.", "success");
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Could not veto access request", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!accessReq) return;
    if (!confirm("Approve emergency access immediately? This will unlock authorized emergency documents.")) return;
    setActionLoading(true);
    try {
      await approveAccessRequest(accessReq.id);
      setAccessReq(null);
      showToast("Emergency access granted to nominee.", "success");
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Could not approve access request", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const res = await searchVault(searchQuery);
      setSearchResult(res);
    } catch (err: any) {
      setSearchResult({ answer: err.message || "Failed to search vault.", sources: [] });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetName.trim()) return;
    setAssetSubmitting(true);
    try {
      await createAsset(newAssetName.trim(), newAssetType);
      setShowAddAsset(false);
      setNewAssetName("");
      showToast(`Asset "${newAssetName}" registered successfully!`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Could not create asset", "error");
    } finally {
      setAssetSubmitting(false);
    }
  };

  const getAssetIcon = (type: string) => {
    switch (type) {
      case "vehicle":
        return <Car className="w-5 h-5 text-[#08C5B3]" />;
      case "property":
        return <Home className="w-5 h-5 text-emerald-400" />;
      case "person":
        return <UserIcon className="w-5 h-5 text-indigo-400" />;
      default:
        return <Folder className="w-5 h-5 text-slate-400" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-44 bg-slate-200/70 rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-28 bg-slate-200/70 rounded-2xl" />
          <div className="h-28 bg-slate-200/70 rounded-2xl" />
          <div className="h-28 bg-slate-200/70 rounded-2xl" />
          <div className="h-28 bg-slate-200/70 rounded-2xl" />
        </div>
        <div className="h-64 bg-slate-200/70 rounded-3xl" />
      </div>
    );
  }

  const expiringSoonCount = data?.expiring_soon_count ?? data?.alerts.filter((a) => a.severity === "soon" || a.severity === "urgent").length ?? 0;
  const expiredCount = data?.expired_count ?? data?.alerts.filter((a) => a.severity === "expired").length ?? 0;
  const missingCount = data?.missing_count ?? data?.assets.reduce((acc, a) => acc + (a.missing_count || 0), 0) ?? 0;

  return (
    <div className="space-y-8 pb-12">
      {/* Toast Feedback */}
      {notification && (
        <div
          className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold border transition-all animate-in slide-in-from-top-3 ${
            notification.type === "success"
              ? "bg-[#101D36] text-[#5EEAD4] border-[#08C5B3]/40 shadow-[#08C5B3]/10"
              : "bg-red-950 text-red-200 border-red-500/40"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-[#08C5B3] shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* 1. Live Emergency Access Alert Banner */}
      {accessReq && accessReq.status === "pending" && (
        <div className="p-5 sm:p-6 rounded-3xl bg-red-950/60 border-2 border-red-500 shadow-2xl shadow-red-950/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 animate-in fade-in">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-red-600/30 animate-pulse">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-400 bg-red-950 px-2.5 py-0.5 rounded-full border border-red-700/60">
                  Live Emergency Countdown
                </span>
                <span className="text-xs font-bold text-white">
                  Auto-unlocks in <span className="text-red-400 font-mono text-sm underline">{countdown}s</span>
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-200 mt-1">
                Nominee <strong className="text-white">{accessReq.nominee_name || "Emergency Nominee"}</strong> ({accessReq.nominee_relationship || "Family"}) requested access.
              </p>
              <p className="text-xs text-red-300/80 mt-0.5">
                Veto immediately to lock the vault, or approve now to grant instant emergency view.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto self-stretch md:self-auto">
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="flex-1 md:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Approve
            </button>
            <button
              onClick={handleVeto}
              disabled={actionLoading}
              className="flex-1 md:flex-none px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-md shadow-red-600/25 transition-all flex items-center justify-center gap-1.5"
            >
              <ShieldX className="w-4 h-4" /> VETO ACCESS
            </button>
          </div>
        </div>
      )}

      {/* 2. Top Stats Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Documents */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Documents</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#0B1730] mt-1">
              {data?.total_documents ?? 0}
            </p>
            <p className="text-[11px] text-teal-700 font-semibold mt-0.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-[#08C5B3]" /> AES-256 Encrypted
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-teal-50 text-[#08C5B3] flex items-center justify-center shrink-0 border border-teal-100">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Registered Assets */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Registered Assets</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#0B1730] mt-1">
              {data?.total_assets ?? 0}
            </p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">Vehicles, Homes, Family</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200">
            <Folder className="w-5 h-5" />
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expiring Soon</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-1">
              {expiringSoonCount}
            </p>
            <p className="text-[11px] text-amber-700 font-medium mt-0.5">
              {expiringSoonCount > 0 ? "Requires Renewal" : "All policies valid"}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Missing Documents Alert */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Missing Documents</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-red-600 mt-1">
              {missingCount}
            </p>
            <p className="text-[11px] text-red-700 font-medium mt-0.5">
              {missingCount > 0 ? "Legal Gaps Detected" : "Vault 100% Complete"}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-200">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Hero Security Row: Readiness Score Card + Natural Language AI Assistant */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Readiness Score Card (5 cols) */}
        <div className="lg:col-span-5 bg-[#0B1730] text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-[#1E3258] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-[#08C5B3]" /> Family Readiness Score
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200 bg-[#101D36] border border-teal-500/30 px-2.5 py-0.5 rounded-full">
                Formula Verified
              </span>
            </div>

            <div className="flex items-baseline gap-3 mt-4">
              <span className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white font-mono">
                {data?.readiness_score ?? 0}%
              </span>
              <div>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                    (data?.readiness_score ?? 0) >= 80
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-500/30"
                      : (data?.readiness_score ?? 0) >= 50
                      ? "bg-amber-950 text-amber-300 border border-amber-500/30"
                      : "bg-red-950 text-red-300 border border-red-500/30"
                  }`}
                >
                  {(data?.readiness_score ?? 0) >= 80 ? "Protected" : "Action Needed"}
                </span>
                <p className="text-[11px] text-slate-400 mt-1">Indian Household Benchmark</p>
              </div>
            </div>

            {/* Score progress bar */}
            <div className="w-full bg-[#101D36] rounded-full h-3.5 mt-4 overflow-hidden border border-[#1E3258]">
              <div
                className={`h-full rounded-full transition-all duration-700 shadow-sm ${
                  (data?.readiness_score ?? 0) >= 80
                    ? "bg-[#08C5B3]"
                    : (data?.readiness_score ?? 0) >= 50
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${Math.max(4, data?.readiness_score ?? 0)}%` }}
              />
            </div>

            {/* Transparent Score Breakdown */}
            <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-[#1E3258] text-center">
              <div className="bg-[#101D36] p-2.5 rounded-xl border border-[#1E3258]/70">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Completeness</p>
                <p className="text-sm font-bold text-white mt-1">
                  {data?.breakdown.completeness.score}<span className="text-slate-500 text-xs">/50</span>
                </p>
                <p className="text-[10px] text-teal-400 font-mono mt-0.5">50% weight</p>
              </div>
              <div className="bg-[#101D36] p-2.5 rounded-xl border border-[#1E3258]/70">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Expiry Health</p>
                <p className="text-sm font-bold text-white mt-1">
                  {data?.breakdown.expiry_health.score}<span className="text-slate-500 text-xs">/30</span>
                </p>
                <p className="text-[10px] text-amber-400 font-mono mt-0.5">30% weight</p>
              </div>
              <div className="bg-[#101D36] p-2.5 rounded-xl border border-[#1E3258]/70">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Nominee</p>
                <p className="text-sm font-bold text-white mt-1">
                  {data?.breakdown.nominee_setup.score}<span className="text-slate-500 text-xs">/20</span>
                </p>
                <p className="text-[10px] text-indigo-400 font-mono mt-0.5">20% weight</p>
              </div>
            </div>

            <p className="text-[10px] text-slate-400/80 mt-2.5 leading-relaxed">
              * Score calculation: 50 pts for mandatory documents + 30 pts for non-expired health + 20 pts for active emergency nominee.
            </p>
          </div>

          {/* Next Best Action Widget */}
          {data?.next_actions && data.next_actions.length > 0 && (
            <div className="mt-5 p-3.5 rounded-2xl bg-[#101D36] border border-[#08C5B3]/30">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-[#5EEAD4]">
                  <Sparkles className="w-3.5 h-3.5 text-[#08C5B3]" /> Recommended Action
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#08C5B3]/20 text-[#5EEAD4] text-[10px] font-mono">
                  {data.next_actions[0].estimated_improvement}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-100 mt-1.5">
                {data.next_actions[0].action}
              </p>
              {data.next_actions[0].asset_id ? (
                <Link
                  href={`/assets/${data.next_actions[0].asset_id}/upload`}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#08C5B3] hover:text-[#5EEAD4] transition-colors"
                >
                  Upload now <ArrowRight className="w-3 h-3" />
                </Link>
              ) : (
                <Link
                  href="/nominees"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#08C5B3] hover:text-[#5EEAD4] transition-colors"
                >
                  Manage Nominees <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Natural Language Vault Search (7 cols) */}
        <div className="lg:col-span-7 bg-[#101D36] text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-[#1E3258] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5EEAD4] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#08C5B3]" /> AI Document Assistant
              </span>
              <span className="text-[11px] text-slate-400">Strict vault grounding</span>
            </div>

            <h2 className="text-xl font-extrabold text-white mt-2">
              Ask anything about your family documents
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Search policies, license dates, property registration numbers, or missing checklists.
            </p>

            <form onSubmit={handleSearch} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. When does my car insurance expire?"
                  className="w-full pl-10 pr-3.5 py-3 rounded-xl bg-[#0B1730] border border-[#1E3258] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#08C5B3] focus:border-[#08C5B3] transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={searchLoading}
                className="px-5 py-3 bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] font-extrabold text-xs rounded-xl transition-all shrink-0 disabled:opacity-60 shadow-md shadow-[#08C5B3]/20 flex items-center gap-1.5"
              >
                {searchLoading ? (
                  <>Thinking...</>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Ask AI
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Question Pills */}
            <div className="flex flex-wrap gap-2 mt-3.5">
              {[
                "When does my car insurance expire?",
                "Show my PUC expiry",
                "What documents are missing for Flat 302?",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setSearchQuery(q);
                  }}
                  className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-[#0B1730] hover:bg-[#162749] text-slate-300 border border-[#1E3258] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* AI Search Result Card */}
          {searchResult && (
            <div className="mt-5 p-4 rounded-2xl bg-[#0B1730] border border-[#08C5B3]/40 text-xs animate-in fade-in">
              <div className="flex items-center gap-1.5 text-[#5EEAD4] font-bold mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#08C5B3]" /> Answer:
              </div>
              <p className="text-slate-100 font-medium leading-relaxed whitespace-pre-line">
                {searchResult.answer}
              </p>

              {searchResult.sources && searchResult.sources.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-[#1E3258] flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-bold">Citations:</span>
                  {searchResult.sources.map((src, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#101D36] text-teal-300 text-[10px] border border-teal-500/30 font-mono"
                    >
                      <FileText className="w-2.5 h-2.5" /> {src.title} ({src.field}: {src.value})
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Actionable "Needs Your Attention" Section */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-[#0B1730] text-lg">Needs Your Attention</h3>
              <p className="text-xs text-slate-500">Expiring policies and missing mandatory documents</p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            {((data?.alerts?.length || 0) + (data?.next_actions?.length || 0))} Action Items
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* A. Expiry Alerts */}
          {data?.alerts && data.alerts.length > 0 ? (
            data.alerts.map((alert) => (
              <div
                key={alert.document_id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  alert.severity === "expired"
                    ? "bg-red-50/60 border-red-200 text-red-950"
                    : alert.severity === "urgent"
                    ? "bg-red-50/40 border-red-200 text-red-950"
                    : "bg-amber-50/40 border-amber-200 text-amber-950"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-600 truncate">{alert.asset_name}</span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                        alert.severity === "expired"
                          ? "bg-red-100 text-red-800 border border-red-300"
                          : alert.severity === "urgent"
                          ? "bg-red-100 text-red-800 border border-red-300"
                          : "bg-amber-100 text-amber-800 border border-amber-300"
                      }`}
                    >
                      {alert.label}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm mt-1.5 line-clamp-1">{alert.title}</h4>
                  <p className="text-xs text-slate-600 mt-0.5">Category: {alert.doc_type}</p>
                </div>

                <div className="mt-3.5 pt-3 border-t border-slate-200/70 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-600 font-medium">Expires: {alert.expiry_date}</span>
                  {alert.renew_url ? (
                    <a
                      href={alert.renew_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-teal-800 hover:text-teal-900 bg-white px-2.5 py-1 rounded-lg border border-teal-300 shadow-2xs flex items-center gap-1 transition-colors"
                    >
                      Renew <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <Link
                      href={`/assets/${alert.asset_id}`}
                      className="text-xs font-bold text-slate-700 hover:text-slate-900 underline"
                    >
                      View
                    </Link>
                  )}
                </div>
              </div>
            ))
          ) : null}

          {/* B. Next Best Actions (Missing Documents) */}
          {data?.next_actions?.map((act, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-teal-50/50 border border-teal-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider bg-teal-100/70 px-2 py-0.5 rounded-md">
                    Missing Document
                  </span>
                  <span className="text-[10px] font-extrabold text-teal-700 font-mono">
                    {act.estimated_improvement}
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm mt-2">{act.action}</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Complete this requirement to raise your family readiness score.
                </p>
              </div>

              <div className="mt-3.5 pt-3 border-t border-teal-200/60 flex items-center justify-end">
                {act.asset_id ? (
                  <Link
                    href={`/assets/${act.asset_id}/upload`}
                    className="text-xs font-bold text-[#0B1730] bg-[#08C5B3] hover:bg-[#07AF9E] px-3 py-1.5 rounded-xl shadow-xs transition-colors flex items-center gap-1"
                  >
                    Upload Document <ArrowRight className="w-3 h-3" />
                  </Link>
                ) : (
                  <Link
                    href="/nominees"
                    className="text-xs font-bold text-[#0B1730] bg-[#08C5B3] hover:bg-[#07AF9E] px-3 py-1.5 rounded-xl shadow-xs transition-colors flex items-center gap-1"
                  >
                    Setup Nominee <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Registered Assets Section */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="font-extrabold text-[#0B1730] text-lg">Family Assets</h3>
            <p className="text-xs text-slate-500">
              Documents organized by vehicles, properties, and household members
            </p>
          </div>
          <button
            onClick={() => setShowAddAsset(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0B1730] hover:bg-[#162749] text-white text-xs font-bold rounded-xl shadow-sm transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 text-[#08C5B3]" /> Add New Asset
          </button>
        </div>

        {data?.assets.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
            <Folder className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h4 className="font-bold text-slate-800 text-sm">No assets registered yet</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Add your vehicle (Car, Bike), property (Flat, House), or family member to begin document autopilot.
            </p>
            <button
              onClick={() => setShowAddAsset(true)}
              className="mt-4 px-4 py-2.5 bg-[#08C5B3] text-[#0B1730] font-extrabold text-xs rounded-xl shadow-sm"
            >
              + Create First Asset
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {data?.assets.map((asset) => (
              <div
                key={asset.id}
                className="group p-5 sm:p-6 rounded-2xl border border-slate-200 hover:border-[#08C5B3] hover:shadow-md transition-all bg-white flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 group-hover:bg-teal-50 flex items-center justify-center transition-colors">
                      {getAssetIcon(asset.type)}
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      {asset.type}
                    </span>
                  </div>

                  <h4 className="font-bold text-base text-slate-900 mt-3 group-hover:text-teal-700 transition-colors">
                    {asset.name}
                  </h4>

                  {/* Checklist Summary */}
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {asset.checklist?.map((item) => (
                      <span
                        key={item.doc_type}
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                          item.present
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : item.optional
                            ? "bg-slate-50 text-slate-400 border border-slate-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {item.present ? (
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                        ) : item.optional ? (
                          <span className="text-[9px]">○</span>
                        ) : (
                          <XCircle className="w-2.5 h-2.5 text-red-500" />
                        )}
                        {item.doc_type}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">
                    {asset.document_count} {asset.document_count === 1 ? "document" : "documents"}
                    {asset.missing_count > 0 && (
                      <span className="text-red-600 font-bold ml-1.5">
                        • {asset.missing_count} missing
                      </span>
                    )}
                  </span>
                  <Link
                    href={`/assets/${asset.id}`}
                    className="text-[#08C5B3] hover:text-[#07AF9E] font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1"
                  >
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Recent Security Activity Trail */}
      {data?.recent_activity && data.recent_activity.length > 0 && (
        <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#08C5B3]" />
              <h3 className="font-extrabold text-[#0B1730] text-base">Recent Vault Activity</h3>
            </div>
            <Link
              href="/audit"
              className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1"
            >
              Full Audit Trail <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {data.recent_activity.map((log) => (
              <div key={log.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 truncate">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider shrink-0">
                    {log.action}
                  </span>
                  <span className="font-medium text-slate-800 truncate">{log.target}</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Asset Modal (High Contrast, Accessible Form) */}
      {showAddAsset && (
        <div className="fixed inset-0 z-50 bg-[#0B1730]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-xl text-[#0B1730]">Add New Asset</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Group documents around a vehicle, property, or family member
                </p>
              </div>
              <button
                onClick={() => setShowAddAsset(false)}
                className="text-slate-400 hover:text-slate-700 p-1 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-4 mt-5">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Asset Name *
                </label>
                <input
                  type="text"
                  required
                  value={newAssetName}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  placeholder="e.g. Honda City, Flat 302, Self, Kavita"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3] focus:border-[#08C5B3] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Asset Category *
                </label>
                <select
                  value={newAssetType}
                  onChange={(e) => setNewAssetType(e.target.value as any)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#08C5B3] focus:border-[#08C5B3] transition-all cursor-pointer"
                >
                  <option value="vehicle">Vehicle (RC, Insurance, PUC, Driving License)</option>
                  <option value="property">Property (Registry, Tax, Electricity Bill)</option>
                  <option value="person">Family Member (Aadhaar, PAN, Health Insurance)</option>
                  <option value="other">Other Asset (Financial, Electronics, Misc)</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                <Info className="w-3.5 h-3.5 text-[#08C5B3] inline mr-1 -mt-0.5" />
                Once created, Smart Vault automatically activates the legal document checklist corresponding to this category.
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAsset(false)}
                  className="flex-1 py-2.5 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assetSubmitting}
                  className="flex-1 py-2.5 text-xs font-extrabold rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] shadow-md shadow-[#08C5B3]/20 transition-all"
                >
                  {assetSubmitting ? "Saving..." : "Save Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
