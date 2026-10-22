# Storage and workflow contracts for this increment

This document describes the implemented data contracts for class templates, roster review, readiness evidence, and translation foundations. It is not a record of completed testing. See [QA status](qa-status.md) for verification and [the roadmap](next-release-roadmap.md) for features that remain proposals.

## Database upgrade and class templates

The IndexedDB database keeps the name `attendance-desk-v1`. [Dexie schema version 2](../src/db/db.ts) adds the `classTemplates` store with primary key `id`; the existing tables and indexes remain in place. Upgrading an existing version 1 database adds an empty store without rewriting roster, session, attendance, audit, or vault records. The database schema version, backup envelope version, cipher version, and vault metadata version are distinct contracts.

Templates are the only new persisted record type in this increment:

| Layer              | Stored fields                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Outer template row | Random UUID `id`, authenticated `encrypted` payload                                                                   |
| Encrypted template | `name`, `settings`, `createdAt`, `updatedAt`                                                                          |
| Encrypted settings | `course`, canonical `section`, optional `subject`, `room`, `institution`, integer `graceMinutes`, explicit `timezone` |

[Template operations](../src/domain/templates.ts) encrypt with the existing vault encryption key and authenticated context `class-template:${id}`. Names, class settings, and timestamps are not plaintext indexes. Template IDs and ciphertext remain visible as structural metadata, consistent with the existing [threat model](threat-model.md).

Templates exclude session IDs, start times, room challenges, roster snapshots, attendance, and audit history. Applying defaults does not retain a live relationship between a session and its source template. Editing or deleting the template therefore does not rewrite existing sessions.

Session start input is interpreted in the device timezone and stored as an absolute timestamp. The explicit class/report timezone is a separate display/report setting; editing it does not reinterpret the start input. Selecting a template resets the start input to the current device time and clears the room challenge. Duplicating copies the persisted template, not unsaved form edits.

[Shared class validation](../src/domain/classSettings.ts) trims text, canonicalizes sections, accepts course/section/template names of 1–100 characters, optional descriptive fields up to 150 characters, integer grace periods of 0–180 minutes, and a timezone accepted by `Intl.DateTimeFormat`. Saved templates require an explicit timezone. Recovery additionally rejects unexpected template/settings fields and invalid or reversed timestamps. Template updates check that the stored row has not changed since it was read for that save; writes check the active vault salt.

## Backup versions and atomic replacement

[Export](../src/db/backup.ts) takes a consistent read transaction across vault metadata and all five data tables, validates the snapshot, and emits an envelope with `format: "attendance-desk"`, `v: 2`, `meta`, and an encrypted `payload`. The payload authentication context is `backup:v2`. New payloads require a `classTemplates` array, even when it is empty. Vault metadata and individual ciphers remain version 1.

| Input backup                                                                                  | Restore behavior                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Valid version 1, `backup:v1` context, no templates                                            | Restore existing records and initialize templates to an empty array |
| Valid version 1 with an explicit empty templates array                                        | Accept as legacy data with no templates                             |
| Version 1 claiming nonempty templates                                                         | Reject; templates require envelope version 2                        |
| Valid version 2, `backup:v2` context, templates array present                                 | Validate and restore all tables, including templates                |
| Unknown envelope version, missing version 2 templates, invalid encrypted fields, or wrong PIN | Reject before replacement                                           |

[Runtime validation](../src/db/backupValidation.ts) authenticates and validates every supported record shape and relationship, including templates and supported legacy audit formats. Existing limits remain 25 MiB for the file, 100,000 rows per table, and 10,000 students per session snapshot. Template validation follows the same limit applied to other tables.

Only after validation succeeds does one read/write transaction clear and replace `meta`, `students`, `sessions`, `attendance`, `scanEvents`, and `classTemplates`. A failed write rolls back the transaction. Restoration is complete replacement, not history merging: restoring an old backup removes current templates and any records not contained in that backup. New backup files are not promised to open in older application versions that support only envelope version 1.

