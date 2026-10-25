# 08 — Testing and validation

Baseline: 168 tests in 19 files passed before changes. Current final results are recorded below after verification completes; intermediate failures were corrected before final claims.

## Reproducible commands

Standard project commands remain `pnpm test`, `pnpm qa:exports`, `pnpm build`. This environment lacks pnpm and restricts parent-directory enumeration by esbuild's default config bundler. Equivalent installed-tool commands are:

```sh
node node_modules/vitest/vitest.mjs run --configLoader runner
node scripts/generate-qa-exports.mjs
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build --configLoader runner
node node_modules/vite/bin/vite.js build --configLoader runner --base=/ClassAttendance/ --outDir=artifacts/modernization/dist-subpath
```

Browser verification uses `scripts/verify-next-release-browser.mjs` with `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `QA_OUTPUT`, and optional `QA_BASE_PATH` / `QA_DIST` / `QA_PORT`. Playwright is reused from an existing local installation; no runtime dependency is added. The harness serves axe from the same origin to comply with the actual CSP; it does not turn off the policy.

## Evidence boundaries

- Crypto/database tests use synthetic records and fake IndexedDB; production browser flows exercise real browser IndexedDB/WebCrypto.
- Export QA compares all synthetic values/types/formatting at 0, 1, 45 and 10,000 rows with SheetJS and ExcelJS.
- The independent Python verifier initially could not start because `openpyxl` is not installed; its final status is recorded below.
- Automated browser tests are not physical optical scanning, OS power-loss trials, or second-physical-device recovery.
- A successful offline reload is not proof of cold browser/device restart behavior.
- Axe's manual-dialog color-contrast incomplete result requires manual review, even when no violations are reported.

## Final execution results

Executed October 24, 2026 on Windows / Node 24.13.1:

| Check | Result | Evidence |
| --- | --- | --- |
| Full Vitest suite | **190 / 190 pass**, 24 files | `artifacts/modernization/tests.json` |
| Strict TypeScript build | Pass | `tsc -b` completed with exit 0 |
| Synthetic export QA | Pass for 0, 1, 45, 10,000 rows | `artifacts/qa-exports/validation.json` |
| Root production build | Pass; 12 precached entries | `dist/`; approximately 1,745 KiB uncompressed precache |
| Repository-subpath build | Pass | `artifacts/modernization/dist-subpath/` |
| Root production browser | Pass; 11 workflow checks | `artifacts/modernization/browser-root/browser-results.json` |
| Subpath production browser | Pass; same 11 checks | `artifacts/modernization/browser-subpath/browser-results.json` |
| Accessibility | No axe violations on four screens per path | Manual-dialog color-contrast result incomplete; manual review remains |
| Viewports/text | 375px student/teacher, 768px tablet, 1280px desktop, 200% teacher text: no document overflow | Screenshots in browser evidence directories |
| Python independent verifier | **Blocked** | Missing openpyxl; installation of pinned 3.1.5 returned no available distribution |
| Registry dependency upgrade/audit | **Blocked** | npm registry EACCES; pnpm unavailable |
| Physical devices / live deployment | **Not performed** | External release gates |

Browser checks exercise production WebCrypto/IndexedDB, mobile QR generation, actual bundled compatibility decoding against a synthetic canvas video stream, committed attendance, stream release, camera-denied/manual fallback, template editing, full roster review, two-tab staleness, offline reload of lazy teacher code and guide, Excel/CSV downloads, encrypted recovery in a fresh browser context, role-switch relocking, and failed teacher-module retry. The CSP remains enabled: inline script injection is rejected, while same-origin assets, service worker, decoder and exports continue working.

The final suite adds 22 tests over the 168-test baseline. During the final run an existing roster callback assertion exposed a timing race: DOM availability did not guarantee completion of its passive notification effect. The assertion now waits for the exact same expected state. The final rerun passes all 190 tests; security/domain checks were not weakened.

The build retains a warning for the approximately 940 KB minified lazy ExcelJS chunk. It is precached and compressed for transfer; this is a recorded limitation, not a failed build. Performance evidence establishes bounded DOM rows and deferred teacher module loading, not a measured classroom throughput claim.

Compact, shareable results are retained in [validation-summary.json](evidence/validation-summary.json). Generated XLSX/CSV, screenshots, synthetic encrypted backups, test JSON and build outputs remain in ignored `artifacts/` / `dist/` directories. These are synthetic and contain no production records.
