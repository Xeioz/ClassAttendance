# Modernize integration and lightweight UI plan

**Prepared:** 25 October 2026  
**Status:** Proposed implementation plan and visual direction; application changes are not implemented by this document  
**Product base:** prototypev2, `d73e3c58b138b180ffb3c3143f402d0515274634`  
**Hardening source:** modernize, `cb6fd54100cf5881f09c8d8081993f17f1d19f45`  
**Visual companion:** [Static UI direction preview](ui-direction-preview.html)

## 1. Decision and scope

Refine the whole interface while retaining the agreed workflow. A clearer layout does not inherently require larger JavaScript downloads. Use the existing React, TypeScript and bundled Tailwind stack, semantic HTML, system fonts and a small set of local SVG icons. Measure the result rather than claiming that a visual redesign is automatically lightweight.

Keep prototypev2's role landing, direct student destination, import-first CSV/Excel editor, independent class enrollment, class/session routes, safe pending-operation handling and controlling-worker cache verification. Adapt modernize's security, lifecycle, reporting, readiness and accessibility improvements around those contracts.

This plan covers browser-based delivery only. It does not add native applications, online accounts, server synchronization, receipts, reminders, archiving, deletion or a new cryptographic design. Existing numeric-PIN and QR trust limitations remain documented.

Do not merge the entire modernize branch or replace application files wholesale. Its template/section model and storage format differ from our class/enrollment model.

## 2. UI references and what to borrow

The following official references were checked on 25 October 2026. They guide our own design; adopting their libraries or copying their branding is not required.

