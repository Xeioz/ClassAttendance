# Teacher guide

## Preparation

Open the institution's stable HTTPS website in the browser that will hold your records. No application installation is required. Check offline readiness while online, then test reopening the website without connectivity. Website resources and your local roster are separate prerequisites.

Choose **I am a Teacher**, then create or unlock the teacher workspace using the Master PIN. Use a long random numeric PIN, keep the device locked, and store the secret securely. A forgotten secret cannot be reset to decrypt old records. The teacher view locks after 15 minutes without pointer or keyboard interaction.

## Roster and session

The first-use screen starts with **Import master list**. Choose a CSV or Excel (`.xlsx`/`.xls`) file, confirm the worksheet where applicable, and review automatic column matching. Missing columns are left unmapped rather than guessed.

In the preview, fill required course, section and term values for each proposed class. Correct any missing/invalid student IDs or names directly in the student rows. Use **Fill shared blanks across all classes** to apply course, section, term or institution only where empty; imported values are retained. Optional subject, institution and room fields may stay blank. Saving stays disabled until every required field and conflict is resolved, including rows on other pages/classes.

**Confirm and save master list** creates or matches classes by course + section + term and adds enrollment in one transaction. Omitted enrollment is retained, and matched classes keep their current defaults. The same student can belong to multiple courses; duplicate enrollment within one class and conflicting names must be resolved. Close active sessions before importing. Your corrections remain editable after a save error, but an unsaved draft is only in the unlocked page and is lost when leaving/reloading or locking.

Download a basic or complete CSV template from the importer, or use the existing CA sample and fill its missing course/term. **Add class manually** and each class's existing three-column CSV importer remain available as secondary workflows. See [master-list import](master-list-import.md) for limits and column aliases.

From **Overview**, choose **Start attendance** for that class. A room challenge is generated once and can be changed before starting. Institution, subject and room improve exported reports. Verify the start time, displayed device timezone, grace period and room challenge. Announce the challenge to the class. The public challenge is not proof of identity.

## Scanning and manual fallback

Start the camera and permit the expected camera request. Choose another camera after stopping if needed. Torch appears only where supported. If native decoding fails, stop and enable compatibility decoder. Verify the student presenting the pass using the school's procedure.

Success means the local database transaction completed. "Not saved" requires retry or manual fallback. A duplicate is neutral confirmation; ordinary repeated camera frames should stay silent. Ask students to remove their pass from the view before the next presentation.

Use Manual check-in / correction or F2 for unavailable devices. Search the student, select present/late/excused or automatic timing, and enter a reason. To change an existing record, enable correction and choose a status. The camera pauses while the dialog is open. Escape closes the dialog when no save is pending.

## Disputes

A repeated ID does not prove wrongdoing. When the latest scan is a duplicate, enter a reason and flag a disputed check-in if identity is in question. The original attendance remains intact and both presentation times enter the audit history.

Visually verify identity, enter a resolution reason and resolve the review. If attendance itself needs changing, make a separate manual correction. Open disputes must be resolved before closing.

## Closure and reopening

Choose **Review attendance** to pause the camera. Review "Not yet recorded" and unresolved disputes before confirming closure. Closure marks remaining students absent and makes the session read-only. Exporting does not change attendance state.

To change a closed session, enter a reopening reason. Other active sessions must be closed first. Reopening preserves recorded statuses and explicit teacher absences, while automatic closure absences return to not yet recorded. Close again when review finishes.

## Reports and recovery

Download Excel for the summary, complete roster and audit worksheet. CSV is a flat administrative roster export. Active-session exports clearly identify unfinished attendance. The attendance rate is `(present + late) / enrolled`; excused students remain in the denominator. Timestamps in downloads use UTC with the class timezone separately recorded.

Use **Backup & storage** to download an encrypted backup after class and keep it outside the recording device. Check browser downloads actually contains the file. Lock the workspace to access restoration. Choose the backup, enter its PIN, acknowledge full replacement and restore. Invalid files or wrong PINs should leave current data intact. Test restoration on a separate supported device before relying on it.

Do not clear browser website data to fix an error. Record the error, preserve backups, and seek support. Changing browser, origin, profile or device does not transfer local records automatically.

## Existing prototype records

The additive database upgrade preserves the vault and original records. **Unassigned records** holds old sessions until you create a matching class and associate them explicitly. Historical association does not automatically copy enrollment. Review existing section students in the class Roster screen before adding them. You can resume an unassigned active session immediately and close it before importing enrollment.

Version 2 backups include class metadata and enrollment; version 1 backups remain supported and restore as unassigned history. After restoration the PIN screen refreshes; unlock with the archive's PIN. Close other tabs before restoring or upgrading. Do not redeploy prototypeV1 against an upgraded database as a downgrade strategy; preserve a verified v1 backup before upgrading and use a separate test origin/browser for a v1 recovery drill.

## Navigation and layout

On wide screens the class list sits beside the current task. On narrow screens choose a class, then use **Back to classes**. The same scanner instance reflows across widths. In-progress teacher operations temporarily block role changes, navigation and explicit locking. Browser/OS termination can still interrupt the page; reopen and inspect committed records rather than assuming an unfinished confirmation was saved.

Class Defaults changes affect future sessions only. Start time uses the device's local clock; report timezone controls report date grouping. Processed attendance includes explicit absent and excused decisions and does not prove physical arrival.
