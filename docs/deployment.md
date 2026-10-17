# Deployment and release verification

The application is implemented for Vercel with browser-local storage and server-only AI processing. Deploying it does not require authentication or a central profile database. A public deployment needs Gemini credentials and shared rate limiting. No deployment has been performed by the implementation workflow.

## Build and hosting

1. Use Node.js 24 and npm, with the committed lockfile.
2. Run `npm ci`, `npm run typecheck`, `npm run lint`, and `npm test`.
3. Build with `npm run build -- --webpack`. The prebuild script copies the matching PDF.js worker to `public/`. The bundled `/fonts/` files and their license must remain in the deployment.
4. In Vercel, select the Next.js framework, Node.js 24, install command `npm ci`, and build command `npm run build -- --webpack`. Keep the default Next.js output handling; this application needs Route Handlers and is not a static export.
5. Configure the environment variables below for both preview and production deployments, then redeploy. The validation route requests a 180-second duration; choose a deployment configuration supporting that duration. Parsing, analysis, and generation use 60-second route budgets.

Webpack is the verified production build path. The default Turbopack build may need local process/port access unavailable in restricted execution environments. It remains selectable through the standard `npm run build` script.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-only Google Gemini key. Never prefix with `NEXT_PUBLIC_`. |
| `GEMINI_MODEL` | Optional structured-output model available to the project; current application default is `gemini-3.5-flash-lite`, shared by all AI tasks. |
| `UPSTASH_REDIS_REST_URL` | Shared Redis REST endpoint for client/global counters. |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only Redis REST token. |
| `RATE_LIMIT_SALT` | Long random secret used to HMAC client IPs for rate-limit keys. |

Vercel's Upstash integration may instead create `KV_REST_API_URL` and `KV_REST_API_TOKEN`. The app accepts that pair when both `UPSTASH_` variables are absent or blank, so duplicating integration credentials is unnecessary. A partially configured `UPSTASH_` pair fails closed; remove both overrides to use the integration. Neither `REDIS_URL` nor the read-only token can replace the REST write credentials. Add `GEMINI_API_KEY` separately in Vercel: local environment files are not deployed through Git.

If an existing environment sets `GEMINI_MODEL=gemini-2.5-flash`, change it to `gemini-3.5-flash-lite` and redeploy. Google rejects the older model for new users. A saved environment override takes precedence over the application's updated default. Provider 404 responses produce `AI_MODEL_UNAVAILABLE` without exposing provider details. Use only `GEMINI_MODEL`; the former `GEMINI_PARSE_MODEL` override is no longer read and can be removed. See [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).

Provider deadline errors (408/504) return `AI_TIMEOUT`; access, quota, and rejected-request failures have distinct safe error codes. Server diagnostics record only the numeric provider status, never provider messages or resume content. On October 17, 2026, a synthetic extraction with the full profile schema succeeded using `gemini-3.5-flash-lite`; `gemini-3.8-flash` returned deadline errors even on a minimal text request. This verifies that extraction configuration, not live generation/validation or future provider availability. Google describes [Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) as optimized for document parsing.

Resume extraction preserves year-only dates as labeled facts in Additional accomplishments; precise date fields still require `YYYY-MM`. Missing months are never guessed. Empty/null optional dates become absent; invalid complete dates still fail validation. Extraction validation diagnostics contain only schema paths and error codes, never extracted values or raw provider output.

Provider JSON schemas omit `maxItems` array caps: the job-analysis schema with those caps produced a reproducible Gemini 400, while the same request without them succeeded. Runtime Zod validation retains every array limit, including for generated content and semantic reviews. Output-size limits and evidence checks remain enforced.

Vercel sets `VERCEL=1`. The limiter accepts client identity only from the Vercel-managed `x-vercel-forwarded-for` header on that platform. Do not substitute arbitrary `X-Forwarded-For` input. Other production hosts need an explicitly trusted proxy implementation before AI endpoints are enabled. Missing configuration, invalid identity, or a Redis error fails closed with a safe 503 response.

