# Implementation verification

This document records the original prototype verification. For the subsequent QA fixes, newly executed tests, schema-2 export evidence and current release limitations, use [QA implementation status](docs/qa-status.md). Historical results below are not a substitute for the current checks.

## Story

Student/browser QR generation and teacher/browser roster, session, attendance, correction, and export operations use local encrypted IndexedDB. There is no API server or cloud database in this scope.

## Confirmed

- Strict TypeScript compilation succeeded.
- Vite production build succeeded and Workbox generated a precache covering the built website and lazy scanner/export chunks.
- 28 automated tests passed across crypto, QR/CSV contracts, attendance transactions/recovery, reporting, field-analysis arithmetic, and the teacher interface.
- The production-dependency audit reported no known vulnerabilities at implementation time. This is not a guarantee against undiscovered issues.
- In the in-app Chromium browser, student ID `2024-10492` normalized to `202410492`, generated a visible Canvas QR, and activated supported wake lock.
- The resource-readiness control correctly reported the built resources cached after the Workbox revision-key fix.
- After stopping the preview HTTP server, the existing browser tab reloaded successfully through the service worker and generated a new QR without the server.
- The teacher entry and recovery interface rendered from that cached website. No real teacher credentials or student records were entered during browser inspection.
- No browser warnings/errors were recorded during the online readiness/QR check.

## Significant checks

- Eight concurrent attempts for one session/student produced one attendance row and seven duplicate outcomes.
- Simulated audit-write rejection left no attendance row.
- Encryption rejected wrong PINs, swapped record context, and tampered ciphertext.
- UTF-8 BOM, quoted commas, and Windows-1252 fallback retained Philippine names.
- ID-normalization collisions were rejected before import.
- Session closure created absences and blocked later automatic scans.
- Historical roster snapshots survived later roster changes.
- Encrypted backup restored records after local deletion; wrong PIN and malformed-file attempts preserved existing data.
- An actual generated Excel workbook was read back to verify counts, preserved leading zeros, Unicode, and a formula-looking name stored as text.
- Phase 3 dispute tests preserve first/second presentation times, block unresolved closure, record reasoned resolution and retain original timestamps during correction.
- Reopening removes automatic absences while preserving explicit teacher decisions. Closed-session corrections are rejected until reopening.
- Continuous target testing accepts one held pass over five seconds, then permits a deliberate re-presentation after clearing the view.
- A jsdom interface test opens the F2 manual dialog, records an excusal, closes the session read-only and reopens it with a reason. The camera adapter is mocked in that test.
- Root and `/ClassAttendance/` production builds succeeded, with correctly prefixed assets and generated workers. The updated browser cache check passed. The new guide opened through the service worker after the preview server was stopped.
- The field-analysis CLI rejected the empty measurement template. Unit tests used explicitly synthetic measurements and do not establish classroom performance.
- The 12-slide defense deck and one-slide onboarding deck passed package/layout/font checks and Artifact Tool import. Every rendered slide was visually inspected. No PowerPoint execution claim is made.
- Both PDF documents were rendered and inspected, including both sides of the teacher tri-fold.

## Not yet verified for deployment

- Optical scanning with physical cameras and student displays, rear-camera choices, and torch.
- Real Safari/iOS, Android browser, Firefox, and desktop browser coverage.
- Full browser restart with connectivity unavailable (the performed check was a tab reload with the HTTP server stopped).
- Browser permission prompts, low-storage eviction, abrupt power loss, OS suspension, and hardware thermal/battery behavior.
- Actual download/restore on another physical device, screen-reader interaction, and classroom throughput.
- Institution-specific identity verification, ID format policy, retention/processing procedures, and RA 10173 compliance assessment.
- GitHub Pages repository enablement, workflow execution and a live HTTPS deployment. Workflow files are prepared; a successful deployment is not claimed.

The build emits a size warning for the approximately 500 KB uncompressed spreadsheet chunk. It is lazy-loaded, compressed for transfer, and included in the offline precache. The complete precache is approximately 1.2 MB uncompressed. No runtime spreadsheet CDN fetch is required.

## Commands

```sh
node node_modules/typescript/bin/tsc -b
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
pnpm audit --prod --audit-level high
```
