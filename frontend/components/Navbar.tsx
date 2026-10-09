"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shield, Lock, User as UserIcon, LogOut, Users, History, LayoutDashboard } from "lucide-react";
import { getUser, logout } from "@/lib/api";
import { User } from "@/lib/types";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUserState] = useState<User | null>(null);

  useEffect(() => {
    setUserState(getUser());
  }, []);

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-40 bg-[#0B1F3A] text-white shadow-md border-b border-teal-900/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-teal-500/20 group-hover:scale-105 transition-transform">
            <Shield className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">Smart Vault</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold bg-teal-500/15 text-teal-300 px-2 py-0.5 rounded-full border border-teal-500/30">
                <Lock className="w-2.5 h-2.5" /> AES-256 GCM
              </span>
            </div>
            <p className="text-[10px] text-teal-200/60 leading-none hidden sm:block">Family Document Autopilot</p>
          </div>
        </Link>

        {/* Navigation links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/dashboard"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              pathname === "/dashboard"
                ? "bg-teal-500 text-slate-950 font-semibold"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Dashboard</span>
          </Link>

          <Link
            href="/nominees"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              pathname === "/nominees"
                ? "bg-teal-500 text-slate-950 font-semibold"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Nominee Access</span>
          </Link>

          <Link
            href="/audit"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              pathname === "/audit"
                ? "bg-teal-500 text-slate-950 font-semibold"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Audit Log</span>
          </Link>

          {/* User & Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-700/60 ml-1">
            <span className="text-xs text-slate-300 hidden lg:inline-block font-medium">
              {user ? user.name : "My Vault"}
            </span>
            <button
              onClick={logout}
              title="Log out"
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
