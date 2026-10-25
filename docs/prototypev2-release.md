# prototypev2 implementation and verification

**Branch:** prototypev2  
**Version:** 0.3.0  
**Date:** 25 October 2026  
**Delivery:** browser-based website; no native mobile application

## Implemented workflow

- Root role choice, explicit `#/student` and `#/teacher` destinations, and class/session hash routes compatible with a static repository subpath.
- Student ID/challenge flow with existing QR v1 payload, optional ID memory, offline preparation available before generating a pass, and direct bookmark guidance.
- Distinct teacher vault checking, first-use PIN creation, returning unlock and storage error states. Restore completion refreshes entry state; role changes remove the unlocked teacher tree.
- Responsive teacher class navigation and full-width task screens on narrow viewports. The scanner has one owner; resizing changes presentation without mounting another camera.
- Class overview, roster, history, defaults, session setup, scan, review and closed results. Generated challenges remain stable during the setup form and can be regenerated deliberately.
- Encrypted class metadata, independent enrollment links, immutable session roster snapshots and defaults that apply only to new sessions.
- CSV previews identify additions, matches, name conflicts and section mismatches. Imports merge enrollment, retain omitted students and stay blocked during an active session.
- Legacy sessions remain accessible as unassigned records. Explicit association adds class navigation without replacing IDs, attendance or audit evidence. Copying section enrollment requires a separate review/action and is idempotent.
- Version 2 encrypted backups include class/enrollment data. Restore supports v1, validates associations and duplicate keys, then atomically replaces all authoritative tables. Newer unsupported backup versions are rejected.
- Teacher mutations and backup operations publish busy state. In-app navigation and explicit lock defer while an operation is pending. Web Locks serialize operations across cooperating tabs where supported; transactional guards remain in place elsewhere.
- Custom Workbox service worker verifies its own revision-specific precache. Student preparation does not open the teacher database. Controller changes invalidate readiness.
- Existing manual entry, duplicate suppression, disputes, closure/reopening and Excel/CSV reports are retained. New explicit absences are distinguished from generated closure absences. Report filenames include the full session ID to distinguish same-day sessions.

Opaque class IDs and enrollment relationships are observable database metadata; class labels and private student records remain encrypted. The requested cryptographic and QR contracts are unchanged.

## Upgrade and recovery contract

The same database name is retained. Structural version 2 adds classes/enrollments without rewriting legacy ciphertext. There is no destructive automatic content migration. Each association is a small optimistic transaction; an interruption or failed write leaves original records intact and can be retried. Unassigned active sessions can be resumed before enrollment work.

Before testing against an existing working browser, export a verified backup from prototypeV1 and keep its PIN. Close other attendance tabs before the upgrade. Blocked database upgrades show a close-other-tabs message. Existing older software may not understand the upgraded schema; redeploying old assets is not a database rollback. Use the preserved v1 backup and a separate browser/origin for a legacy recovery drill. Do not delete the current working database as a routine downgrade procedure.

The website retains prompt-based updates. Teacher update activation checks active sessions while holding the same Web Lock used by teacher operations. Student update guidance asks the user to close attendance tabs and reopen after attendance; it does not open or migrate teacher storage merely to update the student pass. Browser support and old already-open clients limit coordination; this is not a collaborative multi-device system.

## Verification evidence

- Strict TypeScript project checking.
- Automated suite: **44 tests across 10 files passed**, covering original attendance/crypto rules plus class isolation, import conflicts, legacy association/retry, additive schema upgrade, class defaults, v1/v2 restoration, explicit absence provenance, role/PIN navigation, pending-operation navigation and restore-entry refresh.
- Service-worker unit checks for manifest-specific resource lookup, missing decoder resources and lookup failures. These mock Workbox and do not replace an actual browser offline test.
- Production builds for `/` and `/ClassAttendance/`, with emitted JS/CSS references checked against the injected precache manifest.
- Frozen dependency lockfile verified with pnpm's supply-chain policy check.

The browser automation tool timed out reaching the local preview, including after rebinding the preview server. No successful screenshot review, physical camera test, installed shortcut test or cold offline browser launch is claimed. The original audit and plan remain historical design inputs; this document describes the implementation and its verification boundaries.

## Required classroom/device checks before production deployment

1. On each supported phone/desktop browser, prepare `#/student`, close the tab, disable connectivity and reopen the saved student URL. Verify the form, QR rotation and wake-lock fallback.
2. Repeat at the actual repository hosting subpath. Test Back, reload, skip control and root-launching icons separately.
3. Import the 20-student CA sample into BSIT-3A. Verify two same-section classes have independent enrollment and correct session snapshots.
4. Test actual camera permission, rear-camera selection, fallback decoder, torch, audio unlock and manual attendance. Rotate/resize while scanning and confirm one camera stream and stable selection.
5. Exercise scan/manual save failures, closure, disputes, reopen and report downloads. Inspect actual saved files and large-text/keyboard/screen-reader behavior.
6. Upgrade with an older tab open, restore legacy and v2 archives on a separate test browser, and test old/new worker coexistence and deferred updates.

No production deployment is triggered by these changes. Existing PDF/slide handouts describe prototypeV1; the Markdown guides and bundled HTML guide are the current prototypev2 instructions.

## Remaining engineering boundaries

The class navigation still loads/decrypts local historical sessions on entry/focus. Live scan refreshes read the selected report/audit snapshot. Very large multi-semester datasets need measured query/paging work before a scale claim. Browser data retention is not guaranteed; first use requires connectivity. PIN guessing resistance, device trust, QR forwarding and lack of server synchronization remain the documented threat-model limitations.
