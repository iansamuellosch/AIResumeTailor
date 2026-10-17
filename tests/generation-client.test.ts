import { afterEach, expect, it, vi } from "vitest";
import { requestTailoredResume, requestResumeValidation } from "@/lib/generation/client";
import { tailoringInput, savedResume } from "./fixtures/tailoring";
import { defaultResumeSettings, type DashboardInput } from "@/schemas/resume";
afterEach(() => vi.unstubAllGlobals());
const dashboard: DashboardInput = { jobDescription: "React engineer building accessible applications.", notes: "", jobUrl: "", settings: defaultResumeSettings };
it("combines analysis and writing in one request and returns the unreviewed draft", async () => {
  const input = tailoringInput(); const resume = { ...savedResume(), profileId: input.profile.id };
  const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, data: { resume, reviewPermit: "reserved" } }));
  vi.stubGlobal("fetch", fetcher);
  expect(await requestTailoredResume(input.profile, dashboard, vi.fn())).toEqual({ resume, reviewPermit: "reserved" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/api/generate-resume");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ jobDescription: dashboard.jobDescription, profile: input.profile });
});
it("surfaces safe admission errors without further calls", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ success: false, error: { code: "RATE_LIMITED", message: "Try again later." } }, { status: 429 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(requestTailoredResume(tailoringInput().profile, dashboard, vi.fn())).rejects.toThrow("Try again later");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects invalid responses and mismatched profile versions", async () => {
  const input = tailoringInput(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValueOnce(Response.json({ success: true, data: {} }));
  await expect(requestTailoredResume(input.profile, dashboard, vi.fn())).rejects.toThrow("invalid content");
  fetcher.mockResolvedValueOnce(Response.json({ success: true, data: { resume: { ...savedResume(), profileId: input.profile.id, profileVersion: 99 } } }));
  await expect(requestTailoredResume(input.profile, dashboard, vi.fn())).rejects.toThrow("does not match");
});
it("reviews a saved draft independently, preserving failed verdicts and sending the reserved allowance", async () => {
  const input = tailoringInput(); const resume = { ...savedResume(), profileId: input.profile.id };
  const reviewed = { ...resume, validation: { status: "failed", checkedAt: new Date().toISOString(), issues: [{ id: "issue", severity: "error", fieldPath: "summary", message: "Unsupported leadership", evidenceIds: [] }] } };
  const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, data: { resume: reviewed } })); vi.stubGlobal("fetch", fetcher);
  expect(await requestResumeValidation(input.profile, resume, true, undefined, "reserved")).toEqual(reviewed);
  expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][0]).toBe("/api/validate-resume");
  expect(JSON.parse(fetcher.mock.calls[0][1].body).reviewPermit).toBe("reserved");
});
