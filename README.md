# AI Resume Tailor

Milestones 1–6: a local-first resume workspace with PDF/DOCX upload, Gemini extraction, approved profile editing, job analysis, evidence-based generation, and local resume persistence. Generated results receive deterministic and semantic factual checks, a bounded correction attempt, an editable preview with original restoration, and local history. PDF/DOCX exports, profile backups/import, selective deletion, responsive previews, accessibility checks, and a production-build CI workflow complete the MVP implementation.

## Run locally

Use Node.js 22.13+ (Node 24 LTS recommended) and npm.

```sh
npm ci
cp .env.example .env.local
# Set GEMINI_API_KEY in .env.local, then:
npm run dev
```

Open http://localhost:3000. Obtain a Gemini API key from Google AI Studio. `GEMINI_MODEL` defaults to `gemini-3.8-flash`; choose a model available to your project that supports structured JSON output. Keys stay server-side and must never use a `NEXT_PUBLIC_` prefix. Restart the server after changing environment variables. Without a key, uploads are still stored locally and can be retried later or replaced with a manual draft; AI parsing returns an understandable configuration error.

`postinstall`, `predev`, and `prebuild` copy the installed PDF.js worker into `public/`. This same-origin generated asset is ignored by Git and rebuilt from the locked dependency version. No CDN is used for document processing.

## Workflow

1. Choose or drop one PDF/DOCX, up to 5 MiB. The original is saved to IndexedDB before extraction.
2. Extract text in a browser worker using PDF.js or Mammoth. The UI stays responsive and terminates processing after 45 seconds. DOCX archive metadata is checked for excessive expansion before decompression. PDFs are limited to 100 pages; extracted text to 60,000 characters. Scanned/image-only and password-protected PDFs need a readable, unlocked alternative; OCR is out of scope.
3. Send **only extracted text** to `/api/parse-resume`. Gemini uses a structured JSON schema and extraction-only instructions. Zod validates the result. Lifecycle metadata and fact IDs are assigned by the application, never trusted from AI.
4. Save the draft locally and open `/profile`. Review, correct, and expand every profile section. No upload or autosave can create or overwrite a verified profile. Select **Save & Continue** to validate and approve your information, then open the dashboard.
5. If extraction, networking, AI, or storage fails, retain existing data and show recovery options. A saved original can be retried after reload. Manual draft creation works without AI. Replacement requires confirmation when a draft or verified profile exists. Concurrent draft changes are detected at commit time to avoid overwriting edits in another tab.

AI output is unverified and can contain mistakes despite schema validation. Profile approval records your review; it does not independently prove the truth of entered or extracted facts.

## Profile editing and approval

`/profile` supports personal information and additional websites; multiline headline, summary, and career objective; employment; education; categorized skills and optional proficiency/context; projects; certifications; awards; publications; volunteer work; professional memberships; languages; and other accomplishments. Employment and project facts are edited individually. Cards support addition, deletion with confirmation, and ordering. Facts get IDs only when added. React Hook Form uses a separate internal field key so reordering never replaces domain evidence IDs.

Desktop has a section sidebar with completion indicators and save status. Mobile has a compact section menu and collapsible sections. Each field has a label; approval errors open the relevant sections, display inline messages, and focus the first invalid field. Empty optional sections are allowed. A full name is required for approval; added entries must meet the strict section schemas. Unknown dates/proficiency remain blank, and entering current employment clears its end date.

Drafts and approved profiles have deliberately different validation:

- `profileDraftSchema` preserves unfinished entries, partially typed email/URLs, and incorrect date ranges for correction. It still enforces structure, valid IDs, unique IDs, text limits, draft status, and lifecycle integrity. Drafts may contain invalid input and must never be used directly for generation.
- `professionalProfileSchema` remains strict for AI output and approved data. **Save & Continue** uses it to reject invalid fields before approval. `readProfile(db, "verified")` always uses strict validation.

Draft changes autosave after 600 ms through a serialized write queue. **Save Draft** flushes immediately. Application links flush pending edits before navigation; the browser warns before unloading with unsaved work. Wait for the saved status before closing the browser or device. Failed storage writes leave the form intact with a retryable error.

