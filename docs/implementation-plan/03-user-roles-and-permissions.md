# 03 — User roles and permissions

| Capability | Student view | Locked teacher view | Unlocked teacher workspace |
| --- | --- | --- | --- |
| Enter own ID/challenge and display QR | Yes | Navigate to student view | Navigate to student view |
| Remember/forget student ID | Optional local storage | No teacher identity implication | No teacher identity implication |
| Create/unlock local vault | No | PIN form | Lock first to unlock again |
| View encrypted teacher records | No | No | Decrypted using in-memory keys |
| Import/review roster | No | No | Yes, with session/staleness guards |
| Manage templates | No | No | Yes |
| Create/scan/correct/close/reopen | No | No | Domain guards and required reasons apply |
| Download reports/backups | No | No | Yes; reports contain plaintext personal data |
| Replace workspace from backup | No | File + backup PIN + explicit replacement acknowledgment | Lock before restore |
| Check offline resources | Yes | Yes | Yes |

These are workflows, not centrally authenticated roles. Frontend navigation is not authorization. Protection comes from encrypted local records and possession of vault keys; `TEACHER_PIN` identifies local unlock authority rather than an independently verified teacher account.

No administrator role is needed for this single-vault local deployment. True multi-user operation would require an institutional identity provider, verified principal identifiers, server-side authorization, trusted synchronization, account recovery, audit ownership, retention policy and a migration/recovery plan before implementation.

The student interface does not gain access to roster names or attendance history. Room challenge generation provides convenient shared session input; it does not authenticate students. Switching away from the teacher workspace unmounts it and requires PIN unlock on return.
