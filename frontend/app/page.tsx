"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";
import { Shield } from "lucide-react";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (token) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-2xl bg-teal-500 text-slate-950 flex items-center justify-center animate-pulse">
        <Shield className="w-6 h-6" />
      </div>
      <p className="mt-4 text-sm text-slate-500 font-medium">Loading Smart Vault...</p>
    </div>
  );
}
