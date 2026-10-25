# Redesign compatibility and offline audit

**Date:** 25 October 2026  
**Scope:** Existing prototype compared with the proposed role navigation, direct student access, explicit classes and responsive teacher workspace  
**Method:** Source inspection, existing automated regression suite, and browser-platform documentation  
**Status:** Planning and analysis. Findings below are not implementation fixes.

## 1. Decision

Responsive CSS does not inherently change offline caching, encryption or database persistence. The redesign can preserve offline functionality, but the complete proposal is more than a layout change. Routes, manifest shortcuts, React component lifetime, database schema, migration and backup contracts must change together where they depend on each other.

Do not promise that the redesigned release already works offline. It has not been built or tested. The current regression suite verifies existing behavior, not the new design.

## 2. Offline behavior by type of change

| Change | Offline compatibility | Required condition |
| --- | --- | --- |
| CSS grid, sidebar collapse, font/spacing changes | Compatible in principle | Bundle CSS locally and cache the new build |
| Reflow on rotation or resizing | Compatible in principle | Reuse the same scanner/pass components; preserve session selection |
| Root role-selection page | Requires navigation changes | Do not replace every explicit destination with a root redirect |
| Saved student destination | Requires routing and shortcut verification | Resolve the explicit student route offline from cached shell |
| Student-only screen | Compatible without teacher data | Do not open/migrate the teacher database merely to render a student pass |
| Lazy-loaded teacher screens or icons | Requires cache coverage | Every required chunk/resource must be included in the new build's offline checklist |
| Class/enrollment tables | Requires migration | Keep vault, historical records and class associations consistent |
| New website deployment | Requires safe handover | Existing cached build may continue until the new build is downloaded and activated |
| First visit on an uncached phone without internet | Unsupported | No responsive design or route can supply resources the browser never obtained |
| Separate new hosting origin | Requires record transfer | Browser records and cache do not move automatically |

Two offline layers must remain independent:

1. **Website resources:** HTML, CSS, JavaScript, decoder and report chunks, guide and icons.
2. **Teacher records:** encrypted database, vault metadata, attendance, class membership and migration state.

Cached website resources do not prove the teacher roster exists. A saved teacher database does not prove the scanner decoder is cached. The interface must distinguish both conditions.

## 3. Findings and required refinements

Labels: **Confirmed** means directly observable in current source. **Integration risk** means the new design introduces a failure if implemented without the stated contract. Priorities describe redesign work, not a claim that every existing workflow is currently broken.

### R01. Section-based membership conflicts with course-specific class cards

**Priority:** P0 before class navigation becomes authoritative. **Confirmed + integration risk.**

Evidence: `src/domain/attendance.ts`, `saveRoster()` derives the student token from section and canonical ID; `createSession()` selects all students matching section. There is no independent class-enrollment association in `src/db/db.ts`.

Example: IT301 / BSIT-3A and IT302 / BSIT-3A cannot currently maintain different enrollment lists through the import model. Relabeling the same data as two class cards does not isolate membership.

Fix: add class IDs and explicit membership. Create sessions from the selected class's enrollment, not a section filter. Imports must target a class and handle names/identity updates deliberately. Use an immutable roster snapshot during attendance.

### R02. Backups do not contain the proposed class model

**Priority:** P0 before storing new class data. **Confirmed + integration risk.**

Evidence: `src/db/backup.ts` defines a v1 payload containing students, sessions, attendance and scanEvents only. Restore clears/repopulates those known tables.

Impact: adding class tables without updating backup/restore can omit class metadata or leave stale membership after replacement. A restored database can contain valid attendance with missing or unrelated class navigation.

Fix: version the backup contract and include all new authoritative tables and associations. Clear/replace them in the same validated restore operation. Support v1 via a deliberate legacy conversion. Have older software reject newer backup formats rather than silently accepting partial data. Decryption keys must remain compatible unless an independent cryptographic migration is designed.

### R03. Old and new browser tabs can disagree about schema and membership

**Priority:** P0 before migration release. **Integration risk.**

Evidence: the database has one structural version today. Current operations know only that version; they have no class-content migration gate or compatibility epoch.

