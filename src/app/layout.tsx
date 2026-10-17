import type { Metadata } from "next";
import { Navigation } from "@/components/layout/navigation";
import { StorageStatus } from "@/components/layout/storage-status";
import "./globals.css";
export const metadata: Metadata = { title: { default: "AI Resume Tailor", template: "%s | AI Resume Tailor" }, description: "Your experience. The right resume. A local-first resume workspace." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="min-h-screen bg-background font-sans text-foreground antialiased">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-card focus:p-4">Skip to content</a>
    <Navigation />
    <main id="main-content" className="mx-auto min-h-[70vh] max-w-6xl px-5 py-12 sm:px-8 sm:py-16">{children}</main>
    <footer className="mx-auto flex max-w-6xl flex-col gap-3 border-t px-5 py-6 sm:flex-row sm:justify-between sm:px-8"><p className="text-xs text-muted-foreground">AI Resume Tailor · v0.6.0</p><StorageStatus /></footer>
  </body></html>;
}
