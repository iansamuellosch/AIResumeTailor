import { afterEach, expect, it, vi } from "vitest";
import { requestProfileDraft } from "@/lib/parsing/client";
import { createEmptyProfile } from "@/schemas/profile";
afterEach(() => vi.unstubAllGlobals());
it("validates returned drafts and rejects invalid or verified server output", async () => {
  const profile = createEmptyProfile();
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ success: true, data: { profile } })).mockResolvedValueOnce(Response.json({ success: true, data: { profile: { ...profile, status: "verified" } } }));
  vi.stubGlobal("fetch", fetch);
  expect(await requestProfileDraft("resume text")).toEqual(profile);
  await expect(requestProfileDraft("resume text")).rejects.toThrow("invalid draft");
});
it("reports network, timeout, and safe API errors without losing local files", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("network"))
    .mockRejectedValueOnce(new DOMException("Timeout", "TimeoutError"))
    .mockResolvedValueOnce(Response.json({ success: false, error: { code: "RATE_LIMITED", message: "Please retry later." } }, { status: 429 }));
  vi.stubGlobal("fetch", fetch);
  await expect(requestProfileDraft("resume text")).rejects.toThrow("saved locally");
  await expect(requestProfileDraft("resume text")).rejects.toThrow("timed out");
  await expect(requestProfileDraft("resume text")).rejects.toThrow("Please retry later");
});
