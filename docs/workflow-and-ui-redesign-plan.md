# Workflow and UI redesign plan

**Project:** Portable QR Web-Based Student Attendance System  
**Document version:** 1.1  
**Prepared:** 25 October 2026  
**Status:** Refined design proposal for review before implementation  
**Scope:** Role entry, student offline access, teacher PIN onboarding and teacher workspace redesign

## 1. Purpose

Give students a short path to their QR pass and teachers a visual workspace organized around classes and attendance. This change retains the browser-based delivery, local encrypted records, manual attendance, disputes, reports and recovery already implemented.

This document specifies future behavior. It does not claim that the screens or migrations described here are implemented. The existing website and attendance rules remain unchanged until implementation begins.

## 2. Agreed product direction

1. The website's root entry presents **I am a Student** and **I am a Teacher**.
2. Students continue using their student ID number and room challenge to generate a pass.
3. Students can prepare their own page for offline use and return directly to it without choosing a role again.
4. Teachers create and confirm a Master PIN on first use of a browser workspace, then enter the teacher portal.
5. Returning teachers unlock their existing browser workspace with its PIN.
6. The teacher portal has two main areas: class/session navigation and the selected attendance workspace.
7. The teacher interface adapts to narrow browser screens without requiring a native mobile application.

## 3. Scope and retained behavior

### Included

- A role-selection landing page and persistent direct destinations.
- Student-page offline preparation, direct-link guidance and optional remembered ID.
- Clear loading, first-use PIN, returning unlock and recovery states.
- Visual class navigation and task-specific teacher screens.
- Class identity based on course and section, rather than section alone.
- Reusable class settings and safe association of existing records.
- Responsive layouts, accessibility requirements and workflow tests.

### Retained

- Teacher-supervised identity verification. A QR pass does not prove identity or prevent forwarding.
- Encrypted local storage, existing PIN compatibility and browser-local ownership of records.
- One active attendance session per browser workspace.
- Transactional saves, duplicate protection, manual attendance, dispute review and audit history.
- Read-only closed sessions and reasoned reopening.
- Excel/CSV downloads and encrypted backup/restore.
- Prompt-based website updates, deferred while attendance is active.

### Outside this redesign

- Teacher accounts, school-wide permissions, cloud synchronization or access from multiple devices to the same live records.
- Biometric verification, student passwords or mandatory installation.
- Changing cryptographic settings or rotating existing PIN-derived keys.
- Rewriting punctuality, dispute or attendance-rate policies.
- Archiving/deleting class data or changing retention rules.

## 4. Navigation and direct access

### Proposed route contract

Use hash routes for the initial static-host implementation. They work with the existing GitHub Pages repository path without requiring server rewrites on the first visit.

| Destination | Local/root-host example | Repository-host example |
| --- | --- | --- |
| Role selection | `/#/` | `/ClassAttendance/#/` |
| Student page | `/#/student` | `/ClassAttendance/#/student` |
| Teacher entry | `/#/teacher` | `/ClassAttendance/#/teacher` |
| Selected class | `/#/teacher/classes/:classId` | Same route after the repository base |
| Selected session | `/#/teacher/classes/:classId/sessions/:sessionId` | Same route after the repository base |

The visible labels can say “Student page” and “Teacher workspace.” Users do not need to understand hash routing. Route IDs are opaque identifiers; URLs must not contain student IDs, names, PINs or room challenges.

### Navigation rules

- Opening the root shows role selection. Do not silently send every shared-device user into the last role.
- Opening the explicit student destination always opens the student page, including reload/back navigation and prepared offline access.
- Opening a teacher destination always passes through the unlock boundary when keys are unavailable.
- A small **Change role** link returns to role selection. Leaving the teacher route releases keys and stops the camera after any pending save finishes.
- Leaving a teacher view does not close its attendance session. Unlocking later offers **Resume attendance**.
- Invalid routes show a clear route-not-found state with student and teacher destinations. An unknown class/session never falls back to a different class silently.
- Browser Back must reflect actual navigation. Editing a student pass returns to its form without an unexpected trip to role selection.
- A direct URL is navigation, not teacher authorization. Only successful unlock exposes decrypted teacher data.

