"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
} from "lucide-react";
import {
  getDashboard,
  getCurrentAccessRequest,
  vetoAccessRequest,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);

  // New asset modal state
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetType, setNewAssetType] = useState("vehicle");
  const [assetSubmitting, setAssetSubmitting] = useState(false);

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
      console.error(err);
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

  // Live countdown timer for emergency access
  useEffect(() => {
    if (!accessReq || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          loadData(); // reload on unlock
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [accessReq, countdown]);

  const handleVeto = async () => {
    if (!accessReq) return;
    try {
      await vetoAccessRequest(accessReq.id);
      setAccessReq(null);
      loadData();
    } catch (err: any) {
      alert(err.message || "Could not veto access request");
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
      await createAsset(newAssetName, newAssetType);
      setShowAddAsset(false);
      setNewAssetName("");
      loadData();
    } catch (err: any) {
      alert(err.message || "Could not create asset");
    } finally {
      setAssetSubmitting(false);
    }
  };

  const getAssetIcon = (type: string) => {
    switch (type) {
      case "vehicle":
        return <Car className="w-5 h-5 text-blue-500" />;
      case "property":
        return <Home className="w-5 h-5 text-emerald-500" />;
      case "person":
        return <UserIcon className="w-5 h-5 text-purple-500" />;
      default:
        return <Folder className="w-5 h-5 text-slate-500" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-slate-200 rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-slate-200 rounded-3xl" />
          <div className="h-64 bg-slate-200 rounded-3xl md:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Emergency Access Banner (Live countdown & VETO button) */}
      {accessReq && accessReq.status === "pending" && (
        <div className="p-4 sm:p-5 rounded-3xl bg-red-50 border-2 border-red-300 shadow-lg shadow-red-100 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 animate-bounce">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                  Emergency Access Alert
                </span>
                <span className="text-xs font-semibold text-slate-700">
                  Auto-unlock in <span className="text-red-700 font-bold text-sm">{countdown}s</span>
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">
                Nominee <span className="font-bold">{accessReq.nominee_name || "Emergency Contact"}</span> requested access
              </p>
            </div>
          </div>
          <button
            onClick={handleVeto}
            className="w-full sm:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            <ShieldX className="w-4 h-4" /> VETO ACCESS
          </button>
        </div>
      )}

      {/* 2. Top Overview: Readiness Score & Natural Search */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Readiness Score Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Family Readiness Score</span>
              <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                Autopilot Active
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-4">
              <span className="text-5xl font-extrabold tracking-tight text-[#0B1F3A]">
                {data?.readiness_score ?? 0}%
              </span>
              <span className="text-xs font-medium text-slate-500">
                {data?.readiness_score && data.readiness_score >= 80
                  ? "Vault Protected"
                  : "Attention Recommended"}
              </span>
            </div>

            {/* Score progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-3 mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  (data?.readiness_score ?? 0) >= 80
                    ? "bg-teal-500"
                    : (data?.readiness_score ?? 0) >= 50
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${data?.readiness_score ?? 0}%` }}
              />
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 text-center">
              <div>
                <p className="text-[10px] text-slate-500 font-medium">Completeness</p>
                <p className="text-xs font-bold text-slate-900 mt-0.5">{data?.breakdown.completeness.score}/50</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-medium">Expiry Health</p>
                <p className="text-xs font-bold text-slate-900 mt-0.5">{data?.breakdown.expiry_health.score}/30</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-medium">Nominee</p>
                <p className="text-xs font-bold text-slate-900 mt-0.5">{data?.breakdown.nominee_setup.score}/20</p>
              </div>
            </div>
          </div>

          {/* Next Best Action */}
          {data?.next_actions && data.next_actions.length > 0 && (
            <div className="mt-4 p-3 rounded-2xl bg-teal-50/80 border border-teal-100">
              <div className="flex items-center justify-between text-[11px] font-bold text-teal-900">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" /> Next Best Action
                </span>
                <span className="text-teal-700">{data.next_actions[0].estimated_improvement}</span>
              </div>
              <p className="text-xs font-medium text-slate-800 mt-1">{data.next_actions[0].action}</p>
            </div>
          )}
        </div>

        {/* Natural Language Vault Search */}
        <div className="lg:col-span-2 bg-[#0B1F3A] text-white rounded-3xl p-6 shadow-md border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> AI Vault Assistant
              </span>
              <span className="text-[11px] text-slate-400">Answers strictly from your documents</span>
            </div>

            <h2 className="text-lg font-bold text-white mt-1">Ask anything about your family documents</h2>

            <form onSubmit={handleSearch} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. When does my car insurance expire?"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={searchLoading}
                className="px-4 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-xl transition-colors shrink-0 disabled:opacity-60"
              >
                {searchLoading ? "Thinking..." : "Ask AI"}
              </button>
            </form>

            {/* Quick Demo Questions */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {[
                "When does my car insurance expire?",
                "Show my PUC expiry",
                "Which documents are missing for Flat 302?",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setSearchQuery(q); }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Search Result Card */}
          {searchResult && (
            <div className="mt-4 p-4 rounded-2xl bg-slate-800/90 border border-teal-500/30 text-xs">
              <div className="flex items-center gap-1.5 text-teal-400 font-semibold mb-1">
                <Sparkles className="w-3.5 h-3.5" /> Answer:
              </div>
              <p className="text-slate-100 font-medium leading-relaxed whitespace-pre-line">
                {searchResult.answer}
              </p>

              {searchResult.sources.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-700 flex flex-wrap gap-2">
                  <span className="text-[10px] text-slate-400 self-center">Sources:</span>
                  {searchResult.sources.map((src, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-900/60 text-teal-300 text-[10px] border border-teal-500/20 font-mono"
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

      {/* 3. Expiry Alerts Section */}
      {data?.alerts && data.alerts.length > 0 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-slate-900 text-base">Expiry Alerts</h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                {data.alerts.length} action items
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.alerts.map((alert) => (
              <div
                key={alert.document_id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  alert.severity === "expired" || alert.severity === "urgent"
                    ? "bg-red-50/50 border-red-200"
                    : "bg-amber-50/40 border-amber-200"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">{alert.asset_name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        alert.severity === "expired"
                          ? "bg-red-100 text-red-700"
                          : alert.severity === "urgent"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {alert.label}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm mt-1">{alert.title}</h4>
                  <p className="text-xs text-slate-600 mt-0.5">Type: {alert.doc_type}</p>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Expiry: {alert.expiry_date}</span>
                  {alert.renew_url ? (
                    <a
                      href={alert.renew_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-teal-700 hover:text-teal-800 bg-white px-2.5 py-1 rounded-lg border border-teal-200 shadow-xs flex items-center gap-1 transition-colors"
                    >
                      Renew <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Assets Section */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Your Assets</h3>
            <p className="text-xs text-slate-500">Documents organized around family assets, not scattered folders</p>
          </div>
          <button
            onClick={() => setShowAddAsset(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] hover:bg-[#132c4f] text-white text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Add Asset
          </button>
        </div>

        {data?.assets.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl">
            <Folder className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h4 className="font-bold text-slate-700 text-sm">No assets yet</h4>
            <p className="text-xs text-slate-500 mt-1">Add your first vehicle, property, or family member</p>
            <button
              onClick={() => setShowAddAsset(true)}
              className="mt-4 px-4 py-2 bg-teal-500 text-slate-950 font-bold text-xs rounded-xl"
            >
              + Create First Asset
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.assets.map((asset) => (
              <Link
                key={asset.id}
                href={`/assets/${asset.id}`}
                className="group p-5 rounded-2xl border border-slate-200 hover:border-teal-500 hover:shadow-md transition-all bg-white flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-teal-50 flex items-center justify-center transition-colors">
                      {getAssetIcon(asset.type)}
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {asset.type}
                    </span>
                  </div>

                  <h4 className="font-bold text-base text-slate-900 mt-3 group-hover:text-teal-700 transition-colors">
                    {asset.name}
                  </h4>

                  {/* Checklist Summary */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {asset.checklist?.map((item) => (
                      <span
                        key={item.doc_type}
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium ${
                          item.present
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                            : item.optional
                            ? "bg-slate-50 text-slate-400 border border-slate-200"
                            : "bg-red-50 text-red-600 border border-red-200"
                        }`}
                      >
                        {item.present ? (
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                        ) : item.optional ? (
                          <span className="text-[10px]">○</span>
                        ) : (
                          <XCircle className="w-2.5 h-2.5 text-red-500" />
                        )}
                        {item.doc_type}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {asset.document_count} {asset.document_count === 1 ? "doc" : "docs"}
                    {asset.missing_count > 0 && (
                      <span className="text-red-500 font-semibold ml-1">
                        • {asset.missing_count} missing
                      </span>
                    )}
                  </span>
                  <span className="text-teal-600 font-semibold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Add Asset Modal */}
      {showAddAsset && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <h3 className="font-bold text-lg text-slate-900">Add New Asset</h3>
            <p className="text-xs text-slate-500 mt-1">Group documents around a vehicle, property, or person</p>

            <form onSubmit={handleCreateAsset} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Asset Name</label>
                <input
                  type="text"
                  required
                  value={newAssetName}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  placeholder="e.g. Honda City, Flat 302, Self"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Asset Type</label>
                <select
                  value={newAssetType}
                  onChange={(e) => setNewAssetType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all cursor-pointer"
                >
                  <option value="vehicle" className="text-slate-900 bg-white">Vehicle (RC, Insurance, PUC, License)</option>
                  <option value="property" className="text-slate-900 bg-white">Property (Registry, Tax, Electricity, Rent)</option>
                  <option value="person" className="text-slate-900 bg-white">Person (Aadhaar, PAN, Health Insurance)</option>
                  <option value="other" className="text-slate-900 bg-white">Other Asset</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAsset(false)}
                  className="flex-1 py-2.5 text-xs font-bold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assetSubmitting}
                  className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-teal-500 hover:bg-teal-600 text-slate-950 shadow-sm"
                >
                  {assetSubmitting ? "Creating..." : "Save Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
