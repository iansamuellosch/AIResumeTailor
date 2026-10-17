# AI Resume Tailor

Milestones 1–3: a local-first foundation, PDF/DOCX upload and Gemini extraction, and a complete professional profile editor with local autosaving and explicit approval. The landing page contains instructions, upload controls, and a data disclosure. Job analysis, resume generation, factual validation of generated content, and document export remain later work.

## Run locally

Use Node.js 22.13+ (Node 24 LTS recommended) and npm.

```sh
npm ci
cp .env.example .env.local
# Set GEMINI_API_KEY in .env.local, then:
npm run dev
```

Open http://localhost:3000. Obtain a Gemini API key from Google AI Studio. `GEMINI_MODEL` defaults to `gemini-2.5-flash`; choose a model available to your project that supports structured JSON output. Keys stay server-side and must never use a `NEXT_PUBLIC_` prefix. Restart the server after changing environment variables. Without a key, uploads are still stored locally and can be retried later or replaced with a manual draft; AI parsing returns an understandable configuration error.

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

Writes compare both draft and approved snapshots inside the transaction. If another tab saves or approves first, the stale editor stops writing and shows a conflict message; it never silently overwrites the newer profile. Reloading after confirmation discards unsaved local edits and loads the stored version. The dashboard requires an approved profile and shows its version; generation controls remain Milestone 4.

## Public deployment and API protection

The Next.js app can be built and hosted on Vercel. Before enabling live parsing, configure:

- `GEMINI_API_KEY`, optionally `GEMINI_MODEL`.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for shared rate-limit counters.
- `RATE_LIMIT_SALT`, a long random secret used to HMAC client IPs before storage.

Production parsing **fails closed** if shared Redis, a valid Vercel-provided client IP, or required settings are unavailable. Vercel preview deployments also require shared limiting. It currently allows 5 parsing attempts per client per 10 minutes and 200 total attempts per day across deployments sharing that Redis/prefix. Redis failures/timeouts do not permit AI calls. Counters contain pseudonymous identifiers and expiration windows, not resume content; analytics are disabled. Client IPs come only from Vercel’s `x-vercel-forwarded-for` header on Vercel deployments. Other production hosting requires adapting the trusted-proxy identity source; arbitrary forwarded headers are not trusted.

Local `next dev` uses one in-memory bucket of 5 attempts per minute across clients. This is only a development convenience, **not distributed production protection**. Local `next start` fails closed for AI parsing without a trusted production deployment. Tests mock AI/provider calls and do not require a paid key.

The API caps streamed JSON bodies at 256 KiB (including when Content-Length is missing or false), checks origin when supplied, validates input and output, applies provider and client timeouts, returns consistent JSON errors, and sets `Cache-Control: no-store`. Provider details and personal content are not logged or included in error responses. Same-origin checks are supplemental; shared rate limits and the global cap are the cost controls. Additional edge/WAF controls and provider quotas may be appropriate for a public launch.

## Architecture and storage

- Next.js App Router, strict TypeScript, Tailwind CSS 4, and configured shadcn/ui components. Responsive navigation covers `/`, `/profile`, `/dashboard`, `/resume/[id]`, and `/settings`.
- Zod schemas in `src/schemas` are the runtime and inferred-type source of truth. Repeatable professional facts have stable IDs. Dates use `YYYY-MM` only when known; the extraction prompt preserves partial source dates with context in additional accomplishments rather than inventing months.
- Browser extraction, server AI processing, upload orchestration, and persistence are separate modules under `src/lib`. A server-only import guards Gemini credentials and rate-limit code.
- Dexie schema version 1 has `profiles`, `profileDrafts`, `uploadedDocuments`, `generatedResumes`, and `settings`. Singleton profile keys support one professional profile. Draft source document linkage is optional record metadata and requires no index migration. Future indexed changes must append a Dexie version; do not rewrite released version 1.
- Original files are Blobs; no extracted text is stored separately. A latest-upload pointer supports retry. Draft commits occur in transactions, independently of file storage, so a failed operation cannot remove the original or approved data. Invalid stored profiles are rejected without deleting them.
- IndexedDB opens in client effects, never during SSR. Storage/quota failures are surfaced. The generated-resume store remains reserved until its schema is implemented.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest covers schemas, file limits, archive checks, AI validation, safe API errors, request limits, provider timeouts, rate-limiter outages, persistence/recovery, concurrent drafts, and verified-profile isolation. React Testing Library checks navigation. Editor storage tests cover incomplete drafts, strict approval, transactional rollback, versions, evidence IDs, and stale tabs. Playwright runs real synthetic PDF/DOCX extraction, mocked AI parsing, every profile section, nested fact edits/reordering/deletion, approval errors, autosave recovery, approved-profile isolation, navigation flushes, two-tab conflicts, failure/retry, manual creation, replacement confirmation, and desktop/mobile layouts. Fixtures contain fictitious professional information only. No automated test makes paid API calls.

## Remaining limitations

- Profile data import/export, individual deletion controls, and resume workflows belong to later milestones. Settings → Clear resume data removes uploads, draft/approved profiles, saved resumes, and the latest-upload pointer after confirmation, then reloads the upload page. This is atomic and preserves unrelated preferences. Local storage is not a backup and may be cleared or unavailable.
- Real Gemini output quality still needs a user-run smoke test with configured credentials. Automated provider responses are mocked; no live call is claimed.
- npm audit reports 5 high-severity development lint-chain findings through `eslint-config-next → fast-glob → micromatch → braces` (GHSA-vfj7-8cjw-p6xm). No patched braces successor was available during implementation.
- npm audit also reports 3 moderate findings through Mammoth’s CLI-only `argparse → sprintf-js` chain (GHSA-hp3w-g68c-fv3c). The application imports the browser bundle, which does not include argparse/sprintf; it never invokes Mammoth’s CLI. The suggested forced downgrades are incompatible/obsolete and were not applied. Recheck upstream patches before public release.

References: [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [PDF.js](https://mozilla.github.io/pdf.js/examples/), [Mammoth](https://github.com/mwilliamson/mammoth.js), [Vercel proxy headers](https://vercel.com/docs/headers/request-headers), [Upstash rate limiting](https://upstash.com/docs/redis/sdks/ratelimit-ts/features).