## Roster review and concurrent writes

[CSV inspection](../src/utils/csv.ts) retains row-level problems for review, preserves strings such as leading-zero IDs, and supports UTF-8 with a Windows-1252 fallback or an explicit encoding choice. File size is limited to 5 MiB and imports to 1–10,000 data rows. Headers are normalized to locate `id,name,section`; logical CSV record numbers include the header and need not equal physical lines when quoted fields contain newlines.

[Import review](../src/domain/rosterImport.ts) categorizes rows as added, updated, unchanged, invalid, or conflicting. Identity remains canonical section plus canonical student ID. A repeated identity within the input file marks all matching rows as conflicts, including exact duplicates; there is no implicit winner. Existing-row comparisons include name and displayed ID. Every updated row requires explicit acknowledgement. Any invalid/conflicting row or missing update acknowledgement blocks the entire commit.

The review captures a deterministic comparison token over the current encrypted roster. [Roster save](../src/domain/attendance.ts) checks the expected token, encrypts additions/changes, and checks the roster again inside the write transaction. It also verifies the vault salt and absence of an active session. Changed rows are merged; unchanged ciphertext and omitted students are preserved. A stale comparison throws `StaleRosterPreviewError` with code `ROSTER_CHANGED`; refreshing comparison requires renewed review and acknowledgements.

Session creation compares the selected section against the roster reviewed in the form, reads a fresh roster snapshot, encrypts the proposed session, then verifies that same roster within the transaction that adds the session. A stale form or concurrent roster change produces `ROSTER_CHANGED`, and a competing active session blocks creation. Existing session snapshots remain independent of subsequent imports. Review state, row approvals, search filters, and comparison tokens are temporary UI state, not new database records or backup contents.

## Readiness evidence and its lifetime

[Readiness observations](../src/domain/readiness.ts) are memory-only. They are not stored as classroom certification, reminder schedules, or durable backup history. Readiness does not add a database table or change backup payloads.

| Observation                        | Evidence and limitation                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Class configuration/roster/session | Current inputs, matching roster, pending review, and active-session state; domain transactions still enforce commit-time rules |
| Camera permission                  | Browser-reported permission, if available; not proof the camera opens                                                          |
| Camera test                        | Explicit `getUserMedia` attempt with tracks released; does not test QR decoding or a classroom camera workflow                 |
| Storage                            | Passive persistence status and capacity estimates when supported; missing/failed APIs remain unknown and estimates can change  |
| Offline resources                  | Active service worker scope plus cached asset checklist and required responses; not a physical cold-launch test                |
| Backup activity                    | Download request and completed restore timestamps observed on this page, keyed by vault salt                                   |

The checklist distinguishes ready, needs attention, not checked, and not applicable. Required class/roster/session conditions block session creation. Device and backup checks are advisory, leaving manual attendance available if camera access fails. Camera access is requested only through an explicit camera action; passive readiness refresh does not request it.

Backup activity survives component remounts within the same page but resets on page reload and is not synchronized across tabs. A request is not proof of a retained file, and a completed local restore is not evidence of second-device recovery. There are no recurring reminders, background notifications, retained backup revision ledger, or isolated guided-recovery workflow in this increment.

## Translation and accessibility scope

[Translation resources](../src/i18n/index.ts) are statically imported so shipped strings are available offline. English is the sole supported locale. Lookup attempts the requested locale, its base language, and English fallback; an unknown key remains a visible diagnostic, and missing interpolation values remain visible placeholders. Institution-specific languages require a later decision and reviewed dictionaries.

Only presentation strings are translated. Persisted identifiers, status values, schema keys, audit actions, and export column contracts stay canonical. The foundation does not claim every historical string is extracted or that additional languages are complete.

Form labels, field-associated validation, keyboard navigation, focus handling, live status messages, and non-color-only feedback support the changed workflows. These implementation choices do not constitute a general accessibility certification; browser, keyboard, screen-reader, and deployment observations belong in the verification report.
