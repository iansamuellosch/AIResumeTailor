// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/structured", () => ({ requestStructured: vi.fn() }));
import { requestStructured } from "@/lib/ai/structured";
import { validateResumeWithGemini } from "@/lib/ai/validation";
import { tailoringInput, selection } from "./fixtures/tailoring";
import { assembleResume } from "@/lib/generation/assemble";
import { selectEvidence } from "@/lib/generation/evidence";
const request = vi.mocked(requestStructured);
function fixture() { const input = tailoringInput(); return { profile: input.profile, resume: assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), selection()), correct: false }; }
const verdict = (outcome = "supported") => ({ claims: [{ fieldPath: "experience.0.bullets.0.text", outcome, message: outcome === "supported" ? "" : "Leadership is not supported." }] });
beforeEach(() => { request.mockReset(); });
describe("semantic validation and correction", () => {
  it("reviews the claim's actual evidence and records bounded, qualified success", async () => {
    request.mockResolvedValue(verdict()); const input = fixture();
    const result = await validateResumeWithGemini(input);
    expect(result.validation.status).toBe("passed"); expect(result.validation.checkedAt).toBeDefined();
    expect(result.validation.correctionAttempted).toBe(false);
    const payload = request.mock.calls[0][2];
    expect(JSON.stringify(payload)).toContain("fact-1"); expect(JSON.stringify(payload)).not.toContain(input.profile.personalInfo.email);
    expect(result.experience).toEqual(input.resume.experience);
  });
  it("corrects unsupported wording once and revalidates every claim", async () => {
    const input = fixture(); input.correct = true; input.resume.experience[0].bullets[0].text = "Led API development across the company.";
    request.mockResolvedValueOnce(verdict("unsupported")).mockResolvedValueOnce({ replacements: [{ fieldPath: "experience.0.bullets.0.text", text: "Integrated REST APIs into React applications." }] }).mockResolvedValueOnce(verdict());
    const result = await validateResumeWithGemini(input);
    expect(result.validation).toMatchObject({ status: "passed", correctionAttempted: true });
    expect(request).toHaveBeenCalledTimes(3);
    expect(result.experience[0].bullets[0].id).toBe(input.resume.experience[0].bullets[0].id);
    expect(input.resume.experience[0].bullets[0].text).toContain("Led");
  });
  it("rejects unresolved claims after the single correction attempt", async () => {
    const input = fixture(); input.correct = true;
    request.mockResolvedValueOnce(verdict("unsupported")).mockResolvedValueOnce({ replacements: [{ fieldPath: "experience.0.bullets.0.text", text: "Led API development." }] }).mockResolvedValueOnce(verdict("unsupported"));
    const result = await validateResumeWithGemini(input);
    expect(result.validation.status).toBe("failed"); expect(request).toHaveBeenCalledTimes(3);
    expect(result.validation.issues[0].message).toContain("Leadership");
  });
  it("flags manual claims without automatically rewriting them", async () => {
    const input = fixture(); input.resume.experience[0].bullets[0].text = "Led API development.";
    request.mockResolvedValue(verdict("unsupported"));
    const result = await validateResumeWithGemini(input);
    expect(result.validation.status).toBe("failed"); expect(request).toHaveBeenCalledTimes(1);
    expect(result.experience[0].bullets[0].text).toBe("Led API development.");
  });
  it("keeps uncertainty visible as a review warning", async () => {
    request.mockResolvedValue(verdict("uncertain"));
    const result = await validateResumeWithGemini(fixture());
    expect(result.validation.status).toBe("needs-review"); expect(result.validation.issues[0].severity).toBe("warning");
  });
  it("does not ask AI to repair factual identities or invalid provenance", async () => {
    const input = fixture(); input.resume.experience[0].employer = "Invented Co"; input.correct = true;
    const result = await validateResumeWithGemini(input);
    expect(result.validation.status).toBe("failed"); expect(request).not.toHaveBeenCalled();
  });
  it.each([{ claims: [] }, { claims: [{ fieldPath: "summary", outcome: "supported", message: "" }] }, { claims: [...verdict().claims, ...verdict().claims] }])("rejects incomplete, foreign and duplicate reviews", async (review) => {
    request.mockResolvedValue(review);
    await expect(validateResumeWithGemini(fixture())).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
  });
  it("rejects correction paths outside the exact failed claims", async () => {
    const input = fixture(); input.correct = true;
    request.mockResolvedValueOnce(verdict("unsupported")).mockResolvedValueOnce({ replacements: [{ fieldPath: "contact.fullName", text: "Changed" }] });
    await expect(validateResumeWithGemini(input)).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
  });
  it("propagates provider failure without recording a successful review", async () => {
    const input = fixture(); request.mockRejectedValue(new Error("unavailable"));
    await expect(validateResumeWithGemini(input)).rejects.toThrow();
    expect(input.resume.validation.status).toBe("pending-semantic-review");
  });
});
it("attempts a bounded correction for a generated numeric claim and rechecks the corrected number", async () => {
  const input = fixture(); input.correct = true;
  input.resume.experience[0].bullets[0].text = "Improved performance by 99%.";
  request.mockResolvedValueOnce(verdict("unsupported")).mockResolvedValueOnce({ replacements: [{ fieldPath: "experience.0.bullets.0.text", text: "Integrated REST APIs into React applications." }] }).mockResolvedValueOnce(verdict());
  const result = await validateResumeWithGemini(input);
  expect(result.validation).toMatchObject({ status: "passed", correctionAttempted: true });
  expect(result.experience[0].bullets[0].text).not.toContain("99%");
});
