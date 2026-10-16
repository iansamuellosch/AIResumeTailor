import Link from "next/link";
import { ArrowRight, ShieldCheck, HardDrive, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default function Home() {
  return <div className="space-y-14">
    <section className="max-w-3xl space-y-6"><Badge variant="secondary">A foundation built around your facts</Badge><h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Your experience.<br /><span className="text-primary">The right resume.</span></h1><p className="max-w-xl text-lg leading-8 text-muted-foreground">Turn your existing resume into a tailored application for your next opportunity.</p><div className="flex flex-wrap gap-3"><Button asChild><Link href="/profile">Explore your workspace<ArrowRight aria-hidden="true" /></Link></Button><Button asChild variant="outline"><Link href="/settings">Privacy & local data</Link></Button></div><p className="text-sm text-muted-foreground">Milestone 1 · Upload and tailoring are not available yet.</p></section>
    <section aria-label="Our principles" className="grid gap-5 md:grid-cols-3">
      {[{ Icon: ShieldCheck, title: "Your facts come first", body: "Your approved professional profile will be the source of truth. AI presentation must stay grounded in your experience." }, { Icon: HardDrive, title: "A local-first workspace", body: "Profiles and resumes will stay in this browser using IndexedDB. No account or cloud profile database is required." }, { Icon: ListChecks, title: "Review before you apply", body: "Future tailoring will include evidence checks and a chance to review every generated resume." }].map(({ Icon, title, body }) => <Card key={title}><CardHeader><Icon aria-hidden="true" className="mb-3 size-6 text-primary" /><CardTitle>{title}</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">{body}</CardContent></Card>)}
    </section>
    <aside className="max-w-3xl border-l-2 border-primary pl-5 text-sm leading-6 text-muted-foreground">AI processing, when implemented, will require an internet connection and send necessary resume information to Google Gemini. No AI requests are made in this foundation release. Browser storage can be cleared by your browser; local data is not a backup.</aside>
  </div>;
}