## 5. Screen inventory

| Screen | Primary task | Primary action |
| --- | --- | --- |
| Role selection | Choose the intended workspace | I am a Student / I am a Teacher |
| Student form | Confirm ID and enter room challenge | Display QR pass |
| Student pass | Present the QR | Edit ID or challenge |
| Offline preparation | Prepare and save direct student access | Prepare for offline use |
| Teacher first use | Protect a new local workspace | Create PIN and continue |
| Teacher unlock | Open existing local records | Unlock teacher portal |
| Empty teacher workspace | Establish the first class | Add your first class |
| Class overview | Review the class and start attendance | Start attendance / Resume attendance |
| Active attendance | Record students | Scan / Manual attendance |
| Review attendance | Resolve remaining records and disputes | Close attendance |
| Closed session | Review results and download reports | Download Excel / CSV |
| Roster | Import and review class membership | Import roster |
| Settings and recovery | Back up records and inspect storage | Download encrypted backup |

## 6. Role-selection landing page

### Content

- Heading: **Welcome to Attendance Desk**.
- Supporting sentence: **Choose how you will use the attendance website.**
- Two large, equal-priority choices with readable icons and text:
  - **I am a Student** — “Enter your ID and display your classroom pass.”
  - **I am a Teacher** — “Unlock your workspace and manage attendance.”
- A small help link and discreet connectivity information only when useful.

The landing page does not display the roster importer, storage statistics, PIN form or teacher dashboard. On narrow screens, the choices stack vertically. The entire choice is keyboard-operable with a visible focus state.

## 7. Student journey

### First visit

1. Choose Student, arriving at the explicit student route.
2. Enter the official Student ID number. Preserve the existing validation and optional remembered-ID behavior.
3. Enter the room challenge shown by the teacher.
4. Choose **Display QR pass**.
5. Present the QR and wait for the teacher's saved confirmation.

### Returning visit

Open the saved student URL directly. If the student chose to remember their ID, populate it with an obvious **Change ID** action. The room challenge remains a current-session input; do not silently reuse an old challenge as if it were valid.

### Offline preparation

The student page contains a secondary **Prepare for offline use** action. It must be available before generating a pass; preparation cannot depend on having the current room challenge.

The action verifies the required service-worker/cache state and explains progress. It can request supported browser storage persistence, but denial must not be presented as total failure when the cache is otherwise usable. Show persistence limitations separately.

| State | User-facing message / action |
| --- | --- |
| Not prepared | “Prepare this page while connected before using it offline.” |
| Preparing | “Preparing offline resources…” with repeated activation disabled |
| Cache verified | “Student page resources are ready. Reopen this saved link without a connection to test.” |
| Incomplete cache | Explain reconnect/retry; never show a success badge |
| Unsupported browser feature | Explain the limitation and manual attendance alternative |
| Cache missing after deletion | Explain that preparation is needed again |

After verification, offer **Copy student link** and instructions for bookmarking the current student destination. A browser-controlled “Add to Home Screen” option can be documented as optional only when supported. Do not automatically install, promise universal support for a destination-specific icon, or claim a bookmark itself caches resources.

The current manifest opens the website root. This requires explicit implementation review: a student-targeted shortcut must preserve the student route where the browser supports that mechanism. Until tested on a given browser, recommend the saved student URL rather than promising the installed icon bypasses role selection.

Preparing offline means the browser has the required website resources now. It does not guarantee permanent retention. First access and missing-resource recovery still require connectivity. This change is website offline support, not a mobile application.

### Pass layout

