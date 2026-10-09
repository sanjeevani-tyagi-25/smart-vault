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
  Check,
  Folder,
  ArrowRight,
  Info,
} from "lucide-react";
import { getAsset, getAssets, extractDocument, saveDocument, getToken } from "@/lib/api";
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
  { name: "puc_honda.jpg", label: "PUC Certificate (Vehicle)", type: "image/jpeg" },
  { name: "insurance_honda.jpg", label: "HDFC ERGO Motor Policy", type: "image/jpeg" },
  { name: "rc_honda.jpg", label: "Vehicle RC Smartcard", type: "image/jpeg" },
  { name: "electricity_flat302.jpg", label: "Electricity Bill (Property)", type: "image/jpeg" },
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
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [loadingAsset, setLoadingAsset] = useState(true);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flow step: "select" | "extracting" | "confirm" | "saving"
  const [step, setStep] = useState<"select" | "extracting" | "confirm" | "saving">("select");
  const [extractError, setExtractError] = useState<string | null>(null);

  // Form fields
  const [selectedAssetId, setSelectedAssetId] = useState<number>(assetId);
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
    async function init() {
      const token = getToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      try {
        const [currAsset, assetList] = await Promise.all([getAsset(assetId), getAssets()]);
        setAsset(currAsset);
        setAllAssets(assetList);
        setSelectedAssetId(assetId);
        if (preselectedType) {
          setDocType(preselectedType);
          setTitle(`${currAsset.name} ${preselectedType}`);
        }
      } catch (err: any) {
        console.error("Upload init error:", err);
        router.push("/dashboard");
      } finally {
        setLoadingAsset(false);
      }
    }
    init();
  }, [assetId, preselectedType, router]);

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
    const blob = new Blob([`Smart Vault verified sample payload for ${sample.name}`], { type: sample.type });
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

      // Default high-value family documents to emergency shareable
      const shareableDocs = ["RC", "Insurance", "Health Insurance", "Aadhaar", "Registry", "PAN"];
      setIsEmergencyShareable(shareableDocs.includes(result.doc_type));

      setStep("confirm");
    } catch (err: any) {
      setExtractError(
        err.message || "AI could not read all fields automatically. Please review and enter details manually."
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
      formData.append("asset_id", String(selectedAssetId));
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
      router.push(`/assets/${selectedAssetId}`);
    } catch (err: any) {
      alert(err.message || "Failed to save document to encrypted vault");
      setStep("confirm");
    }
  };

  const getConfidenceBadge = (score?: number) => {
    if (score === undefined || score === null) {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          Manual input
        </span>
      );
    }
    const pct = Math.round(score * 100);
    if (score >= 0.85) {
      return (
        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-200">
          <Check className="w-2.5 h-2.5" /> AI Verified ({pct}%)
        </span>
      );
    }
    if (score >= 0.6) {
      return (
        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1 border border-amber-200">
          <AlertCircle className="w-2.5 h-2.5" /> Review ({pct}%)
        </span>
      );
    }
    return (
      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-red-100 text-red-800 flex items-center gap-1 border border-red-200">
        <HelpCircle className="w-2.5 h-2.5" /> Low confidence ({pct}%)
      </span>
    );
  };

  if (loadingAsset) {
    return (
      <div className="flex items-center justify-center min-h-[350px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#08C5B3]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Back Link */}
      <Link
        href={`/assets/${assetId}`}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {asset?.name}
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-extrabold text-[#0B1730]">AI Document Upload</h1>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
            For {asset?.name}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Upload images or PDFs. Gemini AI extracts document numbers, dates, and names. All blobs are encrypted with AES-256-GCM.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
        <div
          className={`py-2 px-3 rounded-xl border transition-all ${
            step === "select" || step === "extracting"
              ? "bg-[#0B1730] text-white border-[#0B1730] shadow-xs"
              : "bg-white text-slate-400 border-slate-200"
          }`}
        >
          1. Select File
        </div>
        <div
          className={`py-2 px-3 rounded-xl border transition-all ${
            step === "extracting"
              ? "bg-[#08C5B3] text-[#0B1730] border-[#08C5B3] animate-pulse"
              : step === "confirm" || step === "saving"
              ? "bg-[#0B1730] text-white border-[#0B1730]"
              : "bg-white text-slate-400 border-slate-200"
          }`}
        >
          2. AI Extract
        </div>
        <div
          className={`py-2 px-3 rounded-xl border transition-all ${
            step === "confirm" || step === "saving"
              ? "bg-[#08C5B3] text-[#0B1730] border-[#08C5B3] shadow-xs"
              : "bg-white text-slate-400 border-slate-200"
          }`}
        >
          3. Review & Save
        </div>
      </div>

      {/* STEP 1: File Selection */}
      {(step === "select" || step === "extracting") && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-slate-200/80 space-y-6">
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
                ? "border-[#08C5B3] bg-teal-50/30"
                : "border-slate-300 hover:border-[#08C5B3] hover:bg-slate-50/50"
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#08C5B3] mx-auto flex items-center justify-center mb-3 border border-teal-100">
              <Upload className="w-6 h-6" />
            </div>

            {selectedFile ? (
              <div>
                <p className="text-sm font-bold text-slate-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {(selectedFile.size / 1024).toFixed(1)} KB • Click to choose a different file
                </p>
                {previewUrl && (
                  <div className="mt-4 max-h-48 overflow-hidden rounded-xl border border-slate-200 inline-block bg-white p-1 shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Preview" className="max-h-44 object-contain mx-auto rounded-lg" />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Click to browse or drop document file here
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports JPG, PNG, WEBP, PDF (Max 10 MB)
                </p>
              </div>
            )}
          </div>

          {/* Quick Demo Indian Document Samples */}
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2.5">
              ⚡ Quick Demo Sample Documents
            </p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_FILES.map((sample) => (
                <button
                  key={sample.name}
                  type="button"
                  onClick={() => selectSampleFile(sample)}
                  className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${
                    selectedFile?.name === sample.name
                      ? "bg-[#0B1730] text-[#5EEAD4] border-[#0B1730] font-bold shadow-xs"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  {sample.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Select any sample above to simulate Indian document files without needing a local upload.
            </p>
          </div>

          {/* Extract Button */}
          <div className="pt-2">
            <button
              onClick={handleExtract}
              disabled={!selectedFile || step === "extracting"}
              className={`w-full py-3.5 px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all ${
                !selectedFile || step === "extracting"
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] shadow-md shadow-[#08C5B3]/20"
              }`}
            >
              {step === "extracting" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#0B1730]" />
                  Extracting document with AI...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#0B1730]" />
                  Extract with AI
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Extraction Loading State Overlay / Card */}
      {step === "extracting" && (
        <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-xs space-y-4 animate-pulse">
          <div className="w-16 h-16 rounded-3xl bg-teal-50 text-[#08C5B3] mx-auto flex items-center justify-center border border-teal-100">
            <Sparkles className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Processing document with AI vision...</h3>
            <p className="text-xs text-slate-500 mt-1">
              Extracting document type, policy/license number, holder name, and validity dates.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-teal-800 bg-teal-50 px-3 py-1 rounded-full font-semibold border border-teal-200">
            <ShieldCheck className="w-3.5 h-3.5 text-[#08C5B3]" />
            Encrypted In-Transit & at Rest
          </div>
        </div>
      )}

      {/* STEP 3: Review & Verification Screen */}
      {(step === "confirm" || step === "saving") && (
        <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-slate-200/80 space-y-5">
          {extractError && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{extractError}</span>
            </div>
          )}

          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-extrabold text-[#0B1730]">Review & Confirm Extracted Metadata</h2>
              <p className="text-xs text-slate-500">
                Correct any field before encrypting and storing in your vault.
              </p>
            </div>
            {detectedLang === "hi" && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                🇮🇳 Hindi Document
              </span>
            )}
          </div>

          <div className="space-y-4">
            {/* Asset Association Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Associate With Asset *
              </label>
              <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#08C5B3] cursor-pointer"
              >
                {allAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Document Type */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800">Document Type *</label>
                {getConfidenceBadge(confidence?.doc_type)}
              </div>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#08C5B3] cursor-pointer"
              >
                {KNOWN_DOC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">Document Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Honda City Comprehensive Insurance"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
              />
            </div>

            {/* Document / Policy Number */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800">Document / Policy Number</label>
                {getConfidenceBadge(confidence?.number)}
              </div>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="e.g. DL-1420110012345 or POL-992182"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                />
              </div>
            </div>

            {/* Holder Name */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800">Holder Name</label>
                {getConfidenceBadge(confidence?.holder_name)}
              </div>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                />
              </div>
            </div>

            {/* Dates Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Issue Date */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800">Issue Date</label>
                  {getConfidenceBadge(confidence?.issue_date)}
                </div>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                  />
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800">Expiry Date</label>
                  {getConfidenceBadge(confidence?.expiry_date)}
                </div>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                  />
                </div>
              </div>
            </div>

            {/* Issuer / Authority */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">Issuing Authority / Company</label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  placeholder="e.g. HDFC ERGO / Transport Department"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
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
                  className="mt-1 w-4 h-4 rounded text-teal-600 focus:ring-[#08C5B3] border-slate-300"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-900">Include in Emergency Nominee Access</p>
                  <p className="text-slate-500 mt-0.5">
                    If authorized, approved nominees can view this document only after the security waiting period expires.
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
              className="w-1/3 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={step === "saving"}
              className="w-2/3 py-3 px-4 rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] text-xs font-extrabold shadow-md shadow-[#08C5B3]/20 flex items-center justify-center gap-2 transition-all"
            >
              {step === "saving" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#0B1730]" />
                  Encrypting & Saving...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-[#0B1730]" />
                  Save Verified Document to Vault
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Security Statement */}
      <div className="p-4 rounded-2xl bg-[#0B1730] text-slate-300 border border-[#1E3258] text-[11px] flex items-start gap-3">
        <Lock className="w-4 h-4 text-[#08C5B3] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-white">AES-256 Authenticated Encryption at Rest:</span> Smart Vault extracts text with AI and stores the original file encrypted using authenticated AES-256-GCM. Unencrypted files are wiped from temporary memory.
        </div>
      </div>
    </div>
  );
}
