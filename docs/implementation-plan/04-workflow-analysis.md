# 04 — Workflow analysis

## AS-IS

```mermaid
flowchart TD
  Open[Open application: all role modules loaded] --> Role{Student or teacher}
  Role -->|Student| ID[Enter ID and room challenge]
  ID --> QR[Display rotating QR]
  Role -->|Teacher| PIN[Unlock vault]
  PIN --> Roster[Import / compare / approve / save roster]
  Roster --> Fields[Template plus all report/session fields]
  Fields --> Type[Type fresh challenge and review start]
  Type --> Start[Explicitly create session]
  QR --> Scan[Scan / verify identity / save]
  Start --> Scan
  Scan --> Review[Manual corrections and disputes]
  Review --> Close[Confirm closure]
  Close --> Files[Export and encrypted backup]
```

## TO-BE

```mermaid
flowchart TD
  Open[Open lightweight student shell] --> Role{Choose workflow}
  Role -->|Student| Pass[ID + challenge, optional private-device memory]
  Pass --> QR[QR with teacher confirmation instructions]
  Role -->|Teacher| Load[Load teacher module with retry]
  Load --> PIN[Unlock with lifecycle-safe key handling]
  PIN --> Roster[Review roster additions / updates and explicitly save]
  Roster --> Template[Reuse template / enter course and section]
  Template --> Optional[Expand report details only when needed]
  Optional --> Fresh[Generate challenge / use current time / review readiness]
  Fresh --> Start[Explicitly create session]
  Start --> Scan[Scan with optional enumeration / manual fallback]
  QR --> Scan
  Scan --> Review[Review paged roster and complete audit history]
  Review --> Correct[Reasoned correction / dispute resolution]
  Correct --> Close[Confirm closure]
  Close --> Files[Complete exports and encrypted backup]
```

## Preserved checks

Roster changes still require explicit review and identity approvals. Challenge generation does not create a session. Optional report fields retain entered/template values. Corrections and dispute resolutions retain reasons/audit. Closure, deletion and restore retain confirmations. Pagination never filters exported data. Backup observations remain advisory, not proof a file is safely stored.
