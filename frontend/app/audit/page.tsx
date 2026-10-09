"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { getAuditLog } from "@/lib/api";
import { AuditLogItem } from "@/lib/types";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");

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
    loadLogs();
  }, []);

  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes("VETO")) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
          {action}
        </span>
      );
    }
    if (act.includes("APPROVED") || act.includes("UNLOCKED")) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
          {action}
        </span>
      );
    }
    if (act.includes("REQUEST")) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
          {action}
        </span>
      );
    }
    if (act.includes("UPLOAD") || act.includes("CREATE")) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
          {action}
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
        {action}
      </span>
    );
  };

  const filteredLogs = logs.filter(
    (item) =>
      item.action.toLowerCase().includes(filterQuery.toLowerCase()) ||
      item.actor_name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      item.target.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Security Audit Trail</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Immutable Log
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete tamper-evident log of document uploads, decryption downloads, nominee requests, and security events.
          </p>
        </div>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 self-start sm:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-400 ml-2" />
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filter by actor, action, or target..."
          className="w-full text-xs font-medium bg-transparent text-slate-900 focus:outline-none placeholder:text-slate-400"
        />
        {filterQuery && (
          <button
            onClick={() => setFilterQuery("")}
            className="text-xs text-slate-400 hover:text-slate-600 px-2"
          >
            Clear
          </button>
        )}
      </div>

      {/* Audit Log Table Card */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-teal-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Loading audit log events...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center">
            <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-600">No matching audit events</p>
            <p className="text-[11px] text-slate-400 mt-1">Actions performed in your vault will automatically appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pl-2">Timestamp</th>
                  <th className="pb-3">Actor</th>
                  <th className="pb-3">Action</th>
                  <th className="pb-3 pr-2">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {filteredLogs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 pl-2 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="py-3 font-semibold text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.actor_name}</span>
                      </div>
                    </td>
                    <td className="py-3 whitespace-nowrap">{getActionBadge(item.action)}</td>
                    <td className="py-3 pr-2 text-slate-600 max-w-xs truncate" title={item.target}>
                      {item.target}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security Note */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-700">Tamper Evident:</span> Every file view, download, decryption, nominee invitation, and access request is permanently logged under your account. Logs are isolated per user and cannot be deleted by nominees.
        </div>
      </div>
    </div>
  );
}