Editing an approved profile creates a separate draft while preserving its IDs and original creation timestamp. The approved copy stays untouched until the next explicit approval. Approval runs in one IndexedDB transaction: validate the complete profile, assign the verification timestamp, increment the approved version, write the approved copy, and remove the reviewed draft. Autosaves are paused/drained before approval so an older pending write cannot recreate that draft. Uploaded-source linkage is preserved. No database-index migration is needed; the existing stores and optional record metadata are reused.

Writes compare both draft and approved snapshots inside the transaction. If another tab saves or approves first, the stale editor stops writing and shows a conflict message; it never silently overwrites the newer profile. Reloading after confirmation discards unsaved local edits and loads the stored version. The dashboard requires an approved profile and shows its version. Each generation rereads the latest approved copy; an unreviewed editor draft is never used.

## Milestone 4: job analysis and resume generation

On `/dashboard`, paste a job description (20–30,000 characters), optionally supply company/title, posting URL, and notes, then choose the template, target length, emphasis, and wording instructions. Optional details are not required when already present in the description. Progress reports real request stages without percentages. Duplicate submissions are blocked, and failed operations leave the form and saved profile intact.

`/api/analyze-job` sends only the description and optional company/title to Gemini, requests structured requirements/keywords, and validates the result with Zod. Missing company information is left absent. `/api/generate-resume` requires a strictly validated approved profile. All AI endpoints use the same streamed 256 KiB body cap, origin check, shared client/global limits, safe JSON responses, no-store headers, and bounded provider calls. Very large profiles may exceed the payload cap; this returns an explicit error without changing local data. No resume/profile content is persisted or logged server-side.

Generation is deliberately constrained:

1. Rank verified entries and facts by token overlap with job requirements, retaining original order on ties. Bound selection by target length/emphasis. Send only selected employment/project evidence and skill/education/certification candidates to Gemini; contact details, summary, headline, job URL, and profile lifecycle metadata are excluded.
2. Ask Gemini to select source IDs and rewrite supported bullets. Notes/instructions may guide presentation but cannot supply new qualifications. Prompts treat all supplied content as untrusted and prohibit changing facts, inventing numbers/skills, unsupported leadership, API-development claims from API consumption, or presenting projects as employment.
3. Reject unknown/duplicate entry selections, unknown skill/education/certification IDs, missing or cross-entry bullet evidence, and empty results. Numeric claims are checked in the subsequent validation stage so supported evidence can be used for one bounded correction. Copy employers, titles, dates, project identities, credentials, skills, contact information, headline, and summary directly from the approved profile. In this milestone, headline and summary are preserved verbatim rather than rewritten.
4. Create lifecycle/bullet IDs server-side and preserve the profile ID/version. The candidate begins as `pending-semantic-review`; the client then submits it to `/api/validate-resume` before saving. Generation is rejected if factual errors remain after one correction attempt. Warnings remain visible for user review. These checks do not guarantee accuracy.
5. Save the reviewed structure, original content, and approved source profile snapshot to IndexedDB, then offer a link to `/resume/[id]`. The editable single-column preview survives reloads and can be reopened from dashboard history. If local saving fails, the result remains in the current tab and **Retry saving resume** makes no further AI calls. Closing/reloading before retry loses that unsaved result.

Target length guides selection and concise wording; PDF export reports the actual page count and never truncates content or silently reduces font sizes to force that target. Original uploaded files, approved profiles, and existing resumes are untouched by generation. Schema validation is not proof of factual accuracy, and client-supplied “verified” status records user approval rather than independent verification.

## Milestone 5: validation, editing, and history

`POST /api/validate-resume` accepts a resume, its strictly validated approved source profile, and an optional `correct` flag. It shares all other AI endpoints' size/origin/rate safeguards and no-store responses. Incoming validation metadata is ignored and recomputed. Deterministic checks compare profile ID/version, contact fields, employers, titles, locations, dates/current status, project identities, degrees, skill identifiers/values, and certifications. Bullets require evidence from their own source entry; duplicate identifiers and unsupported numeric tokens are errors. These checks are conservative and do not infer years of experience from dates.

Semantic review sends Gemini each rewritten claim with its actual scoped evidence, excluding contact fields, job requirements, and unrelated instructions. Existing approved headline/summary/project description are trusted verbatim; edited versions are reviewed. Each claim must receive exactly one supported/unsupported/uncertain verdict; missing, duplicate, foreign, malformed, or truncated results fail safely. Prompts explicitly flag invented technologies/metrics, exaggerated responsibilities/seniority, misleading causality, API consumption presented as development, and misattribution. A source ID alone never establishes support.

