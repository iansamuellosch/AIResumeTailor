# AI Resume Tailor — MVP Specification

## 1. Project Overview

Build a production-quality MVP of a local-first, AI-powered resume tailoring application.

The application allows users to upload an existing resume, extract their professional information, review and expand that information, and generate job-specific resumes using Google Gemini.

The application's primary objective is to generate accurate, professional, ATS-friendly resumes tailored to specific job descriptions without fabricating qualifications or misrepresenting the user's experience.

### Core Product Philosophy

The application must distinguish between:

1. Verified professional information.
2. AI-generated presentation of that information.

The AI may optimize how verified information is presented but must never invent qualifications, employers, responsibilities, technologies, achievements, or experience.

The verified professional profile is the single source of truth.

### MVP Features

1. Resume upload (PDF/DOCX).
2. AI-powered resume parsing.
3. Structured professional profile editor.
4. Local profile persistence.
5. Job description input.
6. AI-powered job description analysis.
7. AI-powered resume generation.
8. Evidence-based factual validation.
9. Resume preview and manual editing.
10. PDF and DOCX export.
11. Local resume history.
12. Local data import/export.

### Out of Scope

Do not implement:

- User authentication
- Multiple professional profiles
- Cloud profile storage
- Payment processing
- Subscription management
- Cover letter generation
- Job application tracking
- Browser extensions
- Multiple resume templates
- LinkedIn integrations
- Collaborative editing
- AI chat assistants

These may be considered after the MVP is complete.

---

# 2. Technology Stack

Use:

- Next.js (App Router)
- React
- TypeScript (strict mode)
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- Dexie.js
- IndexedDB
- Google Gemini API
- Next.js Route Handlers
- PDF.js for PDF text extraction
- Mammoth for DOCX text extraction
- docx for DOCX generation
- A text-based PDF export solution
- Vitest
- React Testing Library
- Playwright

Use current stable, compatible package versions.

Use npm as the package manager.

### Development Principles

- Prefer simple, maintainable implementations.
- Use reusable components.
- Keep business logic separate from UI components.
- Use strict TypeScript types.
- Validate external data using Zod.
- Avoid unnecessary dependencies.
- Avoid premature abstraction.
- Implement functionality incrementally.
- Prioritize correctness over feature quantity.

---

# 3. Application Architecture

The application is local-first.

The frontend is hosted publicly, but professional profiles and generated resumes are stored locally in the user's browser.

Use IndexedDB through Dexie.js.

No authentication or centralized user database is required.

### Data Flow

Resume Upload
    |
    v
Document Text Extraction
    |
    v
Gemini Structured Extraction
    |
    v
Unverified Profile Draft
    |
    v
User Review and Approval
    |
    v
Verified Profile (IndexedDB)
    |
    v
Job Description Input
    |
    v
Gemini Job Analysis
    |
    v
Relevant Evidence Selection
    |
    v
Gemini Resume Generation
    |
    v
Factual Validation
    |
    v
Resume Preview
    |
    v
PDF / DOCX Export

### Privacy Requirements

- Store user profiles in IndexedDB.
- Store original uploaded files locally.
- Store generated resumes locally.
- Do not persist resume content on the application server.
- Send only necessary information to Gemini.
- Keep API keys server-side.
- Do not log personal resume content.
- Allow users to export and delete their information.
- Clearly disclose that AI processing sends data to an external provider.

Local-first does not mean fully offline.

AI functionality requires an internet connection.

---

# 4. Application Routes

Implement:

/
    Landing page and resume upload

/profile
    Profile review and editing

/dashboard
    Resume generation dashboard

/resume/[id]
    Generated resume preview and editor

/settings
    Local data management

API routes:

/api/parse-resume
/api/analyze-job
/api/generate-resume
/api/validate-resume

All API routes must:

- Validate incoming requests.
- Return consistent JSON responses.
- Handle errors safely.
- Avoid exposing sensitive information.
- Protect against excessive API usage.

---

# 5. Landing Page

## Objective

Allow users to begin using the application with minimal friction.

## UI Requirements

