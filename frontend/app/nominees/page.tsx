"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  RefreshCw,
} from "lucide-react";
import {
  getNominees,
  addNominee,
  deleteNominee,
  getAccessRequests,
  requestEmergencyAccess,
  vetoAccessRequest,
  getNomineeDocuments,
  downloadDecryptedDocument,
} from "@/lib/api";
import { Nominee, AccessRequest, DocumentItem } from "@/lib/types";

export default function NomineesPage() {
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
    loadData();
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          // Reload to trigger lazy resolution
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
      await addNominee(name, email, relationship);
      setName("");
      setEmail("");
      setRelationship("Spouse");
      setShowAddModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Could not add nominee");
    } finally {
      setAddingNominee(false);
    }
  };

  const handleDeleteNominee = async (id: number) => {
    if (!confirm("Remove this nominee from emergency access?")) return;
    try {
      await deleteNominee(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Could not delete nominee");
    }
  };

  const handleRequestEmergency = async (nomineeId: number) => {
    setActionLoading(true);
    try {
      const newReq = await requestEmergencyAccess(nomineeId);
      setCountdown(newReq.seconds_remaining);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Failed to trigger emergency access request");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVeto = async (requestId: number) => {
    if (!confirm("Are you sure you want to VETO this emergency access request immediately?")) return;
    setActionLoading(true);
    try {
      await vetoAccessRequest(requestId);
      setCountdown(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Could not veto request");
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
    } catch (err: any) {
      alert(err.message || "Could not decrypt document");
    }
  };

  const latestRequest = requests[0];
  const isPending = latestRequest && latestRequest.status === "pending";
  const isApproved = latestRequest && latestRequest.status === "approved";
  const isVetoed = latestRequest && latestRequest.status === "vetoed";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[350px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Emergency Nominee Access</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
              Zero-Knowledge Safeguard
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Trusted family members can request emergency access to essential documents with a timed security countdown and owner veto.
          </p>
        </div>

        {/* Demo Mode Toggle: Switch to Nominee View */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleNomineeView}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${
              isNomineeView
                ? "bg-[#0B1F3A] text-teal-400 border border-teal-500"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Eye className="w-4 h-4" />
            {isNomineeView ? "Exit Nominee View" : "Demo: Switch to Nominee View"}
          </button>
        </div>
      </div>

      {/* --- SIMULATED NOMINEE VIEW (DEMO) --- */}
      {isNomineeView ? (
        <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-teal-500/30 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">Nominee Emergency Portal</h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40">
                    READ-ONLY
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Simulating nominee access. Only documents explicitly marked for emergency sharing are visible.
                </p>
              </div>
            </div>

            <button
              onClick={handleToggleNomineeView}
              className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              Back to Owner
            </button>
          </div>

          {loadingNomineeDocs ? (
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400">Verifying emergency access clearance...</p>
            </div>
          ) : nomineeDocError ? (
            <div className="p-6 rounded-2xl bg-red-950/40 border border-red-500/40 text-center space-y-3">
              <ShieldAlert className="w-8 h-8 text-red-400 mx-auto" />
              <div>
                <h3 className="text-sm font-bold text-red-200">Access Restricted</h3>
                <p className="text-xs text-red-300/80 mt-1">{nomineeDocError}</p>
              </div>
              <p className="text-[11px] text-slate-400">
                To unlock, trigger an emergency access request below as the owner or wait for the countdown to expire.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal-300">
                  {nomineeDocs.length} Emergency Documents Unlocked
                </p>
                <span className="text-[11px] text-slate-400">Owner editing & deletion disabled</span>
              </div>

              {nomineeDocs.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  No documents marked for emergency access.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {nomineeDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-between hover:border-slate-600 transition-colors"
                    >
                      <div className="min-w-0 pr-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                          {doc.doc_type}
                        </span>
                        <h4 className="text-sm font-bold text-white truncate mt-1">{doc.title}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {doc.expiry_date ? `Expires: ${doc.expiry_date}` : "Permanent Document"}
                        </p>
                      </div>

                      <button
                        onClick={() => handleDownloadDoc(doc)}
                        title="Download Decrypted File"
                        className="p-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold transition-all shadow-sm"
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
      ) : null}

      {/* --- LIVE EMERGENCY COUNTDOWN / STATUS BANNER --- */}
      {isPending && latestRequest && (
        <div className="bg-red-500/10 border-2 border-red-500 rounded-3xl p-6 sm:p-8 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-red-500 text-white flex items-center justify-center shrink-0 animate-pulse">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-red-950">Emergency Access Requested!</h2>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-600 text-white uppercase tracking-wider animate-pulse">
                    LIVE COUNTDOWN
                  </span>
                </div>
                <p className="text-xs text-red-800 mt-1">
                  Nominee <span className="font-bold">{latestRequest.nominee_name}</span> requested vault access.
                  If you do not veto within the security window, emergency documents will automatically unlock.
                </p>
              </div>
            </div>

            {/* Live countdown display */}
            <div className="text-center sm:text-right px-4 py-2 bg-white/80 rounded-2xl border border-red-200">
              <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Unlocks in</span>
              <div className="text-3xl font-extrabold text-red-600 font-mono">
                {countdown !== null ? `${countdown}s` : "0s"}
              </div>
            </div>
          </div>

          {/* VETO ACTION BUTTON */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
            <button
              onClick={() => handleVeto(latestRequest.id)}
              disabled={actionLoading}
              className="w-full sm:w-auto px-8 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 transition-all"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Ban className="w-4 h-4 text-white" />
              )}
              VETO ACCESS NOW
            </button>
          </div>
        </div>
      )}

      {/* Access Status Summary Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Current Safeguard Status</h2>
            <p className="text-xs text-slate-500">
              Waiting period: 60s demo mode (7 days in production).
            </p>
          </div>

          {isPending ? (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-800 border border-red-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 animate-spin" /> Countdown Running
            </span>
          ) : isApproved ? (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Emergency Access Unlocked
            </span>
          ) : isVetoed ? (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5" /> Request Vetoed & Secured
            </span>
          ) : (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Standby & Armed
            </span>
          )}
        </div>

        {/* Nominees List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Trusted Nominees ({nominees.length})
            </h3>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Nominee
            </button>
          </div>

          {nominees.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">No Nominees Registered</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Add a spouse, parent, or trusted family member to complete your family readiness score.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-3 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold text-xs rounded-xl"
              >
                Add Family Nominee
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {nominees.map((nom) => (
                <div
                  key={nom.id}
                  className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm">
                      {nom.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{nom.name}</h4>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          {nom.relationship}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {nom.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{nom.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* Trigger Emergency Simulation Button for this nominee */}
                    <button
                      onClick={() => handleRequestEmergency(nom.id)}
                      disabled={actionLoading || isPending}
                      className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                        isPending
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                      }`}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Request Emergency Access
                    </button>

                    <button
                      onClick={() => handleDeleteNominee(nom.id)}
                      title="Remove Nominee"
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Past Access History / Requests */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Access Request History</h3>

        {requests.length === 0 ? (
          <p className="text-xs text-slate-400">No past emergency access requests recorded.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="p-3.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">
                      {req.nominee_name || `Nominee #${req.nominee_id}`}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        req.status === "approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : req.status === "vetoed"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {req.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Requested: {new Date(req.requested_at).toLocaleString()}
                  </p>
                </div>

                {req.status === "pending" && (
                  <button
                    onClick={() => handleVeto(req.id)}
                    className="px-3 py-1 bg-red-600 text-white font-bold rounded-lg text-xs"
                  >
                    VETO
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Nominee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add Trusted Nominee</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Nominees can access emergency-tagged documents only if you don&apos;t veto the 60s request.
            </p>

            <form onSubmit={handleAddNominee} className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya.sharma@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Relationship</label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all cursor-pointer"
                >
                  <option value="Spouse" className="text-slate-900 bg-white">Spouse</option>
                  <option value="Child" className="text-slate-900 bg-white">Child</option>
                  <option value="Parent" className="text-slate-900 bg-white">Parent</option>
                  <option value="Sibling" className="text-slate-900 bg-white">Sibling</option>
                  <option value="Lawyer" className="text-slate-900 bg-white">Legal Counsel</option>
                  <option value="Other" className="text-slate-900 bg-white">Other</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingNominee}
                  className="w-1/2 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 flex items-center justify-center gap-1.5"
                >
                  {addingNominee ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Save Nominee"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
