import { afterEach, expect, it, vi } from "vitest";
import { requestTailoredResume } from "@/lib/generation/client";
import { tailoringInput, savedResume } from "./fixtures/tailoring";
import { defaultResumeSettings, type DashboardInput } from "@/schemas/resume";
afterEach(() => vi.unstubAllGlobals());
const dashboard: DashboardInput = { jobDescription: "React engineer building accessible applications.", notes: "", jobUrl: "", settings: defaultResumeSettings };
it("runs job analysis before generation and passes through supported content", async () => {
  const input = tailoringInput(); const resume = { ...savedResume(), profileId: input.profile.id };
  const reviewed = { ...resume, validation: { status: "passed", checkedAt: new Date().toISOString(), issues: [] } };
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ success: true, data: { jobAnalysis: input.jobAnalysis } })).mockResolvedValueOnce(Response.json({ success: true, data: { resume } })).mockResolvedValueOnce(Response.json({ success: true, data: { resume: reviewed } }));
  vi.stubGlobal("fetch", fetcher); const progress = vi.fn();
  expect(await requestTailoredResume(input.profile, dashboard, progress)).toEqual(reviewed);
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual(["/api/analyze-job", "/api/generate-resume", "/api/validate-resume"]);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty("profile");
  expect(progress.mock.calls.flat()).toEqual(["Analyzing job description", "Matching qualifications and generating resume", "Validating facts and correcting unsupported wording"]);
});
it("stops on analysis failure and surfaces the safe server message", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ success: false, error: { code: "RATE_LIMITED", message: "Try again later." } }, { status: 429 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(requestTailoredResume(tailoringInput().profile, dashboard, vi.fn())).rejects.toThrow("Try again later");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects invalid responses and mismatched profile versions", async () => {
  const input = tailoringInput(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValueOnce(Response.json({ success: true, data: {} }));
  await expect(requestTailoredResume(input.profile, dashboard, vi.fn())).rejects.toThrow("invalid content");
  fetcher.mockResolvedValueOnce(Response.json({ success: true, data: { jobAnalysis: input.jobAnalysis } })).mockResolvedValueOnce(Response.json({ success: true, data: { resume: { ...savedResume(), profileId: input.profile.id, profileVersion: 99 } } }));
  await expect(requestTailoredResume(input.profile, dashboard, vi.fn())).rejects.toThrow("does not match");
});

it("rejects generated resumes with unresolved factual errors", async () => {
  const input = tailoringInput(); const resume = { ...savedResume(), profileId: input.profile.id };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ success: true, data: { jobAnalysis: input.jobAnalysis } })).mockResolvedValueOnce(Response.json({ success: true, data: { resume } })).mockResolvedValueOnce(Response.json({ success: true, data: { resume: { ...resume, validation: { status: "failed", checkedAt: new Date().toISOString(), issues: [{ id: "issue", severity: "error", fieldPath: "summary", message: "Unsupported leadership", evidenceIds: [] }] } } } })));
  await expect(requestTailoredResume(input.profile, dashboard, vi.fn())).rejects.toThrow("Unsupported leadership");
});