- Large black-on-white QR with preserved quiet zone.
- Clearly visible student ID and current room challenge.
- Brief refresh information, with reduced motion support.
- **Show this to your teacher and wait for confirmation.**
- **Edit ID or challenge** and a secondary **Change role** link.
- Optional wake-lock information near the pass. No forced-brightness claim.

Never display “Attendance recorded” solely because the student generated a pass. There is no return communication channel from the teacher in the current architecture.

## 8. Teacher PIN onboarding

### Entry-state decision

1. Display **Checking local workspace…** while opening IndexedDB and checking vault metadata.
2. If no vault exists, show **Create your teacher PIN** with PIN and confirmation fields.
3. If a vault exists, show **Unlock teacher portal** with the existing-PIN field only.
4. If storage access fails, show a recoverable storage error. Do not interpret an error as “no vault” or create a replacement vault.
5. Successful creation or unlock opens the same teacher shell.

Keep existing supported PIN rules and encryption compatibility for this redesign. Explain that a longer random PIN offers better protection. A hidden **Show PIN** toggle may reveal only the current input and must have an accessible label.

### First-use content

- PIN and Confirm PIN, with matching validation.
- “This PIN protects records saved in this browser.”
- “Keep your PIN securely. It cannot be reset to decrypt existing records.”
- Primary **Create PIN and continue**.
- Secondary **Restore an existing backup**, so a migrating teacher does not accidentally establish an unrelated workspace first.

### Returning content

- PIN field and primary **Unlock teacher portal**.
- A clear wrong-PIN message without clearing existing records.
- Secondary **Restore backup** help, explaining that restoration replaces local records after confirmation and validation.
- **Change role**.

PINs must not be remembered in localStorage, embedded in routes or transmitted to hosting. Switching roles locks the teacher view. Existing inactivity-lock behavior remains, and no pending write may be discarded silently during navigation.

## 9. Teacher portal: two-section layout

### Desktop layout

```text
Teacher workspace                                  Help  Settings  Lock
+---------------------------+------------------------------------------+
| CLASSES AND SESSIONS      | SELECTED WORKSPACE                       |
|                           |                                          |
| + Add class               | IT301 / BSIT-3A                           |
| Search classes            | Web Systems / 20 enrolled                 |
|                           |                                          |
| IT301 / BSIT-3A           | [Start attendance / Resume attendance]   |
| IT302 / BSIT-3B           |                                          |
|                           | Overview / Roster / History              |
| Recent sessions          |                                          |
| Active session marker    | Content changes with the current task    |
+---------------------------+------------------------------------------+
```

The left navigation is approximately 260–300 CSS pixels wide on a sufficiently wide viewport. The right workspace takes the remaining width. Breakpoints must follow usable content width rather than device names; start with a two-column layout at 1024 CSS pixels and validate before finalizing.

The sidebar identifies classes using both course and section. Never use color alone for selected or active states. A class can exist without sessions or enrollment and must have a useful empty state.

### Narrow layouts

Below the validated two-column breakpoint, show the class list as the initial teacher screen. Selecting a class opens its workspace in the full available width. Provide **Back to classes**, active class context and accessible secondary navigation. Do not render a compressed permanent sidebar beside the camera.

Opening and closing navigation must not accidentally start, close or switch the active attendance session. Preserve the current task when resizing the browser. Dialogs must fit the visible viewport, including an on-screen keyboard.

## 10. Teacher workspace by task

### A. Empty workspace

Show **Add your first class** with a short explanation and a clear class-creation action. Once the class exists, guide the teacher to import its roster. Avoid showing every empty dashboard widget.

### B. Class setup and overview

Class setup captures course code, section, optional subject/institution/room, term label and default grace period/timezone. The term label distinguishes repeated offerings across semesters; preserve existing terms as “Unspecified term” unless a teacher supplies one.

The overview shows the class identity, enrolled count, latest session and one dominant **Start attendance** action. An active session replaces it with **Resume attendance**. Roster and History are clear secondary destinations.