| Reference | Use in this system | Boundary |
| --- | --- | --- |
| [shadcn/ui dashboard example](https://ui.shadcn.com/examples/dashboard) | Main visual reference: compact sidebar, neutral surfaces, clear page headings and structured lists | Use our existing forest accent. Omit revenue charts, sales metrics, avatar decoration and unrelated dashboard features. No shadcn/Radix/chart dependency is proposed. |
| [GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers/) | Review class/student details before the final save, with clear routes back to corrections | Adapt the review behavior to enrollment; retain editable missing fields and atomic saving. |
| [GOV.UK error summary](https://design-system.service.gov.uk/components/error-summary/) | A concise issue summary linked to the affected field, plus an inline error at that field | Test focus after changing class/page. Announce useful summaries without repeatedly reading every issue during typing. |
| [USWDS step indicator](https://designsystem.digital.gov/components/step-indicator/) | Progress through the linear import process, with a separate heading and Back/Continue controls | On narrow screens use compact step text. Do not use the indicator as navigation for unrelated teacher tasks. |

The recommended direction is a restrained administrative workspace. The static preview is our own low-fidelity interpretation with synthetic data, not a screenshot of those products or a working implementation.

## 3. Problems the UI work must resolve

- The current import review contains several large panels and long explanatory blocks. Teachers need an immediate answer to which field needs attention and what to do next.
- Class navigation, global backup actions and active-session actions need distinct locations and consistent hierarchy.
- Student QR presentation should dominate its screen; offline preparation and help must remain available without crowding the pass.
- Readiness, network connectivity, committed attendance and backup evidence currently risk looking like one generic status. They describe different facts.
- The attendance table currently renders all matching students. Audit browsing still caps the visible list at 100 events. Use bounded rendering and let teachers reach all records.
- The teacher lifecycle still needs modernize's late-unlock, suspended-inactivity and camera-resource fixes. Visual polish must not mask those defects.
- The modernize skip link changes the hash to `#main`, while its role handler interprets that as student navigation. Preserve prototypev2's focus-based skip behavior.

## 4. Product invariants

1. Root entry presents Student and Teacher. Explicit student links bypass that choice, including prepared offline reopening.
2. Student ID and current room challenge remain the only required pass inputs. No attendance-success claim is shown without teacher-side confirmation.
3. The teacher creates or unlocks a local PIN-protected workspace. Navigation does not substitute for authentication.
4. Import is the first task in an empty teacher workspace. CSV/Excel values populate the preview; missing required values stay blank.
5. Course, section, term, student ID and name must be resolved before import saving. Optional metadata may remain blank. Shared values fill only explicitly selected blanks.
6. Classes use course + section + term with independent enrollment. A settings template alone does not establish membership.
7. Only one attendance session is active per local workspace. Historical roster snapshots, original IDs, timestamps and audits are preserved.
8. Success feedback follows transaction commit. In-app role changes/locking resolve pending operations; forced browser termination remains outside that guarantee.
9. No deployment, schema upgrade or destructive cleanup is part of approving this plan alone.

## 5. Full UI specification

### Visual system

- Retain forest `#123b32`, ink `#172c27`, and paper `#f5f6f2` initially. Use white task surfaces and restrained borders; verify every foreground/background pairing.
- Use the installed system sans-serif stack. Do not download web fonts. Establish page, task, field and supporting-text levels with reusable tokens.
- Use a consistent 4/8/12/16/24/32 CSS-pixel spacing scale, approximately 10–12 px control radii and 16 px panel radii. Reduce nested cards and repeated uppercase headings.
- One dominant action per task state. Secondary actions use outlined buttons or ordinary links. Destructive or session-closing actions stay in explicit review flows.
- Status combines words and symbols: Saved, Needs attention, Already recorded, Not saved, Active and Closed. Color is supplementary.
- Controls target at least 48 × 48 CSS pixels; visible focus, associated labels, inline errors and appropriate announcements are required.

### Landing and student screens

The landing has a short heading and two large role choices. Keep browser/storage explanations out of the primary choice area. Existing direct links remain stable.

The student form is a centered single column, approximately 440 px maximum width, with ID, room challenge and one Display pass action. Optional ID memory, preparation and help are secondary. On the pass screen preserve a large black/white canvas, quiet zone, full ID and current challenge. Avoid overlays or sticky actions covering the QR. Keep editing and Change role accessible.

Offline preparation remains available before a pass. Separate resource verification from persistence permission. Guidance for a direct bookmark must not promise that every home-screen icon preserves the destination.

### Teacher entry and shared shell

Use a compact PIN card with explicit Checking, Create, Unlock and Storage error states. Recovery remains available before creating a workspace. Port field-linked errors, stale-unlock invalidation and expiry checks from modernize.

On sufficiently wide viewports, use a roughly 240–280 px class navigation column and a flexible workspace. Keep brand/help/lock in a compact header. Show Import master list prominently and Add class manually as secondary. On narrow screens use full-width class/task views with an accessible Back to classes action. A navigation drawer is optional only if it improves measured usability; if added, it needs focus and Escape handling.

Resize the same task tree. Never mount separate desktop and phone scanners. Preserve form drafts, selected class/session, QR timers and camera ownership through reflow.

### Import wizard

Keep four understandable stages: **Upload → Match columns → Complete & review → Saved**. Saved is a confirmation state. Show Step N of 4 on narrow screens; use a small labeled progress row only where it fits.

- Upload: one drop/file control, supported formats/limits, and two template choices. No pre-required class form.
- Mapping: suggested source columns, unmapped missing fields, worksheet choice and a small source preview. Warn clearly before rebuilding an already edited preview.
- Complete/review: compact class list with issue counts; selected class editor; a paginated student editor; links into missing fields; a collapsible shared-blanks tool. Required blanks have inline messages, not only colored borders.
- Final action: concise counts for new/matched classes, added/unchanged/updated enrollment and unresolved issues. An import cannot become a partial save because the teacher filtered or paged the preview.
- Failed saves retain corrections in the unlocked view. Preserve the current memory-only draft policy for this increment; do not add plaintext draft persistence. Explain loss on lock/reload/leaving.

Port modernize's reviewed name-change workflow: show before/after identity values, explain shared impact, require individual approval and reject stale previews. The master-list path must retain multi-class, Excel and missing-field correction behavior.

### Class overview and setup

Show course, section, term, enrollment count, latest session and one Start/Resume attendance action. Use Roster, Sessions and Defaults as secondary destinations. An empty roster has an import action rather than empty metrics. Readiness distinguishes required blockers from advice and links directly to a correction.

Session setup pre-fills selected-class defaults. Keep start time, report timezone, grace and challenge visible enough for review; group optional report metadata. Generating a challenge or setting the current time changes the draft only. Defaults never rewrite an active or historical session.

### Scanning

The camera and latest saved result dominate. Show active class context and challenge, then compact Present, Late and Not yet recorded counts. Put Manual attendance and Review attendance within easy reach. Use the existing sound opt-in and optional torch. Do not add charts or animated decoration.

Review/manual/dispute states pause the scanner before editing. Freeze the dispute target and presentation timestamps. Discard stale UI results without falsely implying that an already committed write was cancelled. Port modernize's enumeration/torch/late-stream cleanup fixes while retaining operation guards.

### Review, results and recovery

Use a searchable/filterable attendance table with 50 rows per page, full identifiers and clear status text. Keep overflow inside the table container on small screens. Secondary details can expand within a row; do not duplicate a desktop table and mobile list in the DOM. Audit history pages at 100 events, with every event reachable. Pagination must not filter exports or change stored rosters.

Close only from Review, showing remaining students and blocking disputes. Closed results show counts, a defined attendance rate, Excel/CSV and backup actions, plus reason-required reopening. Keep our explicit teacher/closure absence provenance and unique session filenames.

Backup & storage separates local saves, archive download requested, observed download and successful recovery evidence. A click is not proof of an externally stored backup. Migration review and reusable template recovery belong here, not in the daily scan view.

## 6. Integration architecture and storage gate

### Confirmed blocker

Both branches name the database `attendance-desk-v1` and declare Dexie schema version 2. Prototypev2 adds classes/enrollments; modernize adds classTemplates. An isolated test with installed Dexie 4.0.11 and fake IndexedDB showed schema reconciliation removing the opposite branch's stores. Modernize's database/backup definitions are unchanged from the previously tested next-release definitions. No real browser records were used.

Both backup envelopes also label different payloads as version 2. Do not treat those labels as proof of compatibility.

### Proposed unified model

| Data | Treatment |
| --- | --- |
| students, sessions, attendance, scanEvents, vault meta | Preserve identities, keys, encryption contexts and historical semantics |
| classes + enrollments | Retain as authoritative course/section/term membership model |
| classTemplates | Preserve legacy template records; expose review/copy of defaults when useful, without a competing primary navigation model |
| new migration metadata | Record source schema shape, migration progress and completion without storing private labels in plaintext |

Before any new Dexie query can trigger automatic schema repair, inspect the existing native store shape through a controlled compatibility check. Handle fresh, v1, prototypev2-v2 and modernize-v2 databases explicitly. Do not infer source solely from a numeric version; previously repaired databases may have an adjusted native version. Unknown shapes must stop with recovery guidance, not automatic deletion.

Use an explicit version 3 schema that carries all recognized stores forward. Structural addition and unlocked content association are separate. Preserve templates without automatically inventing a term or course-specific enrollment. Missing associations stay reviewable. Upgrade actions must be idempotent and recover from interrupted writes, quota failure and stale/open tabs.

New encrypted backup format 3 needs an explicit schema identifier and covers all authoritative stores plus relevant migration state. Validate legacy v1, both recognized v2 variants and new v3 before atomic replacement. Reject unknown/ambiguous variants. Use a deliberate `backup:v3` authentication context for new archives; keep existing vault/record cryptography unchanged.

Port modernize's runtime validator and extend it for class links, enrollment, absence provenance and migration metadata. Do not copy its current replacement-table list unchanged. Validate snapshots before export as well as before restore. Demonstrate legacy recovery into an isolated workspace before releasing the upgrade.

## 7. What to port and what to adapt

| Work item from modernize | Integration approach |
| --- | --- |
| Late-unlock invalidation, monotonic/wall expiry | Port behind the existing teacher boundary; coordinate expiry with pending commits |
| Scanner lifecycle and torch serialization | Port with tests against our Scan/Review ownership and one-camera rule |
| Teacher lazy loading and load/retry boundary | Adapt to our `#/teacher` routes and preserve direct destinations on recovery |
| Pagination, audit lookup, epoch-zero handling | Port into SessionWorkspace; verify full exports remain unchanged |
| CSP and no-referrer | Test in enforced production mode against custom service worker, CSV/Excel reading, decoder, reports and download flows |
| Readiness checklist | Use our class enrollment and worker-specific cache evidence; keep blockers separate from advice |
| Approved roster changes/stale review | Combine with our editable missing fields and atomic multi-class commit; preserve unchanged ciphertext where practical |
| ExcelJS schema/validation tooling | Adapt IDs, timestamp semantics and filename behavior; keep SheetJS for Excel input |
| Bundled English resources/focus fixes | Extend to all prototypev2 screens; English only until translations are separately reviewed |

Keep prototypev2's route-preserving skip control, role landing, student bookmark destination, operation coordinator, class identities and worker message protocol. Route compatibility can normalize modernize's `#student` and `#teacher` links into our routes without exposing decrypted data before unlock. Avoid conflicting fragment/anchor handlers.

## 8. Lightweight implementation and proposed budgets

These are proposed engineering targets, not achieved results or promises about an unspecified phone.

| Metric | Target/check |
| --- | --- |
| Student initial JavaScript | At most 100 KiB gzip across the required initial dependency graph, including registration helpers |
| Additional teacher-entry JavaScript | At most 180 KiB gzip before optional camera/Excel work; report exact graph and exclusions |
| CSS | At most 10 KiB gzip for required application styles |
| Full offline precache | At most 2.5 MiB decoded resources initially, including decoder and spreadsheet chunks; report compressed estimates separately |
| Attendance/audit/import DOM | 50 / 100 / 25 rows per visible page; no hidden second copy of the table or camera |
| Runtime resources | One active camera owner, one pass timer/wake-lock owner, optional media actions cleaned up on exit |
| Runtime network | No required CDN fonts, scripts, icon packages or images; prepared offline feature paths make no required external calls |

For context, the current local root artifact at planning time has an HTML-linked entry of 450,139 raw / 144,000 gzip bytes, CSS of 15,223 raw / 3,793 gzip bytes, and 1,305,838 bytes across emitted JS/CSS. This is file-size inspection of the existing build, not a full dependency-graph/network or physical-device benchmark. Modernize's report records approximately 1,745 KiB of uncompressed precache. Rebuild both pinned sources for a comparable baseline before implementation.

Use system fonts, local SVG and existing CSS utilities. Initial UI refinement adds no UI kit, charting, animation or table framework. Lazy-load teacher-only code, decoder and spreadsheet work; precache required lazy chunks so deferring evaluation does not break offline use. Optional ExcelJS adds cached bytes because SheetJS remains needed for input: measure that cost explicitly.

Separate student render readiness from teacher database access. Keep cache preparation available before QR generation. Apply CSP with the actual worker/decoder/import/export paths enabled. A UI style change does not itself change the offline contract, but routing, chunking, worker activation and database migration do.

Measure synthetic 100/1,000/10,000-row cases and document CPU/browser/hardware, cold/warm loading, import time, scan-to-committed-feedback time, memory and update download size. Record baseline and regression; do not claim physical classroom throughput from a synthetic camera. Budget overruns require explanation and a conscious tradeoff rather than silently raising thresholds.

## 9. Implementation sequence and acceptance gates

| Phase | Concrete deliverable | Must pass before proceeding |
| --- | --- | --- |
| 0. Freeze baselines | Pinned sources, source-specific encrypted fixtures, measured artifacts and existing test results | Existing data/backup contracts documented; no branch swapping against working records |
| 1. Visual specification | Reviewable screen designs, shared tokens, state inventory and this plan | Landing/student/import/class/scan/review/narrow layouts understandable without working controls |
| 2. Compatibility foundation | Source-shape detection, additive v3 schema, versioned backup adapters and recovery tooling | Both v2 variants and v1 preserve counts, identities, snapshots and associations; failed migration/restore leaves working records intact |
| 3. Lifecycle and security | Unlock/expiry/camera fixes, operation coordination, lazy teacher boundary, CSP | Pending saves cannot be misrepresented; stale unlock/results rejected; camera/torch cleanup and role relocking tests pass |
| 4. Shared UI and navigation | Reusable controls, status, layout, error, pagination and dialogs | No duplicate responsive resources; correct keyboard/focus/skip behavior; loading/error/empty/offline states present |
| 5. Screen migration | Role/student flow, import-first wizard, class tasks, scanner/review/results/recovery | Agreed product invariants and domain regressions hold; missing fields stay editable and atomic saving remains intact |
| 6. Readiness and reporting | Class-aware readiness, approved roster updates, ExcelJS export and localization coverage | All exported records/types/formatting reconciled; misleading backup/cache claims absent; required chunks cached |
| 7. Release verification | Root/subpath production browser tests, accessibility/performance/device matrix and recovery drill | New and existing suites pass; budgets reviewed; external release limitations explicitly recorded |

UI wireframe work may proceed independently of migration code. Enabling a combined build against existing browser data must wait for the compatibility gate. Do not combine structural migration and broad screen rewrites into a single unreviewable change.

## 10. Verification matrix

- Storage: fresh/v1/each v2 variant, adjusted native versions, missing associations, unknown stores, active legacy session, failed/blocked upgrade, interrupted association, wrong PIN, corrupted/malformed backups, both v2 shapes and new v3 round trips.
- Lifecycle: delayed unlock after pagehide/lock/unmount; timeout after suspension; operation in progress during expiry/navigation; camera enumeration rejection/stall; delayed start/stop; torch races; old result after dispute cancellation.
- Import: basic/full CSV, real XLSX/XLS, worksheet choice, BOM/diacritics/formatted leading zeros, every required field missing, duplicate normalization, same section across courses, approved identity changes, stale preview, failed atomic commit and retained corrections.
- Workflow: landing and old/new direct links, Back/reload/skip, no PIN bypass, class/session route mismatch, one active session, correct resumption, manual fallback, unresolved disputes, closure/reopen, explicit absence provenance and complete paginated review.
- Offline/update: prepared cold tab reopening and actual browser/device restart separately, student destination under both base paths, teacher lazy chunks, real Excel import/export offline, missing resources, controller change, old/new worker coexistence and update deferral.
- Accessibility: keyboard-only journeys, screen-reader outcomes, focus after class/page/error changes, measured contrast, 48 px targets, reduced motion, 200% text and 320/375/768/1280 CSS-pixel widths; physical-device claims need physical tests.
- Export/performance: whole-roster export despite filtering/paging, 0/1/45/10,000-row fixtures, independent reopening, formula safety, long IDs, Unicode, same-day unique filenames, runtime dependency graph, cache size and memory/resource cleanup.

Do not sum 58 prototypev2 tests and 190 recorded modernize tests into a claimed combined result. Port and reconcile tests against the integrated implementation, retaining the security/domain assertions. Prior modernize browser evidence is useful but does not prove this combined UI works. Its report's dependency-update and external-release limitations remain follow-up work.

## 11. Reviewable outcome of this planning task

This Markdown plan and the static HTML design preview are the deliverables. They do not change application screens, schema, dependencies, service worker or hosting. The preview contains synthetic layout examples and no saving, authentication, camera or actual QR functionality. Detailed mockups and implementation can follow this direction after review; the migration contract is a prerequisite to combining production data paths.
