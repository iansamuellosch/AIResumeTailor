import { ResumeHistory } from "@/components/dashboard/resume-history";
import { ProfileGate } from "@/components/dashboard/profile-gate";
export default function DashboardPage() {
  return <div className="max-w-4xl space-y-6">
    <h1 className="text-3xl font-semibold tracking-tight">Your next opportunity</h1>
    <p className="text-muted-foreground">Turn your experience into a resume for the role you want.</p>
    <ProfileGate />
    <ResumeHistory />
  </div>;
}
