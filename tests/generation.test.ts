import { describe, expect, it } from "vitest";
import { jobAnalysisSchema } from "@/schemas/job";
import { generateResumeRequestSchema, resumeSelectionSchema } from "@/schemas/resume";
import { selectEvidence } from "@/lib/generation/evidence";
import { assembleResume } from "@/lib/generation/assemble";
import { tailoringInput, selection } from "./fixtures/tailoring";

describe("job and generation schemas", () => {
  it("accepts ambiguous job details without inventing a company", () => {
    const result = jobAnalysisSchema.parse({ jobTitle: "", requiredSkills: [], preferredSkills: [], responsibilities: [], qualifications: [], keywords: [] });
    expect(result.company).toBeUndefined();
    expect(jobAnalysisSchema.safeParse({ ...result, requiredSkills: "React" }).success).toBe(false);
  });
  it("rejects unapproved profiles, invalid settings, and bullets without evidence", () => {
    const input = tailoringInput();
    expect(generateResumeRequestSchema.safeParse({ ...input, profile: { ...input.profile, status: "draft", verifiedAt: undefined } }).success).toBe(false);
    expect(generateResumeRequestSchema.safeParse({ ...input, settings: { ...input.settings, targetLength: "ten-pages" } }).success).toBe(false);
    const output = selection(); output.experience[0].bullets[0].evidenceIds = [];
    expect(resumeSelectionSchema.safeParse(output).success).toBe(false);
  });
});
describe("evidence selection and assembly", () => {
  it("ranks relevant facts stably and excludes personal contact data", () => {
    const input = tailoringInput(); input.profile.experience.reverse();
    const evidence = selectEvidence(input.profile, input.jobAnalysis, input.settings);
    expect(evidence.experience[0].sourceId).toBe("job-1");
    expect(JSON.stringify(evidence)).not.toContain("alex@example.test");
    expect(evidence).toEqual(selectEvidence(input.profile, input.jobAnalysis, input.settings));
  });
  it("copies identities verbatim, preserves evidence, and marks semantic review pending", () => {
    const input = tailoringInput(); const before = structuredClone(input.profile);
    const resume = assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), selection());
    expect(resume.experience[0]).toMatchObject({ employer: "Example Co", jobTitle: "Engineer", startDate: "2023-04", currentlyEmployed: true });
    expect(resume.experience[0].bullets[0].evidenceIds).toEqual(["fact-1"]);
    expect(resume.summary).toBe(input.profile.summary);
    expect(resume.validation.status).toBe("pending-semantic-review");
    expect(input.profile).toEqual(before);
  });
  it.each(["unknown", "cross-entry", "duplicate", "unknown-skill", "empty"])("rejects %s output", (kind) => {
    const input = tailoringInput(); const output = selection();
    if (kind === "unknown") output.experience[0].bullets[0].evidenceIds = ["fake"];
    if (kind === "cross-entry") output.experience[0].bullets[0].evidenceIds = ["fact-3"];
    if (kind === "duplicate") output.experience.push(output.experience[0]);
    if (kind === "unknown-skill") output.skillIds = ["fake-skill"];
    if (kind === "empty") { output.experience = []; output.skillIds = []; }
    expect(() => assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), output)).toThrow();
  });
  it("accepts supported numbers but does not claim semantic certainty", () => {
    const input = tailoringInput(); const output = selection();
    output.experience[0].bullets = [{ text: "Reduced load times by 20%.", evidenceIds: ["fact-2"] }];
    const resume = assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), output);
    expect(resume.experience[0].bullets[0].text).toContain("20%");
    expect(resume.validation.issues[0].message).toContain("does not prove a claim");
  });
});
