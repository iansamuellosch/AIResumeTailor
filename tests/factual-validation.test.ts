import { describe, expect, it } from "vitest";
import { inspectResume } from "@/lib/validation/deterministic";
import { editableResumeFields, replaceResumeText } from "@/lib/generation/editing";
import { tailoringInput, selection } from "./fixtures/tailoring";
import { assembleResume } from "@/lib/generation/assemble";
import { selectEvidence } from "@/lib/generation/evidence";
function fixture() { const input = tailoringInput(); return { profile: input.profile, resume: assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), selection()) }; }
describe("deterministic factual inspection", () => {
  it("checks valid evidence without claiming semantic support", () => {
    const { profile, resume } = fixture(); const result = inspectResume(profile, resume);
    expect(result.issues).toEqual([]); expect(result.claims).toHaveLength(1);
    expect(result.claims[0].evidence).toEqual([profile.experience[0].responsibilities[0]]);
  });
  it.each(["employer", "jobTitle", "startDate", "currentlyEmployed", "skill", "unknown-entry", "cross-entry", "metric", "profile", "contact", "duplicate"])("flags %s mismatches", (kind) => {
    const { profile, resume } = fixture(); const entry = resume.experience[0];
    if (kind === "employer") entry.employer = "Invented Co";
    if (kind === "jobTitle") entry.jobTitle = "Director";
    if (kind === "startDate") entry.startDate = "2010-01";
    if (kind === "currentlyEmployed") entry.currentlyEmployed = false;
    if (kind === "skill") resume.skills[0].name = "AWS";
    if (kind === "unknown-entry") entry.sourceId = "unknown";
    if (kind === "cross-entry") entry.bullets[0].evidenceIds = ["fact-3"];
    if (kind === "metric") entry.bullets[0].text = "Improved load time by 99%.";
    if (kind === "profile") resume.profileVersion++;
    if (kind === "contact") resume.contact.fullName = "Someone Else";
    if (kind === "duplicate") resume.experience.push(structuredClone(entry));
    expect(inspectResume(profile, resume).issues.some((issue) => issue.severity === "error")).toBe(true);
  });
  it("reviews edited summaries against professional evidence without contact or job requirements", () => {
    const { profile, resume } = fixture(); resume.summary = "Developed React applications.";
    const claim = inspectResume(profile, resume).claims.find((claim) => claim.fieldPath === "summary")!;
    expect(claim.evidence.length).toBeGreaterThan(0);
    expect(JSON.stringify(claim.evidence)).not.toContain(profile.personalInfo.email);
    expect(claim.evidence.map((fact) => fact.text).join(" ")).not.toContain("Frontend Engineer");
  });
  it("allows text editing while preventing edits to IDs, metadata and evidence references", () => {
    const { resume } = fixture(); const path = "experience.0.bullets.0.text";
    const edited = replaceResumeText(resume, path, "Edited text");
    expect(edited.experience[0].bullets[0].id).toBe(resume.experience[0].bullets[0].id);
    expect(edited.experience[0].bullets[0].evidenceIds).toEqual(["fact-1"]);
    expect(resume.experience[0].bullets[0].text).not.toBe("Edited text");
    expect(editableResumeFields(resume).some((field) => field.path === path)).toBe(true);
    for (const path of ["id", "validation.status", "experience.0.sourceId", "__proto__.polluted", "experience.0.bullets.0.evidenceIds"]) expect(() => replaceResumeText(resume, path, "x")).toThrow();
  });
});
it("checks degrees and certifications against their exact approved entries", () => {
  const { profile, resume } = fixture();
  profile.education = [{ id: "edu", institution: "Example University", degree: "BSc", fieldOfStudy: "Computing", honors: [], relevantCoursework: [] }];
  profile.certifications = [{ id: "cert", name: "Example Certificate", issuingOrganization: "Example Institute" }];
  resume.education = structuredClone(profile.education); resume.certifications = structuredClone(profile.certifications);
  resume.education[0].degree = "PhD"; resume.certifications[0].name = "Invented Certificate";
  const result = inspectResume(profile, resume);
  expect(result.issues.map((issue) => issue.fieldPath)).toEqual(expect.arrayContaining(["education.0", "certifications.0"]));
});
it("does not treat digits in evidence IDs as support for numeric summary claims", () => {
  const { profile, resume } = fixture();
  profile.experience[0].id = "job-999"; resume.experience[0].sourceId = "job-999";
  resume.summary = "Completed 999 projects.";
  expect(inspectResume(profile, resume).issues.some((issue) => issue.fieldPath === "summary")).toBe(true);
});