All AI routes share 5 HTTP requests per client per 10 minutes and 200 per day globally. A successful tailoring run uses analysis, generation, and validation requests. A validation request makes up to three Gemini calls, including one optional correction/revalidation. The budget therefore bounds calls but is not a fixed monetary cap; set provider quotas appropriate to the deployment. Existing `resume:parse:*` Redis key prefixes are retained across upgrades to preserve active counters. Development-only in-memory limits are not distributed production protection.

## Production verification

After building locally:

```sh
npx playwright install chromium
PLAYWRIGHT_SERVER_MODE=production npm run test:e2e
```

This starts `next start` on port 3100. All AI responses in the automated browser suite are mocked, including validation. Unit tests also mock provider calls and shared services. No test requires a paid key. The GitHub Actions workflow performs the same build/check/browser sequence on Node.js 24; a local pass does not imply the remote workflow has already run.

Before a public launch, perform a live smoke test with a synthetic resume and configured provider credentials: extract → review/edit → approve → analyze → generate → validate → edit/revalidate → export both formats → reload and reopen history. Inspect the actual PDF and Word output in your supported readers, and verify failures do not remove existing data. This intentionally uses the real provider and can incur usage; the automated implementation checks do not claim that step was performed.

Verify that missing rate-limit settings block AI calls; approved profiles stay in IndexedDB; API responses are `Cache-Control: no-store`; original documents and export content are not uploaded for export; and neither secrets nor professional content appear in logs. The app adds no-sniff, no-referrer, frame-denial, and restricted device-permission headers. Avoid adding request-body logging, analytics capturing field values, or server-side profile persistence.

## Data and output limits

- Upload PDF/DOCX: up to 5 MiB, text-based PDFs up to 100 pages; extracted text up to 60,000 characters. OCR is out of scope.
- AI request bodies: streamed 256 KiB cap and 10-second body deadline; oversized profiles fail safely rather than losing data.
- Job descriptions: 20–30,000 characters.
- Profile imports: 2 MiB, validated before replacing any draft. Imported data always needs fresh approval.
- Export: 200,000 characters; PDF up to 50 pages; 45-second worker deadline. A requested one/two-page target never truncates content or forces unreadably small fonts.
- PDF: bundled Noto Sans supports Latin/Greek/Cyrillic. Unsupported glyphs produce an explicit DOCX fallback message. Other scripts and bidirectional PDF layout are not included in this MVP.
- DOCX: editable paragraphs; pagination can vary across editors and installed fonts.

Storage is isolated by browser and website origin. Moving to a new domain does not move IndexedDB data. Back up approved profiles/drafts as JSON before changing domains or clearing browser data; application documents and saved resume JSON can be downloaded separately. Profile backups exclude original uploads and generated resume history. Deleting application data cannot delete files already downloaded to the user's device.

## Dependency advisories and remaining release checks

The audit still reports the pre-existing eight transitive findings: five high-severity lint-chain findings (`eslint-config-next → fast-glob → micromatch → braces`, GHSA-vfj7-8cjw-p6xm), and three moderate Mammoth CLI-chain findings (`argparse → sprintf-js`, GHSA-hp3w-g68c-fv3c). The application uses Mammoth's browser bundle, not its CLI. No new export dependency advisory was reported by the implementation audit. Forced downgrade suggestions are incompatible with this stack and have not been applied. Recheck with `npm audit` for upstream fixes before release.

Automated axe checks cover WCAG A/AA rules on the core resume/settings workflows; manual keyboard and assistive-technology review still matters. Browser tests cover Chromium desktop and mobile emulation, not every browser or device. No claim is made that AI validation guarantees factual accuracy, that a specific ATS vendor has certified the template, or that the application has already been deployed.

References: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration), [Vercel request headers](https://vercel.com/docs/headers/request-headers), [Upstash rate limiting](https://upstash.com/docs/redis/sdks/ratelimit-ts/features).
