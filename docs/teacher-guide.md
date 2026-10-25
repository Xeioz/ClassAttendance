# Teacher guide

## Preparation

Open the institution's stable HTTPS website in the browser that will hold your records. No application installation is required. Check offline readiness while online, then test reopening the website without connectivity. Website resources and your local roster are separate prerequisites.

Create or unlock the teacher workspace using the Master PIN. Use a long random numeric PIN, keep the device locked, and store the secret securely. A forgotten secret cannot be reset to decrypt old records. The teacher view locks after 15 minutes without pointer or keyboard interaction.

You can bookmark the website with `#teacher` to open the teacher entry directly. Switching to Student pass discards the unlocked teacher view; returning requires the PIN again. Expiry is also checked when a suspended page resumes. If the teacher module cannot load, use **Retry teacher workspace** to reload its entry; this does not clear local records.

## Review and import the roster

Import a CSV with `id,name,section` headers. Choose encoding if the preview looks wrong. Confirm special characters, IDs, section, row count and normalization before saving. Student matching uses section plus canonical ID; a name is not an identity key. Imports cannot run while a session is active.

Review the counts for added, updated, unchanged, invalid, and conflicting rows. Search, category filters, and Previous/Next controls let you inspect every row. Compare both the displayed and canonical matching ID. For each updated student, review the before/after details and explicitly acknowledge the update. Duplicate canonical IDs within the same section are conflicts, even if their displayed spelling differs.

Fix invalid or conflicting rows in the CSV and load it again. Import is all-or-nothing: valid rows are not silently saved while other rows fail. Changing encoding reparses the file and requires a fresh review. Saving merges the entire reviewed file, including rows outside the current search. Existing students omitted from the file remain in the roster; importing is not deletion. Existing session rosters and attendance history are preserved.

If another tab changes the roster after preview, the save is rejected and the application refreshes the comparison. Review the new differences and acknowledge updates again before retrying. If refreshing fails, reload the file. Cancel an unused preview before starting a session.

## Class templates and session preparation

Save reusable course, section, subject, room, institution, grace period, and timezone settings as a named class template. Templates can be selected, updated, duplicated, and deleted. Deleting a template does not delete a session or attendance. Templates remain encrypted in this browser and travel with new encrypted backups.

Enter a section or choose a current suggestion. You can save a future class template before importing students; starting attendance still requires a saved roster for that section. **Reload saved settings** discards the current template draft and reloads its latest saved version. If another tab changes a template, review that version before retrying an update or removal.

A template supplies editable defaults for a new session. Selecting one loads its settings, resets the start time to the current device time, and clears the room challenge; it does not create a session. It does not store the session start time, room challenge, roster, or attendance, and changing it does not alter sessions already created. Review the current roster for the selected section and choose fresh session details each time. A template section missing from the current roster must be imported or changed before starting.

Use **Update selected template** to retain edits, or **Save as new template** to keep a separate version. **Duplicate saved template** copies the saved settings, so save edits first if you want them included. Removing a template requires confirmation; **Keep template** cancels removal. Template editing remains available while a session is active.

Create a session for the correct course and section. Institution, subject and room improve exported reports. The start-time field uses the displayed device timezone. **Class and report timezone** is a separate setting; changing it does not reinterpret the entered start time. Verify both, the grace period, and the room challenge before choosing **Create attendance session**. Announce the challenge to the class. The public challenge is not proof of identity.

Expand **Report details and timezone (optional)** to review those report fields. Collapsing it retains all entered or template values. **Generate room challenge** fills a fresh six-digit challenge, and **Use current time** refreshes the start draft. Review both before explicitly creating the session; these buttons do not start attendance.

## Pre-class readiness

Use the readiness checklist before starting. Class settings, a matching roster, completion or cancellation of roster review, and absence of another active session are required. If the roster changes while a session is being prepared, review the refreshed roster and retry; the application does not commit a session using a stale roster snapshot.

Device checks show **Ready**, **Needs attention**, **Not checked**, or **Not applicable**, with explanations. Camera permission, actual camera access, and QR decoding are separate checks. Choose **Test camera** to request access; a successful test opens the camera and releases its tracks, but does not establish successful QR decoding. Camera failure leaves manual attendance available.

