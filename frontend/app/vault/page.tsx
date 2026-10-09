"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderLock,
  Search,
  Filter,
  ArrowUpDown,
  Lock,
  Clock,
  Download,
  Trash2,
  Share2,
  FileText,
  Plus,
  Edit3,
  Eye,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Car,
  Home,
  User as UserIcon,
  Folder,
  Loader2,
  Check,
  AlertCircle,
  Calendar,
  Building,
  Hash,
} from "lucide-react";
import {
  getDocuments,
  getAssets,
  deleteDocument,
  downloadDecryptedDocument,
  toggleShareable,
  updateDocument,
  createAsset,
  getToken,
} from "@/lib/api";
import { DocumentItem, Asset, DocumentUpdatePayload } from "@/lib/types";

export default function VaultPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"expiry_asc" | "expiry_desc" | "newest" | "title">("expiry_asc");

  // Edit / Preview Modal
  const [activeDoc, setActiveDoc] = useState<DocumentItem | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDocType, setEditDocType] = useState("");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editIssueDate, setEditIssueDate] = useState("");
  const [editAssetId, setEditAssetId] = useState<number>(0);
  const [editShareable, setEditShareable] = useState(true);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Add Asset modal
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetType, setNewAssetType] = useState<"vehicle" | "property" | "person" | "other">("vehicle");
  const [assetSubmitting, setAssetSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    try {
      const [docs, assetList] = await Promise.all([getDocuments(), getAssets()]);
      setDocuments(docs);
      setAssets(assetList);
    } catch (err: any) {
      console.error("Vault load error:", err);
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

  const handleDownload = async (doc: DocumentItem) => {
    setActionLoading(doc.id);
    try {
      await downloadDecryptedDocument(doc.id, doc.original_filename);
      showToast(`Downloaded decrypted "${doc.title}"`);
    } catch (err: any) {
      showToast(err.message || "Could not decrypt document", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (doc: DocumentItem) => {
    if (!confirm(`Permanently delete "${doc.title}" and wipe encrypted file from disk?`)) return;
    try {
      await deleteDocument(doc.id);
      showToast(`Document "${doc.title}" deleted.`);
      await loadData();
      if (activeDoc?.id === doc.id) setActiveDoc(null);
    } catch (err: any) {
      showToast(err.message || "Failed to delete document", "error");
    }
  };

  const handleToggleShare = async (docId: number) => {
    try {
      const updated = await toggleShareable(docId);
      setDocuments((prev) => prev.map((d) => (d.id === docId ? updated : d)));
      if (activeDoc?.id === docId) setActiveDoc(updated);
      showToast(
        updated.is_emergency_shareable
          ? "Document marked for Emergency Nominee sharing."
          : "Document set to Private (excluded from nominee access)."
      );
    } catch (err: any) {
      showToast(err.message || "Could not update sharing status", "error");
    }
  };

  const openPreview = (doc: DocumentItem, edit: boolean = false) => {
    setActiveDoc(doc);
    setIsEditMode(edit);
    setEditTitle(doc.title);
    setEditDocType(doc.doc_type);
    setEditExpiryDate(doc.expiry_date || "");
    setEditIssueDate(doc.issue_date || "");
    setEditAssetId(doc.asset_id);
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
        asset_id: editAssetId,
        is_emergency_shareable: editShareable,
      };
      const updated = await updateDocument(activeDoc.id, payload);
      showToast("Document metadata updated successfully!");
      setActiveDoc(updated);
      setIsEditMode(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to update document metadata", "error");
    } finally {
      setIsSavingEdit(false);
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
      showToast(`Asset "${newAssetName}" registered!`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Could not create asset", "error");
    } finally {
      setAssetSubmitting(false);
    }
  };

  // Helper for expiry calculation
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

  // Filter and sort documents
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      // Search
      const matchesSearch =
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.doc_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.fields?.number && doc.fields.number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (doc.fields?.holder_name && doc.fields.holder_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (doc.asset_name && doc.asset_name.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      // Asset Filter
      if (selectedAssetId !== "all" && doc.asset_id !== Number(selectedAssetId)) {
        return false;
      }

      // Category Filter
      if (selectedCategory !== "all" && doc.doc_type !== selectedCategory) {
        return false;
      }

      // Status Filter
      if (selectedStatus !== "all") {
        const exp = getExpiryInfo(doc.expiry_date);
        if (selectedStatus === "expired" && exp.status !== "expired") return false;
        if (selectedStatus === "expiring_soon" && exp.status !== "soon" && exp.status !== "urgent") return false;
        if (selectedStatus === "valid" && exp.status !== "healthy" && exp.status !== "permanent") return false;
        if (selectedStatus === "emergency" && !doc.is_emergency_shareable) return false;
        if (selectedStatus === "private" && doc.is_emergency_shareable) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "expiry_asc") {
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
      }
      if (sortBy === "expiry_desc") {
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return new Date(b.expiry_date).getTime() - new Date(a.expiry_date).getTime();
      }
      return 0;
    });
  }, [documents, searchQuery, selectedAssetId, selectedCategory, selectedStatus, sortBy]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => set.add(d.doc_type));
    return Array.from(set).sort();
  }, [documents]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-slate-200/70 rounded-3xl" />
        <div className="h-14 bg-slate-200/70 rounded-2xl" />
        <div className="h-96 bg-slate-200/70 rounded-3xl" />
      </div>
    );
  }

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

      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#08C5B3] flex items-center justify-center border border-teal-100">
              <FolderLock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#0B1730]">My Vault</h1>
              <p className="text-xs text-slate-500">
                All family documents • Encrypted with AES-256-GCM authenticated storage
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-center">
          <button
            onClick={() => setShowAddAsset(true)}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4 text-[#08C5B3]" /> Add Asset
          </button>
          {assets.length > 0 && (
            <Link
              href={`/assets/${assets[0].id}/upload`}
              className="px-4 py-2.5 bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] text-xs font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Upload Document
            </Link>
          )}
        </div>
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search bar */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, number, holder, or asset..."
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3] focus:border-[#08C5B3] transition-all"
            />
          </div>

          {/* Asset filter */}
          <div className="md:col-span-2.5">
            <select
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#08C5B3] cursor-pointer"
            >
              <option value="all">All Assets ({assets.length})</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="md:col-span-2.5">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#08C5B3] cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="valid">Valid & Healthy</option>
              <option value="expiring_soon">Expiring Soon (≤30d)</option>
              <option value="expired">Expired</option>
              <option value="emergency">Emergency Shared</option>
              <option value="private">Private Only</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="md:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#08C5B3] cursor-pointer"
            >
              <option value="expiry_asc">Expiry (Urgent first)</option>
              <option value="expiry_desc">Expiry (Furthest first)</option>
              <option value="newest">Recently Added</option>
              <option value="title">Title (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Quick Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
            Category:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 ${
              selectedCategory === "all"
                ? "bg-[#0B1730] text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                selectedCategory === cat
                  ? "bg-[#08C5B3] text-[#0B1730]"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Documents Results List */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-extrabold text-[#0B1730]">
            Documents ({filteredDocs.length} of {documents.length})
          </h2>
          {(searchQuery || selectedAssetId !== "all" || selectedStatus !== "all" || selectedCategory !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedAssetId("all");
                setSelectedStatus("all");
                setSelectedCategory("all");
              }}
              className="text-xs font-bold text-teal-700 hover:text-teal-900 underline"
            >
              Reset Filters
            </button>
          )}
        </div>

        {filteredDocs.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="font-bold text-slate-800 text-sm">No documents matching your criteria</h3>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search terms or filters</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredDocs.map((doc) => {
              const exp = getExpiryInfo(doc.expiry_date);
              return (
                <div
                  key={doc.id}
                  className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/80 -mx-3 px-3 rounded-2xl transition-colors"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
                        {doc.doc_type}
                      </span>
                      {doc.asset_name && (
                        <Link
                          href={`/assets/${doc.asset_id}`}
                          className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                        >
                          {doc.asset_name}
                        </Link>
                      )}
                      <span className="text-sm font-bold text-slate-900 truncate">{doc.title}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                        <Lock className="w-2.5 h-2.5" /> AES-256
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                      {doc.fields?.number && (
                        <span>
                          Doc No: <strong className="text-slate-800 font-semibold">{doc.fields.number}</strong>
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

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {/* Emergency sharing status toggle */}
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

                    {/* View Details / Edit */}
                    <button
                      onClick={() => openPreview(doc, false)}
                      title="Preview details and edit metadata"
                      className="p-2 text-slate-600 hover:text-[#08C5B3] hover:bg-teal-50 rounded-xl border border-slate-200 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Decrypt & Download */}
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

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(doc)}
                      title="Permanently delete from vault"
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
                  <p className="text-xs text-slate-500 mt-0.5">
                    Associated Asset: <strong className="text-slate-800">{activeDoc.asset_name || "None"}</strong>
                  </p>
                </div>

                {/* Metadata Fields Card */}
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
                    <span className="font-bold text-slate-900">
                      {activeDoc.issue_date || "Not specified"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Expiry Date:</span>
                    <span className="font-bold text-slate-900">
                      {activeDoc.expiry_date || "Permanent / No Expiry"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Emergency Nominee Access:</span>
                    <span className={`font-bold ${activeDoc.is_emergency_shareable ? "text-purple-700" : "text-slate-500"}`}>
                      {activeDoc.is_emergency_shareable ? "Enabled" : "Private Only"}
                    </span>
                  </div>
                </div>

                {/* Storage Security Details */}
                <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-[11px] text-teal-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Lock className="w-3.5 h-3.5 text-teal-700" /> AES-256-GCM Encrypted on Disk
                  </span>
                  <span className="font-mono text-teal-800 text-[10px]">{activeDoc.original_filename}</span>
                </div>

                {/* Raw OCR text (collapsible/visible) */}
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

                {/* Action buttons */}
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Document Type</label>
                    <input
                      type="text"
                      value={editDocType}
                      onChange={(e) => setEditDocType(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Associated Asset</label>
                    <select
                      value={editAssetId}
                      onChange={(e) => setEditAssetId(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#08C5B3] cursor-pointer"
                    >
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Issue Date</label>
                    <input
                      type="date"
                      value={editIssueDate}
                      onChange={(e) => setEditIssueDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={editExpiryDate}
                      onChange={(e) => setEditExpiryDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                    />
                  </div>
                </div>

                {/* Emergency Shareable Checkbox */}
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

      {/* Add Asset Modal */}
      {showAddAsset && (
        <div className="fixed inset-0 z-50 bg-[#0B1730]/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-xl text-[#0B1730]">Add New Asset</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Organize documents around a vehicle, property, or person
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
                  placeholder="e.g. Honda City, Flat 302, Self"
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
