import { describe, expect, it } from "vitest";
import { createEmptyProfile, professionalProfileSchema, workExperienceSchema } from "@/schemas/profile";
describe("professional profile validation", () => {
  it("accepts incomplete drafts without inventing facts", () => {
    const draft = createEmptyProfile();
    expect(professionalProfileSchema.parse(draft)).toEqual(draft);
    expect(draft.status).toBe("draft");
    expect(draft.verifiedAt).toBeUndefined();
    expect(draft.skills).toEqual([]);
  });
  it("requires name and timestamp on a verified profile", () => {
    const draft = createEmptyProfile();
    expect(professionalProfileSchema.safeParse({ ...draft, status: "verified" }).success).toBe(false);
    expect(professionalProfileSchema.safeParse({ ...draft, status: "verified", personalInfo: { ...draft.personalInfo, fullName: "Alex Doe" }, verifiedAt: draft.updatedAt }).success).toBe(true);
  });
  it("rejects invalid email, unsafe links, and duplicate fact IDs", () => {
    const draft = createEmptyProfile();
    expect(professionalProfileSchema.safeParse({ ...draft, personalInfo: { ...draft.personalInfo, email: "bad" } }).success).toBe(false);
    expect(professionalProfileSchema.safeParse({ ...draft, personalInfo: { ...draft.personalInfo, portfolioUrl: "javascript:alert(1)" } }).success).toBe(false);
    expect(professionalProfileSchema.safeParse({ ...draft, additionalAccomplishments: [{ id: "same", text: "One" }, { id: "same", text: "Two" }] }).success).toBe(false);
  });
  it("preserves IDs across edits and validation", () => {
    const draft = createEmptyProfile();
    draft.skills.push({ id: "skill-react", name: "React", category: "frameworks-libraries" });
    const edited = professionalProfileSchema.parse({ ...draft, headline: "Developer" });
    expect(edited.id).toBe(draft.id);
    expect(edited.skills[0].id).toBe("skill-react");
    expect(edited.skills[0].proficiency).toBeUndefined();
  });
  it("rejects invalid employment date ranges and current end dates", () => {
    const work = { id: "work", employer: "Example", jobTitle: "Engineer", employmentType: "", location: "", workArrangement: "remote", startDate: "2024-01", endDate: "2023-01", currentlyEmployed: false, responsibilities: [], achievements: [], technologies: [], quantifiableResults: [] };
    expect(workExperienceSchema.safeParse(work).success).toBe(false);
    expect(workExperienceSchema.safeParse({ ...work, endDate: "2025-13" }).success).toBe(false);
    expect(workExperienceSchema.safeParse({ ...work, endDate: "2025-01", currentlyEmployed: true }).success).toBe(false);
  });
});