Storage estimates can change, and persistent-storage permission does not replace backups. Offline readiness checks cached website resources; separately test a cold offline launch at the deployed address. A network connection alone does not establish offline readiness.

Backup evidence includes only download requests and completed restores observed on the current page for the current vault. Reloading loses this activity record. A download request does not prove that a file was kept safely, and a restore in this browser does not prove recovery on another device. Earlier activity and second-device recovery remain unknown. These are advisory observations, not scheduled backup reminders or a recovery certification.

## Scanning and manual fallback

Start the camera and permit the expected camera request. Choose another camera after stopping if needed. Torch appears only where supported. If native decoding fails, stop and enable compatibility decoder. Verify the student presenting the pass using the school's procedure.

Success means the local database transaction completed. "Not saved" requires retry or manual fallback. A duplicate is neutral confirmation; ordinary repeated camera frames should stay silent. Ask students to remove their pass from the view before the next presentation.

Use Manual check-in / correction or F2 for unavailable devices. Search the student, select present/late/excused or automatic timing, and enter a reason. To change an existing record, enable correction and choose a status. The camera pauses while the dialog is open. Escape closes the dialog when no save is pending.

## Disputes

A repeated ID does not prove wrongdoing. When the latest scan is a duplicate, choose Review duplicate check-in to hold that student's identity and both presentation times. The camera pauses while you enter a reason. A scan already saving may finish, but it cannot change the review target. Save to flag the dispute or cancel to discard the draft and resume scanning. A failed save retains the draft for retry. The original attendance remains intact and both presentation times enter the audit history.

Visually verify identity, enter a resolution reason and resolve the review. If attendance itself needs changing, make a separate manual correction. Open disputes must be resolved before closing.

## Closure and reopening

Review "Not yet recorded" and unresolved disputes before confirming closure. Closure marks remaining students absent and makes the session read-only. Exporting does not change attendance state.

To change a closed session, enter a reopening reason. Other active sessions must be closed first. Reopening preserves recorded statuses and explicit teacher absences, while automatic closure absences return to not yet recorded. Close again when review finishes.

## Reports and recovery

Use Previous page / Next page to browse attendance and audit tables. Search applies to all rows before pagination; downloads still include the complete session. Audit pagination exposes events beyond the first 100.

Download Excel for the summary, complete roster and audit worksheet. CSV is a flat administrative roster export. Active-session exports clearly identify unfinished attendance. The attendance rate is `(present + late) / enrolled`; excused students remain in the denominator. Timestamps in downloads use UTC with the class timezone separately recorded.

Downloads always include the full selected session; on-screen roster search does not filter exports. Excel separates Summary, Attendance, Audit trail and Report info, with frozen headers and wrapped names/reasons. Match records across sheets using the explicitly labeled canonical ID; the displayed ID preserves the official spelling. See [schema compatibility](export-schema.md) for changed XLSX row positions. CSV columns are unchanged.

Download an encrypted backup after class and keep it outside the recording device. Check browser downloads actually contains the file. Lock the workspace to access restoration. Choose the backup, enter its PIN, acknowledge full replacement and restore. Invalid files or wrong PINs should leave current data intact. Test restoration on a separate supported device before relying on it.

Backups are validated before download and before replacement, including the supported size/count limits. New backups include class templates. Supported older backups still restore but contain no templates; restoring one replaces the current templates with an empty set. Restoration replaces the whole local workspace, rather than merging it. A successful restore immediately shows Unlock teacher workspace; enter the backup's PIN without reloading. An error identifies the affected table/field without printing private values. If a backup exceeds supported limits, preserve the workspace and seek an evaluated archive/migration plan.

Do not clear browser website data to fix an error. Record the error, preserve backups, and seek support. Changing browser, origin, profile or device does not transfer local records automatically.

## Keyboard access and language

Use **Skip to content** and the keyboard to navigate forms and controls. Validation identifies affected fields and provides readable messages; status updates do not depend only on color or sound. Manual attendance remains available with F2. Review the field explanation before retrying a rejected action.

English is the shipped interface language. The application has a translation-resource foundation with English fallback; institution-specific languages and translations have not been selected or delivered. Persisted attendance statuses, identifiers, and export column meanings remain canonical.
