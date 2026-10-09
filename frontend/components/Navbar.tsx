"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { getUser, logout } from "@/lib/api";
import { User } from "@/lib/types";

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUserState] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setUserState(getUser());
  }, [pathname]);

  if (pathname === "/login") return null;

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/vault", label: "My Vault", icon: FolderLock },
    { href: "/nominees", label: "Nominee Access", icon: Users },
    { href: "/audit", label: "Audit Log", icon: History },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0B1730] text-white shadow-xl shadow-black/20 border-b border-[#1E3258]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#08C5B3] to-[#5EEAD4] flex items-center justify-center text-[#0B1730] font-bold shadow-md shadow-[#08C5B3]/25 group-hover:scale-105 transition-transform duration-200">
            <Shield className="w-5 h-5 text-[#0B1730]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-white font-sans">
                Smart Vault
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-[#08C5B3]/15 text-[#5EEAD4] px-2 py-0.5 rounded-full border border-[#08C5B3]/30">
                <Lock className="w-2.5 h-2.5" /> AES-256 GCM
              </span>
            </div>
            <p className="text-[10px] text-teal-300/70 font-medium leading-none hidden sm:block mt-0.5">
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
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  active
                    ? "bg-[#08C5B3] text-[#0B1730] shadow-sm shadow-[#08C5B3]/30 font-bold"
                    : "text-slate-300 hover:text-white hover:bg-[#162749]"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-[#0B1730]" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Pill & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#101D36] border border-[#1E3258]">
              <div className="w-6 h-6 rounded-lg bg-[#08C5B3]/20 text-[#5EEAD4] flex items-center justify-center text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-200 leading-tight truncate max-w-[120px]">
                  {user.name}
                </p>
                <p className="text-[10px] text-teal-400/80 leading-none">Vault Owner</p>
              </div>
            </div>
          )}

          <button
            onClick={logout}
            title="Log out"
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/20"
          >
            <LogOut className="w-4 h-4" />
          </button>

          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white hover:bg-[#162749] rounded-xl transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#101D36] border-b border-[#1E3258] px-4 py-3 space-y-1.5 animate-in slide-in-from-top-2">
          {user && (
            <div className="flex items-center gap-2.5 pb-2.5 mb-2 border-b border-[#1E3258]">
              <div className="w-8 h-8 rounded-lg bg-[#08C5B3]/20 text-[#5EEAD4] flex items-center justify-center text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-bold text-white">{user.name}</p>
                <p className="text-[10px] text-slate-400">{user.email}</p>
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
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#08C5B3] text-[#0B1730] font-bold"
                    : "text-slate-300 hover:text-white hover:bg-[#162749]"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-[#0B1730]" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
