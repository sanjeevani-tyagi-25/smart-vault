"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  ShieldAlert,
  Clock,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Lock,
  Eye,
  Download,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Check,
  History,
  AlertCircle,
  HelpCircle,
  Info,
} from "lucide-react";
import {
  getNominees,
  addNominee,
  deleteNominee,
  getAccessRequests,
  requestEmergencyAccess,
  vetoAccessRequest,
  approveAccessRequest,
  getNomineeDocuments,
  downloadDecryptedDocument,
  getToken,
} from "@/lib/api";
import { Nominee, AccessRequest, DocumentItem } from "@/lib/types";

export default function NomineesPage() {
  const router = useRouter();
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Nominee Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("Spouse");
  const [addingNominee, setAddingNominee] = useState(false);

  // Nominee View Simulation Mode (Demo)
  const [isNomineeView, setIsNomineeView] = useState(false);
  const [nomineeDocs, setNomineeDocs] = useState<DocumentItem[]>([]);
  const [loadingNomineeDocs, setLoadingNomineeDocs] = useState(false);
  const [nomineeDocError, setNomineeDocError] = useState<string | null>(null);

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    try {
      const [noms, reqs] = await Promise.all([getNominees(), getAccessRequests()]);
      setNominees(noms);
      setRequests(reqs);

      // Check if there is an active pending request
      const pending = reqs.find((r) => r.status === "pending");
      if (pending) {
        setCountdown(pending.seconds_remaining);
      } else {
        setCountdown(null);
      }
    } catch (err: any) {
      console.error("Failed to load nominee data:", err);
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

  // Countdown timer effect
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          loadData();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleAddNominee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setAddingNominee(true);
    try {
      await addNominee(name.trim(), email.trim(), relationship);
      setName("");
      setEmail("");
      setRelationship("Spouse");
      setShowAddModal(false);
      showToast(`Nominee "${name}" added successfully.`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Could not add nominee", "error");
    } finally {
      setAddingNominee(false);
    }
  };

  const handleDeleteNominee = async (id: number, nomineeName: string) => {
    if (!confirm(`Remove ${nomineeName} from emergency vault access?`)) return;
    try {
      await deleteNominee(id);
      showToast(`Removed nominee ${nomineeName}.`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Could not delete nominee", "error");
    }
  };

  const handleRequestEmergency = async (nomineeId: number, nomName: string) => {
    setActionLoading(true);
    try {
      const newReq = await requestEmergencyAccess(nomineeId);
      setCountdown(newReq.seconds_remaining);
      showToast(`Emergency countdown started for ${nomName} (60s demo waiting period).`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to trigger emergency access request", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVeto = async (requestId: number) => {
    if (!confirm("Are you sure you want to VETO this emergency access request? The nominee will remain blocked.")) return;
    setActionLoading(true);
    try {
      await vetoAccessRequest(requestId);
      setCountdown(null);
      showToast("Access request VETOED. Emergency access is locked.");
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Could not veto request", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (requestId: number) => {
    if (!confirm("Approve emergency access immediately? This unlocks emergency-authorized documents without waiting for the timer.")) return;
    setActionLoading(true);
    try {
      await approveAccessRequest(requestId);
      setCountdown(null);
      showToast("Emergency access approved immediately.");
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Could not approve request", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleNomineeView = async () => {
    const nextState = !isNomineeView;
    setIsNomineeView(nextState);
    if (nextState) {
      setLoadingNomineeDocs(true);
      setNomineeDocError(null);
      try {
        const docs = await getNomineeDocuments();
        setNomineeDocs(docs);
      } catch (err: any) {
        setNomineeDocError(err.message || "Emergency access has not been unlocked or was vetoed.");
        setNomineeDocs([]);
      } finally {
        setLoadingNomineeDocs(false);
      }
    }
  };

  const handleDownloadDoc = async (doc: DocumentItem) => {
    try {
      await downloadDecryptedDocument(doc.id, doc.original_filename);
      showToast(`Downloaded "${doc.title}"`);
    } catch (err: any) {
      showToast(err.message || "Could not decrypt document", "error");
    }
  };

  const latestRequest = requests[0];
  const isPending = latestRequest && latestRequest.status === "pending";
  const isApproved = latestRequest && latestRequest.status === "approved";
  const isVetoed = latestRequest && latestRequest.status === "vetoed";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[350px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#08C5B3]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-[#0B1730]">Emergency Nominee Access</h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
              Enforced Server-Side
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Trusted family members can request emergency access with an owner veto window.
          </p>
        </div>

        {/* Demo Mode Toggle: Switch between Owner View and Nominee Portal View */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleNomineeView}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
              isNomineeView
                ? "bg-[#0B1730] text-[#5EEAD4] border border-[#08C5B3]"
                : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Eye className="w-4 h-4 text-[#08C5B3]" />
            {isNomineeView ? "Return to Owner View" : "Demo: Open Nominee Portal"}
          </button>
        </div>
      </div>

      {/* Emergency Safeguard Overview Banner */}
      <div className="p-5 rounded-2xl bg-[#0B1730] text-white border border-[#1E3258] shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-[#5EEAD4] flex items-center justify-center shrink-0 border border-teal-500/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm text-white">Active Safeguard Protocol</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#101D36] text-amber-300 border border-amber-500/30">
                60s Demo Window (7 days in production)
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              If an emergency occurs, nominees can request access. The owner receives immediate notification and can VETO the request. If the timer expires or owner approves, only documents marked as &ldquo;Emergency Shared&rdquo; are visible.
            </p>
          </div>
        </div>
      </div>

      {/* --- SIMULATED NOMINEE VIEW (DEMO PORTAL) --- */}
      {isNomineeView && (
        <div className="bg-[#101D36] text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-[#08C5B3]/40 space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between pb-4 border-b border-[#1E3258]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#08C5B3]/20 text-[#5EEAD4] flex items-center justify-center border border-[#08C5B3]/30">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">Nominee Emergency Portal</h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40">
                    READ-ONLY MODE
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Simulating what your nominee sees. Documents not authorized for emergency sharing are strictly hidden server-side.
                </p>
              </div>
            </div>

            <button
              onClick={handleToggleNomineeView}
              className="text-xs px-3 py-1.5 bg-[#0B1730] hover:bg-[#162749] text-slate-300 border border-[#1E3258] rounded-xl transition-colors font-medium"
            >
              Back to Owner
            </button>
          </div>

          {loadingNomineeDocs ? (
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#08C5B3] mx-auto mb-2" />
              <p className="text-xs text-slate-300">Checking server authorization clearance...</p>
            </div>
          ) : nomineeDocError ? (
            <div className="p-6 rounded-2xl bg-red-950/40 border border-red-500/40 text-center space-y-3">
              <ShieldAlert className="w-8 h-8 text-red-400 mx-auto" />
              <div>
                <h3 className="text-sm font-bold text-red-200">Access Restricted</h3>
                <p className="text-xs text-red-300/80 mt-1">{nomineeDocError}</p>
              </div>
              <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                Emergency access is locked because no active request has been approved or completed its waiting period. Click &ldquo;Return to Owner View&rdquo; and click &ldquo;Request Emergency Access&rdquo; to simulate a real unlock.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal-300">
                  {nomineeDocs.length} Emergency Documents Authorized
                </p>
                <span className="text-[11px] text-slate-400">Editing, updating, and deletion disabled</span>
              </div>

              {nomineeDocs.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  No documents currently marked for emergency sharing.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {nomineeDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-4 rounded-2xl bg-[#0B1730] border border-[#1E3258] flex items-center justify-between hover:border-teal-500/40 transition-colors"
                    >
                      <div className="min-w-0 pr-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                          {doc.doc_type}
                        </span>
                        <h4 className="text-sm font-bold text-white truncate mt-1.5">{doc.title}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {doc.expiry_date ? `Expires: ${doc.expiry_date}` : "Permanent Document"}
                        </p>
                      </div>

                      <button
                        onClick={() => handleDownloadDoc(doc)}
                        title="Download Decrypted File"
                        className="p-2.5 rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] font-bold transition-all shadow-sm shrink-0"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- ACTIVE EMERGENCY COUNTDOWN & VETO / APPROVE CONTROLS --- */}
      {isPending && latestRequest && (
        <div className="bg-red-950/60 border-2 border-red-500 rounded-3xl p-6 sm:p-7 shadow-xl space-y-4 animate-in zoom-in-95">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-red-600/30 animate-pulse">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-white">Emergency Access Requested!</h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white uppercase tracking-wider animate-pulse">
                    ACTIVE COUNTDOWN
                  </span>
                </div>
                <p className="text-xs text-red-200 mt-1">
                  Nominee <strong className="text-white">{latestRequest.nominee_name}</strong> requested emergency access.
                  You can immediately veto to lock the vault, or approve right now to grant access.
                </p>
              </div>
            </div>

            {/* Countdown box */}
            <div className="text-center sm:text-right px-4 py-2.5 bg-[#0B1730] rounded-2xl border border-red-500/40">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Unlocks in</span>
              <div className="text-3xl font-extrabold text-red-400 font-mono">
                {countdown !== null ? `${countdown}s` : "0s"}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
            <button
              onClick={() => handleApprove(latestRequest.id)}
              disabled={actionLoading}
              className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> APPROVE IMMEDIATELY
            </button>
            <button
              onClick={() => handleVeto(latestRequest.id)}
              disabled={actionLoading}
              className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md shadow-red-600/30 flex items-center justify-center gap-1.5 transition-all"
            >
              <Ban className="w-4 h-4" /> VETO ACCESS NOW
            </button>
          </div>
        </div>
      )}

      {/* Safeguard Status & Nominees List */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-[#0B1730]">Safeguard Status</h2>
            <p className="text-xs text-slate-500">
              Enforced server-side with cryptographic access tokens
            </p>
          </div>

          {isPending ? (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-800 border border-red-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 animate-spin text-red-600" /> Countdown Active
            </span>
          ) : isApproved ? (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Emergency Access Unlocked
            </span>
          ) : isVetoed ? (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5 text-slate-500" /> Last Request Vetoed
            </span>
          ) : (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#08C5B3]" /> Standby & Armed
            </span>
          )}
        </div>

        {/* Nominees Grid */}
        <div>
          <div className="flex items-center justify-between mb-3.5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Trusted Nominees ({nominees.length})
            </h3>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Nominee
            </button>
          </div>

          {nominees.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-800">No Nominees Registered</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                Add a spouse, parent, child, or legal counsel. Nominees contribute 20 points toward your family readiness score.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-3 px-4 py-2 bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] font-extrabold text-xs rounded-xl shadow-xs"
              >
                + Add Family Nominee
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {nominees.map((nom) => (
                <div
                  key={nom.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm shrink-0 border border-teal-200">
                      {nom.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900">{nom.name}</h4>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          {nom.relationship}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {nom.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{nom.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* Trigger Emergency Simulation */}
                    <button
                      onClick={() => handleRequestEmergency(nom.id, nom.name)}
                      disabled={actionLoading || Boolean(isPending)}
                      className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                        isPending
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 shadow-2xs"
                      }`}
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                      Request Emergency Access
                    </button>

                    <button
                      onClick={() => handleDeleteNominee(nom.id, nom.name)}
                      title="Remove Nominee"
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition-colors"
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

      {/* Access Request History / Timeline */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-200/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#08C5B3]" />
            <h3 className="text-base font-extrabold text-[#0B1730]">Access Request Timeline</h3>
          </div>
          <span className="text-xs text-slate-400">{requests.length} records</span>
        </div>

        {requests.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">No emergency access requests on record.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">
                      {req.nominee_name || `Nominee #${req.nominee_id}`}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        req.status === "approved"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : req.status === "vetoed"
                          ? "bg-red-100 text-red-800 border border-red-200"
                          : "bg-amber-100 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5 font-mono">
                    Requested: {new Date(req.requested_at).toLocaleString("en-IN")}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {req.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleApprove(req.id)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleVeto(req.id)}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs"
                      >
                        VETO
                      </button>
                    </>
                  )}
                  {req.resolved_at && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      Resolved: {new Date(req.resolved_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Nominee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-[#0B1730]/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-[#0B1730]">Add Trusted Nominee</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Trusted family contact for emergency document access
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNominee} className="space-y-4 pt-1">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya.sharma@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Relationship *</label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#08C5B3] cursor-pointer"
                >
                  <option value="Spouse">Spouse</option>
                  <option value="Child">Child</option>
                  <option value="Parent">Parent</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Lawyer">Legal Counsel</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingNominee}
                  className="flex-1 py-2.5 rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] font-extrabold text-xs shadow-md shadow-[#08C5B3]/20 flex items-center justify-center gap-1.5"
                >
                  {addingNominee ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Nominee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
