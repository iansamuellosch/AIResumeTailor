import { LocalData } from "@/components/settings/local-data";
import { ClearResumeData } from "@/components/settings/clear-resume-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return <div className="max-w-2xl space-y-6">
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy & local data</h1>
      <p className="leading-7 text-muted-foreground">Manage your saved information and how it’s used.</p>
    </div>
    <Card>
      <CardHeader><CardTitle>Storage on your device</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>Your profile, uploaded files, and generated resumes are saved in this browser. They won’t automatically appear on another device or in another browser.</p>
        <p>Clearing browser data can remove your saved information. Private browsing may also remove it when you close the window. Download a profile backup below to keep a copy.</p>
      </CardContent>
    </Card>
    <Card id="ai-processing" className="scroll-mt-6">
      <CardHeader><CardTitle>External AI processing</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>Google Gemini helps read your uploaded resume, tailor it to a job, and check the result. This requires an internet connection.</p>
        <p>When you upload a resume, its text is extracted on your device and sent through our application server to Gemini for parsing. Your original file stays in this browser. The extracted information is saved as a draft for you to review.</p>
        <p>Tailoring sends your job description, relevant profile information, and notes to Gemini. Generation checks compare the resulting resume wording with its source facts. Contact details are excluded from tailoring and generation checks. Profile and resume content pass temporarily through our server for AI processing; they are not stored in a server database.</p>
        <p>AI can make mistakes, even after a generation check. Review your profile after parsing and your resume before using it. Saving your own resume edits does not send them to Gemini.</p>
      </CardContent>
    </Card>
    <LocalData />
    <ClearResumeData />
    <p className="text-sm text-muted-foreground">Application version 0.6.0</p>
  </div>;
}