### C. Start attendance

Prefill class metadata, today's date and the proposed start time. Clearly distinguish defaults from the new session values. Generate a valid room challenge automatically, with a deliberate regenerate/edit action before the session starts. The challenge remains public and does not authenticate identity.

Teachers review start time, timezone and grace period before starting. Editing a class default does not retroactively change historical or active sessions.

### D. Active scanning

Give the scanner and latest saved student result the most space. Keep visible:

- Course/section and room challenge.
- **Recorded** and **Not yet recorded** counts based on committed attendance.
- Camera viewport and clear start/stop state.
- Official student name, ID, attendance status and saved time after successful commit.
- Neutral duplicate result with earlier timestamp.
- Distinct not-in-roster and not-saved feedback.
- Large **Manual attendance** and **Review attendance** actions.
- Compact camera selection, torch and sound controls when supported.

Move import tools, backup restoration, detailed audit tables, full session history and exports away from the active scan area. A short duplicate-review action can lead into dispute handling when needed. Do not display automatic absences before closure.

### E. Review before closing

Pause/stop camera capture before review. Show not-yet-recorded students, recorded totals, manual-entry access and unresolved disputes. Provide a clear return to scanning. Closing requires explicit confirmation and the existing dispute rules.

### F. Closed-session results

Show a readable status summary, attendance rate definition, roster results and report actions. Use text labels and simple proportions rather than decorative charts without purpose. Display unresolved or incomplete data honestly.

Primary next actions are **Download Excel**, **Download CSV**, and **Download encrypted backup**. State that attendance is saved locally; a requested download is not proof the file exists outside the device. Reopening remains a secondary reason-required action.

### G. Settings and recovery

Move browser storage details, persistence status, backup/restore explanations and technical troubleshooting into a dedicated area. Show urgent storage/save failures immediately in the affected workflow; do not hide them in Settings.

The basic distinction must stay clear:

- Network availability describes connectivity.
- Offline readiness describes cached website resources.
- Saved attendance describes completed database commits.
- Backup describes a separately downloaded encrypted archive.

## 11. Class model and migration

### Why migration is necessary

Current student rows are grouped by normalized section; sessions store course and section text. A navigation-only grouping would risk confusing two subjects taught to the same section. Add explicit class identity and enrollment associations before making class cards authoritative.

### Proposed model additions

| Entity | Minimum responsibility |
| --- | --- |
| Class offering | Opaque class ID plus encrypted course, section, term and default metadata |
| Class enrollment | Explicit association between a class and an existing student token |
| Session association | Class ID for new sessions, while retaining encrypted historical roster snapshots |
| Migration metadata | Version/progress needed for idempotent completion and recovery |

Keep current encrypted student rows and keys compatible initially. This is not a wholesale student-identity redesign. Class membership must not be inferred from course text during ordinary attendance operations after migration.

### Migration procedure

1. Preserve the current database name, vault and encrypted records. Never treat upgrade failure as a reason to clear data.
2. Add versioned structural schema changes without requiring decrypted values inside the IndexedDB version-upgrade transaction.
3. After teacher unlock, plan content associations in memory. Use course/section groups from historical sessions as candidates, not proof of an unspecified term or identical roster.
4. Show **Review existing classes** when records require association. Same-section rosters can be offered for explicit copying into a class, but changes to one class must not silently alter another.
5. Preserve original session IDs, attendance keys, audit events, timestamps and roster snapshots. Unmatched records remain accessible under **Unassigned records** until reviewed.
6. Apply approved associations atomically where practical, with an idempotent migration marker. Support interruption/retry and conflicting-tab detection.
7. Update backup format/version and restore validation to include classes/enrollments. Continue accepting old backups through an explicit migration path. Do not silently omit new tables from backups.
8. Verify record counts and historical reports before/after migration using representative legacy fixtures.

