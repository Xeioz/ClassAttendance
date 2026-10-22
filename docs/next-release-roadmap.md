# Attendance Desk: proposed next releases

These six features are **planned designs, not implemented functionality**. They follow the current increment of class templates, roster review, pre-class readiness, and accessibility foundations. Acceptance criteria below are requirements for future work, not reported test results.

| Stage                      | Feature                                        | Main prerequisite                                                            |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Next increment             | Backup reminders and guided recovery           | Durable backup activity model and isolated restore validation                |
| Next increment             | Unrecognized-scan review queue                 | Explicit resolution policy and versioned audit schema                        |
| Subsequent release         | Local student attendance history               | Agreed student identity and correction presentation rules                    |
| Subsequent release         | Student retirement and reactivation            | Enrollment eligibility, retention, and authorization policy                  |
| Architecture investigation | Verified check-in receipts                     | Device communication, trusted signing identity, and acknowledgement protocol |
| Architecture investigation | Private student portal and correction requests | Institutional identity, server authorization, and synchronization design     |

## Constraints carried into every stage

The teacher workspace stores encrypted records locally. A student's identity is currently scoped to a section and canonical student ID; keyed tokens depend on the vault's keys. Sessions retain roster snapshots. A shared teacher PIN unlocks a local vault and does not identify an individual teacher or authenticate a student. Student QR payloads are self-asserted and do not prove attendance was saved or that the student is physically present. See the [identity and session implementation](../src/domain/attendance.ts), [check-in implementation](../src/domain/checkIn.ts), [types](../src/types.ts), and [threat model](threat-model.md).

All new sensitive local records must use authenticated encryption, participate in export/restore validation, and have version-aware migrations. Preserve legitimate old backups, existing attendance uniqueness, session snapshots, and correction audit history. Test migration failure and rejected restoration without changing the live workspace. The [backup implementation](../src/db/backup.ts) and [runtime validators](../src/db/backupValidation.ts) are the existing integration points.

Institutional identity, retention, deletion, and access rules require explicit policy decisions. A local PIN workflow cannot enforce named staff roles. Deployment still needs the actual HTTPS, offline, physical-device recovery, and institutional checks in the [release gates](deployment.md); implementing a feature does not satisfy those checks.

## 1. Backup reminders and guided recovery

**User problem.** Teachers can accumulate attendance changes without making a recoverable backup, while a download click can look like proof that records are safely stored.

**Proposed behavior.** Record encrypted backup activity against a vault revision. A revision changes when recoverable application data changes. Queue an in-app reminder after session closure, after a committed roster change, or when changes remain unbacked-up beyond an agreed interval. Combine multiple causes into one reminder for the current outstanding revision. Use closure IDs and roster-commit IDs to deduplicate repeated renders, reopening the app, and overlapping tabs.

Allow dismissal of a particular reminder and snoozing until a chosen time. Define whether a new significant change overrides a dismissal; do not silently reset snooze on every scan. Reevaluate due reminders when the unlocked application opens or regains focus. Do not promise notifications while the application is closed.

Show three distinct signals:

- **Download requested:** the application produced a backup and requested a browser download. This does not establish that a file was retained.
- **File available:** the teacher selects the saved file again and it passes envelope/decryption validation, or a supported file API confirms a completed write. Explain the narrower evidence in either case.
- **Recovery checked:** a particular backup was successfully restored and reconciled in an isolated test workspace. Label a teacher-reported second-device test separately from an automated local check.

Associate these signals with the backup's identifier/fingerprint, content revision, and time. A successful recovery of yesterday's file must not mark today's changes as protected. Do not update the content revision simply because reminder state changed.

Guided recovery must decrypt and validate in a temporary, separate database, use temporary keys, compare restored record counts and representative relationships, and dispose of the temporary data and keys on completion or failure. It must never swap the live vault metadata, active keys, or tables. A deliberate live restore remains a separate, clearly labeled operation using the existing validated transaction.

**Dependencies, decisions, and risks.** Define the reminder interval, which roster changes are significant, snooze choices, and whether reminder preferences are device-local or included in backups. Browser download APIs do not generally prove a retained file; persistence permission is not a backup. Temporary recovery duplicates sensitive data briefly and needs cleanup after interrupted checks. A local test does not establish availability on another physical device.

**Acceptance criteria.**

1. Repeated closure events, page reloads, and two tabs produce one applicable reminder; dismissal and snooze survive the agreed lifetime.
2. A cancelled download never reports a saved or recovery-checked file. An older backup never clears a newer revision's reminder.
3. Wrong PIN, malformed payload, unsupported version, and interrupted recovery checks preserve all live records and vault metadata. Temporary stores are cleaned up, including abandoned stores discovered on startup.
4. A valid supported legacy backup can be checked in isolation. The displayed result identifies the tested file and its coverage; second-device checks remain explicitly distinguishable.
5. Closing the application produces no promise of background reminders. On next open, due reminders are reevaluated without losing snooze rules.