Create a modern, minimal landing page.

Include:

- Application name
- Logo placeholder
- Headline
- Short product description
- Drag-and-drop upload area
- File selection button
- Supported formats
- Upload and processing states
- Continue button
- Privacy disclosure

### Suggested Copy

Headline:

"Your experience. The right resume."

Description:

"Turn your existing resume into a tailored application for your next opportunity."

Primary CTA:

"Upload Resume"

Supported formats:

PDF and DOCX.

Maximum file size:

5 MB.

## Upload Behavior

When a file is selected:

1. Validate its format.
2. Validate its size.
3. Store the original file in IndexedDB.
4. Extract text from the document.
5. Send extracted text to Gemini.
6. Convert the response into a structured profile draft.
7. Save the draft locally.
8. Navigate to /profile.

The user must review the extracted information before it becomes verified.

### Error Handling

If parsing fails:

- Preserve the original file.
- Display an error message.
- Allow retrying.
- Allow manual profile creation.

### Returning Users

If a verified profile exists:

Display:

- Continue to Dashboard
- Edit Profile
- Replace Resume

Replacing a resume must require confirmation.

Never silently overwrite verified profile information.

---

# 6. Profile Editor

## Objective

Allow users to review, correct, and expand their professional information.

## Layout

Desktop:

Two-column layout.

Left:

- Section navigation
- Completion indicators
- Save status

Right:

- Editable forms

Mobile:

Single-column layout.

Use collapsible sections.

Avoid presenting the entire profile as one enormous form.

## Profile Sections

### 6.1 Personal Information

Fields:

- Full name
- Email
- Phone
- City
- State or region
- Country
- LinkedIn URL
- Portfolio URL
- GitHub URL
- Additional websites

Do not require a street address.

### 6.2 Professional Summary

Fields:

- Professional headline
- Professional summary
- Career objective (optional)

Use multiline text fields.

### 6.3 Work Experience

Support unlimited entries.

Each entry includes:

- Unique ID
- Employer
- Job title
- Employment type
- Location
- Work arrangement
- Start date
- End date
- Currently employed
- Responsibilities
- Achievements
- Technologies used
- Quantifiable results

Each responsibility and achievement must be independently editable.

Support:

- Add employment
- Edit employment
- Delete employment
- Reorder employment
- Add responsibility
- Remove responsibility
- Add achievement
- Remove achievement

Use cards for individual employment entries.

### 6.4 Education

Support multiple entries.

Fields:

- Institution
- Degree
- Field of study
- Start date
- Graduation date
- GPA (optional)
- Honors (optional)
- Relevant coursework (optional)

### 6.5 Skills

Support categories:

- Programming languages
- Frameworks and libraries
- Tools and platforms
- Databases
- Cloud technologies
- Professional skills
- Other

Each skill includes:

- Unique ID
- Name
- Category
- Optional proficiency
- Optional supporting context

Do not invent proficiency levels.

Use editable tags or cards.

### 6.6 Projects

Support multiple entries.

Fields:

- Project name
- Description
- Role
- Technologies
- Project URL
- Repository URL
- Start date
- End date
- Responsibilities
- Achievements

### 6.7 Certifications

Fields:

- Certification name
- Issuing organization
- Issue date
- Expiration date
- Credential URL

### 6.8 Additional Information

Optional sections:

- Awards
- Publications
- Volunteer experience
- Professional memberships
- Languages
- Additional accomplishments

Support repeatable entries.

---

# 7. Profile Data Model

Create a strongly typed professional profile model.

Suggested structure:

```typescript
interface ProfessionalProfile {
  id: string;
  version: number;
  status: "draft" | "verified";

  personalInfo: PersonalInfo;

  headline: string;
  summary: string;
  careerObjective?: string;

  experience: WorkExperience[];
  education: Education[];
  skills: Skill[];
  projects: Project[];
  certifications: Certification[];

  awards: Award[];
  publications: Publication[];
  volunteerExperience: VolunteerExperience[];
  languages: Language[];

  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
}
```

Define all referenced interfaces.

Use stable unique IDs for:

- Employment entries
- Responsibilities
- Achievements
- Skills
- Projects
- Certifications
- Other professional facts

IDs must persist across profile edits.

Use Zod schemas as the runtime validation source.

Infer TypeScript types from Zod where practical.

---

# 8. Profile Verification

AI-extracted information is unverified by default.

Display:

"Review your information before continuing. Your approved profile will be used to generate future resumes."

Provide:

- Save Draft
- Save & Continue
- Add Entry
- Delete Entry
- Edit Entry

### Verification Workflow

When Save & Continue is selected:

1. Validate the profile.
2. Ensure professional facts have stable IDs.
3. Mark the profile as verified.
4. Record the verification timestamp.
5. Save to IndexedDB.
6. Navigate to /dashboard.

Autosaving may save drafts.

Autosaving must not automatically verify unreviewed information.

Generated resumes must never overwrite the verified profile.

---

# 9. Dashboard

## Objective

Provide a focused workspace for generating tailored resumes.

## Main Sections

### 9.1 Job Description

Large multiline textarea.

Placeholder:

"Paste the job description here..."

This should be the most prominent element.

### 9.2 Optional Job Information

Fields:

- Company name
- Job title
- Job posting URL
- Additional notes

Do not require information already present in the job description.

### 9.3 Resume Settings

Fields:

Resume template:
- Modern Professional (MVP default)

Target length:
- One page
- Two pages
- Automatic

Emphasis:
- Balanced
- Technical skills
- Professional experience
- Projects

Optional additional instructions.

### 9.4 Generate Button

Primary CTA:

"Generate Tailored Resume"

Disable while processing.

Display progress states:

1. Analyzing job description
2. Matching qualifications
3. Generating resume
4. Validating facts
5. Preparing preview

Do not invent progress percentages.

### 9.5 Resume History

Display locally saved resumes.

Each history entry includes:

- Job title
- Company
- Creation date
- Last modified date
- Resume template

Actions:

- Open
- Delete
- Download

Sort by most recently modified.

---

# 10. Job Description Analysis

Implement:

POST /api/analyze-job

Input:

- Job description
- Optional company name
- Optional job title

Use Gemini to extract structured information.

Suggested schema:

```typescript
interface JobAnalysis {
  jobTitle: string;
  company?: string;
  seniority?: string;

  requiredSkills: string[];
  preferredSkills: string[];

  responsibilities: string[];
  qualifications: string[];
  keywords: string[];
}
```

Use structured JSON output.

Validate with Zod.

Handle missing or ambiguous fields gracefully.

Do not fabricate missing company information.

---

# 11. Evidence-Based Resume Generation

Implement:

POST /api/generate-resume

Inputs:

- Verified profile
- Job analysis
- Resume settings
- Optional user instructions

## Generation Philosophy

Use a selection-and-transformation pipeline.

Do not ask Gemini to invent a complete professional history.

Instead:

1. Identify relevant verified facts.
2. Rank facts by relevance.
3. Select appropriate experience.
4. Rewrite selected information professionally.
5. Construct a structured resume.
6. Validate generated claims.
7. Render using a controlled template.

## AI Rules

The AI must never:

- Invent employers.
- Invent employment dates.
- Invent job titles.
- Invent degrees.
- Invent certifications.
- Invent technical skills.
- Invent achievements.
- Invent metrics.
- Invent responsibilities.
- Misrepresent personal projects as employment.
- Misrepresent familiarity as expertise.
- Misrepresent API consumption as API development.
- Claim unsupported leadership experience.
- Change factual information to match job requirements.

The AI may:

- Improve wording.
- Reorder relevant information.
- Condense descriptions.
- Emphasize relevant achievements.
- Combine related verified facts.
- Use relevant terminology when supported.
- Highlight transferable skills.

## Evidence References

Every generated experience bullet must reference supporting facts.

Example:

Verified fact:

```json
{
  "id": "fact_001",
  "text": "Integrated REST APIs into production React applications."
}
```

Generated bullet:

```json
{
  "id": "bullet_001",
  "text": "Integrated REST APIs into production React applications to support dynamic data-driven functionality.",
  "evidenceIds": ["fact_001"]
}
```

The validation system must verify that the referenced evidence actually supports the generated claim.

An existing evidence ID does not automatically prove a statement is accurate.

---

# 12. Generated Resume Model

Suggested structure:

```typescript
interface GeneratedResume {
  id: string;

  profileVersion: number;

  jobAnalysis: JobAnalysis;
  settings: ResumeSettings;

  contact: ResumeContact;

  headline: string;
  summary: string;

  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: ResumeSkill[];
  projects: ResumeProject[];
  certifications: ResumeCertification[];

  validation: ResumeValidationResult;

  createdAt: string;
  updatedAt: string;
}
```

Define all referenced types.

Use structured data rather than AI-generated HTML.

The rendering layer controls document appearance.

---

# 13. Factual Validation

Implement:

POST /api/validate-resume

The validator compares generated resume content with verified profile data.

## Deterministic Validation

Check:

- Employer names
- Employment dates
- Job titles
- Degrees
- Certifications
- Skill identifiers
- Evidence IDs
- Unsupported numeric claims where possible

## Semantic Validation

Use Gemini to evaluate whether generated claims are supported by their referenced evidence.

The validator must identify:

- Unsupported claims
- Exaggerated responsibilities
- Invented technologies
- Invented metrics
- Misleading wording
- Unsupported seniority claims
- Misattributed achievements

Suggested result:

```typescript
interface ValidationIssue {
  id: string;

  severity: "error" | "warning";

  fieldPath: string;
  message: string;

  evidenceIds: string[];
}
```

## Validation Behavior

If validation fails:

1. Attempt a limited correction.
2. Revalidate.
3. Reject unresolved unsupported claims.
4. Display remaining issues for user review.

Do not silently accept failed validation.

Do not claim validation guarantees perfect accuracy.

The user retains final responsibility for reviewing the resume.

---

# 14. Resume Preview and Editing

Route:

/resume/[id]

## Features

- Professional resume preview
- Editable text
- Save changes
- Restore original generated content
- Validation warnings
- Export PDF
- Export DOCX
- Return to dashboard

Manual edits affect only the generated resume.

They must not modify the verified professional profile.

Preserve the original generated version for restoration.

## Template Requirements

Implement one professional ATS-friendly template.

Use:

- Single-column layout
- Clear section headings
- Standard typography
- Consistent spacing
- Readable font sizes
- Conventional section ordering
- Minimal decorative elements

Avoid:

- Tables used for primary resume layout
- Complex columns
- Graphics-heavy formatting
- Text embedded in images
- Excessive icons

---

# 15. PDF and DOCX Export

Implement both formats.

## PDF Requirements

- Text must be selectable.
- Text must be searchable.
- Consistent margins.
- Correct page breaks.
- No clipped content.
- Appropriate font sizes.
- Consistent spacing.
- Professional appearance.

Do not export screenshots as PDFs.

## DOCX Requirements

- Editable text.
- Consistent styling.
- Standard headings.
- Proper paragraph spacing.
- Correct section ordering.
- Reasonable pagination.

## Filename Format

FirstName_LastName_Company_Position.pdf

FirstName_LastName_Company_Position.docx

Sanitize filenames.

Handle missing company or job title gracefully.

---

# 16. IndexedDB Persistence

Use Dexie.js.

Suggested stores:

```typescript
profiles
profileDrafts
uploadedDocuments
generatedResumes
settings
```

## Requirements

- Persist data across reloads.
- Support schema migrations.
- Store original documents as Blobs.
- Store structured profiles.
- Store generated resumes.
- Store application settings.
- Handle unavailable storage.
- Handle storage quota errors.

## Import/Export

Allow users to export their professional profile as JSON.

Allow users to import a previously exported profile.

Validate imported JSON with Zod.

Do not blindly trust imported data.

Warn before replacing an existing profile.

---

# 17. Settings

Route:

/settings

Include:

- Export profile
- Import profile
- Delete uploaded resume
- Delete generated resumes
- Delete all local data
- Privacy information
- AI processing disclosure
- Application version