Existing three-column CSV files (`id,name,section`) remain supported, including the 20-student CA sample. Imports occur inside a selected class and verify its section. A mismatched section requires correction or explicit class review, not silent reassignment. The selected class determines course membership because the CSV does not contain a course column.

## 12. Visual and accessibility specification

- Reuse the current forest/neutral identity while establishing consistent spacing, type sizes and component states.
- Use a clear hierarchy: page/class heading, task heading, field labels, supporting text.
- Primary controls target at least 48 by 48 CSS pixels. Use CSS pixels for browser layout specifications.
- Use readable text and measured contrast, visible keyboard focus and semantic landmarks.
- Every icon-only control needs an accessible name. Statuses use text and symbols as well as color.
- Dialogs manage focus, support Escape when no operation is pending, and restore focus to their trigger.
- Screen readers announce completed scan outcomes and failures without reading every countdown tick.
- Preserve 200% text enlargement and usable zoom/reflow. Test the narrowest supported viewport and portrait/landscape changes.
- Avoid dashboard clutter: summary figures should answer a teacher question, and one primary action should dominate each task state.
- Do not add flashing confirmations, excessive motion, autoplay audio or full-screen failure overlays for recoverable errors.

## 13. Failure and interruption requirements

| Situation | Required behavior |
| --- | --- |
| Student opens prepared direct link offline | Student form appears without role selection |
| Student opens uncached browser offline | Explain the missing preparation where the browser can load a fallback; do not promise the website can run before its first load |
| Remembered ID storage denied | Pass generation still works; explain that ID memory is unavailable |
| Teacher vault check fails | Storage error and retry/recovery help; no automatic new-vault creation |
| Teacher leaves while a scan saves | Complete/resolve the pending operation before releasing the view; saved records remain resumable |
| Camera denied/unavailable | Manual attendance remains prominent |
| Database write fails | Explicit not-saved result; counters stay based on committed records |
| Dispute exists during closure | Closure blocked with a route to resolve it |
| Active session exists in another class | Offer Resume; do not create a second active session |
| Browser/tab interrupted | Unlock and resume the correct existing session |
| Class migration interrupted | Retry safely; existing records remain accessible |
| Old backup restored | Validate, restore and guide class association without losing historical records |
| Website update available during attendance | Defer activation under the retained update policy |

## 14. Implementation sequence and review gates

### Step 1: Navigation and screen designs

Create wireframes for landing, student form/pass, PIN creation/unlock, empty teacher workspace, class overview, scanner, review and results. Confirm layout at desktop and narrow widths. Finalize route/shortcut behavior before promising browser-specific offline shortcuts.

### Step 2: Class foundation and safe migration

Design the class/enrollment schema, legacy association review, backup compatibility and migration tests. Implement these together after the route and operation boundaries below are established. This foundation must pass its gates before the new class sidebar owns attendance selection.

### Step 3: Role entry and student offline journey

Implement routes, role landing, direct student access, optional ID memory and offline preparation feedback. Preserve the QR contract and teacher authorization boundary.

### Step 4: Teacher PIN and two-section shell

Implement explicit loading/first-use/returning/error states. Build class navigation, selected context and responsive task routing. Retain encryption keys only within the unlocked teacher boundary.

Establish teacher-wide pending-operation coordination and restore-completion refresh before moving mutations into separate screens. Build the responsive shell against the current data contract first; enable class-specific selection only after the class/migration/backup foundation passes verification. Follow the detailed release order in the compatibility audit.

### Step 5: Daily attendance flow

Move existing domain operations into the new overview, scanner, review and results screens. Reuse transaction/audit logic instead of duplicating it in UI components. Add generated session challenges and reusable defaults.

### Step 6: Verification and documentation

Run domain regressions, migration/backup tests, route/offline checks and interaction/accessibility tests. Test actual phone and desktop browsers before claiming supported shortcuts or camera behavior. Update guides, screenshots and release notes to match the implemented flow.

