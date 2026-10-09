import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Vault — AI Family Document Autopilot",
  description: "Asset-based family document vault with AI extraction, expiry tracking, missing doc detection, and emergency nominee access.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 selection:bg-teal-500 selection:text-white">
        <Navbar />
        <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
        <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-200">
          Smart Vault • Family Document Autopilot • AES-256-GCM Encrypted at Rest
        </footer>
      </body>
    </html>
  );
}
