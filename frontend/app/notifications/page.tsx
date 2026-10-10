"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Check,
  CheckCheck,
  X,
  Calendar,
  Settings,
  RefreshCw,
  Mail,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Plus,
  Trash2,
  Upload,
  FileText,
  RotateCw,
} from "lucide-react";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  getReminderSettings,
  updateReminderSettings,
  triggerNotificationsCheck,
  renewDocument,
  getToken,
} from "@/lib/api";
import { NotificationItem, ReminderSettings } from "@/lib/types";

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "soon" | "expired" | "renewed" | "dismissed">("all");

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ReminderSettings>({
    user_id: 0,
    intervals: [30, 7, 1, 0],
    email_enabled: true,
  });
  const [selectedIntervals, setSelectedIntervals] = useState<number[]>([30, 7, 1, 0]);
  const [customIntervalInput, setCustomIntervalInput] = useState<string>("");
  const [emailToggle, setEmailToggle] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Renewal Modal state
  const [renewingDoc, setRenewingDoc] = useState<NotificationItem | null>(null);
  const [newExpiryDate, setNewExpiryDate] = useState<string>("");
  const [newIssueDate, setNewIssueDate] = useState<string>("");
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
      const [items, setts] = await Promise.all([
        getNotifications(true), // load both active and dismissed
        getReminderSettings(),
      ]);
      setNotifications(items || []);
      if (setts) {
        setSettings(setts);
        setSelectedIntervals(setts.intervals || [30, 7, 1, 0]);
        setEmailToggle(setts.email_enabled ?? true);
      }
    } catch (err: any) {
      console.error("Notifications load error:", err);
      showToast(err.message || "Failed to load notifications", "error");
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

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await triggerNotificationsCheck();
      showToast(`Checked expiries: ${res.created_count} new alerts, ${res.updated_count} updated.`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      showToast("Notification marked as read");
    } catch (err: any) {
      showToast(err.message || "Failed to mark as read", "error");
    }
  };

  const handleDismiss = async (id: number) => {
    try {
      await dismissNotification(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, is_dismissed: true, dismissed_at: new Date().toISOString() } : n
        )
      );
      showToast("Notification dismissed");
    } catch (err: any) {
      showToast(err.message || "Failed to dismiss notification", "error");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      showToast(`Marked ${res.updated} notifications as read`);
    } catch (err: any) {
      showToast(err.message || "Failed to mark all as read", "error");
    }
  };

  const handleToggleInterval = (day: number) => {
    if (selectedIntervals.includes(day)) {
      setSelectedIntervals(selectedIntervals.filter((d) => d !== day));
    } else {
      setSelectedIntervals([...selectedIntervals, day].sort((a, b) => b - a));
    }
  };

  const handleAddCustomInterval = () => {
    const parsed = parseInt(customIntervalInput.trim(), 10);
    if (isNaN(parsed) || parsed < 0) {
      showToast("Please enter a valid positive number of days", "error");
      return;
    }
    if (!selectedIntervals.includes(parsed)) {
      setSelectedIntervals([...selectedIntervals, parsed].sort((a, b) => b - a));
    }
    setCustomIntervalInput("");
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const updated = await updateReminderSettings({
        intervals: selectedIntervals,
        email_enabled: emailToggle,
      });
      setSettings(updated);
      showToast("Reminder preferences saved successfully!");
      setShowSettings(false);
      // Trigger check with new intervals
      await triggerNotificationsCheck();
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to update reminder settings", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // Renewal submit handler
  const handleConfirmRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewingDoc || !renewingDoc.document_id) return;
    if (!newExpiryDate) {
      showToast("Please select the new confirmed expiry date", "error");
      return;
    }

    setRenewLoading(true);
    try {
      await renewDocument(renewingDoc.document_id, newExpiryDate, {
        issueDate: newIssueDate || undefined,
        file: renewFile,
      });
      showToast(`Document "${renewingDoc.title}" renewed! Expiry updated to ${newExpiryDate}.`);
      setRenewingDoc(null);
      setNewExpiryDate("");
      setNewIssueDate("");
      setRenewFile(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Renewal failed", "error");
    } finally {
      setRenewLoading(false);
    }
  };

  const openRenewalModal = (notif: NotificationItem) => {
    setRenewingDoc(notif);
    // suggest date 1 year from previous expiry if possible
    if (notif.expiry_date) {
      try {
        const parts = notif.expiry_date.split("-");
        if (parts.length === 3) {
          const nextYear = String(parseInt(parts[0], 10) + 1);
          setNewExpiryDate(`${nextYear}-${parts[1]}-${parts[2]}`);
        }
      } catch {
        setNewExpiryDate("");
      }
    } else {
      setNewExpiryDate("");
    }
    setNewIssueDate("");
    setRenewFile(null);
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeTab === "unread") return !n.is_read && !n.is_dismissed;
      if (activeTab === "soon") return (n.severity === "soon" || n.severity === "urgent") && !n.is_dismissed;
      if (activeTab === "expired") return n.severity === "expired" && !n.is_dismissed;
      if (activeTab === "renewed") return n.severity === "renewed" || n.state === "renewed";
      if (activeTab === "dismissed") return n.is_dismissed;
      // "all" tab excludes dismissed by default unless user goes to dismissed tab
      return !n.is_dismissed;
    });
  }, [notifications, activeTab]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read && !n.is_dismissed).length;
  }, [notifications]);

  const getSeverityStyle = (severity: string, daysLeft: number) => {
    switch (severity) {
      case "expired":
        return {
          badgeBg: "bg-red-500/15 text-red-400 border-red-500/30",
          cardBorder: "border-red-500/30 bg-[#16121f]",
          label: daysLeft < 0 ? `Expired (${Math.abs(daysLeft)} days ago)` : "Expired Today",
          icon: ShieldAlert,
          iconColor: "text-red-400",
        };
      case "urgent":
        return {
          badgeBg: "bg-rose-500/15 text-rose-300 border-rose-500/30",
          cardBorder: "border-rose-500/30 bg-[#181324]",
          label: daysLeft === 0 ? "Expires Today" : `Expires in ${daysLeft} days`,
          icon: AlertTriangle,
          iconColor: "text-rose-400",
        };
      case "soon":
        return {
          badgeBg: "bg-amber-500/15 text-amber-300 border-amber-500/30",
          cardBorder: "border-amber-500/30 bg-[#171927]",
          label: `Expiring Soon (${daysLeft} days left)`,
          icon: Clock,
          iconColor: "text-amber-400",
        };
      case "upcoming":
        return {
          badgeBg: "bg-teal-500/15 text-teal-300 border-teal-500/30",
          cardBorder: "border-[#1E3258] bg-[#0E1B33]",
          label: `Upcoming Reminder (${daysLeft} days left)`,
          icon: Bell,
          iconColor: "text-teal-400",
        };
      case "renewed":
        return {
          badgeBg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
          cardBorder: "border-emerald-500/30 bg-[#0E2325]",
          label: "Renewed / Up to date",
          icon: CheckCircle2,
          iconColor: "text-emerald-400",
        };
      default:
        return {
          badgeBg: "bg-slate-500/15 text-slate-300 border-slate-500/30",
          cardBorder: "border-[#1E3258] bg-[#0E1B33]",
          label: `${daysLeft} days left`,
          icon: Bell,
          iconColor: "text-slate-400",
        };
    }
  };

  return (
    <div className="min-h-screen bg-[#070E1E] text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border text-xs font-semibold animate-in slide-in-from-bottom-5 ${
            toast.type === "success"
              ? "bg-[#0B1E38] text-[#5EEAD4] border-[#08C5B3]/40 shadow-[#08C5B3]/20"
              : "bg-[#251018] text-rose-300 border-rose-500/40 shadow-rose-500/20"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4 text-[#08C5B3]" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="bg-white dark:bg-[#0B1730] rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-[#1E3258] shadow-xs dark:shadow-2xl text-slate-900 dark:text-white flex flex-col md:flex-row md:items-center justify-between gap-6 transition-colors">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#08C5B3] to-[#5EEAD4] flex items-center justify-center text-[#0B1730] font-bold shadow-md shadow-[#08C5B3]/25">
                <Bell className="w-5 h-5 text-[#0B1730]" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-[#0B1730] dark:text-white tracking-tight">
                  Notification Centre & Smart Reminders
                </h1>
                <p className="text-xs text-teal-700 dark:text-teal-300 font-medium mt-0.5">
                  Timezone: <span className="font-mono text-slate-900 dark:text-white">Asia/Kolkata (IST)</span> • Automated background expiry checks
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-3 max-w-2xl leading-relaxed">
              Track upcoming policy renewals, passport expiries, and vehicle certifications with zero manual calculations.
              Reminders are calculated against your confirmed document dates with multi-interval scheduling and duplicate prevention.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                showSettings
                  ? "bg-[#08C5B3] text-[#0B1730] border-[#08C5B3] shadow-md shadow-[#08C5B3]/25"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 dark:bg-[#101D36] dark:text-slate-200 dark:border-[#1E3258] dark:hover:border-teal-400 dark:hover:text-white"
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Reminder Settings</span>
            </button>

            <button
              onClick={handleManualSync}
              disabled={syncing}
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#101D36] dark:text-slate-200 dark:border-[#1E3258] dark:hover:border-teal-400 dark:hover:text-white text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
              title="Run background expiry evaluator now"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin text-teal-400" : ""}`} />
              <span>{syncing ? "Checking..." : "Sync Checks"}</span>
            </button>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="px-3.5 py-2.5 rounded-xl bg-teal-500/10 text-teal-700 dark:text-[#5EEAD4] border border-[#08C5B3]/30 hover:bg-[#08C5B3]/20 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
        </div>

        {/* Settings Drawer / Panel */}
        {showSettings && (
          <div className="bg-white dark:bg-[#0B1730] rounded-3xl p-6 border border-slate-200 dark:border-[#08C5B3]/30 shadow-xl space-y-6 transition-colors">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#1E3258]">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-teal-600 dark:text-[#5EEAD4]" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Reminder Schedule Preferences</h2>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Reminder Intervals */}
              <div>
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                  Active Reminder Intervals
                </label>
                <p className="text-xs text-slate-400 mb-3">
                  Choose days before document expiry when you wish to receive persistent notifications.
                </p>

                <div className="flex flex-wrap gap-2 mb-3">
                  {[60, 30, 15, 7, 3, 1, 0].map((days) => {
                    const isSelected = selectedIntervals.includes(days);
                    const label = days === 0 ? "Expiry Day (0d)" : `${days} days before`;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => handleToggleInterval(days)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                          isSelected
                            ? "bg-[#08C5B3] text-[#0B1730] border-[#08C5B3] shadow-sm shadow-[#08C5B3]/30"
                            : "bg-[#101D36] text-slate-400 border-[#1E3258] hover:text-white hover:border-slate-500"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Add Custom Interval */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Custom days (e.g. 45)"
                    value={customIntervalInput}
                    onChange={(e) => setCustomIntervalInput(e.target.value)}
                    className="w-44 px-3 py-1.5 rounded-xl bg-[#101D36] border border-[#1E3258] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#08C5B3]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomInterval}
                    className="px-3 py-1.5 rounded-xl bg-[#162749] text-teal-300 border border-[#1E3258] hover:bg-[#1E3258] text-xs font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Interval
                  </button>
                </div>
              </div>

              {/* Email Delivery Toggle */}
              <div className="bg-[#101D36] p-4 rounded-2xl border border-[#1E3258] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-[#5EEAD4]" /> Email Alerts (Resend)
                    </span>
                    <button
                      type="button"
                      onClick={() => setEmailToggle(!emailToggle)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        emailToggle ? "bg-[#08C5B3]" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          emailToggle ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    When active, critical alerts (expired, 7-day, 1-day) send an encrypted-safe email summary with a secure link to your vault.
                    Actual delivery requires <code className="text-teal-300">RESEND_API_KEY</code> set in your environment.
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#1E3258] flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="px-5 py-2 rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] font-bold text-xs shadow-md shadow-[#08C5B3]/25 transition-all disabled:opacity-50"
                  >
                    {savingSettings ? "Saving..." : "Save Preferences"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1E3258] pb-3">
          {[
            { id: "all", label: "All Active", count: notifications.filter((n) => !n.is_dismissed).length },
            { id: "unread", label: "Unread", count: unreadCount },
            { id: "soon", label: "Expiring Soon", count: notifications.filter((n) => (n.severity === "soon" || n.severity === "urgent") && !n.is_dismissed).length },
            { id: "expired", label: "Expired", count: notifications.filter((n) => n.severity === "expired" && !n.is_dismissed).length },
            { id: "renewed", label: "Renewed", count: notifications.filter((n) => n.severity === "renewed" || n.state === "renewed").length },
            { id: "dismissed", label: "Dismissed Archive", count: notifications.filter((n) => n.is_dismissed).length },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  active
                    ? "bg-[#08C5B3] text-[#0B1730] shadow-sm shadow-[#08C5B3]/25"
                    : "bg-[#101D36] text-slate-300 hover:text-white border border-[#1E3258] hover:border-slate-500"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
                    active ? "bg-[#0B1730] text-[#08C5B3]" : "bg-[#1E3258] text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="bg-[#0B1730] rounded-3xl p-12 text-center border border-[#1E3258]">
            <RefreshCw className="w-8 h-8 text-[#08C5B3] animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-300">Loading notifications & reminders...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="bg-[#0B1730] rounded-3xl p-12 text-center border border-[#1E3258] shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-[#101D36] border border-[#1E3258] text-[#5EEAD4] flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">No notifications in this view</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              All documents in this category are healthy or up to date.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notif) => {
              const style = getSeverityStyle(notif.severity, notif.days_left);
              const IconComp = style.icon;

              return (
                <div
                  key={notif.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg ${
                    style.cardBorder
                  } ${!notif.is_read && !notif.is_dismissed ? "ring-1 ring-[#08C5B3]/40" : ""}`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        style.badgeBg
                      }`}
                    >
                      <IconComp className={`w-5 h-5 ${style.iconColor}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.badgeBg}`}
                        >
                          {style.label}
                        </span>
                        {notif.interval_days >= 0 && (
                          <span className="text-[10px] font-mono text-slate-400 bg-[#101D36] px-2 py-0.5 rounded-full border border-[#1E3258]">
                            {notif.interval_days === 0 ? "Day-of alert" : `${notif.interval_days}d interval`}
                          </span>
                        )}
                        {!notif.is_read && !notif.is_dismissed && (
                          <span className="w-2 h-2 rounded-full bg-[#08C5B3] inline-block animate-pulse" />
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-white tracking-tight truncate">
                        {notif.title}
                      </h3>
                      <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                        {notif.message}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 mt-2.5 text-[11px] text-slate-400">
                        {notif.expiry_date && (
                          <span className="flex items-center gap-1 font-mono text-slate-300">
                            <Calendar className="w-3.5 h-3.5 text-teal-400" />
                            Confirmed Expiry: {notif.expiry_date}
                          </span>
                        )}
                        <span>
                          Created: {new Date(notif.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1E3258]">
                    {notif.document_id && (
                      <Link
                        href={`/vault?doc_id=${notif.document_id}`}
                        className="px-3 py-1.5 rounded-xl bg-[#101D36] hover:bg-[#162749] text-slate-200 hover:text-white border border-[#1E3258] text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-teal-400" /> View
                      </Link>
                    )}

                    {notif.document_id && notif.severity !== "renewed" && (
                      <button
                        type="button"
                        onClick={() => openRenewalModal(notif)}
                        className="px-3 py-1.5 rounded-xl bg-[#08C5B3]/20 hover:bg-[#08C5B3]/30 text-[#5EEAD4] border border-[#08C5B3]/40 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> Renew
                      </button>
                    )}

                    {!notif.is_read && !notif.is_dismissed && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(notif.id)}
                        title="Mark as read"
                        className="p-1.5 rounded-xl text-slate-400 hover:text-teal-400 hover:bg-[#101D36] border border-transparent hover:border-[#1E3258] transition-colors"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}

                    {!notif.is_dismissed && (
                      <button
                        type="button"
                        onClick={() => handleDismiss(notif.id)}
                        title="Dismiss notification"
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-[#101D36] border border-transparent hover:border-[#1E3258] transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Document Renewal Modal */}
        {renewingDoc && (
          <div className="fixed inset-0 z-50 bg-[#070E1E]/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#0B1730] border border-[#1E3258] rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 text-slate-100">
              <div className="flex items-center justify-between pb-4 border-b border-[#1E3258]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#08C5B3]/20 text-[#5EEAD4] flex items-center justify-center">
                    <RotateCw className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Renew Document</h3>
                    <p className="text-xs text-slate-400 truncate max-w-xs">{renewingDoc.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => setRenewingDoc(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmRenewal} className="mt-5 space-y-4">
                <div className="bg-[#101D36] p-3.5 rounded-2xl border border-[#1E3258] text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current Expiry:</span>
                    <span className="font-mono font-bold text-rose-300">
                      {renewingDoc.expiry_date || "None"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Days Left:</span>
                    <span className="font-bold text-white">{renewingDoc.days_left} days</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">
                    New Confirmed Expiry Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newExpiryDate}
                    onChange={(e) => setNewExpiryDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#101D36] border border-[#1E3258] text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Confirmed date in <span className="text-teal-300">Asia/Kolkata</span> timezone.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">
                    New Issue Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={newIssueDate}
                    onChange={(e) => setNewIssueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#101D36] border border-[#1E3258] text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">
                    Upload Renewed Document File (Optional)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setRenewFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#162749] file:text-teal-300 hover:file:bg-[#1E3258]"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Replaces encrypted file on disk while saving version history in document audit logs.
                  </p>
                </div>

                <div className="pt-3 border-t border-[#1E3258] flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRenewingDoc(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={renewLoading}
                    className="px-5 py-2 rounded-xl bg-[#08C5B3] hover:bg-[#07AF9E] text-[#0B1730] font-extrabold text-xs shadow-md shadow-[#08C5B3]/25 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>{renewLoading ? "Renewing..." : "Confirm & Save Renewal"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