**Implementation sequence.** Agree trigger policy → add encrypted revision/activity records and migration/backup validation → build deduplicated reminder UI → add isolated recovery engine and interruption cleanup → test failure paths and perform the physical-device recovery exercise.

## 2. Unrecognized-scan review queue

**User problem.** A teacher can miss repeated scans from a student absent from the session roster, and later roster changes can obscure what happened during the session.

**Proposed behavior.** Build a queue from valid but unlisted scan events, retaining the original chronological events. Group by session and canonical scanned ID, with first/last scan times, attempt count, and an expandable timeline. Store only the canonical ID, session reference, event references/times, and necessary review metadata in encrypted records. Do not retain camera images, raw QR payloads, room challenges, or an asserted name as trusted identity. Malformed input remains a separate validation outcome rather than creating arbitrary roster candidates.

Use explicit states such as **unresolved**, **resolved: no action**, and **resolved: linked for review**. Every decision records its time, reason, target if any, and actor capability. With today's PIN this actor is the local teacher role, not a verified named individual. Repeated scans after resolution must follow an agreed rule, such as reopening the group with a new unresolved occurrence while preserving the prior decision.

Resolution must never enroll a student or create attendance implicitly. If policy later permits amending a session roster, implement that as a separate authorized action with explicit confirmation, attendance decision, and audit history. Until that policy exists, keep the original snapshot intact. Active-session roster import restrictions remain in force.

If the ID is added to the current roster later, show a possible match for teacher review. Do not silently resolve the queue, backdate attendance, or add the student to a past session. Match using canonical identity and section context, never name alone. A link associates evidence; it is not attendance credit.

**Dependencies, decisions, and risks.** Extend the [audit schema and readers](../src/domain/audit.ts) and backup validator together. Decide who may resolve/reopen, whether unresolved entries block closure, retention duration, and how repeated attempts are bounded without hiding their chronology. The current local teacher role does not provide independently attributable decisions. Self-asserted IDs can create noise or malicious queue entries; enforce input and storage limits without recording extra personal data.

**Acceptance criteria.**

1. Repeated unknown scans group correctly while their individual event times and ordering remain inspectable; identical IDs in different sessions stay separate.
2. Reviewing, dismissing, or linking a queue entry changes neither roster membership nor attendance totals.
3. Later roster import offers a reviewable match without changing historical snapshots or automatically resolving the item.
4. Decision, reopening, and repeat-after-resolution history survives reload and backup/restore; stale concurrent decisions are detected instead of silently overwritten.
5. Encrypted storage and exported backups contain only the specified minimum data. Malformed QR input cannot populate an unbounded queue.

**Implementation sequence.** Agree resolution/closure/retention policy → define versioned encrypted review events → derive grouping and chronological view from existing unlisted events → add explicit decision controls and concurrency guards → verify later-roster and backup compatibility cases.

## 3. Local student attendance history

**User problem.** Teachers must inspect sessions individually to understand a student's attendance and explain corrected records.

**Proposed behavior.** Provide a teacher-only history over the sessions available in the unlocked local vault. Include class/section, date, session state, attendance status, recorded and original times where relevant, correction explanations appropriate to this view, and a link to the source session. Distinguish an explicit absent record from an unrecorded attendance state. Explain the timezone and distinguish check-in time from a later correction's audit time.

Use the current section-and-canonical-ID identity and session snapshots; names are display values, not join keys. Tokens are scoped to vault keys and must not be treated as portable identities across independently created vaults. Display historical names/IDs from each snapshot so later roster edits do not rewrite the past. A move to another section, a changed ID, or reused IDs requires an explicit identity-linking policy. Do not auto-link students with the same name or merge identical IDs across sections. If durable cross-section identity is required, introduce an enrollment/person identifier through a separate migration and verified mapping process.

Label coverage as **records stored on this device/workspace**. Do not imply completeness for other teachers, browsers, devices, deleted records, or backups not loaded into this vault. Restoring a replacement backup does not inherently merge histories.

**Dependencies, decisions, and risks.** Agree ID reuse, section transfer, correction visibility, date/time interpretation, and incomplete-session denominator rules. Reuse [report derivation](../src/domain/reports.ts) and [session snapshots](../src/types.ts), rather than inventing a second attendance calculation. Large histories need bounded queries or indexes that respect the existing encryption model; plaintext search indexes can disclose student relationships.

**Acceptance criteria.**

