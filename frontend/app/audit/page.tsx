"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  History,
  ShieldCheck,
  User,
  Clock,
  ArrowLeft,
  FileText,
  Lock,
  Loader2,
  RefreshCw,
  Search,
  Filter,
  ShieldAlert,
  Download,
  Trash2,
  CheckCircle2,
  Ban,
  Upload,
} from "lucide-react";
import { getAuditLog, getToken } from "@/lib/api";
import { AuditLogItem } from "@/lib/types";

export default function AuditLogPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getAuditLog();
      setLogs(data);
    } catch (err: any) {
      console.error("Failed to load audit logs:", err);
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
    loadLogs();
  }, [router]);

  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes("VETO")) {
      return (
        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">
          <Ban className="w-2.5 h-2.5" /> {action}
        </span>
      );
    }
    if (act.includes("APPROVED") || act.includes("UNLOCKED") || act.includes("APPROVE")) {
      return (
        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
          <CheckCircle2 className="w-2.5 h-2.5" /> {action}
        </span>
      );
    }
    if (act.includes("REQUEST")) {
      return (
        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
          <ShieldAlert className="w-2.5 h-2.5" /> {action}
        </span>
      );
    }
    if (act.includes("DOWNLOAD") || act.includes("VIEW")) {
      return (
        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-900 border border-cyan-300 flex items-center gap-1">
          <Download className="w-2.5 h-2.5" /> {action}
        </span>
      );
    }
    if (act.includes("UPLOAD") || act.includes("CREATE")) {
      return (
        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-300 flex items-center gap-1">
          <Upload className="w-2.5 h-2.5" /> {action}
        </span>
      );
    }
    if (act.includes("DELETE") || act.includes("REMOVED")) {
      return (
        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">
          <Trash2 className="w-2.5 h-2.5" /> {action}
        </span>
      );
    }
    return (
      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
        {action}
      </span>
    );
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      const q = filterQuery.toLowerCase();
      const matchesSearch =
        item.action.toLowerCase().includes(q) ||
        item.actor_name.toLowerCase().includes(q) ||
        item.target.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (categoryFilter === "documents") {
        return item.action.includes("DOCUMENT");
      }
      if (categoryFilter === "emergency") {
        return item.action.includes("EMERGENCY") || item.action.includes("VETO") || item.action.includes("NOMINEE");
      }
      if (categoryFilter === "auth_assets") {
        return item.action.includes("USER") || item.action.includes("ASSET");
      }

      return true;
    });
  }, [logs, filterQuery, categoryFilter]);

  // Metric counts
  const totalDownloads = logs.filter((l) => l.action.includes("DOWNLOAD") || l.action.includes("VIEW")).length;
  const totalEmergencyEvents = logs.filter((l) => l.action.includes("EMERGENCY") || l.action.includes("VETO")).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-extrabold text-[#0B1730]">Security Audit Trail</h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#08C5B3]" /> Immutable Log
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-evident record of all uploads, decryption streaming, nominee approvals, and owner vetoes.
          </p>
        </div>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 self-start sm:self-center transition-colors shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#08C5B3] ${loading ? "animate-spin" : ""}`} />
          Refresh Log
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Recorded Events</p>
          <p className="text-2xl font-extrabold text-[#0B1730] mt-1">{logs.length}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Decryption Downloads</p>
          <p className="text-2xl font-extrabold text-teal-700 mt-1">{totalDownloads}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Emergency Protocol Events</p>
          <p className="text-2xl font-extrabold text-amber-600 mt-1">{totalEmergencyEvents}</p>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/80 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search by actor name, event action, or resource..."
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3] focus:border-[#08C5B3]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`px-3 py-2 rounded-xl font-bold transition-colors ${
                categoryFilter === "all" ? "bg-[#0B1730] text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              All Events
            </button>
            <button
              onClick={() => setCategoryFilter("documents")}
              className={`px-3 py-2 rounded-xl font-bold transition-colors ${
                categoryFilter === "documents" ? "bg-[#0B1730] text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Document Ops
            </button>
            <button
              onClick={() => setCategoryFilter("emergency")}
              className={`px-3 py-2 rounded-xl font-bold transition-colors ${
                categoryFilter === "emergency" ? "bg-[#0B1730] text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Emergency & Nominees
            </button>
            <button
              onClick={() => setCategoryFilter("auth_assets")}
              className={`px-3 py-2 rounded-xl font-bold transition-colors ${
                categoryFilter === "auth_assets" ? "bg-[#0B1730] text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Auth & Assets
            </button>
          </div>
        </div>
      </div>

      {/* Audit Log Table Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80 space-y-4">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#08C5B3] mx-auto mb-2" />
            <p className="text-xs text-slate-400">Loading audit log entries...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center">
            <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">No matching audit events</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Actions in your vault will automatically record immutable timestamps here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="pb-3.5 pl-2">Timestamp</th>
                  <th className="pb-3.5">Actor</th>
                  <th className="pb-3.5">Security Event</th>
                  <th className="pb-3.5 pr-2">Target Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLogs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 pl-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="py-3.5 font-bold text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.actor_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 whitespace-nowrap">{getActionBadge(item.action)}</td>
                    <td className="py-3.5 pr-2 text-slate-700 max-w-sm truncate font-medium" title={item.target}>
                      {item.target}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security Guarantee Note */}
      <div className="p-4 rounded-2xl bg-[#0B1730] text-slate-300 border border-[#1E3258] text-[11px] flex items-start gap-3">
        <Lock className="w-4 h-4 text-[#08C5B3] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-white">Cryptographic Privacy & Tamper-Evident History:</span> Audit log events record every security state change, decryption stream, and nominee interaction. Audit entries are isolated to your account and cannot be deleted or manipulated by nominees. Passwords and encryption keys are never logged.
        </div>
      </div>
    </div>
  );
}