Impact: an upgrade can be blocked by an old tab, or old section-wide logic can write records without new class associations if compatibility is not constrained. A browser update button alone does not coordinate every tab.

Fix: implement database-version handling with an explicit close/reload message; add a content-migration state checked by all new teacher read/write operations. Do not run migration concurrently with attendance, import or restore. Test an old open tab during upgrade and stale clients after restoration. Keep original records intact while association review is incomplete.

Reference: IndexedDB requires coordinated version changes across open connections; see the W3C specification in Section 9.

### R04. Current role selection is transient component state

**Priority:** P1. **Confirmed.**

Evidence: `src/App.tsx` initializes role to student, provides a role toggle and holds no persistent route contract. It does not implement the new landing or direct teacher/student routes.

Impact: a page reload cannot reconstruct a chosen class/task. The new landing would appear repeatedly if implemented as another temporary React state.

Fix: use explicit hash routes, rooted under `import.meta.env.BASE_URL`, as proposed. Keep root entry intentional. Direct student links must never depend on a last-role preference or teacher database unlock. Validate route IDs and class/session ownership before displaying teacher context.

### R05. Hash routes conflict with the current skip link

**Priority:** P1. **Confirmed + integration risk.**

Evidence: `src/App.tsx` uses `href="#main"`. With hash routing, clicking it can replace `#/student` or a teacher destination with `#main` if the router treats all fragments as routes.

Fix: give the skip control an explicit focus/scroll action that preserves route state, or define a router-aware anchor strategy. Test keyboard skip navigation from every route, including offline. Do not remove the accessibility feature to simplify routing.

### R06. The current manifest launches the root

**Priority:** P1 for student direct-entry promise. **Confirmed.**

Evidence: `vite.config.ts` declares `start_url: '.'` and browser display mode. Existing bookmarks or saved website icons may target the root regardless of the page visible when saved.

Impact: a root-launching icon will show the new role selection. Caching the student page does not itself change the launch destination.

Fix: guarantee direct-entry behavior for an explicit student bookmark/link first. Keep root-launching icons documented honestly. Evaluate a student-specific manifest or shortcut only as a separately tested browser feature; preserve application identity/scope and existing teacher bookmarks. Never promise universal “save offline” installation behavior.

### R07. Cache readiness is not tied strictly to the active build

**Priority:** P1 before using stronger readiness language. **Confirmed limitation.**

Evidence: `OfflineStatus.tsx` uses global `caches.match()` with `ignoreSearch`, checks resource existence and gets a registration by document location. It does not establish a matching active build/checklist identity or verify each asset's content.

Impact: during an update, resources/checklists from multiple cache generations can produce misleading readiness. After a structural redesign, “files exist somewhere” is weaker than “the active student flow is prepared.”

Fix: identify the intended scope, controlling worker and build-specific precache/checklist. Keep readiness state outside page components and invalidate it on controller/build change. A full readiness check still cannot promise future retention. Do not couple the student's readiness UI to teacher IndexedDB availability or schema upgrades.

### R08. Update protection is coupled to teacher database access

**Priority:** P1. **Confirmed.**

Evidence: `OfflineStatus.applyUpdate()` queries active sessions in IndexedDB even on the student view. Its `active` prop captures only some work from the teacher component tree. A pending operation in a different tab is not represented by that prop.

Impact: a student-only browser with unavailable/blocked storage can encounter update trouble unrelated to QR generation. Migration can also block an update query. Route switches can clear local busy state while an operation is finishing.

Fix: centralize service-worker registration and update decisions. Maintain safe fallback behavior when database state cannot be inspected; do not force an update on an unknown teacher state. Use explicit teacher activity/compatibility coordination across relevant tabs, with an activity lease where appropriate. Test transitions and registration changes. Student pass generation must continue to work independently while an update is deferred.

### R09. Duplicating responsive layouts can duplicate device resources

**Priority:** P1. **Integration risk.**

Evidence: `ScannerView` opens camera resources in an effect; `DynamicQR` starts a timer and wake-lock lifecycle. Hiding a mounted component with CSS does not unmount it.

Impact: rendering a desktop scanner and a phone scanner simultaneously can request multiple streams. Swapping component trees on resize can repeatedly reset debounce, sound controls, local form input and camera permission flow.

