# AI Resume Tailor

Milestone 1 foundation for a local-first resume tailoring application. No AI, upload, parsing, profile editing, resume generation, or export functionality is enabled yet.

## Run locally

Use Node.js 22.12+ (Node 24 LTS recommended) and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. No API key or environment configuration is needed for this milestone.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest runs schema, persistence, and navigation tests with React Testing Library, jsdom, and fake-indexeddb. Playwright runs navigation and actual IndexedDB initialization smoke tests at desktop and mobile viewport sizes using Chromium. Tests make no paid API calls.

## Architecture

- Next.js App Router, React, strict TypeScript, Tailwind CSS 4, and shadcn/ui (Button, Card, Badge). `components.json` configures aliases and the neutral theme; component source lives in `src/components/ui`. The shared `cn` helper merges Tailwind classes.
- All five application routes exist: `/`, `/profile`, `/dashboard`, `/resume/[id]`, and `/settings`. Future workflows are labeled placeholders. Navigation wraps on narrow screens and includes active-page semantics, keyboard focus states, and a skip link.
- `src/schemas/profile.ts` defines runtime schemas and draft construction. `src/types/index.ts` infers domain types from those schemas rather than maintaining duplicate interfaces. All repeatable facts carry stable IDs; validation preserves IDs and rejects duplicates across the profile.
- Drafts can omit personal details. Verified profiles require a name and verification timestamp. Verification is a data invariant, not a UI workflow in this milestone. Month dates use `YYYY-MM`; timestamps use UTC ISO strings. Unknown employment dates may be omitted rather than invented.
- `src/lib/storage/database.ts` configures five Dexie stores at schema version 1. The lazy browser-only accessor avoids IndexedDB work during server rendering. The footer initializes the database in a client effect and reports failures without logging personal content.
- Draft and verified profile stores use a singleton `primary` key, supporting exactly one professional profile. Saving a draft never writes to the verified store. Both reads and writes validate profiles; invalid records remain untouched. Quota/storage errors produce actionable messages.
- The generated-resume store reserves an explicitly unknown payload until its domain schema is designed in Milestone 4. No generation repository or API endpoints are exposed prematurely.
- Future migrations must append a new Dexie version and an explicit upgrade function as needed. Do not edit the released version 1 declaration.

## Privacy and limitations

Personal data is intended to remain in IndexedDB; no server profile database exists. Browser storage is not a backup and can be cleared or unavailable. Future Gemini requests will require disclosure and server-side credentials. AI API handlers, abuse protection, import/export, destructive-data controls, document extraction, and full editor workflows belong to later milestones.

Initial npm audit reports five high-severity development-tool findings through `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` (GHSA-vfj7-8cjw-p6xm). The currently published braces release (3.0.3) has no patched successor. The affected lint tooling is not application runtime code. Recheck before deployment; do not apply the suggested forced downgrade to an incompatible Next.js lint configuration.

Next.js installation reference: https://nextjs.org/docs/app/getting-started/installation
shadcn/ui setup reference: https://ui.shadcn.com/docs/installation
