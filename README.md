# Attendance Desk

A browser-based QR attendance website built with React 19, TypeScript, Vite, Tailwind, Dexie, WebCrypto, PapaParse, qrcode, html5-qrcode, ExcelJS, and Workbox. No native application or installation is required.

## Run

Requires Node 22.18+ or Node 24 and pnpm. The first dependency installation requires internet access.

```sh
pnpm install
pnpm dev
```

For the offline-capable production build:

```sh
pnpm test
pnpm qa:exports
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

1. Open Teacher workspace and create a Master PIN. Use a long random PIN and record it securely. No reset can decrypt forgotten-PIN records.
2. Import a CSV with `id,name,section` headers. Review additions, updates, unchanged rows, invalid rows, and identity conflicts. Approve each changed identity, then explicitly save. Invalid or conflicting rows block the whole file; omitted students remain enrolled.
3. Save reusable class templates or enter class settings directly. Review the pre-class checklist and current roster, choose a fresh 3–6 digit room challenge, and explicitly create the session. Start input uses the device timezone; the class/report timezone is a separate setting.
4. Students open Student pass, enter their ID and challenge, and display a QR. Optional ID memory is confined to their browser.
5. Verify student identity, start the teacher camera, and scan. Choose compatibility decoder if native decoding fails. Manual check-in remains available.
6. Review saved records and disputes. Use F2 for manual attendance or reasoned corrections. Resolve disputes before closure. Closed sessions are read-only; reopen with a reason before changes.
7. Download an Excel/CSV report and an encrypted backup. Excel includes a separate audit worksheet. Check the browser actually saved each file. Keep the backup outside the recording device.
8. To restore, lock teacher records, choose the backup and its PIN, acknowledge replacement, and restore. Existing data is replaced only after validation, inside a database transaction.

## Implementation map

| Requested module               | Implementation                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| A: database and encryption     | `src/db/db.ts`, `crypto.ts`, `vault.ts`, `backup.ts`                                          |
| B: student ID and dynamic QR   | `src/components/student/StudentPass.tsx`, `DynamicQR.tsx`, `src/hooks/wakeLock.ts`            |
| C: roster and camera           | `src/components/teacher/RosterUpload.tsx`, `ScannerView.tsx`, `src/utils/csv.ts`, `camera.ts` |
| C: accessible HUD and feedback | `src/components/common/AccessibleHUD.tsx`, `src/utils/feedback.ts`                            |
| D: sessions and transactions   | `src/domain/attendance.ts`, `checkIn.ts`, `sessionLifecycle.ts`, `qr.ts`                      |
| D: reports                     | `src/domain/reports.ts`, `src/utils/excel.ts`, `csvExport.ts`                                 |
| Disputes and audit             | `src/domain/audit.ts`, `src/components/teacher/DisputePanel.tsx`, `AuditTrail.tsx`            |
| Teacher orchestration          | `src/components/teacher/TeacherPortal.tsx`, `TeacherWorkspace.tsx`, `ManualEntryDialog.tsx`   |
| Offline caching                | `vite.config.ts`, `src/components/common/OfflineStatus.tsx`                                   |
| Class templates and review     | `src/domain/templates.ts`, `classSettings.ts`, `src/components/teacher/SessionForm.tsx`       |
| Roster comparison and guards   | `src/domain/rosterImport.ts`, `rosterSnapshot.ts`, `src/utils/rosterValidation.ts`            |
| Readiness and translation      | `src/components/teacher/PreClassReadiness.tsx`, `src/domain/readiness.ts`, `src/i18n/`        |

Files use `.ts`/`.tsx` instead of `.js`/`.jsx` to enforce strict TypeScript. `ExportModal` is an inline export control rather than a focus-trapping dialog; session rules are in the domain layer, not inside the export component.

## Security contract

- Implements the specifically requested PBKDF2-HMAC-SHA256, 100,000 iterations, with a random 128-bit salt. Derives separate non-extractable AES-GCM-256 and HMAC-SHA256 keys. PINs accept 6–12 digits.
- Every encryption gets a fresh 96-bit IV. Additional authenticated data binds ciphertext to its record identity. Names, IDs, section membership, session details, attendance values, notes, events, and the backup payload are encrypted.
- Plaintext metadata consists of record IDs, vault KDF parameters, active/closed session state, and opaque HMAC indexes; record counts, relationships, and same-identity equality remain observable. This is not traffic-analysis-proof storage.
- Six-digit PINs remain vulnerable to offline guessing. These requested settings are a compatibility baseline, not a claim of strong resistance against a stolen database. A passphrase/key-wrapping design is a future hardening change requiring migration.
- Keys remain in memory only. Teacher views lock after 15 minutes without pointer/keyboard interaction or when leaving the page. Camera capture alone does not extend that interval. JavaScript cannot promise forensic memory wiping.
- No student device pairing, signatures, institutional authentication, or automated presence verification is claimed. Shared challenges and rotating QR codes can be forged or relayed. Teacher identity verification is required.
- Local events support application traceability; a person controlling the browser/device can tamper with the application or replace local data. Audit records are not independently tamper-proof.
- At-rest encryption does not prevent malicious same-origin scripts from reading unlocked records. Do not add unreviewed third-party scripts, analytics, or unsafe HTML rendering.
- Encryption does not independently establish RA 10173 compliance. The institution must define processing responsibility, lawful basis, notices, retention, deletion, access, incident response, and personal-device policy before deployment.
- Excel downloads contain plaintext personal data. Follow approved institutional handling rules. Encrypted backup files still require protected storage.

## Offline and browser contract

- All built JS/CSS and lazy decoder/export chunks are precached; no classroom runtime CDN requests are needed. ExcelJS creates formatted reports locally. The pinned SheetJS package independently checks generated files during QA; it is not loaded from a classroom runtime CDN.
- Click Check offline readiness, then perform an actual cold offline launch. A readiness result checks cached resource existence, not a permanent guarantee against browser deletion or corruption.
- `navigator.storage.persist()` can be unavailable or denied. Browser storage is finite; clearing website data or losing the device can lose records. Keep backups.
- Writes and audit attempts commit transactionally before success feedback. A compound database primary key prevents duplicate attendance even with concurrent scans. A 1.5-second cooldown and continuous-target gate suppress held passes until the target clears; neither is an attendance integrity control.
- The local database is authoritative; there is no server sync. Use one teacher device per class. Multiple tabs cannot create duplicate attendance records or competing active sessions, but interfaces refresh on focus rather than providing collaborative live synchronization.
- Website updates are prompted and blocked by the update action while an active local session exists. First installation may activate normally. Keep the hosting origin stable; changing it does not transfer local browser records.
- Camera requires HTTPS/localhost and permission. Rear camera preference, camera selection after permission, and torch are capability-based. Wake lock and vibration are optional. Wake lock does not force brightness.
- Default timezone is the teacher device's browser timezone, explicitly displayed during session creation. Export timestamps use UTC. The device clock is not externally trusted. Correct queued students manually when cutoff fairness requires it.
- QR freshness accepts 90 seconds past / 30 seconds future, allowing boundary/clock tolerance. These windows do not prevent replay. The unique attendance record is the real duplicate control.
- CSV accepts UTF-8/BOM and Windows-1252 fallback or explicit selection. Arbitrary encoding detection is not claimed. Import rejects normalization collisions within a section. Confirm the ID normalization policy with the institution before importing real rosters.
- Excel schema 2 reports have separate Summary, Attendance, Audit trail and Report info sheets, explicit display/canonical ID columns, frozen table headers, wrapped text, row heights, filters and percentage formats. CSV retains its 16-column layout and formula guards. See [export schema and compatibility](docs/export-schema.md) before updating downstream imports.
- Backup restore is limited to 25 MB and 100,000 rows per table. Larger archives require an evaluated streaming approach.

## Validation and remaining release work

Automated tests cover crypto authentication/tampering, ID and QR validation, encoding, exact debounce/timing boundaries, concurrent duplicate writes, audit-write failures, closure, historical roster snapshots, wrong PINs, and backup recovery.

The next release adds encrypted reusable templates, complete roster-change reviews with stale-write protection, a pre-class checklist, and accessibility/localization foundations with bundled English fallback. See the [implementation and verification report](docs/next-release-status.md), [storage and backup compatibility](docs/next-release-storage.md), and [proposed roadmap](docs/next-release-roadmap.md). Additional institutional languages still need selection and reviewed translations.

Earlier QA remediation includes stable dispute drafts, complete pre-restore payload validation with legacy support, immediate restore UI refresh, displayed-ID search, and serialized workbook-format checks. The [previous QA record](docs/qa-status.md) preserves that evidence. `pnpm qa:exports` generates and reconciles 0/1/45/10,000-row synthetic files; CI also reopens them independently with openpyxl.

Phase 3 adds read-only closure, reasoned reopening, dispute review, original timestamps, coherent report snapshots, and a native manual dialog. Phase 4 adds CI, an opt-in Pages deployment workflow, field observation tooling, user guides, and defense artifacts. See [implementation record](docs/phase-3-4.md), [teacher guide](docs/teacher-guide.md), [deployment](docs/deployment.md), and [field protocol](docs/field-protocol.md).

The field template deliberately contains no measurements. Analyze a completed run with `pnpm field:analyze measured.csv summary.json`. Synthetic unit fixtures verify arithmetic and never establish classroom performance. Generated PDFs and editable decks are available under `docs/handouts/`; their source generators are in `scripts/` and require the bundled artifact runtime/ReportLab described by their command-line arguments.

Before using real student records, validate actual camera scanning on supported Android/iOS/desktop browsers, camera permission/denial, glare and damaged displays, cold offline startup, low-storage conditions, interruption/power-loss behavior, screen readers/zoom, backup restoration on another physical device, browser download behavior, and institutional privacy procedures. The code is an implemented baseline, not a certification that these device and operational checks have passed.

## Primary references

- [Vite PWA update behavior](https://vite-pwa-org.netlify.app/guide/auto-update)
- [html5-qrcode usage](https://scanapp.org/html5-qrcode-docs/docs/intro)
- [Official SheetJS distribution](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/)
- [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [NPC implementing rules](https://privacy.gov.ph/implementing-rules%20regulations-data-privacy-act-2012/)
