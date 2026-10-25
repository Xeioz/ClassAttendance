# Attendance Desk

A browser-based QR attendance website built with React 19, TypeScript, Vite, Tailwind, Dexie, WebCrypto, PapaParse, qrcode, html5-qrcode, SheetJS, and Workbox. No native application or installation is required.

## Run

Requires Node 22.18+ or Node 24 and pnpm. The first dependency installation requires internet access.

```sh
pnpm install
pnpm dev
```

For the offline-capable production build:

```sh
pnpm test
pnpm build
pnpm preview
```

The preview URL is normally http://127.0.0.1:4173/. The development server deliberately does not enable the production service worker. Use the production preview for offline checks. Deploy the `dist` directory to a stable HTTPS origin for use across devices. A LAN HTTP address is not sufficient for camera/WebCrypto access on another device.

This workspace also supports direct Node invocations when pnpm is not on PATH:

```sh
node node_modules/typescript/bin/tsc -b
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js preview --host 127.0.0.1
```

## First classroom workflow

1. Choose **I am a Teacher** and create a Master PIN, or unlock the existing workspace. Keep the PIN securely; it cannot be reset to decrypt old records.
2. Choose **Add class**, enter course, section and term, then import `id,name,section` CSV into that class. Preview additions, matches, name conflicts and section mismatches. Imports add enrollment; omitted students stay enrolled. Try `public/master-list-20-students.csv` with a BSIT-3A class.
3. Open the class Overview and choose **Start attendance**. Review the device-local start time, report timezone, grace period and generated room challenge. Only one session can be active.
4. Students choose **I am a Student**, prepare offline resources and bookmark the exact `#/student` URL. They enter ID and the current challenge to display a QR. A root-launching home-screen icon may still show role selection.
5. Verify identity, start the teacher camera and scan. Manual attendance (F2), sound, torch and compatibility decoding remain available. Success feedback follows a committed save.
6. Choose **Review attendance** to pause the camera, review unrecorded students and resolve disputes. Confirm closure to fill automatic absences. Closed results are read-only; reopening requires a reason.
7. Download Excel/CSV and use **Backup & storage** for an encrypted backup. Check the browser saved the files and keep the backup outside the recording device.
8. To restore, lock records and select the archive with its original PIN. Confirm full replacement. Version 2 archives include classes/enrollment; version 1 archives restore original records for explicit class review.
9. Existing sessions appear under **Unassigned records**. Create the matching course/section/term, then associate each session. This preserves its IDs, attendance, audit and snapshot. Existing section students are copied into a class only after explicit roster review.

Desktop uses class navigation beside the selected workspace. Narrow screens use full-width class and task views with **Back to classes**. Resizing does not mount a second scanner. Defaults apply only to future sessions.

See [prototypev2 implementation and validation](docs/prototypev2-release.md) for migration, recovery and remaining device checks.

## Implementation map

| Requested module | Implementation |
| --- | --- |
| A: database and encryption | `src/db/db.ts`, `crypto.ts`, `vault.ts`, `backup.ts` |
| B: student ID and dynamic QR | `src/components/student/StudentPass.tsx`, `DynamicQR.tsx`, `src/hooks/wakeLock.ts` |
| C: roster and camera | `src/components/teacher/RosterUpload.tsx`, `ScannerView.tsx`, `src/utils/csv.ts`, `camera.ts` |
| C: accessible HUD and feedback | `src/components/common/AccessibleHUD.tsx`, `src/utils/feedback.ts` |
| D: sessions and transactions | `src/domain/attendance.ts`, `checkIn.ts`, `sessionLifecycle.ts`, `qr.ts` |
| D: reports | `src/domain/reports.ts`, `src/utils/excel.ts`, `csvExport.ts` |
| Disputes and audit | `src/domain/audit.ts`, `src/components/teacher/DisputePanel.tsx`, `AuditTrail.tsx` |
| Teacher orchestration | `src/components/teacher/TeacherPortal.tsx`, `TeacherWorkspace.tsx`, `SessionWorkspace.tsx`, `ClassForm.tsx`, `ManualEntryDialog.tsx` |
| Classes and safe operations | `src/domain/classes.ts`, `operations.ts`, `src/hooks/route.ts` |
| Offline caching | `src/sw.ts`, `vite.config.ts`, `src/components/common/OfflineStatus.tsx` |

Files use `.ts`/`.tsx` instead of `.js`/`.jsx` to enforce strict TypeScript. `ExportModal` is an inline export control rather than a focus-trapping dialog; session rules are in the domain layer, not inside the export component.

## Security contract

