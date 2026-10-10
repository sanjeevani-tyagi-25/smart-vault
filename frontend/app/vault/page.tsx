"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderLock,
  Search,
  Filter,
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
  Car,
  Home,
  User as UserIcon,
  Folder,
  Loader2,
  AlertCircle,
  Upload,
  Layers,
  ArrowRight,
  RotateCw,
} from "lucide-react";
import {
  getDocuments,
  getAssets,
  deleteDocument,
  deleteAsset,
  downloadDecryptedDocument,
  toggleShareable,
  updateDocument,
  createAsset,
  renewDocument,
  getToken,
} from "@/lib/api";
import { DocumentItem, Asset, DocumentUpdatePayload } from "@/lib/types";

// Unified vault item representing either a standalone asset or an encrypted document
interface VaultListItem {
  id: string; // e.g. "doc-1" or "asset-2"
  rawId: number;
  kind: "document" | "asset";
  title: string;
  category: string;
  assetId: number;
  assetName: string;
  assetType: "vehicle" | "property" | "person" | "other";
  docNumber?: string | null;
  holderName?: string | null;
  issuer?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  createdAt: string;
  isEmergencyShareable?: boolean;
  originalFilename?: string | null;
  documentCount?: number;
  rawDoc?: DocumentItem;
  rawAsset?: Asset;
}