New generation uses `correct: true`: at most one text-only correction may replace failed claims. It cannot change identities, source IDs, or evidence references. All claims are then rechecked. Unresolved errors reject the generation and are shown on the dashboard without saving an accepted resume. Structural identity/provenance errors are rejected directly rather than repaired by AI. Provider failures never produce successful validation. Uncertain claims produce visible warnings (`needs-review`), while completed checks with no issues produce `passed`. The endpoint can take up to three 45-second provider calls; the route has a 180-second budget and the client a 155-second timeout. Production hosting must support this duration. No content is persisted server-side.

The preview offers **Edit resume**, **Save changes**, **Check facts & save**, **Restore original**, and reload controls. Text editing preserves all fact/source/bullet IDs; it cannot alter verification metadata. Manual changes immediately clear prior validation and affect only this resume. Saving is explicit; schema failures retain edits. **Check facts & save** reviews and saves the current text without automatically rewriting it. Manual content with errors may be saved as a clearly failed draft for further correction, never marked passed. Unsaved navigation/reloads prompt before discarding changes. A supporting-evidence panel lets users compare each bullet with its original facts.

New records retain an approved source profile snapshot locally, keeping validation tied to the version used for generation even after the current profile changes. Milestone 4 records remain readable; review can use the current approved profile only when ID/version match. Save and restore transactions compare the expected modification timestamp, use monotonically increasing timestamps, preserve the immutable original/source snapshot, and reject stale-tab writes or deleted-record resurrection. Restoring requires confirmation and restores the original generation's review status. Failed writes keep the editor's content available for retry.

Dashboard history uses IndexedDB change subscriptions, sorts by most recently modified, and displays role, company, creation/modification dates, template, and review status. It supports opening, confirmed deletion with stale-record protection, and downloading resume JSON without exporting the full source profile snapshot. Unreadable records are preserved and reported rather than silently removed. Formatted PDF/DOCX downloads are available from the preview and each history entry after factual review.

## Milestone 6: exports and local data management

**Export PDF** and **Export DOCX** appear on the resume preview and in each history entry’s **Document downloads** panel. Unsaved text, pending factual review, and failed validation block formatted exports. Warnings remain visible for review. Export errors leave the saved resume intact and allow retry. JSON history downloads remain available for data recovery, including unfinished resumes.

Preview and both formats use one plain-text block model (`src/lib/export/document.ts`) to keep contact information, headline/summary, experience, skills, projects, education, honors/coursework, and certifications consistent. AI instructions, notes, validation messages, evidence IDs, and source snapshots are excluded from application documents. Filenames follow `First_Last_Company_Position.pdf`/`.docx`, omit absent job details, preserve Unicode names, and remove unsafe path/control characters.

PDF export uses pdf-lib, embedded openly licensed Noto Sans Regular/Bold, US Letter pages, 48-point margins, 10.5-point body text, stable heading spacing, long-word/URL wrapping, widow control, and page numbers. It draws actual text, never screenshots. Text can be selected, searched, and extracted. Headings stay with following content where space permits; long content paginates without clipping. A page-target mismatch is reported after export rather than deleting text. DOCX uses the `docx` library to create editable Word paragraphs, native list numbering, Title/Heading styles, Arial typography, matching page size/margins, and keep-with-next/widow controls. Office font substitution may change pagination.

Formatting runs in a disposable browser worker with a 45-second limit; document content never leaves the browser for export. Fonts are served from this application’s `/fonts/`, without Google Fonts/CDN requests. PDF export reports missing font glyphs instead of emitting replacement squares; DOCX can use system fonts for other scripts. Export input is capped at 200,000 characters and PDF output at 50 pages to bound work on malformed local data. Failed font downloads, worker startup, encoding, timeouts, or packing do not change stored data.

Settings supports approved-profile and unfinished-draft JSON backups. Imports accept a versioned backup or raw supported profile, cap files at 2 MB, validate with Zod, and always create an unverified draft for review. An existing draft/approval triggers confirmation. Current approved data stays intact until explicit approval, and stale-tab imports are rejected transactionally. Professional fact IDs are preserved; a new profile lifecycle ID/timestamps prevent imported verification/version metadata from impersonating older resume evidence. Imported drafts may contain incomplete fields but cannot be approved until the strict profile schema passes.

