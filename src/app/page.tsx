import { ResumeUpload } from "@/components/upload/resume-upload";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col gap-10">
      <section aria-labelledby="page-title" className="space-y-3">
        <h1 id="page-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          AI Resume Tailor
        </h1>
        <p className="leading-7 text-muted-foreground">
          Start with your existing resume. You’ll review and correct your information
          before using it to create a resume for a specific job.
        </p>
      </section>

      <ResumeUpload />

      <aside id="upload-disclosure" aria-label="Data disclosure" className="mt-auto border-t pt-5 text-xs leading-6 text-muted-foreground">
        Your original file and profile draft are stored in this browser. Selecting
        or dropping a file sends its extracted text through our server to Google
        Gemini for parsing. The original file stays on your device. AI processing
        requires an internet connection. Review the draft for accuracy. Clearing
        browser data can remove local information.
      </aside>
    </div>
  );
}