export default function VaultPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string>("all");
  const [selectedAssetType, setSelectedAssetType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<"all" | "documents" | "assets">("all");
  const [sortBy, setSortBy] = useState<"newest" | "expiry_asc" | "expiry_desc" | "title">("newest");

  // Edit / Preview Modal for documents
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
  const [assetFormError, setAssetFormError] = useState<string | null>(null);

  // Renewal Modal state
  const [renewingDoc, setRenewingDoc] = useState<DocumentItem | null>(null);
  const [renewExpiryDate, setRenewExpiryDate] = useState("");
  const [renewIssueDate, setRenewIssueDate] = useState("");
  const [renewFile, setRenewFile] = useState<File | null>(null);
  const [renewLoading, setRenewLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    try {
      const [docs, assetList] = await Promise.all([getDocuments(), getAssets()]);
      setDocuments(docs || []);
      setAssets(assetList || []);
    } catch (err: any) {
      console.error("Vault load error:", err);
      showToast(err.message || "Failed to load vault items", "error");
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

  // Auto-open document modal if doc_id parameter exists in query string (from notifications click)
  useEffect(() => {
    if (documents.length > 0 && typeof window !== "undefined") {
      const docIdParam = new URLSearchParams(window.location.search).get("doc_id");
      if (docIdParam) {
        const found = documents.find((d) => String(d.id) === docIdParam);
        if (found) {
          openPreview(found, false);
        }
      }
    }
  }, [documents]);

  const handleConfirmRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewingDoc) return;
    if (!renewExpiryDate) {
      showToast("Please enter the new confirmed expiry date", "error");
      return;
    }
    setRenewLoading(true);
    try {
      await renewDocument(renewingDoc.id, renewExpiryDate, {
        issueDate: renewIssueDate || undefined,
        file: renewFile,
      });
      showToast(`Document "${renewingDoc.title}" renewed! Expiry updated.`);
      setRenewingDoc(null);
      setRenewExpiryDate("");
      setRenewIssueDate("");
      setRenewFile(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to renew document", "error");
    } finally {
      setRenewLoading(false);
    }
  };

  // Unified items list containing all documents AND assets
  const vaultItems = useMemo<VaultListItem[]>(() => {
    const assetMap = new Map<number, Asset>();
    assets.forEach((a) => assetMap.set(a.id, a));

    // 1. Map documents
    const docItems: VaultListItem[] = documents.map((doc) => {
      const matchedAsset = assetMap.get(doc.asset_id);
      return {
        id: `doc-${doc.id}`,
        rawId: doc.id,
        kind: "document",
        title: doc.title,
        category: doc.doc_type,
        assetId: doc.asset_id,
        assetName: doc.asset_name || matchedAsset?.name || "Unassigned Asset",
        assetType: matchedAsset?.type || "other",
        docNumber: doc.fields?.number || null,
        holderName: doc.fields?.holder_name || null,
        issuer: doc.fields?.issuer || null,
        issueDate: doc.issue_date || null,
        expiryDate: doc.expiry_date || null,
        createdAt: doc.created_at,
        isEmergencyShareable: doc.is_emergency_shareable,
        originalFilename: doc.original_filename,
        rawDoc: doc,
      };
    });

    // 2. Map assets
    const assetItems: VaultListItem[] = assets.map((a) => {
      const categoryLabel =
        a.type === "vehicle"
          ? "Vehicle"
          : a.type === "property"
          ? "Property"
          : a.type === "person"
          ? "Family Member"
          : "Other Asset";

      return {
        id: `asset-${a.id}`,
        rawId: a.id,
        kind: "asset",
        title: a.name,
        category: categoryLabel,
        assetId: a.id,
        assetName: a.name,
        assetType: a.type,
        docNumber: null,
        holderName: null,
        issuer: null,
        issueDate: null,
        expiryDate: null,
        createdAt: a.created_at,
        isEmergencyShareable: false,
        documentCount: a.document_count || 0,
        rawAsset: a,
      };
    });

    return [...assetItems, ...docItems];
  }, [documents, assets]);

  // Helper for expiry calculation
  const getExpiryInfo = (expiryDateStr?: string | null) => {
    if (!expiryDateStr) return { label: "Permanent / No Expiry", status: "permanent", color: "slate" };
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

  const getAssetCategoryIcon = (type: string) => {
    switch (type) {
      case "vehicle":
        return <Car className="w-4 h-4 text-[#08C5B3]" />;
      case "property":
        return <Home className="w-4 h-4 text-emerald-500" />;
      case "person":
        return <UserIcon className="w-4 h-4 text-indigo-500" />;
      default:
        return <Folder className="w-4 h-4 text-slate-500" />;
    }
  };

  // Filter and sort items
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return vaultItems
      .filter((item) => {
        // Search filter
        if (q) {
          const matchesSearch =
            item.title.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q) ||
            item.assetName.toLowerCase().includes(q) ||
            item.assetType.toLowerCase().includes(q) ||
            (item.docNumber && item.docNumber.toLowerCase().includes(q)) ||
            (item.holderName && item.holderName.toLowerCase().includes(q));

          if (!matchesSearch) return false;
        }

        // Item Type Filter (All / Documents / Assets)
        if (itemTypeFilter === "documents" && item.kind !== "document") return false;
        if (itemTypeFilter === "assets" && item.kind !== "asset") return false;

        // Specific Asset Filter
        if (selectedAssetId !== "all" && item.assetId !== Number(selectedAssetId)) {
          return false;
        }

        // Asset Type Filter
        if (selectedAssetType !== "all" && item.assetType !== selectedAssetType) {
          return false;
        }

        // Category Filter
        if (selectedCategory !== "all") {
          const matchCategory =
            item.category.toLowerCase() === selectedCategory.toLowerCase() ||
            item.assetType.toLowerCase() === selectedCategory.toLowerCase();
          if (!matchCategory) return false;
        }

        // Status Filter
        if (selectedStatus !== "all") {
          if (item.kind === "document") {
            const exp = getExpiryInfo(item.expiryDate);
            if (selectedStatus === "expired" && exp.status !== "expired") return false;
            if (selectedStatus === "expiring_soon" && exp.status !== "soon" && exp.status !== "urgent") return false;
            if (selectedStatus === "valid" && exp.status !== "healthy" && exp.status !== "permanent") return false;
            if (selectedStatus === "emergency" && !item.isEmergencyShareable) return false;
            if (selectedStatus === "private" && item.isEmergencyShareable) return false;
            if (selectedStatus === "pending") return false;
          } else {
            // For asset items
            if (selectedStatus === "pending" && (item.documentCount || 0) > 0) return false;
            if (selectedStatus === "valid" && (item.documentCount || 0) === 0) return false;
            if (
              selectedStatus === "expired" ||
              selectedStatus === "expiring_soon" ||
              selectedStatus === "emergency" ||
              selectedStatus === "private"
            ) {
              return false;
            }
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "newest") {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortBy === "expiry_asc") {
          if (!a.expiryDate && !b.expiryDate) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          if (!a.expiryDate) return 1;
          if (!b.expiryDate) return -1;
          return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        }
        if (sortBy === "expiry_desc") {
          if (!a.expiryDate && !b.expiryDate) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          if (!a.expiryDate) return 1;
          if (!b.expiryDate) return -1;
          return new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime();
        }
        return 0;
      });
  }, [vaultItems, searchQuery, selectedAssetId, selectedAssetType, selectedCategory, selectedStatus, itemTypeFilter, sortBy]);

  // Unique categories for quick pills
  const categories = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => set.add(d.doc_type));
    assets.forEach((a) => {
      const label =
        a.type === "vehicle"
          ? "Vehicle"
          : a.type === "property"
          ? "Property"
          : a.type === "person"
          ? "Family Member"
          : "Other Asset";
      set.add(label);
    });
    return Array.from(set).sort();
  }, [documents, assets]);

  // Handlers for document actions
  const handleDownload = async (doc: DocumentItem) => {
    setActionLoading(`down-${doc.id}`);
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
    if (!confirm(`Permanently delete document "${doc.title}" and wipe encrypted file from disk?`)) return;
    try {
      await deleteDocument(doc.id);
      showToast(`Document "${doc.title}" deleted.`);
      if (activeDoc?.id === doc.id) setActiveDoc(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete document", "error");
    }
  };

  const handleDeleteAsset = async (asset: Asset) => {
    if (
      !confirm(
        `Permanently delete asset "${asset.name}" and all its associated documents from the vault?`
      )
    )
      return;
    try {
      await deleteAsset(asset.id);
      showToast(`Asset "${asset.name}" and associated records deleted.`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete asset", "error");
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

  // Add Asset form handler
  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssetFormError(null);

    const trimmedName = newAssetName.trim();
    if (!trimmedName) {
      setAssetFormError("Please enter a valid asset name.");
      return;
    }
    if (trimmedName.length < 2) {
      setAssetFormError("Asset name must be at least 2 characters.");
      return;
    }

    if (assetSubmitting) return;
    setAssetSubmitting(true);

    try {
      const created = await createAsset(trimmedName, newAssetType);
      setShowAddAsset(false);
      setNewAssetName("");
      setNewAssetType("vehicle");
      showToast(`Asset "${created.name}" registered in vault!`);
      // Immediately reload data to display the new asset in the vault listing
      await loadData();
    } catch (err: any) {
      setAssetFormError(err.message || "Could not register asset. Please try again.");
      showToast(err.message || "Could not create asset", "error");
    } finally {
      setAssetSubmitting(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedAssetId("all");
    setSelectedAssetType("all");
    setSelectedStatus("all");
    setSelectedCategory("all");
    setItemTypeFilter("all");
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "N/A";
    try {
      return new Date(isoString).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-slate-200/70 rounded-3xl" />
        <div className="h-14 bg-slate-200/70 rounded-2xl" />
        <div className="h-96 bg-slate-200/70 rounded-3xl" />
      </div>
    );
  }

  const isVaultTotallyEmpty = assets.length === 0 && documents.length === 0;

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
                All family documents and asset containers • Encrypted with AES-256-GCM storage
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-center">
          <button
            onClick={() => {
              setAssetFormError(null);
              setShowAddAsset(true);
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <Plus className="w-4 h-4 text-[#08C5B3]" /> Add Asset
          </button>

          {assets.length > 0 ? (
            <Link
              href={`/assets/${selectedAssetId !== "all" ? selectedAssetId : assets[0].id}/upload`}
              className="px-4 py-2.5 bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] text-xs font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" /> Upload Document
            </Link>
          ) : (
            <button
              onClick={() => {
                showToast("Please add an asset container first to upload documents for it.");
                setShowAddAsset(true);
              }}
              className="px-4 py-2.5 bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] text-xs font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" /> Upload Document
            </button>
          )}
        </div>
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 space-y-4">
        {/* Main Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          {/* Search bar */}
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, asset, number, or holder..."
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3] focus:border-[#08C5B3] transition-all"
            />
          </div>

          {/* Asset Type filter */}
          <div className="lg:col-span-2">
            <select
              value={selectedAssetType}
              onChange={(e) => setSelectedAssetType(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#08C5B3] cursor-pointer"
            >
              <option value="all">All Asset Types</option>
              <option value="vehicle">Vehicles</option>
              <option value="property">Properties</option>
              <option value="person">Family Members</option>
              <option value="other">Other Assets</option>
            </select>
          </div>

          {/* Specific Asset filter */}
          <div className="lg:col-span-2">
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
          <div className="lg:col-span-2">
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
              <option value="pending">Pending Documents</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="lg:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#08C5B3] cursor-pointer"
            >
              <option value="newest">Recently Added</option>
              <option value="expiry_asc">Expiry (Urgent first)</option>
              <option value="expiry_desc">Expiry (Furthest first)</option>
              <option value="title">Title / Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* View Mode Pills (All / Documents / Assets) & Category Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
              Show:
            </span>
            <button
              type="button"
              onClick={() => setItemTypeFilter("all")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                itemTypeFilter === "all"
                  ? "bg-[#0B1730] text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              All Items ({vaultItems.length})
            </button>
            <button
              type="button"
              onClick={() => setItemTypeFilter("documents")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                itemTypeFilter === "documents"
                  ? "bg-[#0B1730] text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Documents ({documents.length})
            </button>
            <button
              type="button"
              onClick={() => setItemTypeFilter("assets")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                itemTypeFilter === "assets"
                  ? "bg-[#0B1730] text-white"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Assets ({assets.length})
            </button>
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
                  ? "bg-[#08C5B3] text-[#0B1730]"
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
      </div>

      {/* Main Vault Results Section */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-extrabold text-[#0B1730]">
              Documents & Assets ({filteredItems.length} of {vaultItems.length})
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                {documents.length} {documents.length === 1 ? "document" : "documents"}
              </span>
              <span>•</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                {assets.length} {assets.length === 1 ? "asset" : "assets"}
              </span>
            </div>
          </div>

          {(searchQuery ||
            selectedAssetId !== "all" ||
            selectedAssetType !== "all" ||
            selectedStatus !== "all" ||
            selectedCategory !== "all" ||
            itemTypeFilter !== "all") && (
            <button
              onClick={resetFilters}
              className="text-xs font-bold text-teal-700 hover:text-teal-900 underline"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* 1. Empty Vault State (No Assets or Documents in the entire Vault) */}
        {isVaultTotallyEmpty ? (
          <div className="text-center py-16 px-4 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#08C5B3] flex items-center justify-center mx-auto mb-3 border border-teal-100 shadow-sm">
              <FolderLock className="w-7 h-7" />
            </div>
            <h3 className="font-extrabold text-[#0B1730] text-base">Your Vault is Empty</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Add your first vehicle, property, or family member to register asset containers and begin document autopilot.
            </p>
            <button
              onClick={() => {
                setAssetFormError(null);
                setShowAddAsset(true);
              }}
              className="mt-4 px-5 py-2.5 bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] font-extrabold text-xs rounded-xl shadow-sm transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Your First Asset
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          /* 2. Filter Empty State (Items exist, but none match current search/filter) */
          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="font-bold text-slate-800 text-sm">No items matching your criteria</h3>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search terms or filters</p>
            <button
              onClick={resetFilters}
              className="mt-3 text-xs font-bold text-[#08C5B3] hover:underline"
            >
              Reset all filters
            </button>
          </div>
        ) : (
          /* 3. Vault Listing */
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => {
              const isDoc = item.kind === "document";
              const exp = isDoc ? getExpiryInfo(item.expiryDate) : null;

              return (
                <div
                  key={item.id}
                  className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/80 -mx-3 px-3 rounded-2xl transition-colors"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Kind Badge */}
                      {isDoc ? (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-teal-600" />
                          {item.category}
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 flex items-center gap-1">
                          {getAssetCategoryIcon(item.assetType)}
                          {item.category}
                        </span>
                      )}

                      {/* Associated Asset Link / Container Tag */}
                      {isDoc ? (
                        <Link
                          href={`/assets/${item.assetId}`}
                          className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                        >
                          Asset: {item.assetName}
                        </Link>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-teal-50/70 text-teal-800 border border-teal-200/80">
                          Asset Container • {item.documentCount || 0}{" "}
                          {(item.documentCount || 0) === 1 ? "doc" : "docs"}
                        </span>
                      )}

                      {/* Title */}
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {item.title}
                      </span>

                      {/* Encryption Status Badge */}
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                        <Lock className="w-2.5 h-2.5" /> AES-256
                      </span>
                    </div>

                    {/* Metadata line: Document number, Holder, Expiry, Creation Date */}
                    <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                      {/* Document Number (Hide gracefully if unavailable) */}
                      {item.docNumber && (
                        <span>
                          Doc No: <strong className="text-slate-800 font-semibold">{item.docNumber}</strong>
                        </span>
                      )}

                      {/* Holder Name (Hide gracefully if unavailable) */}
                      {item.holderName && (
                        <span>
                          Holder: <strong className="text-slate-800 font-semibold">{item.holderName}</strong>
                        </span>
                      )}

                      {/* Expiry Pill for Documents */}
                      {isDoc && exp && (
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
                      )}

                      {/* Asset Document Status */}
                      {!isDoc && (
                        <span>
                          {(item.documentCount || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />{" "}
                              {item.documentCount} {(item.documentCount === 1 ? "document" : "documents")} active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600" /> Pending document upload
                            </span>
                          )}
                        </span>
                      )}

                      {/* Creation Date */}
                      <span className="text-[11px] text-slate-400">
                        Added: {formatDate(item.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {isDoc && item.rawDoc ? (
                      /* Document Actions */
                      <>
                        {/* Emergency sharing status toggle */}
                        <button
                          onClick={() => handleToggleShare(item.rawId)}
                          title={
                            item.isEmergencyShareable
                              ? "Click to set private"
                              : "Click to allow nominee emergency view"
                          }
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all ${
                            item.isEmergencyShareable
                              ? "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100"
                              : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                          }`}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          {item.isEmergencyShareable ? "Shared" : "Private"}
                        </button>

                        {/* View Details / Edit */}
                        <button
                          onClick={() => openPreview(item.rawDoc!, false)}
                          title="Preview details and edit metadata"
                          className="p-2 text-slate-600 hover:text-[#08C5B3] hover:bg-teal-50 rounded-xl border border-slate-200 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Decrypt & Download */}
                        <button
                          onClick={() => handleDownload(item.rawDoc!)}
                          disabled={actionLoading === `down-${item.rawId}`}
                          title="Decrypt and stream document file"
                          className="p-2 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-xl border border-slate-200 transition-colors"
                        >
                          {actionLoading === `down-${item.rawId}` ? (
                            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>

                        {/* Delete document */}
                        <button
                          onClick={() => handleDelete(item.rawDoc!)}
                          title="Permanently delete from vault"
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      /* Asset Actions */
                      <>
                        {/* Direct Upload link for this asset */}
                        <Link
                          href={`/assets/${item.rawId}/upload`}
                          title="Upload new document to this asset"
                          className="px-3 py-1.5 rounded-xl bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 text-xs font-bold flex items-center gap-1 transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5 text-teal-600" /> Upload
                        </Link>

                        {/* Open Asset Detail Page */}
                        <Link
                          href={`/assets/${item.rawId}`}
                          title="View asset checklist and details"
                          className="p-2 text-slate-600 hover:text-[#08C5B3] hover:bg-teal-50 rounded-xl border border-slate-200 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>

                        {/* Delete Asset */}
                        <button
                          onClick={() => item.rawAsset && handleDeleteAsset(item.rawAsset)}
                          title="Delete asset container and documents"
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
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
                    Associated Asset:{" "}
                    <strong className="text-slate-800">{activeDoc.asset_name || "None"}</strong>
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
                    <span
                      className={`font-bold ${
                        activeDoc.is_emergency_shareable ? "text-purple-700" : "text-slate-500"
                      }`}
                    >
                      {activeDoc.is_emergency_shareable ? "Enabled" : "Private Only"}
                    </span>
                  </div>
                </div>

                {/* Storage Security Details */}
                <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-[11px] text-teal-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Lock className="w-3.5 h-3.5 text-teal-700" /> AES-256-GCM Encrypted on Disk
                  </span>
                  <span className="font-mono text-teal-800 text-[10px]">
                    {activeDoc.original_filename}
                  </span>
                </div>

                {/* Raw OCR text snippet */}
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
                    onClick={() => {
                      setRenewingDoc(activeDoc);
                      try {
                        const parts = (activeDoc.expiry_date || "").split("-");
                        if (parts.length === 3) {
                          const nextYear = String(parseInt(parts[0], 10) + 1);
                          setRenewExpiryDate(`${nextYear}-${parts[1]}-${parts[2]}`);
                        }
                      } catch {
                        setRenewExpiryDate("");
                      }
                      setRenewIssueDate("");
                      setRenewFile(null);
                    }}
                    className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCw className="w-4 h-4 text-teal-600" /> Renew
                  </button>
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
                    <Download className="w-4 h-4" /> Download
                  </button>
                </div>
              </div>
            ) : (
              /* Edit Form Mode */
              <form onSubmit={handleSaveEdit} className="space-y-4 pt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Document Title *
                  </label>
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
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Document Type
                    </label>
                    <input
                      type="text"
                      value={editDocType}
                      onChange={(e) => setEditDocType(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Associated Asset
                    </label>
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
                    <p className="text-slate-500 text-[11px]">
                      Unlocks for nominee only if security waiting period expires
                    </p>
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
                  Register a container for your vehicle, property, or family member
                </p>
              </div>
              <button
                onClick={() => {
                  setAssetFormError(null);
                  setShowAddAsset(false);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {assetFormError && (
              <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{assetFormError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAsset} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Asset Name *
                </label>
                <input
                  type="text"
                  required
                  value={newAssetName}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  placeholder="e.g. Honda City, Flat 302, Self, Father"
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
                  onClick={() => {
                    setAssetFormError(null);
                    setShowAddAsset(false);
                  }}
                  className="flex-1 py-2.5 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assetSubmitting}
                  className="flex-1 py-2.5 text-xs font-extrabold rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] shadow-md shadow-[#08C5B3]/20 transition-all flex items-center justify-center gap-1.5"
                >
                  {assetSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    "Save Asset"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Renewal Modal */}
      {renewingDoc && (
        <div className="fixed inset-0 z-50 bg-[#0B1730]/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center">
                  <RotateCw className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Renew Document</h3>
                  <p className="text-xs text-slate-500 truncate max-w-xs">{renewingDoc.title}</p>
                </div>
              </div>
              <button
                onClick={() => setRenewingDoc(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmRenewal} className="mt-4 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Current Expiry:</span>
                  <span className="font-mono font-bold text-rose-600">
                    {renewingDoc.expiry_date || "Permanent / None"}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  New Confirmed Expiry Date *
                </label>
                <input
                  type="date"
                  required
                  value={renewExpiryDate}
                  onChange={(e) => setRenewExpiryDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  New Issue Date (Optional)
                </label>
                <input
                  type="date"
                  value={renewIssueDate}
                  onChange={(e) => setRenewIssueDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Upload Renewed File (Optional)
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setRenewFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-teal-50 file:text-teal-800 hover:file:bg-teal-100"
                />
              </div>

              <div className="pt-2 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setRenewingDoc(null)}
                  className="flex-1 py-2.5 text-xs font-bold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renewLoading}
                  className="flex-1 py-2.5 text-xs font-extrabold rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] shadow-md shadow-[#08C5B3]/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>{renewLoading ? "Renewing..." : "Confirm Renewal"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