Deleting uploaded files removes original Blobs, the retry pointer, and obsolete source-document links while preserving professional facts and resumes. Deleting generated resumes removes their originals and local evidence snapshots while preserving profiles/uploads. **Delete all local data** atomically clears all five IndexedDB stores, including preferences, then reloads the upload screen. Each deletion requires confirmation, and failed multi-store changes roll back. Existing browser downloads are outside the application’s storage and are not deleted.

The UI wraps long resume strings on narrow screens, retains visible keyboard focus and labeled fields, and respects reduced-motion preferences. New Playwright tests exercise the complete upload → approval → tailoring → manual edit → factual review → actual PDF/DOCX download → reload flow, plus backups/import/deletion and automated axe WCAG A/AA checks on desktop and mobile. Export tests verify filenames, character handling, text contents, page bounds, and pending/failed review guards. One-page and four-page fixtures were rendered and visually checked in PDF and DOCX; PDF text extraction was independently verified.

See [deployment and release verification](docs/deployment.md). CI runs type checks, lint, unit/integration tests, a webpack production build, and the complete browser suite against that production build without paid API calls. Local export QA fixtures can be retained with `EXPORT_QA_DIR=/private/tmp/resume-export-qa npm test`; fixture files contain invented test identities only and are not application data.

## Public deployment and API protection

The Next.js app can be built and hosted on Vercel. Before enabling live AI processing, configure:

- `GEMINI_API_KEY`, optionally `GEMINI_MODEL`.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for shared rate-limit counters.
- `RATE_LIMIT_SALT`, a long random secret used to HMAC client IPs before storage.

Production AI processing **fails closed** if shared Redis, a valid Vercel-provided client IP, or required settings are unavailable. Vercel preview deployments also require shared limiting. It currently allows 5 AI requests per client per 10 minutes and 200 total requests per day across deployments sharing that Redis/prefix. Redis failures/timeouts do not permit AI calls. Counters contain pseudonymous identifiers and expiration windows, not resume content; analytics are disabled. Client IPs come only from Vercel’s `x-vercel-forwarded-for` header on Vercel deployments. Other production hosting requires adapting the trusted-proxy identity source; arbitrary forwarded headers are not trusted.

Parsing, job analysis, generation, and validation share these budgets; one tailoring run uses three HTTP requests. Each validation request makes at most three provider calls (review, one correction, revalidation), so the 200-request daily budget bounds provider calls at 600; it is not a monetary spending cap. Configure provider quotas for your deployment. Existing Redis key prefixes (`resume:parse:*`) are retained so upgrading cannot reset counters. Local `next dev` uses one in-memory bucket of 5 AI requests per minute across clients. This is only a development convenience, **not distributed production protection**. Local `next start` fails closed for AI processing without a trusted production deployment. Tests mock AI/provider calls and do not require a paid key.

The API caps streamed JSON bodies at 256 KiB (including when Content-Length is missing or false), checks origin when supplied, validates input and output, applies provider and client timeouts, returns consistent JSON errors, and sets `Cache-Control: no-store`. Provider details and personal content are not logged or included in error responses. Same-origin checks are supplemental; shared rate limits and the global cap are the cost controls. Additional edge/WAF controls and provider quotas may be appropriate for a public launch.

## Architecture and storage

