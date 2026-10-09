"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileText,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Lock,
  Loader2,
  Calendar,
  User as UserIcon,
  Hash,
  Building,
  Eye,
  Check,
} from "lucide-react";
import { getAsset, extractDocument, saveDocument } from "@/lib/api";
import { Asset, ExtractionResult, DocumentFields, DocumentConfidence } from "@/lib/types";

const KNOWN_DOC_TYPES = [
  "RC",
  "Insurance",
  "PUC",
  "Driving License",
  "Registry",
  "Property Tax Receipt",
  "Electricity Bill",
  "Rent Agreement",
  "Aadhaar",
  "PAN",
  "Passport",
  "Health Insurance",
  "Other",
];

const SAMPLE_FILES = [
  { name: "puc_honda.jpg", label: "PUC Certificate (25 days left)", type: "image/jpeg" },
  { name: "insurance_honda.jpg", label: "Insurance (12 days left)", type: "image/jpeg" },
  { name: "rc_honda.jpg", label: "Vehicle RC", type: "image/jpeg" },
  { name: "electricity_flat302.jpg", label: "Electricity Bill", type: "image/jpeg" },
  { name: "hindi_insurance.jpg", label: "Hindi Insurance Policy", type: "image/jpeg" },
  { name: "aadhaar_self.jpg", label: "Aadhaar Card (Govt ID)", type: "image/jpeg" },
  { name: "rent_agreement.pdf", label: "Residential Lease Agreement", type: "application/pdf" },
];