- Implements the specifically requested PBKDF2-HMAC-SHA256, 100,000 iterations, with a random 128-bit salt. Derives separate non-extractable AES-GCM-256 and HMAC-SHA256 keys. PINs accept 6–12 digits.
- Every encryption gets a fresh 96-bit IV. Additional authenticated data binds ciphertext to its record identity. Names, IDs, class metadata, session details, attendance values, notes, events, and the backup payload are encrypted. Opaque class/enrollment links are plaintext relational metadata.
- Plaintext metadata consists of record IDs, vault KDF parameters, active/closed session state, and opaque HMAC indexes; record counts, relationships, and same-identity equality remain observable. This is not traffic-analysis-proof storage.
- Six-digit PINs remain vulnerable to offline guessing. These requested settings are a compatibility baseline, not a claim of strong resistance against a stolen database. A passphrase/key-wrapping design is a future hardening change requiring migration.
- Keys remain in memory only. Teacher views lock after 15 minutes without pointer/keyboard interaction or when leaving the page. Camera capture alone does not extend that interval. JavaScript cannot promise forensic memory wiping.
- No student device pairing, signatures, institutional authentication, or automated presence verification is claimed. Shared challenges and rotating QR codes can be forged or relayed. Teacher identity verification is required.
- Local events support application traceability; a person controlling the browser/device can tamper with the application or replace local data. Audit records are not independently tamper-proof.
- At-rest encryption does not prevent malicious same-origin scripts from reading unlocked records. Do not add unreviewed third-party scripts, analytics, or unsafe HTML rendering.
- Encryption does not independently establish RA 10173 compliance. The institution must define processing responsibility, lawful basis, notices, retention, deletion, access, incident response, and personal-device policy before deployment.
- Excel downloads contain plaintext personal data. Follow approved institutional handling rules. Encrypted backup files still require protected storage.

## Offline and browser contract

- All built JS/CSS and lazy decoder/export chunks are precached; no classroom runtime CDN requests are needed. The SheetJS official tarball is an install-time dependency, not a runtime CDN script.
- Click Check offline readiness, then perform an actual cold offline launch. A readiness result asks the controlling service worker to check its own revision-specific precache, not a permanent guarantee against browser deletion or corruption.
- `navigator.storage.persist()` can be unavailable or denied. Browser storage is finite; clearing website data or losing the device can lose records. Keep backups.
- Writes and audit attempts commit transactionally before success feedback. A compound database primary key prevents duplicate attendance even with concurrent scans. A 1.5-second cooldown and continuous-target gate suppress held passes until the target clears; neither is an attendance integrity control.
- The local database is authoritative; there is no server sync. Use one teacher device per class. Multiple tabs cannot create duplicate attendance records or competing active sessions, but interfaces refresh on focus rather than providing collaborative live synchronization.
- Website updates are prompted and blocked by the update action while an active local session exists. First installation may activate normally. Keep the hosting origin stable; changing it does not transfer local browser records.
- Camera requires HTTPS/localhost and permission. Rear camera preference, camera selection after permission, and torch are capability-based. Wake lock and vibration are optional. Wake lock does not force brightness.
- Default timezone is the teacher device's browser timezone, explicitly displayed during session creation. Export timestamps use UTC. The device clock is not externally trusted. Correct queued students manually when cutoff fairness requires it.
- QR freshness accepts 90 seconds past / 30 seconds future, allowing boundary/clock tolerance. These windows do not prevent replay. The unique attendance record is the real duplicate control.
- CSV accepts UTF-8/BOM and Windows-1252 fallback or explicit selection. Arbitrary encoding detection is not claimed. Import rejects normalization collisions within a section. Confirm the ID normalization policy with the institution before importing real rosters.
- Excel reports include institution/subject/room metadata, status shares, a complete audit worksheet, widths, merged title, filters and percentage formats. CSV includes formula guards. SheetJS Community Edition does not supply arbitrary styled badge/cell rendering here.
- Backup restore is limited to 25 MB and 100,000 rows per table. Larger archives require an evaluated streaming approach.

## Validation and remaining release work

Automated tests cover crypto authentication/tampering, ID and QR validation, encoding, exact debounce/timing boundaries, concurrent duplicate writes, audit-write failures, closure, historical roster snapshots, wrong PINs, and backup recovery.

Phase 3 adds read-only closure, reasoned reopening, dispute review, original timestamps, coherent report snapshots, and a native manual dialog. Phase 4 adds CI, an opt-in Pages deployment workflow, field observation tooling, user guides, and defense artifacts. See [implementation record](docs/phase-3-4.md), [teacher guide](docs/teacher-guide.md), [deployment](docs/deployment.md), and [field protocol](docs/field-protocol.md).

The field template deliberately contains no measurements. Analyze a completed run with `pnpm field:analyze measured.csv summary.json`. Synthetic unit fixtures verify arithmetic and never establish classroom performance. Generated PDFs and editable decks are available under `docs/handouts/`; their source generators are in `scripts/` and require the bundled artifact runtime/ReportLab described by their command-line arguments.

Before using real student records, validate actual camera scanning on supported Android/iOS/desktop browsers, camera permission/denial, glare and damaged displays, cold offline startup, low-storage conditions, interruption/power-loss behavior, screen readers/zoom, backup restoration on another physical device, browser download behavior, and institutional privacy procedures. The code is an implemented baseline, not a certification that these device and operational checks have passed.

## Primary references

- [Vite PWA update behavior](https://vite-pwa-org.netlify.app/guide/auto-update)
- [html5-qrcode usage](https://scanapp.org/html5-qrcode-docs/docs/intro)
- [Official SheetJS distribution](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/)
- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [NPC implementing rules](https://privacy.gov.ph/implementing-rules%20regulations-data-privacy-act-2012/)