1. Same-name students and identical IDs in different sections never merge. Ambiguous reused or changed identities are surfaced rather than inferred.
2. Renaming a current roster student preserves historical display values, session membership, and prior attendance totals.
3. Status and time corrections are explained in sequence with their original values where available; unresolved/unrecorded states are distinguishable from absence.
4. Filters and totals reconcile with the source sessions and exports, including closed, reopened, and partially recorded sessions under the agreed rules.
5. The coverage limitation remains visible; no unavailable other-device records are represented as empty or confirmed absence.

**Implementation sequence.** Agree identity and display policy → implement shared local history projection → test snapshot/correction/denominator cases → add accessible filters and session navigation → verify large local datasets and exported history if export is approved.

## 4. Student retirement and reactivation

**User problem.** Departed students clutter future class rosters, but deleting them could erase evidence or change historical attendance rates.

**Proposed behavior.** Add an encrypted eligibility state to the current roster identity: active or retired, with decision time and reason. Retired students are excluded from newly created session rosters and remain searchable in a clearly labeled retired-student view. Reactivation is explicit and affects future sessions. Existing active and closed session snapshots, attendance, audit history, exports, and denominators remain unchanged.

Require an unlocked teacher workspace for either action. If institutional policy requires named administrators or separate permissions, defer that authorization requirement to an authenticated role system; the shared PIN cannot enforce it. Guard decisions against concurrent roster imports/session creation. Importing an existing retired ID must show its state and require an explicit reactivation decision, rather than silently making it active. A reused ID must not reactivate a different person's history by assumption.

Retirement is not deletion. Provide no automatic purge until retention and deletion rules are approved and implemented. Explain that retired records remain in historical sessions and backups.

**Dependencies, decisions, and risks.**

| Policy decision           | Required outcome before release                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Who can retire/reactivate | Accept the local unlocked-teacher capability or require named institutional roles                                 |
| Existing active sessions  | Preserve their snapshot; define any separate enrollment amendment workflow                                        |
| Retention                 | Specify periods and responsibility for live data, audit records, exports, and backups                             |
| Deletion                  | Define approval, legal/recordkeeping holds, history/denominator effects, and treatment of already exported copies |
| ID reuse and transfer     | Require explicit identity review; no automatic name or ID reassignment                                            |

A future deletion workflow needs a separate design; merely hiding a row cannot satisfy a deletion request. Extend encrypted roster validation and migration defaults so older backups restore existing students as active unless a supported record explicitly says otherwise.

**Acceptance criteria.**

1. Retired students are excluded only from subsequently created sessions; historical roster counts, attendance percentages, and exports reconcile exactly before and after retirement/reactivation.
2. Reactivation and import of a retired ID require explicit decisions, persist across reload, and survive supported backup/restore.
3. Concurrent retirement/import/session creation yields a consistent roster snapshot or an actionable stale-state conflict.
4. Supported old backups remain valid with documented eligibility defaults. Invalid eligibility or audit data is rejected before live replacement.
5. The interface explains retained history and does not label retirement as deletion or promise removal from existing downloaded copies.

**Implementation sequence.** Approve authorization/retention/identity policy → migrate eligibility and audit data → update new-session roster selection and import review → add retirement/reactivation controls → reconcile historical reports and exercise concurrent changes and legacy restore.

## 5. Verified check-in receipts

**User problem.** A student generating a QR code, or seeing a successful camera decode, cannot know whether the correct attendance record was actually saved.

**Proposed behavior.** Investigate an authenticated acknowledgement emitted only after attendance and its audit event commit successfully. Bind a receipt to a protocol version, opaque session identifier, intended student, unique committed event/receipt ID, recorded status/time, and issuer identity. Use a documented canonical signed representation and minimize personal information. A receipt confirms the issuer's stated persistence result; it does not independently prove physical presence.

Evaluate two communication paths: an authenticated online service that relays/verifies acknowledgements, or an offline teacher-issued receipt QR that the student scans with an application holding a trusted issuer public key. The latter requires trusted public-key provisioning and a dedicated signing key, not the teacher's numeric PIN or the vault encryption/HMAC key. An arbitrary public key embedded in the same receipt provides no institutional authenticity. Protect and rotate signing keys, and define lost-device revocation.

Distinguish **saved on this teacher device** from **accepted by the institutional service**. In an offline workflow, a local receipt cannot promise eventual server acceptance. A delayed or failed response displays pending/unknown state and permits safe retry. Duplicate retries must return the same committed outcome or a clearly identified existing record; they must not issue a new attendance credit. A later correction/revocation requires a versioned status lookup or explicit superseding event, since an old signed receipt cannot change itself.

**Dependencies, decisions, and risks.** Specify trust roots, device enrollment, key custody, authenticated routing, retention, and student-to-receipt binding before implementation. The existing rotating student QR challenge is not a signed persistence acknowledgement. Prevent replay by validating session/recipient/event binding, challenge or request identifiers where used, and idempotency; do not rely on a timestamp alone. Teacher-device compromise can still produce misleading locally signed claims. The [threat model](threat-model.md) must describe that limit rather than treating signatures as tamper-proof attendance.

