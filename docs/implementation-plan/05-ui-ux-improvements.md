# 05 — UI/UX improvements and control audit

## Implemented changes

- Teacher code loads when selected, with a visible loading state and error/retry boundary.
- Course, section and grace remain prominent; institution, subject, room and report timezone move into expandable report details. Collapsing the group retains its values. Validation expands it before focusing an invalid field.
- Explicit challenge generation supplies six random digits; the teacher can still enter a challenge manually. Use-current-time refreshes the draft start. Neither action creates attendance.
- Attendance renders 50 matching rows per page. Audit history renders 100 and exposes all remaining matching events. Search/filter/session changes reset paging; counts shrink safely.
- Epoch-zero presentation times display correctly in dispute resolution instead of appearing unknown.
- Optional camera enumeration no longer prevents scanning; torch state follows the current handle.

## Interactive-control audit

Every interactive component below was inspected for handler wiring, state, domain calls, validation and error handling. Runtime evidence is grouped by workflow; this table does not claim every possible browser/hardware combination was exercised.

| Component | Controls inspected | Runtime evidence / limits |
| --- | --- | --- |
| App | Student/teacher navigation, skip link, home and guide links | Production browser navigation, guide offline; secure-context check inspected |
| TeacherEntry | Loading, retry | Browser module-loading checks; error retry covered by browser checks where noted in validation report |
| StudentPass / DynamicQR | ID/challenge, remember, forget, display/edit | Existing validation/keyboard tests; production mobile QR; actual student identity remains external |
| TeacherPortal | PIN/confirmation, submit, lock | Existing PIN/restore tests plus delayed-unlock, storage rejection and inactivity regressions |
| RosterUpload | File/drop, encoding, search/category, pagination, per-update approval, save/cancel | Roster data/UI tests; production invalid/conflict/update/stale two-tab flows; native file-picker/drop mechanics are browser responsibilities |
| SessionForm | Template selection/name/save/update/reload/duplicate/delete/keep/confirm, class/session fields, generated challenge, current time, create | Template tests; real encrypted template/session writes; production template flows; optional-field validation regression |
| PreClassReadiness | Refresh, review configuration/roster/active session, camera test, offline check, backup navigation | Readiness UI/capability tests and production camera-denied/manual fallback |
| ScannerView | Start/stop, device selector, fallback, torch | Scanner lifecycle regressions; production startup/failure paths; physical camera/torch availability remains external |
| TeacherWorkspace | History, search, manual/F2, sound toggle, close confirmation, close, reopen reason/submit, roster paging | Existing teacher UI/lifecycle tests plus pagination; production manual path; physical audio output unverified |
| ManualEntryDialog | Search, selection, correction checkbox, status, reason, save, close/Escape | Keyboard/validation/correction tests and production reasoned excusal |
| DisputePanel | Begin/cancel review, reason, flag, resolution form | Existing stable-draft/error/closure tests; epoch-zero regression |
| AuditTrail | Expand, search, action filter, previous/next | Audit search/history regression and complete browsing test |
| ExportModal | Excel and CSV | Export contract tests and production download checks; desktop Excel rendering external |
| BackupControls | Download, file/PIN, replacement acknowledgment, restore | Wrong PIN/malformed/legacy/rollback tests; fresh-browser-context recovery |
| OfflineStatus | Readiness check, guarded update | Readiness tests; production offline reload; active-session update guard inspected/tested by existing suite |
| ErrorBoundary | Reload website | Handler inspected; no intentional corruption of real records to trigger it |

## Responsive/accessibility scope

Retain Tailwind breakpoints, wrapping labels, 48px controls, visible focus, live status, textual scan outcomes and native dialog keyboard handling. Browser evidence covers desktop, 375px mobile, tablet and 200% text as recorded in the validation report. Axe results are automated checks, not full accessibility certification; physical screen readers and the manual-dialog contrast incomplete result remain documented limitations.