Fix: one mounted scanner owner, one pass timer and one wake-lock owner. Reflow using CSS and change navigation presentation without duplicating task components. Do not hide a running scanner on a different teacher screen: explicitly pause/stop it. Preserve state when the viewport changes.

### R10. Pending work is not coordinated centrally with lock or role changes

**Priority:** P1. **Confirmed limitation + integration risk.**

Evidence: teacher lock clears keys; App role changes unmount the teacher portal. Manual dialog and backup controls hold their own `busy` state. Scanner pending state exists in the workspace, not a teacher-wide operation coordinator. The inactivity timer watches pointer/keyboard events rather than ongoing operation completion.

Impact: navigation or auto-lock can remove visible confirmation while a database operation continues using captured keys. The UI cannot safely equate unmounting with cancellation. Hard browser/OS termination cannot be held back reliably.

Fix: coordinate all mutation states under the teacher boundary. On explicit lock/change-role: stop new scans, drain or resolve pending commits, then clear display/key references. Preserve active session for later resumption. If inactivity timeout occurs during a write, mark lock requested and lock after completion. Explain that this is best-effort in-app coordination, not a guarantee against forced termination.

### R11. New class navigation magnifies stale-selection races

**Priority:** P1. **Confirmed limitation + integration risk.**

Evidence: `TeacherWorkspace` owns selection, scanning, reads and report state together. It has a sequence guard for full refreshes and a selected-ID check for some later updates. Session selection currently clears session state before reloading it.

Impact: a slow read or mutation result can be associated visually with another selected class if the redesign spreads ownership across sidebar, tabs and routes. A URL containing a class and session could also describe a mismatched pair.

Fix: all operations capture immutable session/class IDs at initiation. Resolve and validate route context before accepting scans. Discard stale read responses; committed writes still report against their actual target. Do not mutate the task target merely because the sidebar selection changed. Offer explicit Resume for the single active session.

### R12. Roster editing behavior needs a class-specific import contract

**Priority:** P1. **Confirmed.**

Evidence: `saveRoster()` uses `bulkPut` merge and blocks imports if any active session exists. It has no replace-membership operation, withdrawal behavior or conflict preview against existing different names for the same canonical ID. Current CSV row-collision validation does not by itself detect an existing identity mismatch.

Impact: “Import this class” could unintentionally update shared identity details, retain students the teacher thought were removed, or suggest that replacing a file replaces enrollment when it only merges.

Fix: initially offer **Add/update enrollment** with a preview of additions, matches, identity-name conflicts and section mismatches. Keep removal out of the first redesign unless explicitly designed. If replace is added later, require a removal preview and preserve session snapshots. Retain the existing global active-session import restriction for the first release rather than silently relaxing concurrency rules.

### R13. Existing identity keys must remain stable during class migration

**Priority:** P1 before expanding identity contracts. **Integration risk.**

Evidence: student tokens sign `student:${section}:${id}` and attendance/session records refer to those tokens. Adding course or term to that derivation would change existing lookup identities. No delimiter collision in the existing normalized ID contract was established by this review.

Fix: keep legacy token bytes unchanged for existing records. Associate students through explicit enrollments and opaque class IDs. Any future identity consolidation needs a separate mapping migration that preserves historical references. Do not add course/term text into legacy token derivation as an improvised migration.

### R14. Automatic absence and first-recorded time need careful treatment

**Priority:** P2 independent hardening before changing results UX. **Confirmed edge cases.**

Evidence: reopening recognizes legacy automatic absences using a specific MANUAL reason string. A teacher-written absence with that exact reason would also qualify. Corrections from a SYSTEM absence can leave `originalAt` unset; reporting then falls back to the correction time, which should not be mislabeled as an optical first presentation.

Fix: use explicit closure-provenance metadata for new records; migrate legacy cases conservatively rather than inferring intent from editable notes. Distinguish first attendance/presentation time, last correction time and absence evaluation time. Require a deliberate policy for manual corrections without a presentation timestamp. Preserve original audit evidence and do not rewrite old history silently.

### R15. Restore changes data without refreshing teacher entry metadata

