import type { GeneratedResume } from "@/schemas/resume";
import { savedResume } from "./tailoring";
/** Fictitious, reviewed fixtures used only for export QA and automated tests. */
export function exportFixture(long = false): GeneratedResume {
  const resume = savedResume(); resume.contact.fullName = "Alex Morgan"; resume.contact.email = "alex.morgan@example.test";
  resume.contact.city = "Boston"; resume.contact.region = "MA"; resume.contact.country = ""; resume.contact.portfolioUrl = "https://example.test/alex";
  resume.headline = "Frontend Engineer"; resume.summary = "Frontend engineer building accessible React applications and integrating REST APIs.";
  resume.jobAnalysis.company = "Example Company"; resume.jobAnalysis.jobTitle = "Frontend Engineer";
  resume.validation = { status: "passed", checkedAt: new Date().toISOString(), issues: [] };
  resume.experience[0].employer = "Example Company"; resume.experience[0].jobTitle = "Frontend Engineer"; resume.experience[0].location = "Boston, MA";
  resume.experience[0].bullets = [
    { id: "bullet-one", text: "Integrated REST APIs into React applications.", evidenceIds: ["fact-1"] },
    { id: "bullet-two", text: "Reduced application load times by 20%.", evidenceIds: ["fact-2"] },
  ];
  resume.skills = ["React", "TypeScript", "JavaScript", "HTML", "CSS", "Git"].map((name, i) => ({ id: `skill-${i}`, name, category: "other" }));
  resume.projects = [{ sourceId: "project", name: "Community directory", role: "Developer", description: "Built an accessible directory for a personal web project.", bullets: [{ id: "project-bullet", text: "Created responsive search and filtering interfaces using React.", evidenceIds: ["project-fact"] }] }];
  resume.education = [{ id: "education", institution: "Example University", degree: "Bachelor of Science", fieldOfStudy: "Computer Science", graduationDate: "2022-05", honors: [], relevantCoursework: [] }];
  resume.certifications = [{ id: "certification", name: "Web Accessibility Certificate", issuingOrganization: "Example Institute", issueDate: "2024-06" }];
  if (long) {
    resume.experience = Array.from({ length: 8 }, (_, i) => ({ ...structuredClone(resume.experience[0]), sourceId: `long-job-${i}`, employer: `Example Organization ${i + 1}`, currentlyEmployed: false, startDate: "2020-01", endDate: "2022-12", bullets: Array.from({ length: 4 }, (_, j) => ({ id: `long-bullet-${i}-${j}`, evidenceIds: ["fact-1"], text: `Maintained React application interfaces for directory search, accessible navigation, and production API integration. Documented component behavior and reviewed interface changes with the project team for release ${i + 1}.${j + 1}.` })) }));
    resume.contact.additionalWebsites = [{ id: "long-url", label: "Portfolio", url: `https://example.test/${"long-path-segment-".repeat(20)}` }];
  }
  return resume;
}
