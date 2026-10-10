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
  Plus,
  Trash2,
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
  "Voter ID",
  "Health Insurance",
  "Other",
];

const SAMPLE_FILES = [
  { name: "rc_honda.jpg", label: "Vehicle RC Smartcard", type: "image/jpeg" },
  { name: "insurance_honda.jpg", label: "HDFC ERGO Motor Policy", type: "image/jpeg" },
  { name: "puc_honda.jpg", label: "PUC Certificate (Vehicle)", type: "image/jpeg" },
  { name: "aadhaar_self.jpg", label: "Aadhaar Card (Govt ID)", type: "image/jpeg" },
  { name: "electricity_flat302.jpg", label: "Electricity Bill (Property)", type: "image/jpeg" },
  { name: "hindi_insurance.jpg", label: "Hindi Insurance Policy", type: "image/jpeg" },
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

  // Flow step: "select" | "extracting" | "confirm"
  const [step, setStep] = useState<"select" | "extracting" | "confirm">("select");
  const [isSaving, setIsSaving] = useState<boolean>(false);
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
  const [extraFields, setExtraFields] = useState<Record<string, any>>({});
  const [userEditedFields, setUserEditedFields] = useState<Set<string>>(new Set());
  const [isEmergencyShareable, setIsEmergencyShareable] = useState<boolean>(true);
  const [rawText, setRawText] = useState<string>("");
  const [tempFileToken, setTempFileToken] = useState<string>("");
  const [confidence, setConfidence] = useState<DocumentConfidence | null>(null);
  const [detectedLang, setDetectedLang] = useState<string>("en");
  const [extractionProvider, setExtractionProvider] = useState<string>("local_ocr");

  // New extra field draft
  const [newExtraKey, setNewExtraKey] = useState("");
  const [newExtraVal, setNewExtraVal] = useState("");

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

  const selectSampleFile = async (sample: (typeof SAMPLE_FILES)[0]) => {
    try {
      const res = await fetch(`/samples/${sample.name}`);
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], sample.name, { type: sample.type });
        handleFileChange(file);
        return;
      }
    } catch (e) {
      console.warn("Could not fetch sample from /samples/, falling back", e);
    }
    const blob = new Blob([`Smart Vault verified sample payload for ${sample.name}`], { type: sample.type });
    const file = new File([blob], sample.name, { type: sample.type });
    handleFileChange(file);
  };

  const markFieldEdited = (fieldKey: string) => {
    setUserEditedFields((prev) => new Set(prev).add(fieldKey));
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
      setExtraFields(result.fields?.extra || {});
      setRawText(result.raw_text || "");
      setConfidence(result.confidence || null);
      setDetectedLang(result.language || "en");
      setExtractionProvider((result as any).provider || "local_ocr");
      setUserEditedFields(new Set());

      if (result.temp_file_token) {
        setTempFileToken(result.temp_file_token);
      }

      // Default high-value family documents to emergency shareable
      const shareableDocs = ["RC", "Insurance", "Health Insurance", "Aadhaar", "Registry", "PAN", "Passport"];
      setIsEmergencyShareable(shareableDocs.includes(result.doc_type));

      setStep("confirm");
    } catch (err: any) {
      setExtractError(
        err.message || "AI could not read all fields automatically. Please review and enter details manually."
      );
      setDocType(preselectedType || "Other");
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
      setConfidence(null);
      setExtraFields({});
      setUserEditedFields(new Set());
      setStep("confirm");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Please provide a title for the document");
      return;
    }

    setIsSaving(true);

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
        extra: extraFields,
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
    } finally {
      setIsSaving(false);
    }
  };

  const getConfidenceBadge = (fieldKey: string, score?: number) => {
    if (userEditedFields.has(fieldKey)) {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          User edited
        </span>
      );
    }
    if (score === undefined || score === null || score === 0.0) {
      return (
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
          Not detected
        </span>
      );
    }
    const pct = Math.round(score * 100);
    if (score >= 0.85) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 flex items-center gap-1 border border-teal-200">
          <Check className="w-2.5 h-2.5 text-teal-700" /> AI extracted ({pct}%)
        </span>
      );
    }
    if (score >= 0.5) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 flex items-center gap-1 border border-amber-200">
          <AlertCircle className="w-2.5 h-2.5 text-amber-700" /> Review ({pct}%)
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 flex items-center gap-1 border border-rose-200">
        <HelpCircle className="w-2.5 h-2.5 text-rose-700" /> Low confidence ({pct}%)
      </span>
    );
  };

  // Document-type specific labeling
  const getNumberLabel = (type: string) => {
    switch (type) {
      case "RC":
        return "Vehicle Registration Number";
      case "PAN":
        return "Permanent Account Number (PAN)";
      case "Aadhaar":
        return "Aadhaar Number (Masked XXXX-XXXX-####)";
      case "Driving License":
        return "Driving License Number";
      case "Passport":
        return "Passport Number";
      case "Voter ID":
        return "EPIC / Voter ID Number";
      case "Insurance":
      case "Health Insurance":
        return "Policy / Member Number";
      case "PUC":
        return "PUC Certificate Number";
      case "Electricity Bill":
        return "Consumer / CA Number";
      case "Property Tax Receipt":
        return "Receipt / Property ID Number";
      case "Registry":
        return "Deed / Document Number";
      case "Rent Agreement":
        return "Agreement / Reference Number";
      default:
        return "Document / Reference Number";
    }
  };

  const getHolderLabel = (type: string) => {
    switch (type) {
      case "RC":
        return "Registered Vehicle Owner";
      case "PAN":
      case "Aadhaar":
      case "Driving License":
      case "Passport":
        return "Cardholder / Full Legal Name";
      case "Voter ID":
        return "Elector Name";
      case "Insurance":
      case "Health Insurance":
        return "Insured Person / Policyholder";
      case "Electricity Bill":
        return "Consumer Name";
      case "Property Tax Receipt":
        return "Taxpayer / Property Owner";
      case "Registry":
        return "Purchaser / Buyer Name";
      case "Rent Agreement":
        return "Tenant Name";
      default:
        return "Primary Holder / Party Name";
    }
  };

  const getIssueDateLabel = (type: string) => {
    switch (type) {
      case "RC":
        return "Registration Date";
      case "Insurance":
        return "Policy Start Date";
      case "PUC":
        return "Testing Date";
      case "Electricity Bill":
        return "Bill Date";
      case "Property Tax Receipt":
        return "Payment Date";
      case "Rent Agreement":
        return "Agreement / Start Date";
      default:
        return "Issue Date";
    }
  };

  const getExpiryDateLabel = (type: string) => {
    switch (type) {
      case "Aadhaar":
      case "PAN":
      case "Voter ID":
      case "Registry":
        return "Expiry Date (Permanent / Not Applicable)";
      case "Electricity Bill":
        return "Payment Due Date";
      case "Rent Agreement":
        return "Tenancy Expiry Date";
      case "Insurance":
      case "Health Insurance":
      case "PUC":
      case "Driving License":
      case "Passport":
        return "Policy Expiry / Valid Until";
      default:
        return "Expiry / Validity Date";
    }
  };

  const handleAddExtraField = () => {
    if (!newExtraKey.trim()) return;
    const cleanKey = newExtraKey.trim().toLowerCase().replace(/\s+/g, "_");
    setExtraFields((prev) => ({ ...prev, [cleanKey]: newExtraVal.trim() }));
    markFieldEdited(`extra_${cleanKey}`);
    setNewExtraKey("");
    setNewExtraVal("");
  };

  const handleRemoveExtraField = (key: string) => {
    setExtraFields((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
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
      <div>
        <Link
          href={`/assets/${assetId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to {asset?.name || "Asset"}
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-[#0B1730] tracking-tight">Upload Document</h1>
        <p className="text-xs text-slate-500 mt-1">
          Add a legal or ownership document for{" "}
          <strong className="text-slate-800">{asset?.name}</strong>. Smart Vault uses OCR and AI to extract
          details for your review before saving with AES-256 encryption.
        </p>
      </div>

      {/* Step 1: File Selection */}
      {step === "select" && (
        <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80 space-y-6">
          {/* Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-slate-300 hover:border-[#08C5B3] rounded-2xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-teal-50/20 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
              }}
            />
            <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-[#08C5B3] flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800">
              {selectedFile ? selectedFile.name : "Click to upload or drag & drop"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Supports JPG, PNG, WEBP, and PDF up to 10 MB
            </p>
          </div>

          {/* Selected File Card */}
          {selectedFile && (
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-teal-50/50 border border-teal-100">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-[#08C5B3]" />
                <div>
                  <p className="text-xs font-bold text-slate-800">{selectedFile.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || "Document"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
              >
                Change
              </button>
            </div>
          )}

          {/* Sample Files for Testing */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Or test with sample documents (Processes real file bytes):
            </p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_FILES.map((sample) => (
                <button
                  key={sample.name}
                  type="button"
                  onClick={() => selectSampleFile(sample)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-900 transition-colors text-slate-700"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {/* Continue Button */}
          <button
            type="button"
            disabled={!selectedFile}
            onClick={handleExtract}
            className="w-full py-3 px-4 rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] disabled:bg-slate-200 disabled:text-slate-400 text-[#0B1730] text-xs font-extrabold shadow-md shadow-[#08C5B3]/20 flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4 text-[#0B1730]" /> Extract Document Details with AI
          </button>
        </div>
      )}

      {/* Step 2: Processing / OCR Extraction */}
      {step === "extracting" && (
        <div className="bg-white rounded-3xl p-12 shadow-xs border border-slate-200/80 text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-[#08C5B3] border-t-transparent animate-spin"></div>
            <Sparkles className="w-6 h-6 text-[#08C5B3] absolute inset-0 m-auto animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Processing Uploaded File...</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Scanning document contents, performing text extraction, and structuring fields for review.
            </p>
          </div>
        </div>
      )}

      {/* Step 3: Review & Confirmation Form */}
      {step === "confirm" && (
        <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80 space-y-6">
          {/* AI Extraction Review Banner */}
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">AI extracted — review required</p>
              <p className="text-amber-800 mt-0.5 leading-relaxed">
                Document fields have been extracted from your file. Please verify every field below against your original document before saving. Smart Vault extraction is an assistance tool and does not prove legal authenticity or government verification.
              </p>
            </div>
          </div>

          {extractError && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{extractError}</span>
            </div>
          )}

          {/* Form Fields */}
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
                {getConfidenceBadge("doc_type", confidence?.doc_type)}
              </div>
              <select
                value={docType}
                onChange={(e) => {
                  setDocType(e.target.value);
                  markFieldEdited("doc_type");
                }}
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
                onChange={(e) => {
                  setTitle(e.target.value);
                  markFieldEdited("title");
                }}
                placeholder="e.g. Honda City Registration Certificate"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
              />
            </div>

            {/* Document / Identification Number */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800">{getNumberLabel(docType)}</label>
                {getConfidenceBadge("number", confidence?.number)}
              </div>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={number}
                  onChange={(e) => {
                    setNumber(e.target.value);
                    markFieldEdited("number");
                  }}
                  placeholder="Enter document number if present"
                  className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border ${
                    !number ? "border-amber-200 bg-amber-50/20" : "border-slate-300 bg-white"
                  } text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]`}
                />
              </div>
              {!number && (
                <p className="text-[11px] text-amber-700 mt-1">Not found in document text — enter manually if available</p>
              )}
            </div>

            {/* Holder Name */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800">{getHolderLabel(docType)}</label>
                {getConfidenceBadge("holder_name", confidence?.holder_name)}
              </div>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={holderName}
                  onChange={(e) => {
                    setHolderName(e.target.value);
                    markFieldEdited("holder_name");
                  }}
                  placeholder="Enter party / holder name"
                  className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border ${
                    !holderName ? "border-amber-200 bg-amber-50/20" : "border-slate-300 bg-white"
                  } text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]`}
                />
              </div>
              {!holderName && (
                <p className="text-[11px] text-amber-700 mt-1">Not found in document text — enter manually if available</p>
              )}
            </div>

            {/* Dates Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Issue Date */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800">{getIssueDateLabel(docType)}</label>
                  {getConfidenceBadge("issue_date", confidence?.issue_date)}
                </div>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => {
                      setIssueDate(e.target.value);
                      markFieldEdited("issue_date");
                    }}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                  />
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800">{getExpiryDateLabel(docType)}</label>
                  {getConfidenceBadge("expiry_date", confidence?.expiry_date)}
                </div>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => {
                      setExpiryDate(e.target.value);
                      markFieldEdited("expiry_date");
                    }}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                  />
                </div>
                {["Aadhaar", "PAN", "Voter ID", "Registry"].includes(docType) && !expiryDate && (
                  <p className="text-[11px] text-slate-400 mt-1">Permanent document (no expiry date)</p>
                )}
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
                  onChange={(e) => {
                    setIssuer(e.target.value);
                    markFieldEdited("issuer");
                  }}
                  placeholder="e.g. Transport Department / Insurance Company"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                />
              </div>
            </div>

            {/* Document-Specific Additional Details Section */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Document-Specific Details
                </p>
                <span className="text-[10px] font-semibold text-slate-500">
                  {Object.keys(extraFields).length} field(s)
                </span>
              </div>

              {Object.keys(extraFields).length === 0 ? (
                <p className="text-xs text-slate-400 italic">No additional specific fields extracted.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(extraFields).map(([k, v]) => (
                    <div key={k} className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-700 capitalize">
                          {k.replace(/_/g, " ")}
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveExtraField(k)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                          title="Remove field"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={v !== null && v !== undefined ? String(v) : ""}
                        onChange={(e) => {
                          setExtraFields((prev) => ({ ...prev, [k]: e.target.value }));
                          markFieldEdited(`extra_${k}`);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Add Custom Field */}
              <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Field name (e.g. Engine No)"
                  value={newExtraKey}
                  onChange={(e) => setNewExtraKey(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#08C5B3]"
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={newExtraVal}
                  onChange={(e) => setNewExtraVal(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#08C5B3]"
                />
                <button
                  type="button"
                  onClick={handleAddExtraField}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            {/* OCR Extracted Text Preview */}
            {rawText && (
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Extracted Raw Text Snippet
                </p>
                <div className="max-h-24 overflow-y-auto p-3 rounded-xl bg-slate-50 text-[11px] font-mono text-slate-700 whitespace-pre-wrap border border-slate-200">
                  {rawText}
                </div>
              </div>
            )}

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
              disabled={isSaving}
              className="w-2/3 py-3 px-4 rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] text-xs font-extrabold shadow-md shadow-[#08C5B3]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-75"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#0B1730]" />
                  Encrypting & Saving...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-[#0B1730]" />
                  Save Document to Vault
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
