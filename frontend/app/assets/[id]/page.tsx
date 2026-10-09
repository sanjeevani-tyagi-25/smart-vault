"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Car,
  Home,
  User as UserIcon,
  Folder,
  Upload,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Trash2,
  Lock,
  Share2,
  AlertTriangle,
  FileText,
  Edit3,
  Eye,
  Plus,
  Search,
  Check,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  getAsset,
  deleteDocument,
  downloadDecryptedDocument,
  toggleShareable,
  deleteAsset,
  updateDocument,
  getToken,
} from "@/lib/api";
import { Asset, DocumentItem, DocumentUpdatePayload } from "@/lib/types";

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = Number(params.id);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Edit / Preview Modal
  const [activeDoc, setActiveDoc] = useState<DocumentItem | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDocType, setEditDocType] = useState("");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editIssueDate, setEditIssueDate] = useState("");
  const [editShareable, setEditShareable] = useState(true);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAsset = async () => {
    try {
      const res = await getAsset(assetId);
      setAsset(res);
    } catch (err: any) {
      showToast(err.message || "Failed to load asset", "error");
      router.push("/dashboard");
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
    loadAsset();
  }, [assetId]);

  const handleDeleteDoc = async (docId: number, title: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${title}"?`)) return;
    try {
      await deleteDocument(docId);
      showToast(`Document "${title}" deleted successfully.`);
      await loadAsset();
      if (activeDoc?.id === docId) setActiveDoc(null);
    } catch (err: any) {
      showToast(err.message || "Could not delete document", "error");
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    setActionLoading(doc.id);
    try {
      await downloadDecryptedDocument(doc.id, doc.original_filename);
      showToast(`Decrypted and downloaded "${doc.title}"`);
    } catch (err: any) {
      showToast(err.message || "Could not download document", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleShare = async (docId: number) => {
    try {
      const updated = await toggleShareable(docId);
      showToast(
        updated.is_emergency_shareable
          ? "Document added to Emergency Nominee sharing."
          : "Document marked Private (nominee access removed)."
      );
      await loadAsset();
      if (activeDoc?.id === docId) setActiveDoc(updated);
    } catch (err: any) {
      showToast(err.message || "Could not toggle sharing status", "error");
    }
  };

  const handleDeleteAsset = async () => {
    if (!confirm(`Are you sure you want to delete ${asset?.name} and all its documents from your encrypted vault?`)) return;
    try {
      await deleteAsset(assetId);
      router.push("/dashboard");
    } catch (err: any) {
      showToast(err.message || "Could not delete asset", "error");
    }
  };

  const openPreview = (doc: DocumentItem, edit: boolean = false) => {
    setActiveDoc(doc);
    setIsEditMode(edit);
    setEditTitle(doc.title);
    setEditDocType(doc.doc_type);
    setEditExpiryDate(doc.expiry_date || "");
    setEditIssueDate(doc.issue_date || "");
    setEditShareable(doc.is_emergency_shareable);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDoc) return;
    setIsSavingEdit(true);
    try {
      const payload: DocumentUpdatePayload = {
        title: editTitle.trim(),
        doc_type: editDocType.trim(),
        expiry_date: editExpiryDate.trim() || null,
        issue_date: editIssueDate.trim() || null,
        is_emergency_shareable: editShareable,
      };
      const updated = await updateDocument(activeDoc.id, payload);
      showToast("Document metadata updated successfully!");
      setActiveDoc(updated);
      setIsEditMode(false);
      await loadAsset();
    } catch (err: any) {
      showToast(err.message || "Failed to update metadata", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const getAssetIcon = (type?: string) => {
    switch (type) {
      case "vehicle":
        return <Car className="w-6 h-6 text-[#08C5B3]" />;
      case "property":
        return <Home className="w-6 h-6 text-emerald-400" />;
      case "person":
        return <UserIcon className="w-6 h-6 text-indigo-400" />;
      default:
        return <Folder className="w-6 h-6 text-slate-400" />;
    }
  };

  const getExpiryInfo = (expiryDateStr?: string | null) => {
    if (!expiryDateStr) return { label: "Permanent", status: "permanent", color: "slate" };
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const exp = new Date(expiryDateStr);
      exp.setHours(0, 0, 0, 0);
      const days = Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (days < 0) return { label: `Expired (${Math.abs(days)}d ago)`, status: "expired", color: "red" };
      if (days <= 7) return { label: `Expires in ${days}d`, status: "urgent", color: "red" };
      if (days <= 30) return { label: `Expires in ${days}d`, status: "soon", color: "amber" };
      return { label: `Valid (${days}d left)`, status: "healthy", color: "green" };
    } catch {
      return { label: expiryDateStr, status: "unknown", color: "slate" };
    }
  };

  const filteredDocs = useMemo(() => {
    if (!asset?.documents) return [];
    return asset.documents.filter((doc) => {
      const matchesSearch =
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.doc_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.fields?.number && doc.fields.number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (doc.fields?.holder_name && doc.fields.holder_name.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (statusFilter !== "all") {
        const exp = getExpiryInfo(doc.expiry_date);
        if (statusFilter === "expired" && exp.status !== "expired") return false;
        if (statusFilter === "expiring_soon" && exp.status !== "soon" && exp.status !== "urgent") return false;
        if (statusFilter === "valid" && exp.status !== "healthy" && exp.status !== "permanent") return false;
        if (statusFilter === "emergency" && !doc.is_emergency_shareable) return false;
        if (statusFilter === "private" && doc.is_emergency_shareable) return false;
      }

      return true;
    });
  }, [asset?.documents, searchQuery, statusFilter]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-36 bg-slate-200/70 rounded-xl" />
        <div className="h-44 bg-slate-200/70 rounded-3xl" />
        <div className="h-64 bg-slate-200/70 rounded-3xl" />
      </div>
    );
  }

  if (!asset) return null;

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Feedback */}
      {toast && (
        <div
          className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold border transition-all animate-in slide-in-from-top-3 ${
            toast.type === "success"
              ? "bg-[#101D36] text-[#5EEAD4] border-[#08C5B3]/40 shadow-[#08C5B3]/10"
              : "bg-red-950 text-red-200 border-red-500/40"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-[#08C5B3] shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Back button */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      {/* Asset Header Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#0B1730] flex items-center justify-center shrink-0 border border-[#1E3258]">
            {getAssetIcon(asset.type)}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-extrabold text-[#0B1730]">{asset.name}</h1>
              <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {asset.type}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> AES-256
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {asset.documents?.length || 0} documents in vault • Automatic Indian legal compliance tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto self-stretch sm:self-auto">
          <Link
            href={`/assets/${asset.id}/upload`}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] text-xs font-extrabold rounded-xl shadow-sm transition-all"
          >
            <Upload className="w-4 h-4" /> Upload Document
          </Link>
          <button
            onClick={handleDeleteAsset}
            title="Delete this asset and its documents"
            className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Missing-Document Detector Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-[#0B1730]">Missing-Document Detector</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                Legal Standards
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Statutory documents expected for a {asset.type} under Indian regulations
            </p>
          </div>
          {asset.missing_docs && asset.missing_docs.length > 0 ? (
            <span className="text-xs font-bold text-red-800 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
              {asset.missing_docs.length} Required Missing
            </span>
          ) : (
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> All Legal Requirements Met
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {asset.checklist?.map((item) => (
            <div
              key={item.doc_type}
              className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                item.present
                  ? "bg-emerald-50/60 border-emerald-200 text-emerald-950"
                  : item.optional
                  ? "bg-slate-50 border-slate-200 text-slate-600"
                  : "bg-red-50/60 border-red-200 text-red-950"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {item.present ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : item.optional ? (
                  <span className="text-xs text-slate-400 font-bold shrink-0">○</span>
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                )}
                <div className="truncate">
                  <p className="text-xs font-bold truncate">{item.label || item.doc_type}</p>
                  <p className="text-[10px] text-slate-500">
                    {item.present ? "Uploaded in vault" : item.optional ? "Recommended" : "Mandatory"}
                  </p>
                </div>
              </div>

              {!item.present && (
                <Link
                  href={`/assets/${asset.id}/upload?doc_type=${encodeURIComponent(item.doc_type)}`}
                  className="ml-2 text-[11px] font-bold text-[#0B1730] bg-[#08C5B3] hover:bg-[#07AF9E] px-2.5 py-1 rounded-lg shrink-0 shadow-2xs transition-colors"
                >
                  Upload
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Uploaded Documents List */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
          <h2 className="text-base font-extrabold text-[#0B1730]">
            Vault Documents ({asset.documents?.length || 0})
          </h2>

          {/* Quick search and filter inside this asset */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter documents..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#08C5B3] cursor-pointer"
            >
              <option value="all">All</option>
              <option value="valid">Valid</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Expired</option>
              <option value="emergency">Emergency Shared</option>
            </select>
          </div>
        </div>

        {!asset.documents || asset.documents.length === 0 ? (
          <div className="text-center py-14 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="font-bold text-slate-800 text-sm">No documents in this asset yet</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Upload photos or PDFs — AI will extract policy numbers, holder names & expiry dates automatically.
            </p>
            <Link
              href={`/assets/${asset.id}/upload`}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] font-extrabold text-xs rounded-xl shadow-sm transition-all"
            >
              <Upload className="w-4 h-4" /> Upload First Document
            </Link>
          </div>
        ) : filteredDocs.length === 0 ? (
          <p className="text-center py-8 text-xs text-slate-400">No documents matched your filter.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredDocs.map((doc) => {
              const exp = getExpiryInfo(doc.expiry_date);
              return (
                <div
                  key={doc.id}
                  className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 -mx-3 px-3 rounded-2xl transition-colors"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
                        {doc.doc_type}
                      </span>
                      <span className="text-sm font-bold text-slate-900 truncate">{doc.title}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                        <Lock className="w-2.5 h-2.5" /> AES-256
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                      {doc.fields?.number && (
                        <span>
                          No: <strong className="text-slate-800 font-semibold">{doc.fields.number}</strong>
                        </span>
                      )}
                      {doc.fields?.holder_name && (
                        <span>
                          Holder: <strong className="text-slate-800 font-semibold">{doc.fields.holder_name}</strong>
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 font-bold text-[11px] px-2 py-0.5 rounded-md ${
                          exp.color === "green"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : exp.color === "amber"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : exp.color === "red"
                            ? "bg-red-50 text-red-800 border border-red-200"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <Clock className="w-3 h-3" /> {exp.label}
                      </span>
                    </div>
                  </div>

                  {/* Document Actions */}
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      onClick={() => handleToggleShare(doc.id)}
                      title={doc.is_emergency_shareable ? "Click to set private" : "Click to allow nominee emergency view"}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all ${
                        doc.is_emergency_shareable
                          ? "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100"
                          : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                      }`}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      {doc.is_emergency_shareable ? "Shared" : "Private"}
                    </button>

                    <button
                      onClick={() => openPreview(doc, false)}
                      title="View & Edit Metadata"
                      className="p-2 text-slate-600 hover:text-[#08C5B3] hover:bg-teal-50 rounded-xl border border-slate-200 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={actionLoading === doc.id}
                      title="Decrypt and stream document file"
                      className="p-2 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-xl border border-slate-200 transition-colors"
                    >
                      {actionLoading === doc.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteDoc(doc.id, doc.title)}
                      title="Delete Document"
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Document Detail & Edit Modal Drawer */}
      {activeDoc && (
        <div className="fixed inset-0 z-50 bg-[#0B1730]/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                  {activeDoc.doc_type}
                </span>
                <span className="text-xs text-slate-400 font-mono">#{activeDoc.id}</span>
              </div>
              <button
                onClick={() => setActiveDoc(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 text-sm"
              >
                ✕
              </button>
            </div>

            {!isEditMode ? (
              /* View Mode */
              <div className="space-y-4 pt-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{activeDoc.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Asset: {asset.name}</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Document / Policy Number:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {activeDoc.fields?.number || "Not specified"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Holder Name:</span>
                    <span className="font-bold text-slate-900">
                      {activeDoc.fields?.holder_name || "Not specified"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Issuing Authority:</span>
                    <span className="font-bold text-slate-900">
                      {activeDoc.fields?.issuer || "Not specified"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Issue Date:</span>
                    <span className="font-bold text-slate-900">{activeDoc.issue_date || "Not specified"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Expiry Date:</span>
                    <span className="font-bold text-slate-900">{activeDoc.expiry_date || "Permanent"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Emergency Access:</span>
                    <span className={`font-bold ${activeDoc.is_emergency_shareable ? "text-purple-700" : "text-slate-500"}`}>
                      {activeDoc.is_emergency_shareable ? "Shared with Nominee" : "Private Only"}
                    </span>
                  </div>
                </div>

                {activeDoc.raw_text && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      OCR Extracted Text Snippet
                    </p>
                    <div className="max-h-28 overflow-y-auto p-3 rounded-xl bg-slate-100 text-[11px] font-mono text-slate-700 whitespace-pre-wrap border border-slate-200">
                      {activeDoc.raw_text}
                    </div>
                  </div>
                )}

                <div className="flex gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsEditMode(true)}
                    className="flex-1 py-2.5 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5"
                  >
                    <Edit3 className="w-4 h-4 text-teal-600" /> Edit Metadata
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(activeDoc)}
                    className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Download className="w-4 h-4" /> Download File
                  </button>
                </div>
              </div>
            ) : (
              /* Edit Form Mode */
              <form onSubmit={handleSaveEdit} className="space-y-4 pt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Document Title *</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Document Type</label>
                  <input
                    type="text"
                    value={editDocType}
                    onChange={(e) => setEditDocType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Issue Date</label>
                    <input
                      type="date"
                      value={editIssueDate}
                      onChange={(e) => setEditIssueDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={editExpiryDate}
                      onChange={(e) => setEditExpiryDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editShareable}
                    onChange={(e) => setEditShareable(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded"
                  />
                  <div className="text-xs">
                    <p className="font-bold text-slate-900">Include in Emergency Nominee Access</p>
                    <p className="text-slate-500 text-[11px]">Unlocks for nominee only if security waiting period expires</p>
                  </div>
                </label>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditMode(false)}
                    className="flex-1 py-2.5 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="flex-1 py-2.5 text-xs font-extrabold rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {isSavingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