**Priority:** P1 when refining entry/recovery. **Confirmed.**

Evidence: BackupControls restores records and shows counts; TeacherPortal checks whether a vault exists on mount/key changes. There is no restore-completion callback to refresh that check.

Impact: restoring into a previously empty page can leave the first-use form visible until a later action. With new migrations, a stale first-use screen could confuse restoring teachers or suggest creating another workspace.

Fix: after successful restore, clear sensitive inputs and refresh vault/schema state through one shared teacher-entry state machine. Prompt for the restored vault's PIN; do not manufacture a new PIN. Prevent restore while another local teacher mutation is active, and coordinate other open tabs before replacement.

### R16. Current performance work grows with all local history

**Priority:** P2; measure before claiming scale. **Confirmed.**

Evidence: listSessions decrypts every session including its roster snapshot. Workspace refresh reads all students and sessions; scan refresh reads the selected report snapshot including the complete audit trail. Report snapshot reads are useful for exports but heavier than a live counter query.

Impact: class sidebar rendering and every scan can become slower as semesters and audit history accumulate. More panels would amplify work if each duplicates subscriptions/decryption.

Fix: class-scoped queries and minimal encrypted navigation summaries; load session roster once per selection and read only changes during scanning. Fetch complete audit/report snapshots when reviewing/exporting. Use paging for historical lists. Keep plaintext indexes minimal and documented; optimization must not leak private roster details into unencrypted caches.

### R17. “Recorded” and active-session summaries need exact definitions

**Priority:** P1 UI contract. **Confirmed domain behavior.**

Evidence: present, late, absent, excused and pending are separate outcomes. Explicit teacher absences can exist while a session is active. An excusal creates a record without proving physical presence.

Fix: define **Processed = PRESENT + LATE + EXCUSED + explicit ABSENT** and **Not yet recorded = roster size minus existing attendance records**. If using “Recorded,” explain it means an attendance decision, not physical check-in. Retain attendance rate `(PRESENT + LATE) / enrolled`, disclose the denominator, and keep dispute count separate. Do not let visual progress imply every record is a physically present student.

### R18. Migration failure and software rollback are different problems

**Priority:** P0 release design. **Integration risk.**

Impact: redeploying the old website after a database upgrade may not reopen or understand the new schema. Keeping old assets is not sufficient for safe database rollback.

Fix: require a verified pre-migration encrypted backup and define supported restore/recovery software. Prefer a tested forward-fix for the upgraded database. If rollback requires restoration, use a controlled compatible database/profile workflow; never delete a live database automatically to make an old build load. Freeze the old source as a recovery reference, not as a guarantee of in-place downgrade compatibility.

## 4. Refined function ownership

| Owner | Responsibilities | Must not own |
| --- | --- | --- |
| Application shell | Route resolution, common error/help, resource readiness, update coordination | Decrypted roster or teacher keys on student routes |
| Teacher boundary | Unlock state, key lifetime, migration gate, operation/lock coordination | Student ID memory |
| Class workspace | Selected class, enrollment and defaults, class history | Global student role selection |
| Session task | Immutable session context, scan/manual/review/results state | Deriving membership from sidebar labels |
| Domain/repository | Validation, transactions, duplicate rules, audit and lifecycle invariants | Screen-width decisions |
| Device adapters | Camera/wake/audio capability and cleanup | Attendance authority or user navigation |
| Backup service | Versioned complete snapshot and validated replacement | Silent conversion with missing class membership |

Use stable task components and pure responsive styling. Keep domain operations shared between desktop and narrow layouts.

## 5. Updated behavior decisions

1. Keep the current QR v1 contract for this redesign; classes are resolved by the teacher's selected active session. Do not require students to select a course or add a new QR field just to support teacher navigation.
2. Generate the room challenge once when starting a session; rerenders/resizes must not regenerate it. Do not repeat the immediately preceding challenge where practical. Reuse remains a relay risk and not authentication.
3. Distinguish saving class defaults from starting a session. Defaults never update active/historical timing or roster snapshots.
4. Keep one active session across the whole teacher workspace, even when navigation shows multiple classes.
5. Before leaving scanning for review/history/settings, stop new decoding and finish pending saves. Resuming scanning restarts intentionally after the target context is confirmed.
6. Treat class navigation and content migration as separate from class deletion/retention. Do not introduce deletion in the first redesign.
7. Do not store the teacher PIN, unlocked keys, names or attendance in route parameters, service-worker HTML caches or ordinary role preferences.
8. Same-origin browser pages share a storage boundary even if paths/roles differ. A dedicated deployment origin and safe code remain important; separate role screens do not create isolated security realms.
9. Keep production display changes separate from schema changes where practical. First release route/layout foundations against the old data contract; only enable authoritative class membership after migration/restore gates pass.

