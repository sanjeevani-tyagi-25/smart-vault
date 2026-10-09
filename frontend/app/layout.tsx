import type { Metadata, Viewport } from "next";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0B1730",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Smart Vault — AI Family Document Management & Emergency Protection",
  description:
    "Secure, asset-organized family document vault with Gemini AI extraction, expiry awareness, missing legal document detector, and timed nominee emergency safeguards.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#F8FAFC] text-[#0B1730] selection:bg-[#08C5B3] selection:text-[#0B1730]">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
        <footer className="py-6 bg-[#0B1730] border-t border-[#1E3258] text-slate-400 text-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-tight">Smart Vault</span>
              <span className="text-slate-500">•</span>
              <span className="text-teal-400 font-medium">Family Document Autopilot</span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                AES-256-GCM Encrypted at Rest
              </span>
              <span>•</span>
              <span>Immutable Security Audit Log</span>
              <span>•</span>
              <span>Controlled Nominee Access</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