Use confirmation dialogs for destructive actions.

---

# 18. Security

## API Security

- Store Gemini API key in environment variables.
- Never expose credentials to the browser.
- Validate all request payloads.
- Limit request sizes.
- Apply rate limiting.
- Handle API errors safely.
- Avoid logging personal information.
- Sanitize rendered content.

## Public Deployment

The application will be publicly accessible.

Protect AI endpoints against abuse.

Implement reasonable per-client usage limits.

Do not rely on browser-only rate limiting.

Do not describe in-memory rate limiting as sufficient for a distributed production deployment.

If external infrastructure is required for production-grade rate limiting, document that dependency.

## Privacy

Do not persist user profiles on the server.

Only process profile information temporarily when required for AI operations.

Disclose external AI processing.

---

# 19. Error Handling

Handle:

- Invalid files
- Unsupported formats
- Oversized uploads
- Corrupt documents
- Failed text extraction
- Gemini API failures
- Invalid AI responses
- Validation failures
- Network timeouts
- IndexedDB errors
- Storage quota errors
- PDF export failures
- DOCX export failures

Requirements:

- Display understandable errors.
- Preserve existing user data.
- Offer retries where possible.
- Never erase verified data after a failed AI operation.

---

# 20. UI Design System

Use a modern SaaS design.

Visual direction:

- Minimal
- Professional
- Clean typography
- Neutral colors
- Generous spacing
- Subtle borders
- Clear visual hierarchy

Use shadcn/ui components.

Suggested components:

- Button
- Input
- Textarea
- Card
- Dialog
- Accordion
- Tabs
- Badge
- Select
- Toast
- Progress indicator
- Skeleton
- Form controls

## Responsive Design

Desktop:

- Two-column profile editor
- Spacious dashboard
- Full resume preview

Mobile:

- Single-column forms
- Stacked dashboard
- Responsive navigation
- Scrollable resume preview

## Accessibility

- Semantic HTML
- Keyboard navigation
- Visible focus states
- Proper form labels
- Accessible error messages
- Sufficient color contrast

---

# 21. Project Structure

Suggested:

```text
src/
├── app/
│   ├── page.tsx
│   ├── profile/
│   │   └── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   ├── resume/
│   │   └── [id]/
│   │       └── page.tsx
│   ├── settings/
│   │   └── page.tsx
│   └── api/
│       ├── parse-resume/
│       │   └── route.ts
│       ├── analyze-job/
│       │   └── route.ts
│       ├── generate-resume/
│       │   └── route.ts
│       └── validate-resume/
│           └── route.ts
│
├── components/
│   ├── layout/
│   ├── upload/
│   ├── profile/
│   ├── dashboard/
│   ├── resume/
│   └── ui/
│
├── lib/
│   ├── ai/
│   │   ├── gemini.ts
│   │   ├── prompts.ts
│   │   └── validation.ts
│   ├── storage/
│   │   └── database.ts
│   ├── parsing/
│   ├── export/
│   └── utils/
│
├── schemas/
│   ├── profile.ts
│   ├── job.ts
│   └── resume.ts
│
├── types/
│   └── index.ts
│
└── hooks/
```

Modify this structure if necessary while preserving separation of concerns.

---

# 22. Testing

Use:

- Vitest
- React Testing Library
- Playwright

## Unit Tests

Test:

- Profile validation
- Job analysis validation
- Resume validation
- Evidence references
- Data transformations
- Filename sanitization
- Parsing utilities

## Integration Tests

Test:

- Resume parsing workflow
- Profile approval
- IndexedDB persistence
- Job analysis
- Resume generation
- Validation failure handling

## End-to-End Tests

Test:

1. Upload resume.
2. Parse resume.
3. Review profile.
4. Edit employment history.
5. Save verified profile.
6. Navigate to dashboard.
7. Paste job description.
8. Generate tailored resume.
9. Preview generated resume.
10. Edit generated content.
11. Export PDF.
12. Export DOCX.
13. Reload and recover saved data.

