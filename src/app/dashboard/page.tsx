import { ProfileGate } from "@/components/dashboard/profile-gate";
export default function DashboardPage() {
  return <div className="max-w-2xl space-y-6">
    <h1 className="text-3xl font-semibold tracking-tight">Your next opportunity</h1>
    <ProfileGate />
  </div>;
}
