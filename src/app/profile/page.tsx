import { ProfileEditor } from "@/components/profile/profile-editor";
export default function ProfilePage() {
  return <div className="space-y-7">
    <div className="max-w-3xl space-y-3">
      <h1 className="text-3xl font-semibold tracking-tight">Your professional profile</h1>
      <p className="leading-7 text-muted-foreground">Review your information before continuing. Your approved profile will be used to generate future resumes.</p>
    </div>
    <ProfileEditor />
  </div>;
}