- Next.js App Router, strict TypeScript, Tailwind CSS 4, and configured shadcn/ui components. Responsive navigation covers `/`, `/profile`, `/dashboard`, `/resume/[id]`, and `/settings`.
- Zod schemas in `src/schemas` are the runtime and inferred-type source of truth. Repeatable professional facts have stable IDs. Dates use `YYYY-MM` only when known; the extraction prompt preserves partial source dates with context in additional accomplishments rather than inventing months.
- Browser extraction, server AI processing, upload orchestration, and persistence are separate modules under `src/lib`. A server-only import guards Gemini credentials and rate-limit code.
- Dexie schema version 1 has `profiles`, `profileDrafts`, `uploadedDocuments`, `generatedResumes`, and `settings`. Singleton profile keys support one professional profile. Draft source document linkage is optional record metadata and requires no index migration. Future indexed changes must append a Dexie version; do not rewrite released version 1.
- Original files are Blobs; no extracted text is stored separately. A latest-upload pointer supports retry. Draft commits occur in transactions, independently of file storage, so a failed operation cannot remove the original or approved data. Invalid stored profiles are rejected without deleting them.
- IndexedDB opens in client effects, never during SSR. Storage/quota failures are surfaced. Generated resume records contain validated structured content plus an immutable original for future restoration. IDs, profile version, timestamps, pending-review status, and evidence IDs are retained. Inserts cannot overwrite existing resumes. An optional approved-source snapshot is added to each new record; old records remain readable. The existing `id, updatedAt` indices suffice, so no IndexedDB version migration is needed.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
# If Turbopack cannot bind its local worker port in a restricted environment:
# npm run build -- --webpack
npx playwright install chromium
npm run test:e2e
# Against an already built production app on port 3100:
PLAYWRIGHT_SERVER_MODE=production npm run test:e2e
```

Milestone 4 adds mocked Gemini and API tests, stable evidence ranking, cross-entry and unsupported-number rejection, strict approval gating, local resume recovery/original preservation, client sequencing, duplicate submission protection, and save retry without repeated AI requests. Playwright covers successful generation, readable saved results after reload, failure/retry, and desktop/mobile layouts.

Vitest covers schemas, file limits, archive checks, AI validation, safe API errors, request limits, provider timeouts, rate-limiter outages, persistence/recovery, concurrent drafts, and verified-profile isolation. React Testing Library checks navigation. Editor storage tests cover incomplete drafts, strict approval, transactional rollback, versions, evidence IDs, and stale tabs. Playwright runs real synthetic PDF/DOCX extraction, mocked AI parsing, every profile section, nested fact edits/reordering/deletion, approval errors, autosave recovery, approved-profile isolation, navigation flushes, two-tab conflicts, failure/retry, manual creation, replacement confirmation, and desktop/mobile layouts. Fixtures contain fictitious professional information only. No automated test makes paid API calls.

The upload handler is named `processUpload` to avoid shadowing `process.env` references injected by Next.js during server compilation.

Milestone 5 tests cover deterministic mismatches, semantic verdict coverage, unsupported wording, correction/revalidation limits, source snapshots, validation failures, edit isolation, stale-tab writes/deletions, original restoration, sorted history, JSON downloads, and browser editing/review/recovery. All provider calls are mocked.

## Remaining limitations

- Validation is evidence-based review, not a guarantee of truth; users must review the result. Older resumes without a source snapshot cannot be revalidated if their approved profile ID/version no longer matches. Profile JSON is a backup of professional facts, not a full workspace archive: original documents and generated resumes are excluded. Saved resume JSON downloads remain available separately. Local browser storage can be cleared or unavailable.
- PDF fonts cover Latin, Greek, and Cyrillic; unsupported characters are reported with a DOCX fallback rather than silently replaced. RTL/CJK PDF font/shaping support is not included. DOCX appearance and pagination depend on the fonts and Word editor installed on the recipient’s device. Target length guides selection and does not guarantee a fixed number of pages.
- Automated accessibility checks cover WCAG A/AA rules in the core resume/settings flows; they do not replace a complete assistive-technology audit. Browser automation currently uses Chromium desktop and mobile emulation. A GitHub Actions workflow is configured, but no remote CI run or Vercel deployment is claimed.
- Real Gemini output quality still needs a user-run smoke test with configured credentials. Automated provider responses are mocked; no live call is claimed.
- npm audit reports 5 high-severity development lint-chain findings through `eslint-config-next → fast-glob → micromatch → braces` (GHSA-vfj7-8cjw-p6xm). No patched braces successor was available during implementation.
- npm audit also reports 3 moderate findings through Mammoth’s CLI-only `argparse → sprintf-js` chain (GHSA-hp3w-g68c-fv3c). The application imports the browser bundle, which does not include argparse/sprintf; it never invokes Mammoth’s CLI. The suggested forced downgrades are incompatible/obsolete and were not applied. Recheck upstream patches before public release.

References: [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [PDF.js](https://mozilla.github.io/pdf.js/examples/), [Mammoth](https://github.com/mwilliamson/mammoth.js), [Vercel proxy headers](https://vercel.com/docs/headers/request-headers), [Upstash rate limiting](https://upstash.com/docs/redis/sdks/ratelimit-ts/features), [pdf-lib](https://pdf-lib.js.org/), [docx](https://docx.js.org/).
