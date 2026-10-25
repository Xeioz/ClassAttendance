# 07 — Implementation roadmap and change tracking

| Priority | Task | Status | Evidence |
| --- | --- | --- | --- |
| P0 assessment | Check encryption/transactions/restore for confirmed critical failures | Assessed; no new P0 established | Existing crypto/data/backup suite retained |
| P1 | Fix late unlock and delayed inactivity expiry | Implemented | `portal-lifecycle.test.tsx`, `inactivity-lock.test.tsx` |
| P1 | Separate teacher loading from student entry | Implemented | `TeacherEntry.tsx`, production browser checks |
| P2 | Keep optional enumeration out of camera critical path | Implemented | `scanner-lifecycle.test.tsx` |
| P2 | Remove stale/no-handle torch behavior | Implemented | `scanner-lifecycle.test.tsx` |
| P2 | Expose older audit events | Implemented | `history-pagination.test.tsx` |
| P2 | Simplify report fields and draft session entry | Implemented | Extended template UI tests |
| P2 | Correct epoch-zero dispute display | Implemented | Extended dispute UI tests |
| P2 | Add CSP and referrer restrictions | Implemented | Production build and browser policy/download/offline checks |
| P2 | Upgrade vulnerable development dependency | Blocked by registry access | See security assessment; loopback-only use retained |
| P3 | Bound attendance table rendering | Implemented | Pagination regression with complete snapshot |
| P3 | Clean SSR export QA optimizer setup | Implemented | Export generator avoids unrelated virtual-PWA scan |
| P3 | Version release and document operations | Implemented | Package 0.3.0, documentation set |
| Validation | Full suite, exports and root/subpath builds | See final validation record | `08-testing-and-validation.md` |
| Validation | Production desktop/mobile/tablet/offline/recovery checks | See final validation record | Browser JSON and screenshots |
| External | Physical device matrix / institution policy / live release | Deferred | Requires hardware, policy or deployment access |

Execution is incremental: preserve baseline → fix lifecycle boundaries → improve forms and browsing → add regression coverage → verify production behavior → document release/rollback. No operation requires deleting or converting existing attendance records.
