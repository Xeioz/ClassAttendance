# prototypev2 promotion to main

Prepared on 2026-10-26 from main `e93c6ff` and prototypev2 `f8e8fc3`.

## Conflict resolution

The class-based, import-first workflow and additive schema-3 migration from prototypev2 are the active application architecture. Main's template records, sample files, export evidence and regression coverage are retained. The merge also preserves:

- Reviewed section-roster imports, before/after approvals, encoding reparsing, complete preview pagination, atomic retries and stale-preview rejection. Class-specific imports validate the section and add enrollment only to that class.
- Current student ciphertext for unchanged identities and historical session snapshots for changed identities. Direct unreviewed imports still refuse conflicting names.
- Runtime validation that rejects invalid start times, mismatched display IDs and caller-supplied closure metadata. Session creation compares the reviewed roster and rechecks encrypted identities and class membership before committing.
- Backup field errors, PIN focus after restoration, and advisory download/restore observations. No download request is presented as proof that the file was saved outside the browser.
- Detailed camera/storage/session readiness under the session form. The class overview keeps its compact checklist. Camera tests are explicit and stop all tracks, including late results after unmount. Both checklists use the current controlling worker's own resource-verification protocol.
- Main's scoped ExcelJS UUID override, byte-preserved CSV samples, independent Python export verification and CI artifact retention. Prototypev2's lazy loading, offline worker, bundle budgets, responsive UI and protected mutation coordination remain active.

Old template-tab UI tests were adapted to the approved copy-template-to-class workflow; template CRUD, concurrency, encryption and recovery are still exercised by the data tests. Legacy cache-checklist tests now assert the controlling-worker verifier, since arbitrary cross-build cache matches are no longer accepted.

## Verification

- 220 tests pass across 30 files, including the combined storage, import, template, recovery, lifecycle, readiness and interface regressions.
- Strict TypeScript checking passes.
- Root and `/ClassAttendance/` production builds pass. Required lazy chunks remain precached.
- Student initial JS is about 85.1 KiB gzip, additional teacher JS about 83.1 KiB, CSS about 4.3 KiB, and required decoded offline assets about 2.23 MiB. All existing budgets pass.
- Synthetic Excel/CSV exports with 0, 1, 45 and 10,000 records pass reconciliation and independent openpyxl 3.1.5 checks.

Physical phone camera/torch behavior and browser/device restart checks remain field work, as documented in the [prototypev2 validation report](prototypev2-modernized-release.md). Localhost and GitHub Pages have separate browser storage: moving between them does not transfer records automatically. Use an encrypted backup and its original PIN when moving the teacher workspace to the published origin.

## Publishing

The repository uses the existing manual **Publish attendance website** workflow. GitHub Pages must use **GitHub Actions**, `main` must be the default branch, and the `github-pages` environment must allow the `main` branch. The workflow builds with GitHub's configured repository base path before uploading `dist`. Publishing remains manual so future source pushes do not silently redeploy the website.
