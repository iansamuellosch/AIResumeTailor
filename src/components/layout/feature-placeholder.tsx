import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export function FeaturePlaceholder({ title, description, milestone }: { title: string; description: string; milestone: number }) {
  return <div className="max-w-2xl space-y-6"><Badge variant="secondary">Coming in Milestone {milestone}</Badge><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1><p className="text-lg leading-relaxed text-muted-foreground">{description}</p><Card><CardHeader><CardTitle>This workspace is being built</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">The application foundation is ready. This feature is not available yet, and no personal information is being collected here.</p></CardContent></Card><Link href="/profile" className="inline-block text-sm font-medium underline underline-offset-4">Return to profile</Link></div>;
}
