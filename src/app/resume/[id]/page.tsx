import Link from "next/link";
import { SavedResume } from "@/components/resume/saved-resume";
export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="max-w-4xl space-y-6"><Link href="/dashboard" className="text-sm underline underline-offset-4">Return to dashboard</Link><h1 className="text-3xl font-semibold tracking-tight">Resume preview</h1><SavedResume id={id} /></div>;
}
