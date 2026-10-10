"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import {
  Shield,
  Lock,
  User as UserIcon,
  LogOut,
  Users,
  History,
  LayoutDashboard,
  FolderLock,
  Menu,
  X,
  Sparkles,
  Bell,
  Check,
  CheckCheck,
  Calendar,
  AlertTriangle,
  Clock,
  ArrowRight,
  Sun,
  Moon,
} from "lucide-react";
import {
  getUser,
  logout,
  getNotifications,
  getUnreadNotificationsCount,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from "@/lib/api";
import { User, NotificationItem } from "@/lib/types";
import { useTheme } from "@/lib/theme";

export default function Navbar() {
  const pathname = usePathname();
  const { theme, toggleTheme, mounted } = useTheme();
  const [user, setUserState] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserState(getUser());
    loadUnreadCount();
  }, [pathname]);

  // Periodic poll for unread notifications every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      loadUnreadCount();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  const loadUnreadCount = async () => {
    try {
      const res = await getUnreadNotificationsCount();
      setUnreadCount(res.unread_count);
    } catch {
      // ignore in background
    }
  };

  const handleToggleDropdown = async () => {
    const nextState = !dropdownOpen;
    setDropdownOpen(nextState);
    if (nextState) {
      setDropdownLoading(true);
      try {
        const items = await getNotifications(false);
        setRecentNotifications(items.slice(0, 6));
        loadUnreadCount();
      } catch (err) {
        console.error("Failed to load notifications:", err);
      } finally {
        setDropdownLoading(false);
      }
    }
  };

  const handleMarkRead = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await markNotificationRead(id);
      setRecentNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      loadUnreadCount();
    } catch (err) {
      console.error("Mark read failed:", err);
    }
  };

  const handleDismiss = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await dismissNotification(id);
      setRecentNotifications((prev) => prev.filter((n) => n.id !== id));
      loadUnreadCount();
    } catch (err) {
      console.error("Dismiss failed:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setRecentNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Mark all read failed:", err);
    }
  };

  if (pathname === "/login") return null;

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/vault", label: "My Vault", icon: FolderLock },
    { href: "/notifications", label: "Notifications", icon: Bell, badge: unreadCount },
    { href: "/nominees", label: "Nominee Access", icon: Users },
    { href: "/audit", label: "Audit Log", icon: History },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const getSeverityBadge = (severity: string, daysLeft: number) => {
    switch (severity) {
      case "expired":
        return {
          bg: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
          label: daysLeft < 0 ? `Expired (${Math.abs(daysLeft)}d ago)` : "Expired Today",
        };
      case "urgent":
        return {
          bg: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30",
          label: daysLeft === 0 ? "Expires Today" : `${daysLeft}d left`,
        };
      case "soon":
        return {
          bg: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
          label: `${daysLeft}d left`,
        };
      case "upcoming":
        return {
          bg: "bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30",
          label: `${daysLeft}d left`,
        };
      case "renewed":
        return {
          bg: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
          label: "Renewed",
        };
      default:
        return {
          bg: "bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/30",
          label: `${daysLeft}d`,
        };
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0B1730]/95 backdrop-blur-md text-slate-900 dark:text-white shadow-sm dark:shadow-xl dark:shadow-black/20 border-b border-slate-200 dark:border-[#1E3258] transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#08C5B3] to-[#5EEAD4] flex items-center justify-center text-[#0B1730] font-bold shadow-md shadow-[#08C5B3]/25 group-hover:scale-105 transition-transform duration-200">
            <Shield className="w-5 h-5 text-[#0B1730]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white font-sans">
                Smart Vault
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-[#08C5B3]/15 text-teal-700 dark:text-[#5EEAD4] px-2 py-0.5 rounded-full border border-[#08C5B3]/30">
                <Lock className="w-2.5 h-2.5" /> AES-256 GCM
              </span>
            </div>
            <p className="text-[10px] text-teal-600 dark:text-teal-300/70 font-medium leading-none hidden sm:block mt-0.5">
              Family Document Autopilot
            </p>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5 lg:gap-2">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  active
                    ? "bg-[#08C5B3] text-[#0B1730] shadow-sm shadow-[#08C5B3]/30 font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-[#162749]"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-[#0B1730]" : "text-slate-400 dark:text-slate-400"}`} />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
                      active
                        ? "bg-[#0B1730] text-[#08C5B3]"
                        : "bg-rose-500 text-white shadow-sm shadow-rose-500/50"
                    }`}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Pill, Theme Toggle, Notifications Bell & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5" ref={dropdownRef}>
          {/* Light / Dark Mode Toggle Button */}
          <button
            onClick={toggleTheme}
            id="theme-toggle-btn"
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-[#162749] border border-transparent hover:border-slate-200 dark:hover:border-[#1E3258] transition-colors focus:outline-none focus:ring-2 focus:ring-[#08C5B3]"
          >
            {mounted ? (
              theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-300" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )
            ) : (
              <span className="w-4 h-4 block" />
            )}
          </button>

          {/* Notification Bell with Dropdown */}
          <div className="relative">
            <button
              onClick={handleToggleDropdown}
              id="notification-bell-btn"
              title="Notifications"
              className={`relative p-2 rounded-xl transition-all duration-150 ${
                dropdownOpen
                  ? "bg-slate-100 text-teal-700 dark:bg-[#1E3258] dark:text-[#5EEAD4] border border-slate-300 dark:border-[#08C5B3]/40"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-[#162749] border border-transparent"
              }`}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse shadow-sm shadow-rose-500/50">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#0B1730] border border-slate-200 dark:border-[#1E3258] shadow-2xl shadow-black/20 dark:shadow-black/60 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                {/* Header */}
                <div className="p-3.5 border-b border-slate-200 dark:border-[#1E3258] bg-slate-50 dark:bg-[#101D36] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#08C5B3]/20 text-teal-800 dark:text-[#5EEAD4] border border-[#08C5B3]/30">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[11px] font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 flex items-center gap-1 transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Notifications list */}
                <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 dark:divide-[#1E3258]/50">
                  {dropdownLoading ? (
                    <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      Loading reminders...
                    </div>
                  ) : recentNotifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#162749] text-teal-600 dark:text-teal-400 mx-auto flex items-center justify-center mb-2">
                        <Check className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">All caught up!</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        No active expiry reminders or alerts.
                      </p>
                    </div>
                  ) : (
                    recentNotifications.map((notif) => {
                      const badge = getSeverityBadge(notif.severity, notif.days_left);
                      return (
                        <div
                          key={notif.id}
                          onClick={() => {
                            setDropdownOpen(false);
                            if (notif.document_id) {
                              window.location.href = `/vault?doc_id=${notif.document_id}`;
                            } else {
                              window.location.href = "/vault";
                            }
                          }}
                          className={`p-3 hover:bg-slate-50 dark:hover:bg-[#162749]/60 cursor-pointer transition-colors flex items-start gap-3 ${
                            !notif.is_read ? "bg-teal-50/40 dark:bg-[#101D36]/80" : ""
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                              !notif.is_read ? "bg-[#08C5B3]" : "bg-transparent"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badge.bg}`}
                              >
                                {badge.label}
                              </span>
                              {notif.expiry_date && (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  {notif.expiry_date}
                                </span>
                              )}
                            </div>
                            <h4 className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate">
                              {notif.title}
                            </h4>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                              {notif.message}
                            </p>
                          </div>
                          {/* Action buttons */}
                          <div className="flex flex-col gap-1 items-end shrink-0">
                            {!notif.is_read && (
                              <button
                                onClick={(e) => handleMarkRead(notif.id, e)}
                                title="Mark as read"
                                className="p-1 rounded text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-200 dark:hover:bg-[#1E3258]"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={(e) => handleDismiss(notif.id, e)}
                              title="Dismiss notification"
                              className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200 dark:hover:bg-[#1E3258]"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer link to Notification Centre */}
                <div className="p-2.5 border-t border-slate-200 dark:border-[#1E3258] bg-slate-50 dark:bg-[#101D36] text-center">
                  <Link
                    href="/notifications"
                    onClick={() => setDropdownOpen(false)}
                    className="text-xs font-semibold text-teal-700 dark:text-[#5EEAD4] hover:text-teal-600 dark:hover:text-teal-300 flex items-center justify-center gap-1 py-1"
                  >
                    View All Notifications & Reminder Settings
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {user && (
            <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#101D36] border border-slate-200 dark:border-[#1E3258]">
              <div className="w-6 h-6 rounded-lg bg-[#08C5B3]/20 text-teal-800 dark:text-[#5EEAD4] flex items-center justify-center text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate max-w-[120px]">
                  {user.name}
                </p>
                <p className="text-[10px] text-teal-600 dark:text-teal-400/80 leading-none">Vault Owner</p>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            title="Log out"
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-500/20"
          >
            <LogOut className="w-4 h-4" />
          </button>

          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-[#162749] rounded-xl transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white dark:bg-[#101D36] border-b border-slate-200 dark:border-[#1E3258] px-4 py-3 space-y-1.5 animate-in slide-in-from-top-2">
          {user && (
            <div className="flex items-center gap-2.5 pb-2.5 mb-2 border-b border-slate-200 dark:border-[#1E3258]">
              <div className="w-8 h-8 rounded-lg bg-[#08C5B3]/20 text-teal-800 dark:text-[#5EEAD4] flex items-center justify-center text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{user.name}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{user.email}</p>
              </div>
            </div>
          )}

          {navLinks.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#08C5B3] text-[#0B1730] font-bold"
                    : "text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-[#162749]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? "text-[#0B1730]" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Mobile Theme Toggle Button */}
          <button
            type="button"
            id="mobile-theme-toggle-btn"
            onClick={() => {
              toggleTheme();
              setMobileMenuOpen(false);
            }}
            aria-label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#162749] transition-colors mt-1 pt-2 border-t border-slate-200 dark:border-[#1E3258]"
          >
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </div>
            <span className="text-[10px] font-bold uppercase text-teal-600 dark:text-[#5EEAD4]">
              {theme === "dark" ? "Switch to Light" : "Switch to Dark"}
            </span>
          </button>
        </div>
      )}
    </header>
  );
}

