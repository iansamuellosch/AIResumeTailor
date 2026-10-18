import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/layout/navigation";
import { StorageStatus } from "@/components/layout/storage-status";
import "./globals.css";
export const metadata: Metadata = { title: { default: "AI Resume Tailor", template: "%s | AI Resume Tailor" }, description: "Your experience. The right resume. A local-first resume workspace." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-card focus:p-4">Skip to content</a>
    <Navigation />
    <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8 sm:py-16"><StorageStatus />{children}</main>
    <footer className="mx-auto w-full max-w-6xl border-t px-5 py-6 text-muted-foreground sm:px-8">
      <p className="text-center text-sm">Saved in the browser. Powered by Google Gemini.</p>
      <div className="mt-4 flex items-center justify-between gap-4 text-xs"><p>v0.6.0</p><Link href="/settings#ai-processing" className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Privacy details</Link></div>
    </footer>
  </body></html>;
}
