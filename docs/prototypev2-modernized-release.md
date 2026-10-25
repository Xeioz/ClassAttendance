# prototypev2: lightweight UI and compatibility integration

Implemented on `prototypev2` from baseline `d73e3c5`, selectively using `modernize` at `cb6fd54`. This is not a branch merge. The approved direction is in [the integration plan](modernize-integration-and-ui-plan.md) and [the visual study](ui-direction-preview.html).

## Product changes

- Separate role landing, direct student links, compact teacher PIN gate, forest/paper design tokens, system fonts, and 48 px controls. Desktop class navigation sits beside the workspace; narrow layouts show one task with Back to classes. No UI framework, font service, animation library or chart dependency was added.
- Import remains the first task. CSV/Excel column mapping leads to class review with missing fields left blank, linked errors, inline guidance, shared fill-blanks actions and 25-row student previews. Desktop review includes an imported-class navigator.
- Existing-name changes require explicit before/after approval. An approval is bound to both spellings; changing the proposed name invalidates it. A changed class/student snapshot rejects a stale save and refreshes the review. Historical session snapshots remain untouched. Unchanged student ciphertext is retained; enrollment additions use bulk reads/writes.
- Class overview includes counts and browser-readiness checks. Classes retain independent course/section/term enrollment. Legacy templates are available under Backup & storage for reviewed copying into a class with an explicit term. They never imply enrollment.
- Attendance renders 50 matching rows per page; audit history renders 100. Older records remain reachable. Class roster and session history are also paginated. Filtering and pagination never narrow exported data.
- Duplicate disputes freeze the reviewed identity and presentation times. Opening/cancelling review invalidates stale scan feedback. Scanning pauses for review/manual work. Processing feedback hides the previous saved result until the new commit completes.
- Optional camera enumeration cannot hold cleanup open. Torch changes are serialized and tied to the current camera handle. Unlock generation checks prevent late key derivation from resurrecting a locked workspace. Expiry is checked after browser suspension and before accepting the first new action.
- ExcelJS produces persisted formatting, filters, frozen panes, wrapped text, heights and percentage formats. SheetJS remains the lazy import parser. English resources and fallback helpers ship locally; status codes and export fields remain canonical. Existing class/import screens still contain English literals; this is not complete translation coverage.

## Existing records and recovery

Both branches used `attendance-desk-v1`, schema 2, for different store sets. Dexie's automatic same-version repair could remove the other branch's tables. The new native preflight recognizes store names, keys, indexes and supported native versions **before Dexie opens**. A native version-30 upgrade only adds missing stores; Dexie then opens schema 3 with the exact superset. Unknown shapes fail without repairing or deleting them. Blocked upgrades ask the user to close other tabs.

The superset retains `students`, `sessions`, `attendance`, `scanEvents`, `meta`, `classes`, `enrollments`, `classTemplates` and non-private migration metadata. Existing cipher versions, AES-GCM authenticated contexts, HMAC identities, PBKDF2 settings and PINs remain unchanged. Migration does not decrypt or rewrite historical records.

New backups use envelope version 3, schema `class-attendance:unified-v3`, and authenticated context `backup:v3`. Recovery accepts legacy v1 and the two recognized v2 shapes (classes/enrollments or classTemplates). Ambiguous v2 shapes are refused. Recovery validates decrypted identities, references, statuses, times, audit/dispute structures, defaults and absence provenance before one atomic replacement transaction. Export uses the same validation. A failed restore rolls back the original records and vault metadata.

Older application versions cannot open schema 3 or restore v3 archives. Retain a pre-upgrade encrypted backup for rollback to an older branch. Do not switch branches against an open working database. A different port/origin has a separate record store.

## Offline behavior and size

Teacher code is loaded lazily; opening a student pass does not need to open IndexedDB. Persistence helpers are separate from Dexie. The existing worker still precaches **all required lazy chunks**, including the decoder, Excel parser and report engine. Readiness asks the controlling worker to verify its own revision-specific manifest. A controller change invalidates readiness. Updates remain deferred during active attendance and serialized teacher mutations.

The browser's persistent-storage grant is advisory and can be denied. A saved link alone does not prepare resources. There are no required third-party runtime requests. The production CSP permits local scripts/workers/media and the inline styles required by the scanner, without allowing inline scripts or evaluation.

Measured production build (Windows, Node 24.22.1; exact current values reproducible with `pnpm check:budgets`):