Mock Gemini responses during automated tests.

Tests must not require paid API calls.

---

# 23. Development Milestones

## Milestone 1 — Foundation

Implement:

- Next.js initialization
- TypeScript configuration
- Tailwind CSS
- shadcn/ui
- Application layout
- Navigation
- Domain models
- Zod schemas
- IndexedDB configuration

Acceptance criteria:

- Application starts locally.
- Navigation works.
- TypeScript checks pass.
- IndexedDB initializes.
- Basic tests pass.

## Milestone 2 — Resume Upload

Implement:

- Upload UI
- File validation
- Local file storage
- PDF extraction
- DOCX extraction
- Gemini structured parsing
- Draft profile creation
- Error handling

Acceptance criteria:

- Users can upload PDF/DOCX.
- Documents are stored locally.
- Text extraction works.
- Gemini returns structured profile data.
- Draft is saved.
- User reaches profile editor.

## Milestone 3 — Profile Editor

Implement:

- All profile sections
- Repeatable employment entries
- Repeatable education entries
- Skills management
- Projects management
- Certifications
- Additional sections
- Form validation
- Draft autosaving
- Profile verification

Acceptance criteria:

- Users can edit extracted information.
- Users can add/remove entries.
- Drafts persist.
- Verified profile persists.
- Dashboard becomes accessible.

## Milestone 4 — Dashboard

Implement:

- Job description input
- Optional job details
- Resume settings
- Job analysis API
- Resume generation API
- Evidence selection
- Generated resume persistence

Acceptance criteria:

- User can paste a job description.
- Gemini analyzes requirements.
- Gemini generates structured resume content.
- Generated content references verified facts.
- Resume is stored locally.

## Milestone 5 — Validation and Preview

Implement:

- Deterministic factual validation
- AI semantic validation
- Correction workflow
- Resume preview
- Manual editing
- Resume history

Acceptance criteria:

- Unsupported claims are flagged.
- Generated resume can be edited.
- Resume can be saved.
- Previous resumes can be reopened.

## Milestone 6 — Export and Polish

Implement:

- PDF export
- DOCX export
- Responsive improvements
- Accessibility improvements
- Error handling
- Automated tests
- Documentation

Acceptance criteria:

- PDF export works.
- DOCX export works.
- Documents contain editable/searchable text.
- Core workflow passes automated tests.
- Application is ready for deployment.

---

# 24. Definition of Done

The MVP is complete when:

1. A user can upload an existing resume.
2. AI extracts structured professional information.
3. The user can review and correct extracted information.
4. The user can manually add professional experience.
5. The approved profile persists locally.
6. The user can paste a job description.
7. AI identifies relevant qualifications.
8. AI generates a tailored resume.
9. Generated claims are checked against verified evidence.
10. Unsupported claims are flagged.
11. The user can preview and edit the result.
12. The user can export PDF.
13. The user can export DOCX.
14. Generated resumes persist locally.
15. The application requires no account.
16. API credentials remain private.
17. Errors do not destroy user data.
18. Automated tests cover critical workflows.
19. The application can be deployed to Vercel.

---

# 25. Codex Implementation Instructions

You are implementing a real application, not a prototype or visual mockup.

Read this specification completely before beginning.

Follow these principles:

1. Build incrementally.
2. Use strict TypeScript.
3. Validate external data.
4. Keep components focused.
5. Separate business logic from presentation.
6. Preserve factual accuracy.
7. Avoid unnecessary infrastructure.
8. Write tests for critical functionality.
9. Run checks after each milestone.
10. Document implementation decisions.

Do not implement the entire application in one uncontrolled pass.

Work through milestones sequentially.

For each milestone:

1. Inspect the existing codebase.
2. Identify required changes.
3. Implement functionality.
4. Run tests.
5. Run TypeScript checks.
6. Fix identified problems.
7. Summarize completed work.
8. Document remaining limitations.

Do not claim a feature works without implementing it.

Do not fabricate successful test results.

When requirements are ambiguous, choose the simplest maintainable implementation consistent with the project's objectives.

Begin with Milestone 1.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
