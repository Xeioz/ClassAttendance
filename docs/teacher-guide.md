# Teacher guide

## Preparation

Open the institution's stable HTTPS website in the browser that will hold your records. No application installation is required. Check offline readiness while online, then test reopening the website without connectivity. Website resources and your local roster are separate prerequisites.

Create or unlock the teacher workspace using the Master PIN. Use a long random numeric PIN, keep the device locked, and store the secret securely. A forgotten secret cannot be reset to decrypt old records. The teacher view locks after 15 minutes without pointer or keyboard interaction.

## Roster and session

Import a CSV with `id,name,section` headers. Choose encoding if the preview looks wrong. Confirm special characters, IDs, section, row count and normalization before saving. Imports merge students in the same section and cannot run while a session is active.

Create a session for the correct course and section. Institution, subject and room improve exported reports. Verify the start time, displayed device timezone, grace period and room challenge. Announce the challenge to the class. The public challenge is not proof of identity.

## Scanning and manual fallback

Start the camera and permit the expected camera request. Choose another camera after stopping if needed. Torch appears only where supported. If native decoding fails, stop and enable compatibility decoder. Verify the student presenting the pass using the school's procedure.

Success means the local database transaction completed. "Not saved" requires retry or manual fallback. A duplicate is neutral confirmation; ordinary repeated camera frames should stay silent. Ask students to remove their pass from the view before the next presentation.

Use Manual check-in / correction or F2 for unavailable devices. Search the student, select present/late/excused or automatic timing, and enter a reason. To change an existing record, enable correction and choose a status. The camera pauses while the dialog is open. Escape closes the dialog when no save is pending.

## Disputes

A repeated ID does not prove wrongdoing. When the latest scan is a duplicate, enter a reason and flag a disputed check-in if identity is in question. The original attendance remains intact and both presentation times enter the audit history.

Visually verify identity, enter a resolution reason and resolve the review. If attendance itself needs changing, make a separate manual correction. Open disputes must be resolved before closing.

## Closure and reopening

Review "Not yet recorded" and unresolved disputes before confirming closure. Closure marks remaining students absent and makes the session read-only. Exporting does not change attendance state.

To change a closed session, enter a reopening reason. Other active sessions must be closed first. Reopening preserves recorded statuses and explicit teacher absences, while automatic closure absences return to not yet recorded. Close again when review finishes.

## Reports and recovery

Download Excel for the summary, complete roster and audit worksheet. CSV is a flat administrative roster export. Active-session exports clearly identify unfinished attendance. The attendance rate is `(present + late) / enrolled`; excused students remain in the denominator. Timestamps in downloads use UTC with the class timezone separately recorded.

Download an encrypted backup after class and keep it outside the recording device. Check browser downloads actually contains the file. Lock the workspace to access restoration. Choose the backup, enter its PIN, acknowledge full replacement and restore. Invalid files or wrong PINs should leave current data intact. Test restoration on a separate supported device before relying on it.

Do not clear browser website data to fix an error. Record the error, preserve backups, and seek support. Changing browser, origin, profile or device does not transfer local records automatically.
