"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import {
  getAsset,
  deleteDocument,
  downloadDecryptedDocument,
  toggleShareable,
  deleteAsset,
} from "@/lib/api";
import { Asset, DocumentItem } from "@/lib/types";

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = Number(params.id);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const loadAsset = async () => {
    try {
      const res = await getAsset(assetId);
      setAsset(res);
    } catch (err: any) {
      alert(err.message || "Failed to load asset");
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAsset();
  }, [assetId]);

  const handleDeleteDoc = async (docId: number) => {
    if (!confirm("Are you sure you want to delete this document from your encrypted vault?")) return;
    try {
      await deleteDocument(docId);
      loadAsset();
    } catch (err: any) {
      alert(err.message || "Could not delete document");
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    setActionLoading(doc.id);
    try {
      await downloadDecryptedDocument(doc.id, doc.original_filename);
    } catch (err: any) {
      alert(err.message || "Could not download document");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleShare = async (docId: number) => {
    try {
      await toggleShareable(docId);
      loadAsset();
    } catch (err: any) {
      alert(err.message || "Could not toggle sharing status");
    }
  };

  const handleDeleteAsset = async () => {
    if (!confirm(`Are you sure you want to delete ${asset?.name} and all its documents?`)) return;
    try {
      await deleteAsset(assetId);
      router.push("/dashboard");
    } catch (err: any) {
      alert(err.message || "Could not delete asset");
    }
  };

  const getAssetIcon = (type?: string) => {
    switch (type) {
      case "vehicle":
        return <Car className="w-6 h-6 text-blue-500" />;
      case "property":
        return <Home className="w-6 h-6 text-emerald-500" />;
      case "person":
        return <UserIcon className="w-6 h-6 text-purple-500" />;
      default:
        return <Folder className="w-6 h-6 text-slate-500" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-32 bg-slate-200 rounded-xl" />
        <div className="h-40 bg-slate-200 rounded-3xl" />
        <div className="h-64 bg-slate-200 rounded-3xl" />
      </div>
    );
  }

  if (!asset) return null;

  return (
    <div className="space-y-6 pb-12">
      {/* Back button */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      {/* Asset Header Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            {getAssetIcon(asset.type)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{asset.name}</h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-slate-100 text-slate-600">
                {asset.type}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {asset.documents?.length || 0} documents in vault • AES-256 encrypted
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Link
            href={`/assets/${asset.id}/upload`}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-slate-950 text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            <Upload className="w-4 h-4" /> Upload Document
          </Link>
          <button
            onClick={handleDeleteAsset}
            title="Delete Asset"
            className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Missing-Document Detector Card */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Missing-Document Detector</h2>
            <p className="text-xs text-slate-500">
              Checklist of standard legal documents expected for a {asset.type} in India
            </p>
          </div>
          {asset.missing_docs && asset.missing_docs.length > 0 ? (
            <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
              {asset.missing_docs.length} Missing
            </span>
          ) : (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Complete
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
                    {item.present ? "Document uploaded" : item.optional ? "Optional" : "Required"}
                  </p>
                </div>
              </div>

              {!item.present && (
                <Link
                  href={`/assets/${asset.id}/upload`}
                  className="ml-2 text-[11px] font-bold text-teal-700 hover:text-teal-900 bg-white px-2 py-1 rounded-lg border border-teal-200 shrink-0 shadow-2xs"
                >
                  Upload
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Uploaded Documents List */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <h2 className="text-sm font-bold text-slate-900 mb-4">
          Vault Documents ({asset.documents?.length || 0})
        </h2>

        {!asset.documents || asset.documents.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-3xl">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">No documents uploaded yet</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Upload photos or PDFs — AI will extract policy numbers, holder names & expiry dates
            </p>
            <Link
              href={`/assets/${asset.id}/upload`}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-teal-500 text-slate-950 font-bold text-xs rounded-xl shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" /> Upload First Document
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {asset.documents.map((doc) => (
              <div
                key={doc.id}
                className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                      {doc.doc_type}
                    </span>
                    <span className="text-sm font-bold text-slate-900">{doc.title}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                      <Lock className="w-2.5 h-2.5" /> Encrypted Blob
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    {doc.fields?.number && <span>No: <strong className="text-slate-700">{doc.fields.number}</strong></span>}
                    {doc.fields?.holder_name && <span>Holder: <strong className="text-slate-700">{doc.fields.holder_name}</strong></span>}
                    {doc.expiry_date && (
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Clock className="w-3 h-3 text-amber-500" /> Expiry: {doc.expiry_date}
                      </span>
                    )}
                  </div>
                </div>

                {/* Document Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {/* Emergency shareable toggle */}
                  <button
                    onClick={() => handleToggleShare(doc.id)}
                    title={doc.is_emergency_shareable ? "Accessible to nominee in emergency" : "Private only"}
                    className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border flex items-center gap-1 transition-colors ${
                      doc.is_emergency_shareable
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : "bg-slate-100 text-slate-400 border-slate-200"
                    }`}
                  >
                    <Share2 className="w-3 h-3" />
                    {doc.is_emergency_shareable ? "Emergency Shared" : "Private"}
                  </button>

                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={actionLoading === doc.id}
                    title="Decrypt & Stream File"
                    className="p-2 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-xl transition-colors border border-slate-200"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteDoc(doc.id)}
                    title="Delete Document"
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
