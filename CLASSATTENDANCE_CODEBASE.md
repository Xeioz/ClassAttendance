# ClassAttendance: Complete Codebase and Feature Reference

Prepared: October 24, 2026. Package version: `0.3.0`.

This document covers the implemented Attendance Desk application, including the teacher preparation update merged in commit `e93c6ff` and the October 24 workspace modernization. It consolidates features, workflows, architecture, storage, setup, verification, and remaining work. It describes repository evidence; it does not establish that a deployment or physical classroom trial has passed.

## Contents

- [Application overview](#application-overview)
- [Complete implemented feature inventory](#complete-implemented-feature-inventory)
- [Student workflow](#student-workflow)
- [Teacher workflow](#teacher-workflow)
- [Attendance rules](#attendance-rules)
- [Architecture and source map](#architecture-and-source-map)
- [Data model and persistence](#data-model-and-persistence)
- [Security and privacy model](#security-and-privacy-model)
- [Reports and exports](#reports-and-exports)
- [Backup and recovery](#backup-and-recovery)
- [Offline operation and browser support](#offline-operation-and-browser-support)
- [Development and deployment](#development-and-deployment)
- [Testing and verification](#testing-and-verification)
- [Latest implemented update](#latest-implemented-update)
- [Planned features and remaining validation](#planned-features-and-remaining-validation)
- [Existing documentation and supporting artifacts](#existing-documentation-and-supporting-artifacts)

## Application overview

ClassAttendance, displayed as **Attendance Desk**, is a browser-based QR attendance system. Students display passes on their devices; a teacher scans them and manages attendance on a local teacher device. The application also supports manual attendance, correction, disputes, reports, and encrypted recovery.

The application uses React and TypeScript with a static Vite build. Teacher data lives in encrypted IndexedDB records. There is no application API server, cloud student database, institutional login service, or cross-device synchronization in the implemented scope. Browser installation is optional.

## Complete implemented feature inventory

| Area | Implemented behavior | Main source |
| --- | --- | --- |
| Entry and navigation | Student and teacher views, secure-context requirement, skip link, bundled guide | `src/App.tsx` |
| Teacher vault | Master PIN setup, unlock, lock, in-memory keys, inactivity locking | `src/components/teacher/TeacherPortal.tsx`, `src/db/vault.ts` |
| Student identification | ID validation and normalization; optional browser-local remembered ID and forgetting | `src/components/student/StudentPass.tsx`, `src/utils/normalize.ts` |
| Dynamic QR pass | Versioned payload containing ID, room challenge, and timestamp; rotating pass presentation | `src/components/student/DynamicQR.tsx`, `src/domain/qr.ts` |
| Screen wake lock | Requests supported browser wake lock while displaying a pass | `src/hooks/wakeLock.ts` |
| CSV roster import | UTF-8/BOM and Windows-1252 handling, encoding selection, row validation, canonical identity checks | `src/utils/csv.ts`, `src/utils/rosterValidation.ts` |
| Roster review | Added/updated/unchanged/invalid/conflicting categories, search, filters, pagination, before/after comparison, individual update approval | `src/components/teacher/RosterUpload.tsx`, `src/domain/rosterImport.ts` |
| Safe roster saving | Explicit Save/Cancel, atomic merge, stale-review rejection, preservation of omitted students and historical session rosters | `src/domain/attendance.ts`, `src/domain/rosterSnapshot.ts` |
| Class templates | Encrypted create/select/edit/reload/duplicate/delete, future-section preparation, stale edit/delete protection | `src/domain/templates.ts`, `src/domain/classSettings.ts` |
| Session preparation | Course/section, institution/subject/room, start time, grace period, report timezone, fresh room challenge, roster review | `src/components/teacher/SessionForm.tsx` |
| Pre-class readiness | Required class/roster/session checks; advisory camera, offline resources, storage, and observed backup/recovery checks | `src/components/teacher/PreClassReadiness.tsx`, `src/domain/readiness.ts` |
| Camera scanning | Native decoding where available, compatibility decoder, supported camera selection and torch controls | `src/components/teacher/ScannerView.tsx`, `src/utils/camera.ts` |
| Scan feedback | Textual outcomes, accessible status feedback, optional supported audio/vibration | `src/components/common/AccessibleHUD.tsx`, `src/utils/feedback.ts` |
| Attendance recording | Transactional save, present/late classification, unknown/invalid handling, database duplicate protection | `src/domain/checkIn.ts`, `src/domain/attendance.ts` |
| Repeated-frame suppression | 1.5-second cooldown plus continuous-target suppression | `src/domain/qr.ts` |
| Manual attendance | F2 dialog, student search, automatic timing or explicit status, mandatory reason, correction mode | `src/components/teacher/ManualEntryDialog.tsx` |
| Attendance review | Session roster display/search and review of recorded versus unrecorded students | `src/components/teacher/TeacherWorkspace.tsx` |
| Dispute handling | Stable duplicate-review target, both presentation times, reasoned flagging/resolution, closure guard | `src/components/teacher/DisputePanel.tsx`, `src/domain/audit.ts` |
| Audit trail | Encrypted events for traceability, correction context, dispute review, lifecycle actions, exported events | `src/components/teacher/AuditTrail.tsx`, `src/domain/audit.ts` |
| Session lifecycle | Atomic closure with absence reconciliation; read-only closed sessions; reasoned reopening | `src/domain/sessionLifecycle.ts` |
| Excel reports | Four worksheets, full session snapshot, readable formatting, audit data, display/canonical IDs | `src/utils/excel.ts`, `src/domain/reports.ts` |
| CSV reports | Complete session roster, 16-column contract, UTF-8 BOM, quoting, formula guards | `src/utils/csvExport.ts` |
| Encrypted backups | Validated backup downloads, template inclusion, compatible older backup restoration | `src/db/backup.ts`, `src/db/backupValidation.ts` |
| Recovery interface | Locked-workspace restore, PIN check, replacement acknowledgment, transactional replacement, immediate unlock UI | `src/components/teacher/BackupControls.tsx` |
| Offline operation | Production service-worker precache, lazy-chunk caching, resource checklist, network status | `vite.config.ts`, `src/components/common/OfflineStatus.tsx` |
| Update handling | Prompted website updates with update action blocked during an active local session | `src/components/common/OfflineStatus.tsx` |
| Accessibility foundations | Labels, associated validation, keyboard/focus handling, status text, wrapping, narrow/enlarged layouts | `src/components/`, `src/styles.css` |
| Localization foundations | Bundled English strings and fallback mechanism | `src/i18n/index.ts`, `src/i18n/en/` |
| Field analysis | Observation template and CLI for analyzing supplied measurements | `src/domain/fieldMetrics.ts`, `scripts/analyze-field-run.ts` |
| Release tooling | CI, manual Pages publication workflow, synthetic export QA, guide/handout generation | `.github/workflows/`, `scripts/` |

## Student workflow

1. Open the teacher-provided HTTPS address online before class and check offline readiness.
2. Select **Student pass** and enter an official ID and the current room challenge.
3. Optionally remember the ID on a private device. Use the forgetting control on shared devices.
4. Display the generated QR to the teacher. Brightness remains under the student's control.
5. Wait for the teacher to confirm a successful saved check-in. A visible QR is not a receipt.
6. Request manual attendance if the screen, battery, cached site, or device clock prevents scanning.

Students do not create authenticated accounts. A pass carries self-asserted identity data; the teacher must verify identity.

## Teacher workflow

1. Create or unlock the local vault using a 6–12 digit Master PIN.
2. Import a CSV with `id,name,section` headers. Review every category, approve changed identities individually, and explicitly save.
3. Select or save a class template, or enter class settings directly. Review the current section roster.
4. Complete the required preparation checks and inspect advisory device checks.
5. Choose a fresh 3–6 digit room challenge and create the attendance session.
6. Scan student passes. Use compatibility decoding or manual attendance as needed.
7. Review unrecorded students, corrections, duplicate disputes, and audit events.
8. Resolve open disputes and close the session. Remaining unrecorded students become absent.
9. Export Excel/CSV and download an encrypted backup; verify that files were actually saved.
10. Reopen a closed session with a reason when correction is required, then close it again.

Templates remain editable during an active session. Roster imports cannot run during an active session. Starting a session requires a current saved roster and completion or cancellation of a pending roster review.

## Attendance rules

- IDs accept 1–64 letters, digits, spaces, or hyphens before normalization. Matching removes spaces/hyphens and uppercases letters. Display IDs preserve official spelling where available.
- Student identity matching uses section plus canonical ID. Names are not identity keys. Normalization collisions in one section are rejected.
- QR payload version 1 contains `v`, `id`, `ch`, and `ts`; the timestamp is in seconds. Parsing rejects unsupported data, incorrect challenges, oversized payloads, and timestamps outside 90 seconds past / 30 seconds future.
- Arrival at or before `startsAt + graceMinutes` is `PRESENT`; later arrival is `LATE`.
- Persistent outcomes are `PRESENT`, `LATE`, `ABSENT`, and `EXCUSED`. An active session can also contain students with no attendance record yet.
- A compound attendance key permits only one record per session/student, including concurrent attempts. Frame suppression reduces repeated feedback; database constraints preserve uniqueness.
- Attendance and required audit writes commit transactionally before success feedback.
- Manual entries and corrections require reasons. Corrections retain original timestamp context.
- Only `ACTIVE` and `CLOSED` session states persist. Export is a repeatable snapshot operation rather than a lifecycle state.
- Open disputes prevent closure. Dispute resolution does not silently change attendance.
- Reopening requires a reason and no competing active session. It removes automatic closure absences while preserving explicit teacher decisions.
- Session roster snapshots preserve historical membership and reporting denominators after later imports.
- Attendance rate is `(present + late) / enrolled`; excused students remain in the denominator.

## Architecture and source map

| Layer | Files/directories | Responsibility |
| --- | --- | --- |
| Bootstrap | `index.html`, `src/main.tsx`, `src/App.tsx` | React startup, role navigation, shared page structure |
| Student interface | `src/components/student/` | ID entry and dynamic QR presentation |
| Teacher interface | `src/components/teacher/` | Vault, preparation, scanning, review, correction, reporting, recovery |
| Shared interface | `src/components/common/` | Accessible feedback and offline/update status |
| Business rules | `src/domain/` | Attendance, check-in, lifecycle, audit, templates, roster review, readiness, reports, field metrics |
| Persistence/security | `src/db/` | Dexie schema, encryption, vault management, backups and validation |
| Shared types | `src/types.ts` | Stored records, private payloads, session/template settings, scan and audit contracts |
| Utilities | `src/utils/` | CSV, Excel, normalization, camera, download, error and feedback helpers |
| Translation resources | `src/i18n/` | English resources and lookup/fallback support |
| Styling/build | `src/styles.css`, `tailwind.config.js`, `postcss.config.js`, `vite.config.ts`, `tsconfig.json` | Styling, strict TypeScript build, asset paths, PWA configuration |
| Tests | `tests/` | Domain, crypto, database, export, accessibility and interface regressions |
| Automation | `scripts/`, `.github/workflows/` | Export checks, browser verification, field calculations, handouts, CI and deployment |
| Public assets | `public/` | Browser guide, icon and sample rosters |
| Documentation | `docs/` | Operational guides, schema contracts, implementation records and evidence |

The main data flow is interface → domain rules → encrypted Dexie transaction → committed feedback. Reporting reads a coherent database snapshot and builds files locally. Student QR generation runs on the student browser without contacting the teacher database.

## Data model and persistence

The Dexie database is named `attendance-desk-v1`. Its current schema version is **2**; the name remains unchanged for compatibility.

| Store | Primary key/indexes | Contents |
| --- | --- | --- |
| `students` | Unique `token`; `sectionToken` index | Encrypted student identity with opaque matching indexes |
| `sessions` | Unique `id`; `state` index | Encrypted class/session settings and roster snapshot; plaintext lifecycle state |
| `scanEvents` | Unique `id`; `sessionId` index | Encrypted audit payloads associated with sessions |
| `attendance` | Compound `[sessionId+studentToken]`; `sessionId` index | Encrypted status, timing, source, and reason |
| `meta` | Unique `id` | Vault KDF parameters and encrypted verifier |
| `classTemplates` | Unique `id` | Encrypted reusable template payloads |

Schema version 2 adds `classTemplates` without rewriting existing records. Database schema, backup envelope, cipher, and vault metadata versions are separate contracts.

Templates contain a name, timestamps, and reusable course/section/subject/room/institution/grace/timezone settings. They exclude start time, room challenge, roster, and attendance. Selecting a template resets the start input to current device time and clears the challenge. Editing a template does not alter existing sessions.

Roster saving merges reviewed rows atomically; omitted students remain enrolled. A changed roster invalidates a pending review, including changes made in another tab. Session creation also guards against stale roster snapshots.

## Security and privacy model

- PBKDF2-HMAC-SHA256 uses 100,000 iterations and a random 128-bit salt. Separate non-extractable AES-GCM-256 and HMAC-SHA256 keys are derived.
- Each encryption uses a fresh 96-bit IV. Additional authenticated data binds ciphertext to record identity.
- Student details, session settings, attendance values, notes, events, templates, and backup payloads are encrypted.
- Record IDs, KDF metadata, active/closed state, opaque indexes, counts, relationships, and equality patterns remain observable.
- Keys remain in memory. Teacher views lock after 15 minutes without pointer/keyboard activity or when leaving the page; camera capture does not extend the interval.
- Numeric PINs remain susceptible to offline guessing. Forgotten PINs cannot be reset to decrypt the existing vault.
- QR codes and room challenges can be forged or relayed. There is no device pairing, digital signature, institutional authentication, or automatic proof of presence.
- Local audit events provide application traceability. Device/browser owners can replace local data or application code, so this is not an independently tamper-proof ledger.
- Untrusted same-origin scripts can access unlocked data. Spreadsheet reports contain plaintext personal information.

Institutional privacy, identity verification, retention, access, device handling, and incident procedures remain operational decisions. See the [threat model](docs/threat-model.md).

## Reports and exports

Excel schema 2 uses ExcelJS to create four worksheets:

| Worksheet | Contents |
| --- | --- |
| Summary | Class/session metadata, state, full-session scope, counts and rates |
| Attendance | Entire session roster, displayed/canonical IDs, status, times, source, reason |
| Audit trail | Session audit events and identity mappings |
| Report info | Schema version, definitions and handling guidance |

The workbook persists frozen headers, filters, wrapped text, row heights, column widths and percentage formats. IDs are text; timestamps are ISO UTC text. Formula-like strings are stored as text; the exporter does not create formulas.

CSV retains its 16-column layout, UTF-8 BOM, comma separation, CRLF, quoting, and apostrophe guards for formula-like values. Spreadsheet CSV import may infer numeric identifiers; import those columns as text or use XLSX when leading zeros matter.

Both formats cover the entire selected session regardless of on-screen search. Active-session reports are marked **IN PROGRESS - NOT FINAL**. Class/report timezone is recorded separately from UTC timestamps. Automatic absences do not receive fabricated check-in times.

See the [export contract](docs/export-schema.md) before integrating downstream consumers; schema 2 changed the XLSX worksheet layout.

## Backup and recovery

Backups are encrypted and validated before download and before replacement. New backup filenames end in `.enc.json`, and new backups include class templates. Supported older backups remain restorable; older backups without templates replace the current template collection with an empty one.

To restore, lock the teacher workspace, select the file, enter its PIN, and acknowledge full replacement. Validation precedes a transactional replacement of the local workspace. Wrong PINs, malformed files, and failed validation should preserve existing data. Successful restoration immediately returns to the unlock interface.

Restore limits are 25 MB and 100,000 rows per table. Keep backups outside the attendance device and verify actual downloaded files. Readiness indicators reflect only downloads requested and restores completed on the current page/vault; reload loses that observation history. They do not certify another device's recovery.

See [storage and backup compatibility](docs/next-release-storage.md).

## Offline operation and browser support

The production service worker precaches application assets and lazy scanner/export chunks. No classroom runtime CDN request is required. The development server does not enable the production service worker, so use a production build for offline checks.

The readiness check inspects cached resources. Test reopening the actual deployed address offline before use; cached resources can still be evicted or cleared. Persistence requests may be denied or unsupported.

Camera and WebCrypto require HTTPS or localhost. A plain LAN HTTP address is insufficient for another device. Camera choice, torch, wake lock, vibration, and permission inspection depend on browser capabilities. Manual attendance remains available when camera access fails.

Updates are prompted, with the update action blocked during an active local session. The database is local to the browser origin/profile. Changing devices or origins requires backup migration. Multiple tabs have transaction/staleness protections, but there is no collaborative live synchronization; interfaces refresh on focus.

## Development and deployment

### Stack

| Purpose | Package/version in `package.json` |
| --- | --- |
| UI | React / React DOM 19.1.1 |
| Language/build | TypeScript 5.8.3, Vite 6.3.6 |
| Styling | Tailwind CSS 3.4.17, PostCSS 8.5.6 |
| Local database | Dexie 4.0.11 |
| CSV | PapaParse 5.5.3 |
| QR generation/compatibility decoding | qrcode 1.5.4, html5-qrcode 2.3.8 |
| Spreadsheet creation | ExcelJS 4.4.0 |
| Independent spreadsheet QA | SheetJS 0.20.3; Python openpyxl tooling |
| Offline build integration | vite-plugin-pwa 1.0.0 / Workbox |
| Tests | Vitest 3.2.4, Testing Library, jsdom, fake-indexeddb, axe-core |

### Local commands

Requires Node 22.18+ or Node 24 and pnpm. Initial dependency installation requires internet.

```sh
pnpm install
pnpm dev
```

```sh
pnpm test
pnpm qa:exports
pnpm build
pnpm preview
```

Production preview normally uses `http://127.0.0.1:4173/`. Package scripts also provide `pnpm format` and `pnpm field:analyze measured.csv summary.json`.

When pnpm is unavailable but dependencies are installed:

```sh
node node_modules/typescript/bin/tsc -b
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js preview --host 127.0.0.1
```

### Deployment

Publish `dist` to a stable static HTTPS origin. Vite uses `BASE_PATH`, defaulting to `/`, for repository-subpath hosting such as `/ClassAttendance/`. In PowerShell:

```powershell
$env:BASE_PATH = '/ClassAttendance/'
pnpm build
```

`.github/workflows/ci.yml` provides automated checks. `.github/workflows/pages.yml` supports manually dispatched Pages publication; repository Pages settings and a successful deployment run are still required. Hosting changes must preserve correct asset paths, worker scope and MIME types. Avoid long immutable caching for `index.html` and `sw.js`.

See [deployment instructions](docs/deployment.md). Workflow presence does not prove that the site is published.

## Testing and verification

The repository contains tests for:

- Cryptography, wrong PINs, ciphertext tampering and record-context authentication.
- ID normalization, QR validation, timing boundaries and repeated-frame behavior.
- Concurrent duplicate prevention and rollback when audit writes fail.
- Roster validation, encoding, change review, stale writes and UI approval flows.
- Template persistence, editing, duplication, stale changes, schema upgrades and interface behavior.
- Readiness states, backup observations and manual fallback.
- Session closure/reopening, disputes, corrections and historical roster snapshots.
- Backup validation, legacy compatibility, restore interface refresh and search behavior.
- Workbook values and stored formatting, CSV contracts and field-analysis arithmetic.
- Keyboard/focus behavior, localized resources and accessibility regressions.

`pnpm qa:exports` generates synthetic 0/1/45/10,000-row export cases. Independent Python checks reopen exports and compare data and workbook properties:

```sh
python -m pip install -r scripts/qa-requirements.txt
python scripts/verify-qa-exports.py
```

`scripts/verify-next-release-browser.mjs` supports the recorded next-release browser checks. Historical test counts and results belong to their dated reports, not to a claim that checks ran while writing this document.

The October 22 implementation record reports automated/domain/UI checks, production root/subpath browser checks, offline Chromium reloads, backup recovery in a fresh browser context, keyboard checks, axe scans, narrow layouts and enlarged text. Physical camera/device coverage and full accessibility conformance remain incomplete. See [latest verification](docs/next-release-status.md) and [previous QA](docs/qa-status.md).

## Latest implemented update

The October 24 modernization in this workspace updates the package to 0.3.0: direct `#student` / `#teacher` navigation; lazy teacher loading with retry; lifecycle-safe unlock and inactivity handling; optional report fields; challenge/time helpers; bounded attendance and complete audit pagination; camera enumeration/shutdown/torch fixes; epoch-zero dispute display; production CSP/referrer controls; and expanded verification. It preserves schema 2, existing encryption and backup/report contracts. See the [final modernization report](docs/implementation-plan/10-final-implementation-report.md) for 190 passing tests, root/subpath browser evidence and release blockers.

The previous committed feature implementation is `1db3f70`, **Add class templates, reviewed roster imports, and readiness guidance**, merged by `e93c6ff` on October 22, 2026.

1. **Reusable encrypted class templates:** create, select, update, reload, duplicate and delete; prepare future sections; protect against stale edits; include templates in backups.
2. **Reviewed roster changes:** classify every row, compare identities, search/filter/page all results, require individual update approval, save atomically, and reject stale reviews.
3. **Pre-class readiness:** distinguish required preparation from advisory camera/offline/storage/recovery observations and provide actionable navigation.
4. **Accessibility/localization foundations:** bundled English fallback, field validation, focus/keyboard behavior, textual scan states, responsive wrapping and enlarged layouts.

These additions preserve the encrypted local/offline model. Detailed evidence and limitations are in [next-release-status.md](docs/next-release-status.md).

## Planned features and remaining validation

The roadmap describes additional work; specification does not imply implementation:

| Item | Current boundary |
| --- | --- |
| Recurring backup reminders | Planned; readiness observations are already implemented |
| Unrecognized-scan review queue | Planned; current scan rejection/review behavior is not a dedicated queue |
| Local student history | Planned as a separate consolidated feature |
| Student retirement/archive | Requires institutional policy and implementation decisions |
| Verified student receipts | Requires identity/trust and offline feasibility decisions |
| Additional institutional languages | English foundation exists; reviewed translations remain to be selected |
| Cross-device synchronization / server accounts | Outside the implemented local-only scope |

See the [roadmap](docs/next-release-roadmap.md) for complete proposals and dependencies.

Remaining validation includes actual optical scanning, supported Android/iOS/desktop hardware, camera denial and glare, abrupt interruption/power loss, low storage/eviction, physical screen readers, second-device recovery, spreadsheet rendering, classroom throughput, hosted deployment, and institutional privacy procedures. Synthetic students and arithmetic fixtures do not establish real classroom performance.

## Existing documentation and supporting artifacts

| File/directory | Purpose |
| --- | --- |
| [README.md](README.md) | Quick start, implementation map, security/browser contract |
| [VERIFICATION.md](VERIFICATION.md) | Original prototype verification; historical evidence |
| [Teacher guide](docs/teacher-guide.md) | Complete teacher operating procedure |
| [Student guide](docs/student-guide.md) | Pass preparation and manual fallback |
| [Threat model](docs/threat-model.md) | Security assumptions and operational risks |
| [Deployment](docs/deployment.md) | HTTPS hosting, Pages, base paths and release gate |
| [Export schema](docs/export-schema.md) | XLSX schema 2 and CSV compatibility |
| [Phase 3–4 record](docs/phase-3-4.md) | Lifecycle, disputes, reports and release materials |
| [QA status](docs/qa-status.md) | Earlier fixes and export verification |
| [Latest implementation status](docs/next-release-status.md) | Newest implemented features, evidence and limits |
| [Storage compatibility](docs/next-release-storage.md) | Schema upgrade, templates and backup behavior |
| [Roadmap](docs/next-release-roadmap.md) | Proposed future features and decision points |
| [Field protocol](docs/field-protocol.md) | Measurement procedure and browser/device observations |
| [Original proposal](portable_qr_attendance_system_proposal.md) | Initial project proposal; consult implementation records for current behavior |
| [Original stack/phases](portable_qr_attendance_system_tech_stack_and_phases.md) | Initial implementation plan |
| `public/guide.html` | Bundled browser guide |
| `public/sample-roster.csv`, `public/master-list-20-students.csv` | Available import fixtures |
| `docs/fixtures/` | Synthetic 45-student roster and empty observation template |
| `docs/samples/` | Example schema-2 XLSX/CSV exports |
| `docs/handouts/` | Teacher/threat-model PDFs and editable onboarding/defense decks |
| `docs/next-release-evidence/` | Recorded synthetic browser/export/build/test evidence |

Maintenance: update this document when implemented behavior changes. Keep future proposals separate from shipped functionality, and record fresh verification in the relevant dated evidence reports.