| Resource | Measured | Budget |
| --- | ---: | ---: |
| Required initial student JS graph, including worker registration | about 84.7 KiB gzip | 100 KiB |
| Additional teacher JS graph, excluding optional decoder/spreadsheets | about 78.4 KiB gzip | 180 KiB |
| CSS | about 4.1 KiB gzip | 10 KiB |
| Required offline files, decoded | about 2.21 MiB | 2.5 MiB |

The richer report engine increases the initial offline preparation download compared with the previous build; lazy evaluation keeps it out of student startup. The budget script follows static imports, checks required dynamic worker registration, and verifies every required lazy asset appears in the worker. Vite still reports a large optional ExcelJS chunk; its size is included in the offline budget.

## Verification completed on 2026-10-25

- **139 tests across 21 files pass**, plus strict TypeScript checking and production builds at `/` and `/ClassAttendance/`.
- Storage tests cover v1, both v2 store layouts, Dexie-adjusted native version 21, idempotent reopening and unknown-store refusal. Recovery tests cover both v2 backup layouts, v1/v3 recovery, wrong PINs, malformed/authentication failures, orphan references, ambiguous formats and rollback after a simulated quota/write failure.
- Import tests cover real CSV/XLS/XLSX bytes, BOM/accents/leading zeros, missing fields, collisions, class separation, reviewed names, stale previews and atomic retry. Historical attendance and absence-origin regressions pass.
- Lifecycle tests cover late unlock/pagehide, delayed storage permission, suspension-aware expiry, camera enumeration rejection/stall, late startup/stop and torch races. Dispute tests include stale original times and discarded pre-review results.
- Keyboard/manual validation, focus return, student field errors, PIN confirmation focus, textual scan feedback and axe semantic checks pass. jsdom axe checks exclude color contrast; they do not certify rendered accessibility or screen-reader behavior.
- Synthetic XLSX/CSV reports with **0, 1, 45 and 10,000 students/audit events** were reopened with SheetJS, ExcelJS and **openpyxl 3.1.5**. Values/membership, ID text types, formula safety, filters, freeze panes, wrapping, heights and percentage formats reconcile. Desktop Excel print/render layout was not visually tested.
- In the in-app browser, an isolated origin restored an old prototypev2 archive with 20 students, enrollment and a closed session. PIN unlock, retained history, Excel download, missing-field correction and matching-class import succeeded. The production CSP produced no console errors in the tested paths.
- With that origin's server stopped and independently confirmed unreachable, a **new tab** reopened the student destination, loaded the teacher lazy module, unlocked preserved records and parsed a real multi-sheet Excel file. A separate `/ClassAttendance/` build verified its current worker resources and reloaded the saved student destination after its server stopped.
- Layout checks at 320/375/768/1280 CSS px found no horizontal page overflow in the tested student/import views. Student buttons measured 48 px high at 320 px. The linked import error focused the correct field. Only one QR canvas was present. Test tabs and viewport overrides were cleaned up; the user's original record origin was not used for fixture writes.

### Performance scope and remaining device checks

One synthetic Node run on an Intel i5-6500 / Windows / Node 24.22.1 used real WebCrypto and **in-memory fake-indexeddb**. Imports of 100/1,000/10,000 enrollments took roughly 53 ms / 477 ms / 29.8 s. Five committed scan calls took about 3–15 ms / 21–24 ms / 196–264 ms respectively. The 10,000-member class is a stress case and remains expensive; these timings are not browser, camera, physical disk or classroom-throughput measurements. At 10,000 report rows, Excel serialization took about 3.0 s and CSV serialization 1.3 s in a separate run. Heap samples are recorded by the benchmark, not claimed as peak memory.

Physical Android/iPhone cameras, torch availability, browser/device restart recovery, real low-memory eviction, camera throughput, OS text scaling/200% zoom, screen readers, two real devices with different clocks, and actual deployment headers still need field verification. Stopping a local server proves cached-origin operation; it is not an airplane-mode or device-restart test. Hosting was not deployed or changed by this implementation.

## Reproduce

```sh
pnpm test
pnpm build
pnpm check:budgets
pnpm qa:exports
python scripts/verify-qa-exports.py
node scripts/benchmark-offline-data.mjs
pnpm qa:browser-fixture
```

The Python verifier needs openpyxl. Generated reports, fixtures and timing JSON go to ignored `artifacts/`; module bundles go to ignored `.artifact-build/`. The fixture generator uses fake IndexedDB and never accesses a browser database. Its published synthetic PIN is for isolated QA only. Use a separate origin for browser recovery tests. Do not import test fixtures into a working teacher browser.