export default function DocumentUploadPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assetId = Number(params.id);
  const preselectedType = searchParams.get("doc_type");

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(true);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flow step: "select" | "extracting" | "confirm" | "saving"
  const [step, setStep] = useState<"select" | "extracting" | "confirm" | "saving">("select");
  const [extractError, setExtractError] = useState<string | null>(null);

  // Editable Form fields
  const [docType, setDocType] = useState<string>(preselectedType || "RC");
  const [title, setTitle] = useState<string>("");
  const [number, setNumber] = useState<string>("");
  const [holderName, setHolderName] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [issuer, setIssuer] = useState<string>("");
  const [isEmergencyShareable, setIsEmergencyShareable] = useState<boolean>(true);
  const [rawText, setRawText] = useState<string>("");
  const [tempFileToken, setTempFileToken] = useState<string>("");
  const [confidence, setConfidence] = useState<DocumentConfidence | null>(null);
  const [detectedLang, setDetectedLang] = useState<string>("en");

  useEffect(() => {
    async function fetchAsset() {
      try {
        const res = await getAsset(assetId);
        setAsset(res);
        if (preselectedType) {
          setDocType(preselectedType);
          setTitle(`${res.name} ${preselectedType}`);
        }
      } catch (err: any) {
        alert(err.message || "Failed to load asset");
        router.push("/dashboard");
      } finally {
        setLoadingAsset(false);
      }
    }
    fetchAsset();
  }, [assetId, preselectedType]);

  const handleFileChange = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert("File is too large. Maximum size is 10 MB.");
      return;
    }
    setSelectedFile(file);
    setExtractError(null);

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const selectSampleFile = (sample: (typeof SAMPLE_FILES)[0]) => {
    // Generate dummy file payload in memory
    const blob = new Blob([`Sample document content for ${sample.name}`], { type: sample.type });
    const file = new File([blob], sample.name, { type: sample.type });
    handleFileChange(file);
  };

  const handleExtract = async () => {
    if (!selectedFile) return;
    setStep("extracting");
    setExtractError(null);

    try {
      const result: ExtractionResult = await extractDocument(selectedFile);
      setDocType(result.doc_type || preselectedType || "Other");
      setTitle(result.title || `${asset?.name || "Asset"} ${result.doc_type}`);
      setNumber(result.fields?.number || "");
      setHolderName(result.fields?.holder_name || "");
      setIssueDate(result.fields?.issue_date || "");
      setExpiryDate(result.fields?.expiry_date || "");
      setIssuer(result.fields?.issuer || "");
      setRawText(result.raw_text || "");
      setConfidence(result.confidence || null);
      setDetectedLang(result.language || "en");
      if (result.temp_file_token) {
        setTempFileToken(result.temp_file_token);
      }

      // Critical docs default to emergency shareable
      const shareableDocs = ["RC", "Insurance", "Health Insurance", "Aadhaar", "Registry", "PAN"];
      setIsEmergencyShareable(shareableDocs.includes(result.doc_type));

      setStep("confirm");
    } catch (err: any) {
      // Fallback: don't crash, provide empty editable template
      setExtractError(
        "AI could not automatically read this document. Please verify and enter the fields manually."
      );
      setDocType(preselectedType || "Other");
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
      setConfidence(null);
      setStep("confirm");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Please provide a title for the document");
      return;
    }

    setStep("saving");

    try {
      const formData = new FormData();
      formData.append("asset_id", String(assetId));
      formData.append("doc_type", docType);
      formData.append("title", title);

      if (tempFileToken) {
        formData.append("temp_file_token", tempFileToken);
      } else if (selectedFile) {
        formData.append("file", selectedFile);
      }

      const fieldsObj: DocumentFields = {
        number: number || null,
        holder_name: holderName || null,
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
        issuer: issuer || null,
      };

      formData.append("fields_json", JSON.stringify(fieldsObj));
      formData.append("confidence_json", JSON.stringify(confidence || {}));
      formData.append("raw_text", rawText);
      formData.append("is_emergency_shareable", String(isEmergencyShareable));

      if (issueDate) formData.append("issue_date", issueDate);
      if (expiryDate) formData.append("expiry_date", expiryDate);

      await saveDocument(formData);

      // Redirect back to asset page
      router.push(`/assets/${assetId}`);
    } catch (err: any) {
      alert(err.message || "Failed to save document to encrypted vault");
      setStep("confirm");
    }
  };

  const getConfidenceBadge = (score?: number) => {
    if (score === undefined || score === null) return null;
    const pct = Math.round(score * 100);
    if (score >= 0.85) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
          <Check className="w-2.5 h-2.5" /> {pct}%
        </span>
      );
    }
    if (score >= 0.6) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
          <AlertCircle className="w-2.5 h-2.5" /> {pct}%
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 flex items-center gap-1">
        <HelpCircle className="w-2.5 h-2.5" /> Please verify ({pct}%)
      </span>
    );
  };

  if (loadingAsset) {
    return (
      <div className="flex items-center justify-center min-h-[350px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Back Link */}
      <Link
        href={`/assets/${assetId}`}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {asset?.name}
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">Upload Document</h1>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
            For {asset?.name}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          AI will automatically detect document type, holder name, and expiry dates. All files are encrypted with AES-256-GCM.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
        <div
          className={`py-2 px-3 rounded-xl border ${
            step === "select" || step === "extracting"
              ? "bg-[#0B1F3A] text-white border-[#0B1F3A]"
              : "bg-white text-slate-400 border-slate-200"
          }`}
        >
          1. Select File
        </div>
        <div
          className={`py-2 px-3 rounded-xl border ${
            step === "extracting"
              ? "bg-teal-500 text-slate-950 border-teal-500 animate-pulse"
              : step === "confirm" || step === "saving"
              ? "bg-[#0B1F3A] text-white border-[#0B1F3A]"
              : "bg-white text-slate-400 border-slate-200"
          }`}
        >
          2. AI Extract
        </div>
        <div
          className={`py-2 px-3 rounded-xl border ${
            step === "confirm" || step === "saving"
              ? "bg-teal-500 text-slate-950 border-teal-500"
              : "bg-white text-slate-400 border-slate-200"
          }`}
        >
          3. Verify & Save
        </div>
      </div>

      {/* STEP 1: File Selection */}
      {(step === "select" || step === "extracting") && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-6">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileChange(e.target.files[0]);
              }
            }}
          />

          {/* Drag & Drop Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
              selectedFile
                ? "border-teal-500 bg-teal-50/20"
                : "border-slate-200 hover:border-teal-400 hover:bg-slate-50/50"
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 mx-auto flex items-center justify-center mb-3">
              <Upload className="w-6 h-6" />
            </div>

            {selectedFile ? (
              <div>
                <p className="text-sm font-bold text-slate-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {(selectedFile.size / 1024).toFixed(1)} KB • Click to change
                </p>
                {previewUrl && (
                  <div className="mt-4 max-h-40 overflow-hidden rounded-xl border border-slate-200 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Preview" className="max-h-40 object-contain mx-auto" />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Tap to upload or take a photo of document
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports JPG, PNG, WEBP, PDF (Up to 10 MB)
                </p>
              </div>
            )}
          </div>

          {/* Quick Demo Samples */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              ⚡ Quick Demo Sample Files
            </p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_FILES.map((sample) => (
                <button
                  key={sample.name}
                  type="button"
                  onClick={() => selectSampleFile(sample)}
                  className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${
                    selectedFile?.name === sample.name
                      ? "bg-[#0B1F3A] text-teal-400 border-[#0B1F3A] font-bold"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  {sample.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Click any demo sample above to simulate Indian document files without uploading your own.
            </p>
          </div>

          {/* Extract Button */}
          <div className="pt-2">
            <button
              onClick={handleExtract}
              disabled={!selectedFile || step === "extracting"}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                !selectedFile || step === "extracting"
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-teal-500 hover:bg-teal-600 text-slate-950 shadow-md shadow-teal-500/20"
              }`}
            >
              {step === "extracting" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  Reading your document with AI...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  Extract with AI
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Extraction Loading State Overlay / Card */}
      {step === "extracting" && (
        <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-sm space-y-4 animate-pulse">
          <div className="w-16 h-16 rounded-3xl bg-teal-50 text-teal-600 mx-auto flex items-center justify-center">
            <Sparkles className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Reading your document...</h3>
            <p className="text-xs text-slate-500 mt-1">
              Extracting document type, policy/license number, holder details, and validity dates.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-teal-800 bg-teal-50 px-3 py-1 rounded-full font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            AES-256 Encrypted In-Transit
          </div>
        </div>
      )}

      {/* STEP 3: Verification & Confirmation Screen */}
      {(step === "confirm" || step === "saving") && (
        <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-6">
          {extractError && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{extractError}</span>
            </div>
          )}

          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Verify Extracted Information</h2>
              <p className="text-xs text-slate-500">
                Review and edit any field before encrypting and saving to your vault.
              </p>
            </div>
            {detectedLang === "hi" && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                🇮🇳 Hindi Document
              </span>
            )}
          </div>

          <div className="space-y-4">
            {/* Document Type */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Document Type *</label>
                {getConfidenceBadge(confidence?.doc_type)}
              </div>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
              >
                {KNOWN_DOC_TYPES.map((type) => (
                  <option key={type} value={type} className="text-slate-900 bg-white">
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Document Title *</label>
              </div>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Honda City Comprehensive Insurance"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Document / Policy Number */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Document / Policy Number</label>
                {getConfidenceBadge(confidence?.number)}
              </div>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="e.g. DL-1420110012345 or POL-992182"
                  className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                    confidence?.number !== undefined && confidence.number < 0.6
                      ? "border-amber-300 bg-amber-50/30"
                      : "border-slate-200 bg-white"
                  }`}
                />
              </div>
            </div>

            {/* Holder Name */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Holder Name</label>
                {getConfidenceBadge(confidence?.holder_name)}
              </div>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="e.g. Rajesh Kumar"
                  className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                    confidence?.holder_name !== undefined && confidence.holder_name < 0.6
                      ? "border-amber-300 bg-amber-50/30"
                      : "border-slate-200 bg-white"
                  }`}
                />
              </div>
            </div>

            {/* Dates Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Issue Date */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Issue Date</label>
                  {getConfidenceBadge(confidence?.issue_date)}
                </div>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Expiry Date</label>
                  {getConfidenceBadge(confidence?.expiry_date)}
                </div>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                      confidence?.expiry_date !== undefined && confidence.expiry_date < 0.6
                        ? "border-amber-300 bg-amber-50/30"
                        : "border-slate-200 bg-white"
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Issuer / Authority */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Issuing Authority / Company</label>
              </div>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  placeholder="e.g. HDFC ERGO / Transport Department"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Emergency Nominee Sharing Toggle */}
            <div className="pt-2">
              <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEmergencyShareable}
                  onChange={(e) => setIsEmergencyShareable(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-900">Include in Emergency Nominee Access</p>
                  <p className="text-slate-500 mt-0.5">
                    If enabled, approved family nominees can view this document after waiting period expires.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-3">
            <button
              type="button"
              onClick={() => setStep("select")}
              className="w-1/3 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
            >
              Re-upload
            </button>
            <button
              type="submit"
              disabled={step === "saving"}
              className="w-2/3 py-3 px-4 rounded-xl bg-teal-500 hover:bg-teal-600 text-slate-950 text-xs font-bold shadow-md shadow-teal-500/20 flex items-center justify-center gap-2"
            >
              {step === "saving" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  Encrypting & Saving...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-slate-950" />
                  Confirm & Save to Vault
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Security Disclaimer */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-700">AES-256 Authenticated Encryption:</span> Smart Vault extracts information present on the uploaded document. It does not claim government authenticity verification. Files are encrypted on device before storage.
        </div>
      </div>
    </div>
  );
}