**Acceptance criteria.**

1. QR creation, decoding, validation failure, storage rejection, and rolled-back writes cannot produce a saved receipt.
2. A committed check-in produces a receipt matching the correct session, student, status, and event; another student's receipt or another session's replay is rejected.
3. Retries after dropped responses do not duplicate attendance. Offline delays and server conflicts retain explicit pending/local/server-confirmed distinctions.
4. Modified signatures, untrusted issuers, wrong recipients, revoked keys under the defined freshness policy, and unsupported receipt versions fail verification with useful messages.
5. Corrections and closure behavior are specified; an older receipt is not represented as the current status without checking the applicable revision.

**Implementation sequence.** Write protocol/trust model and choose communication path → prototype persistence acknowledgement and idempotency → establish issuer enrollment/signing/revocation → implement student verification and delay handling → run tampering, replay, storage-failure, offline, and physical-device tests before a limited pilot.

## 6. Private student portal and correction requests

**User problem.** Students need private access to their own attendance and a traceable way to request corrections without sharing a teacher's local vault.

**Proposed behavior.** Treat this as a new authenticated service architecture. Prefer institution-supported identity such as OIDC/SSO and an authoritative enrollment mapping. A self-entered student ID, name, room challenge, or teacher PIN is not sufficient account ownership proof. Enforce institution, role, class ownership, and student ownership on every server request, including downloads and correction endpoints. Return only the student's approved record projection; do not expose another student's data or confidential teacher review notes.

Start with a read-only pilot. Then add correction requests with explicit submitted, under-review, approved, rejected, and withdrawn outcomes. A request never changes attendance automatically. An authorized teacher reviews evidence and records a reason; an approved change and its audit event must commit together. Preserve original values, request history, decision identity, and the source session reference.

Define opt-in synchronization from the teacher workspace using a durable operation outbox, unique operation IDs, acknowledged revisions, and retries. Keep local vault keys and PINs on the teacher device; service credentials are separate. Server-side storage and backup need their own encryption and access model. Conflicting edits to the same attendance revision require teacher review rather than silent last-write-wins. Define which system is authoritative and how local restore, session reopening, delayed uploads, and duplicate retries affect server records before permitting multiple writers.

For offline use, show the last successful sync time and cache scope. Any student cache requires an explicit device/privacy policy and bounded access lifetime. Offline correction drafts remain **not submitted** until the service acknowledges them. Sign-out removes application-managed cached records where feasible. Revocation takes effect on the server immediately according to policy, but cannot guarantee immediate erasure or denial on a disconnected device; document that limitation and the reconnect/expiry behavior.

**Dependencies, decisions, and risks.** Institutional approval is needed for identity/enrollment binding, hosting, responsible data owners, staff permissions, parent/guardian access if relevant, correction deadlines, retention/deletion, account recovery, incidents, and data synchronization. Define student and staff revocation and transfers between classes/institutions. Local audit events currently identify a shared teacher capability; do not relabel old actions as verified named staff. Cross-tenant isolation and unauthorized object access are primary risks; client-side hiding is insufficient authorization.

**Acceptance criteria.**

1. A student cannot read, export, enumerate, or modify another student's records by changing IDs or requests. Staff authorization is checked against institution and assigned scope.
2. Enrollment linking and account recovery cannot be completed using only a claimed student ID. Revoked accounts and roles fail server authorization.
3. Requests require teacher decisions; approval commits the correction and audit together, while rejection/withdrawal preserves original attendance. Duplicate submissions and decisions are idempotent.
4. Interrupted uploads, repeated retries, concurrent corrections, stale clients, and replacement local backups do not silently overwrite accepted records; conflicts are visible and recoverable.
5. Offline views identify stale data, queued drafts remain unsubmitted, and reconnect/expiry/sign-out behavior follows the approved cache and revocation policy.
6. Retention/deletion and backup recovery are exercised for both local and server records, with documented handling of previously downloaded copies and retained audit obligations.

**Implementation sequence.** Approve governance, identity, authority, and hosting decisions → threat-model authentication and tenant authorization → implement a scoped read-only portal and enrollment binding → validate sync/outbox/conflict recovery → add teacher-reviewed correction requests → pilot offline caching only after revocation and device policy are agreed.

## Evidence required before advancing a stage

For each implemented increment, publish source changes, migration and regression results, representative generated exports/backups, and explicit remaining limitations. Verify the actual serialized files and restored data, not just in-memory settings. Retain the distinction between automated local tests, browser/device observations, and institution-specific acceptance. Keep [QA status](qa-status.md), [teacher guidance](teacher-guide.md), and the [threat model](threat-model.md) aligned with shipped behavior; these proposals must not appear as completed capabilities until their acceptance criteria are exercised.
