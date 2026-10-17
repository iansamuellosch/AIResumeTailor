import { describe, expect, it } from "vitest";
import { contentPlan, selectionQualityIssues } from "@/lib/generation/quality";
import { selectEvidence } from "@/lib/generation/evidence";
import { assembleResume } from "@/lib/generation/assemble";
import { inspectResume } from "@/lib/validation/deterministic";
import { tailoringInput, selection } from "./fixtures/tailoring";

function richInput() {
  const input = tailoringInput();
  input.profile.experience[0].responsibilities = Array.from({ length: 18 }, (_, i) => ({ id: `detail-${i}`, text: `Implemented React application feature ${i} using verified requirements.` }));
  return input;
}
describe("evidence-limited resume depth", () => {
  it("makes automatic a substantial writing budget and preserves more source facts", () => {
    const input = richInput(); const evidence = selectEvidence(input.profile, input.jobAnalysis, input.settings);
    expect(evidence.experience[0].facts.length).toBe(19);
    expect(contentPlan(evidence, input.settings)).toMatchObject({ targetBullets: 16, minimumBullets: 10 });
    expect(contentPlan(evidence, { ...input.settings, targetLength: "one-page" }).targetBullets).toBe(10);
    expect(contentPlan(evidence, { ...input.settings, targetLength: "two-pages" }).targetBullets).toBe(19);
    expect(JSON.stringify(evidence)).not.toContain(input.profile.personalInfo.email);
  });
  it("flags the two-bullet regression for a rich source without demanding filler from sparse profiles", () => {
    const input = richInput(); const evidence = selectEvidence(input.profile, input.jobAnalysis, input.settings);
    expect(selectionQualityIssues(evidence, input.settings, selection()).join(" ")).toContain("distinct bullets");
    const sparse = tailoringInput();
    expect(selectionQualityIssues(selectEvidence(sparse.profile, sparse.jobAnalysis, sparse.settings), sparse.settings, selection())).toEqual([]);
  });
  it("does not count repeated paraphrases of one fact as sufficient coverage", () => {
    const input = richInput(); const output = selection();
    output.experience[0].bullets = Array.from({ length: 10 }, (_, i) => ({ text: `Distinct wording ${i} for the same fact.`, evidenceIds: ["detail-0"] }));
    expect(selectionQualityIssues(selectEvidence(input.profile, input.jobAnalysis, input.settings), input.settings, output).join(" ")).toContain("source facts");
  });
  it("does not demand extra bullets simply because unrelated old roles contain many facts", () => {
    const input = tailoringInput();
    input.profile.experience[1].responsibilities = Array.from({ length: 20 }, (_, i) => ({ id: `unrelated-${i}`, text: `Reconciled warehouse inventory records for supplier shipment ${i}.` }));
    const plan = contentPlan(selectEvidence(input.profile, input.jobAnalysis, input.settings), input.settings);
    expect(plan.minimumBullets).toBe(0);
    expect(plan.targetBullets).toBe(2);
  });
  it("writes selected positioning and sends it through normal factual inspection", () => {
    const input = tailoringInput(); const output = selection();
    output.headline = "React Developer"; output.summary = "Integrates REST APIs into React applications.";
    const resume = assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), output);
    expect(resume.summary).toBe(output.summary); expect(resume.summary).not.toBe(input.profile.summary);
    expect(inspectResume(input.profile, resume).claims.map((claim) => claim.fieldPath)).toEqual(expect.arrayContaining(["headline", "summary"]));
    resume.summary = "Led 999 engineers.";
    expect(inspectResume(input.profile, resume).issues.some((issue) => issue.fieldPath === "summary")).toBe(true);
  });
  it("flags wholesale omission of education and job-relevant skills", () => {
    const input = tailoringInput();
    input.profile.education = [{ id: "degree", institution: "University", degree: "BSc", fieldOfStudy: "Computing", honors: [], relevantCoursework: [] }];
    const output = selection(); output.skillIds = [];
    const issues = selectionQualityIssues(selectEvidence(input.profile, input.jobAnalysis, input.settings), input.settings, output).join(" ");
    expect(issues).toContain("education"); expect(issues).toContain("job-relevant skill");
  });
  it("flags a copied generic summary while accepting a rewritten supported focus", () => {
    const input = tailoringInput();
    input.profile.summary = "A software developer with professional experience building applications for clients in different industries, collaborating with designers, integrating APIs, maintaining web projects, and delivering updates across a range of customer needs.";
    const evidence = selectEvidence(input.profile, input.jobAnalysis, input.settings);
    const output = selection(); output.summary = input.profile.summary;
    expect(selectionQualityIssues(evidence, input.settings, output).join(" ")).toContain("job-specific summary");
    output.summary = "Develops React interfaces and integrates REST APIs.";
    expect(selectionQualityIssues(evidence, input.settings, output)).toEqual([]);
  });
});