## 6. Mandatory verification matrix

| Test group | Cases | Expected invariant |
| --- | --- | --- |
| Responsive state | Resize/rotate while pass displayed, scanning, dialog open and saving | Same task/session, one device-resource owner, no lost committed data |
| Student offline | Prepared cold launch at root and repository path, direct fragment link, reload, Back, skip control | Correct student screen without role reselection |
| Resource coverage | Missing decoder/export chunk, old/new caches coexist, no network, font/icon loading | No false ready result or runtime CDN dependency |
| Teacher entry | New vault, existing vault, wrong PIN, blocked storage, restored vault | Correct state; no overwrite or misleading creation screen |
| Navigation/lock | Scan save, manual save, close, dispute resolution and backup in flight | Operation result resolved before voluntary teardown; session resumable |
| Class isolation | Same section/different course, same labels/different terms, wrong route association | Independent membership; correct class/session scope |
| Import | Old 3-column CSV, CA sample, diacritics, existing name mismatch, section mismatch, merge vs replace | Explicit preview and no silent reassignment |
| Migration | v1 no history, orphan roster, repeated course names, active session, interruption, quota failure | Old records intact, resumable/idempotent association |
| Multi-tab versions | Old tab blocks schema, active session elsewhere, restore during another tab's operation | Clear coordination; no partial writes/unsafe downgrade |
| Backup | v1 and new format, missing enrollment, duplicate associations, corrupt ciphertext, wrong PIN | Atomic validated restore with preserved historical evidence |
| Lifecycle/reports | Manual absence, excusal, disputed duplicate, closure/reopen, multiple same-day sessions | Original domain rules; clear time semantics and filenames |
| Accessibility | Keyboard route changes, focus restore, screen reader, large text, narrow viewport | Equivalent access without relying on color or device width |

The existing 28-test baseline does not cover this matrix. The existing UI test mocks the camera and uses jsdom. It cannot establish real camera, installed shortcut, service-worker migration or physical-browser behavior.

## 7. Implementation order and release gates

1. Freeze and back up the current prototype; capture a v1 fixture with sessions, disputes and historical snapshots.
2. Finalize routes, skip behavior and one-owner responsive shell. Confirm student direct access and cache coverage without touching record identity.
3. Introduce teacher-wide entry/operation/migration state; fix restore refresh and safe navigation contracts.
4. Implement versioned class/enrollment storage plus matching backup/restore and stale-client safeguards before enabling class-specific imports.
5. Migrate reviewed associations and validate counts/history. Resume an existing active legacy session before forcing migration of its class.
6. Move existing attendance functions into task screens; add defaults and generated challenge with explicit timing rules.
7. Optimize scoped history/scan reads where measured; execute the full matrix and real-browser offline tests.
8. Release only when rollback/recovery, old/new worker coexistence and legacy backup restoration are demonstrated. No destructive automatic cleanup of legacy records.

## 8. Evidence boundaries

The current application source confirms the relationships and limitations described here. All 28 existing tests in 7 files passed, and TypeScript project checking completed successfully during this review. No redesigned components, schema migrations, new manifest or live deployment were created in this analysis. No real classroom records were inspected. Recommendations for unimplemented features are integration requirements, not experimentally confirmed failures of those future features.

## 9. Platform references

- URI fragments stay on the client, supporting one static entry with explicit routes: https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment
- IndexedDB upgrade/version coordination: https://www.w3.org/TR/IndexedDB/ and https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
- Prompt updates for applications with forms: https://vite-pwa-org.netlify.app/guide/auto-update
- Storage API persistence request: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API
