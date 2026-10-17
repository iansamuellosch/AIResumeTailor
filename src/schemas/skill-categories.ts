import { z } from "zod";

export const skillCategoryOptions = [
  { value: "professional", label: "Professional & interpersonal skills" },
  { value: "communication", label: "Communication & writing" },
  { value: "leadership", label: "Leadership & people management" },
  { value: "project-management", label: "Project & program management" },
  { value: "operations", label: "Operations & logistics" },
  { value: "customer-service", label: "Customer service & support" },
  { value: "sales", label: "Sales & business development" },
  { value: "marketing", label: "Marketing & public relations" },
  { value: "finance-accounting", label: "Finance & accounting" },
  { value: "administration", label: "Administration & office support" },
  { value: "research-analysis", label: "Research & analysis" },
  { value: "healthcare", label: "Healthcare & clinical skills" },
  { value: "education-training", label: "Education & training" },
  { value: "design-creative", label: "Design & creative skills" },
  { value: "trades-technical", label: "Trades & technical skills" },
  { value: "tools-platforms", label: "Software, tools & platforms" },
  { value: "programming-languages", label: "Programming languages" },
  { value: "frameworks-libraries", label: "Frameworks & libraries" },
  { value: "databases", label: "Databases" },
  { value: "cloud", label: "Cloud technologies" },
  { value: "other", label: "Other" },
] as const;

// Keep existing category values valid for saved profiles, evidence and backups.
export const skillCategorySchema = z.enum(skillCategoryOptions.map(({ value }) => value));