No schema replacement, production deployment or implementation is performed by approving this document alone; those belong to the subsequent build work.

## 15. Acceptance criteria

1. Root entry shows both role choices with keyboard-operable controls.
2. Explicit student links bypass role selection across reload and prepared offline launch at root and repository base paths.
3. Bookmark guidance points to the student destination. Browser-specific shortcut behavior is either verified or described as unsupported/unverified.
4. Student ID and room challenge remain the only required pass inputs. ID memory is optional and removable.
5. Offline preparation is available before a pass and never reports success when required resources are missing.
6. Teacher first-use creation and returning unlock are distinct. Wrong PIN/storage failure cannot overwrite the vault.
7. Direct teacher routes cannot expose decrypted records without unlocking. Switching roles releases teacher keys and camera resources safely.
8. Desktop has a readable two-area teacher layout; narrow screens provide full-width class and task screens.
9. Same-section classes for different courses have independent class membership and correctly associated sessions.
10. Class defaults prefill new sessions without modifying existing historical or active settings.
11. Only one session is active per workspace; resumption identifies the correct class/session.
12. Scanner feedback, duplicate protection, manual attendance, disputes and committed counters retain their tested behavior.
13. Review exposes remaining students and disputes. Closed results are read-only and reopening requires a reason.
14. Migration preserves legacy IDs, counts, attendance, timestamps, snapshots and audit history. An interrupted migration can resume safely.
15. Both old and new backup formats restore through validated paths, including class/enrollment data in new backups.
16. Keyboard, focus, screen-reader feedback, contrast and text-enlargement checks cover all new screens.

## 16. Review decisions

The product flow and two-section direction come from the current discussion. Hash routes, class model details, migration review, breakpoint starting point and screen copy are implementation proposals in this document. Review them with wireframes before coding. Physical-device support and offline shortcut behavior remain evidence-based release checks.

## 17. Compatibility refinements after source audit

The [redesign compatibility and offline audit](redesign-compatibility-audit.md) records the source evidence, confirmed limitations, integration risks and mandatory test matrix. It supplements this plan; responsive layout alone does not satisfy its migration and offline gates.

1. **One task instance:** reflow the same scanner/pass components. Do not mount duplicate desktop and narrow layouts containing camera, timers or wake locks.
2. **Direct student entry:** preserve the student hash route under the repository base path. Replace the current fragment skip link with route-preserving focus behavior. Treat manifest/root launch separately from a student bookmark.
3. **Offline readiness:** verify resources against the controlling build and scope. Keep resource readiness separate from teacher records, persistence permission and backup status. Student QR generation must not depend on teacher database migration.
4. **Safe transitions:** coordinate scanning, manual entry, disputes, closure, backup and restore under the teacher boundary. Voluntary navigation and inactivity locking must resolve pending writes before clearing sensitive UI state. Hard termination remains outside that guarantee.
5. **Stable records:** retain legacy student tokens, session IDs and roster snapshots. Add class memberships without silently changing identity derivation or historical reports.
6. **Import behavior:** retain the three-column CSV and existing active-session restriction initially. Preview additions, existing-name conflicts and section mismatches. Label merge behavior explicitly; replacing enrollment requires a separate removal design.
7. **Recovery:** version backups alongside the schema; support old archives and reject unsupported newer formats. Refresh teacher entry state after restore. Coordinate blocked upgrades and stale tabs, and demonstrate recovery before release.
8. **Count semantics:** Recorded means an attendance decision, including explicit absence/excusal. Show physically present counts separately where needed; keep attendance-rate definitions visible.
9. **History and timing:** preserve closure/reopen and dispute rules. Distinguish presentation time, correction time and automatic absence evaluation. Avoid reloading/decrypting all history for every scan or sidebar render.

The existing baseline passed 28 automated tests and TypeScript checking during this audit. New offline routes, class migration, responsive device-resource ownership and real-browser launch behavior require their own verification before release.
