# 01 — System assessment

## Baseline and method

Reviewed `CLASSATTENDANCE_CODEBASE.md`, package scripts, source modules, IndexedDB schema, cryptography, backups, interface components, tests, release records and CI. The documented React 19/TypeScript/Vite/Dexie architecture matches the repository. Baseline: 19 test files / 168 tests passed on October 24, 2026 using `node node_modules/vitest/vitest.mjs run --configLoader runner`.

`pnpm` is absent from PATH in this environment. Default bundled Vite configuration loading fails because esbuild cannot enumerate the sandbox's parent directory. Runner loading succeeds without weakening filesystem permissions or changing application behavior.

## Findings

| ID | Classification | Priority | Evidence and consequence | Planned action |
| --- | --- | --- | --- | --- |
| SEC-01 | Verified defect | P1 | `TeacherPortal.unlock` awaits crypto and persistence without invalidating its completion on pagehide/unmount. A late unlock can re-expose the workspace after the lock event. | Invalidate pending unlock attempts on lock/disposal; regress delayed completion. |
| SEC-02 | Verified defect | P1 | Inactivity protection only schedules/reset timers. On a suspended/throttled page an interaction can reset the timer before an expired callback runs. | Compare absolute inactivity deadline on interaction, focus and visibility return before renewal. |
| CAM-01 | Verified defect | P2 | `ScannerView` puts `enumerateDevices` in the same fatal catch as actual startup. A missing/rejected optional enumeration stops a working camera. | Treat camera listing as optional and retain active scanning. |
| CAM-02 | Verified defect | P2 | Torch capability remains true between handles and `camera.current?.torch` can resolve without a camera while the UI toggles its state. | Reset capability on startup/cleanup and require a live handle; test restart and failure. |
| AUD-01 | Verified functional gap | P2 | `AuditTrail` always slices the first 100 matches, with no way to browse older matching events in the UI. Export remains complete. | Add bounded pagination and reset it when filters/session change. |
| UX-01 | Enhancement | P1 | Student entry statically imports teacher workspace, database orchestration and report controls. | Lazy-load teacher functionality with accessible loading/error/retry states. |
| UX-02 | Enhancement | P2 | New sessions present optional report metadata alongside essential course/section fields. | Group optional metadata/timezone under expandable details; preserve values and open on validation errors. |
| UX-03 | Enhancement | P2 | Teachers repeatedly type room challenges and stale form start times. | Add explicit cryptographically random challenge generation and a use-current-time action. |
| PERF-01 | Enhancement | P3 | Attendance roster renders every student row on each refresh. | Bound rendered rows with pagination while preserving full-session exports. |
| SEC-03 | Enhancement | P2 | HTML lacks CSP/referrer policy. React avoids unsafe HTML, but browser resource restrictions add defense in depth. | Add a production-compatible policy; verify scanner, exports, worker and offline behavior. |
| REL-01 | Suspected defect | P2 | Optional storage persistence awaits before unlock finishes; failure/slow response could obscure completed unlock. | Decouple optional persistence from authentication; exercise rejection and lock races. |

No confirmed critical P0 vulnerability or data corruption is established by this assessment. Numeric-PIN offline guessing and unsigned QR forgery/relay are existing trust-model limitations, not solved by navigation or client-side throttling.

## Existing strengths retained

AES-GCM record-context binding; separate HMAC indexes; transactional attendance/audit; duplicate compound key; stale roster/template guards; snapshot reports; validated transactional backup replacement; legacy backup/schema support; closure/reopening semantics; service-worker caching and update guard; explicit sensitive-operation confirmations.

## Inspection limits

Follow-up inspection confirmed two related scanner defects: a stalled optional enumeration could delay shutdown, and repeated torch clicks could race pending constraints. Both are fixed and covered in `scanner-lifecycle.test.tsx`. A valid epoch-zero dispute timestamp also displayed as unknown; its regression is in `dispute-ui.test.tsx`. The existing roster-state notification test needed to await a passive React effect rather than asserting immediately after a DOM change; its expectations remain unchanged.

Maintainer advisories also confirmed affected installed Vite development-server versions. Updating the dependency is blocked by registry access; see the security assessment for exact affected ranges, sources and mitigation scope. Final test/browser results are in `08-testing-and-validation.md`.

Static inspection is not proof that every hardware-dependent control works. Physical cameras, torch, OS storage eviction, assistive technologies and real classroom throughput need external validation. Dependency advisory freshness requires a successful advisory lookup; installed version inspection alone is insufficient.
