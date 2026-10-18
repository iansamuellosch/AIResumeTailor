"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
const links = [{ href: "/profile", label: "Profile" }, { href: "/dashboard", label: "Dashboard" }, { href: "/settings", label: "Privacy & data" }];
export function Navigation() {
  const pathname = usePathname();
  return <header className="border-b bg-background">
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <Link href="/profile" className="flex w-fit items-center gap-2.5 font-semibold tracking-tight"><FileText aria-hidden="true" className="size-6 text-primary" />AI Resume Tailor</Link>
      <nav aria-label="Main navigation" className="flex flex-wrap gap-1">
        {links.map(({ href, label }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted", pathname === href ? "bg-secondary text-secondary-foreground" : "text-muted-foreground")}>{label}</Link>)}
      </nav>
    </div>
  </header>;
}
