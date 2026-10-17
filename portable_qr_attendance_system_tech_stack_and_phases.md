# TECHNICAL STACK AND IMPLEMENTATION PHASES
## Portable QR Web-Based Student Attendance System

**Version:** 3.0  
**Status:** Proposed technical baseline; validation required  
**Delivery:** Browser-accessed HTTPS website with offline caching  
**Implementation focus:** Phases 1–2  
**Excluded:** Native mobile applications, app-store distribution, and mandatory installation

## 1. System boundary

Teachers and students use a website in a supported browser. Desktops, laptops, tablets, and phones are possible access devices; phone access does not make this a mobile app. Installation and Add to Home Screen are not prerequisites.

The teacher's browser stores the local authoritative records. Student browsers display QR payloads. The camera transfers the displayed data optically; devices do not need to communicate over a classroom network. Initial access, cache preparation, and website updates require connectivity.

The baseline is single-teacher-device operation. Cross-device synchronization and centralized school administration are excluded. Browser storage must not be represented as an institution-wide database.

## 2. Stack and selection rules

| Layer | Selection | Required implementation rule |
| --- | --- | --- |
| Interface | React + TypeScript + Vite | Pin maintained versions; keep domain logic outside components |
| Styling | Bundled Tailwind CSS | Explicit tokens; responsive browser layouts; measured accessibility |
| Offline website | vite-plugin-pwa / Workbox | Cache all required resources; verify readiness; defer updates during active sessions |
| Local database | Dexie / IndexedDB | Transactional integrity, versioned migrations, explicit write failures |
| Cryptography | WebCrypto | Random data key, passphrase protection, unique AES-GCM IVs, defined envelopes |
| CSV ingestion | PapaParse | Encoding choice/preview, column mapping, validation, atomic import |
| QR rendering | qrcode | Versioned payload, high contrast, quiet zone, bounded content size |
| QR decoding | Native detector when supported, one evaluated fallback | Bundle fallback workers/WASM; verify offline decoding on real devices |
| Feedback | Accessible status UI; optional Web Audio | Announce success only after save; sound off/mute available |
| Optional device features | Screen wake lock, torch, vibration | Feature-detect and handle denial/unavailability |
| Phase 3 reports | Evaluated spreadsheet library + CSV | Pin reviewed dependency source/version; prevent formula interpretation |

Do not bundle multiple overlapping fallback engines without evidence that they are necessary. Tailwind, a directory tree, or a library choice does not establish accessibility, security, or correctness.

## 3. Architecture boundaries

```text
Browser UI
  -> application operations
     -> domain validation and attendance rules
     -> adapters: database, crypto, camera, cache, backup, clock
```

- UI components render state and invoke operations.
- Domain rules determine valid sessions, attendance transitions, ID policy, and timing.
- Application operations coordinate validation, transactions, and feedback.
- Adapters implement browser-specific behavior and expose explicit capability/failure results.
- The database is authoritative for committed attendance. React counters are derived views, not independent sources of truth.
- A single scan-processing queue controls asynchronous decoder callbacks. Effect cleanup stops camera tracks, timers, decoder work, and event listeners.

## 4. Domain and persistence contracts

| Entity | Purpose / invariant |
| --- | --- |
| Student | Institution-scoped identity; preserves original ID and validated canonical ID |
| Course offering | Course, section, term, and institutional context |
| Enrollment | Relates a student to an offering; supports multiple enrollments |
| Attendance session | Unique ID, offering, challenge, time policy, roster snapshot, active/closed state |
| Scan event | Bounded record of a processed scan attempt and its outcome; repeated camera frames are suppressed |
| Attendance record | One current result per session enrollment |
| Correction event | Previous/new values, local actor context, reason, and teacher-device timestamp |

Attendance outcomes are `PRESENT`, `LATE`, `ABSENT`, and `EXCUSED`. Before finalization, an enrollment without an attendance result is shown as `NOT_YET_RECORDED`. Dispute review is modeled separately from attendance outcome.

### 4.1 Integrity rules

- Enforce uniqueness of `(sessionId, enrollmentId)` transactionally, including simultaneous attempts.
- Keep scan events separate from current attendance so retries do not inflate counts.
- Validate that enrollment belongs to the session roster snapshot.
- Block ambiguous canonical IDs during import; do not silently merge them.
- Define closure and correction rules, including whether reopening is allowed.
- Reject further automatic attendance writes to closed sessions.
- Detect conflicting browser tabs; use a supported locking mechanism with a tested fallback and database invariants as the final protection.
- Describe local audit records as traceability, not independently tamper-proof evidence.

### 4.2 Encrypted storage contract

Persisted private records use a versioned envelope containing encryption metadata and ciphertext. Specify record type/identity binding through authenticated additional data, fresh IV generation, and key versioning. Document every unencrypted index and its privacy implications. Keep decrypted display models distinct from persisted records.

Protect a random data key using a strong teacher passphrase and a benchmarked, versioned KDF. Store only the required salt, KDF parameters, and wrapped/encrypted key material. Do not use a six-digit PIN as the only encryption secret. Define passphrase changes, lock behavior, data migration, and recovery before implementation.

Browser persistence is requested only where supported and its result is displayed honestly. Handle quota exhaustion and failed transactions. No unlimited-storage or zero-loss guarantee is made.

## 5. QR protocol and identity policy

The initial mode is unsigned, teacher-supervised identity verification. QR payloads are not authentication credentials.

```typescript
export interface StudentQRPayloadV1 {
  v: 1;
  id: string;          // Institution-approved canonical ID
  challenge: string;   // Public session selector; not an identity secret
  generatedAt: number; // Unix seconds; freshness input only
}
```

Before coding, define maximum payload size, field lengths, permitted characters, challenge format, uniqueness within active operation, freshness tolerance, future-time rejection, and version compatibility. The teacher resolves the challenge to exactly one active local session. Reject wrong or ambiguous matches.

An optional refresh indicator must not claim to stop screenshots, impersonation, or relay. Lateness uses the teacher's attendance timestamp, not `generatedAt`. Device-key generation and optional signature fields are removed from Phase 1–2; a later signed protocol requires a separately versioned design and verified enrollment process.

## 6. Phase 1 — Web foundation, offline readiness, and student pass

### Objective

Deliver a browser-accessed website that can display student passes offline after verified preparation. No mobile application or installation flow is part of this milestone.

### Work packages

1. **Contracts and foundation**
   - Finalize domain vocabulary, ID rules, QR schema, and supported capability baseline.
   - Initialize React/TypeScript/Vite and pin dependencies with a lockfile.
   - Define responsive typography, spacing, colors, focus, and component states.
2. **Offline website**
   - Bundle required assets locally; avoid runtime CDN dependencies.
   - Cache the website shell and required routes/resources.
   - Report readiness only after checks; distinguish internet status from verified cache readiness.
   - Define update notification and defer activation while attendance is active.
3. **Student journey**
   - Validate IDs using institutional rules, preserving leading zeros and original formatting.
   - Offer explicit optional ID memory and a forget/change action.
   - Collect the session challenge and show clear presentation instructions.
   - Render QR with a four-module quiet zone and adaptive size; do not guarantee readability through damaged screens.
   - Explain that attendance is confirmed by the teacher after saving.
4. **Capabilities and accessibility**
   - Optional wake lock with release/reacquisition handling; provide brightness guidance rather than promising brightness control.
   - Handle narrow/wide viewports, enlarged text, keyboard access, screen readers, and reduced motion.

### Phase 1 acceptance gate

- Cold launch works offline in the prepared browser after closing the website.
- Missing/unavailable cached resources produce a clear recovery path.
- Student ID validation rejects invalid and ambiguous values without destructive normalization.
- QR contract fixtures parse consistently, including boundary and malformed cases.
- Student journey works without installation and without wake-lock support.
- Accessibility checks cover actual rendered screens, not labels alone.

**Not delivered in Phase 1:** authenticated student identity, official attendance collection, or demonstrated classroom throughput.

## 7. Phase 2 — Complete teacher attendance and recovery workflow

### Objective

Deliver one complete local attendance cycle: unlock, import, start, scan/manual entry, correct, close, back up, and restore.

### Work packages

1. **Encrypted teacher records**
   - Implement the defined key lifecycle and encrypted envelopes.
   - Keep teacher records locked until successful unlock; handle wrong secrets without damaging data.
   - Check storage capability, persistence status, quota, and write errors.
2. **Roster import and administration**
   - Provide a browser file picker; drag-and-drop is an enhancement.
   - Support explicit encoding selection and preview; do not assume automatic encoding detection.
   - Map columns, report row errors, validate IDs, and detect collisions/duplicates.
   - Define merge/replace semantics and commit atomically after confirmation.
   - Preserve historical session membership when editing current rosters.
3. **Session lifecycle and timing**
   - Select offering; create unique session, challenge, start time, timezone, and grace period.
   - Resume the existing session after reload.
   - Define multiple-session and multiple-tab conflict handling.
   - Specify late-cutoff and queue fairness policies; detect/report suspicious teacher clock changes.
4. **Camera and manual attendance**
   - Request camera access through an explicit action; offer usable camera selection.
   - Use the capability-tested decoder and fully cached fallback resources.
   - Serialize validation and commit attendance transactionally.
   - Suppress repeated frames without treating ordinary rescans as misconduct.
   - Search the roster for manual check-in; require reasons for corrections.
   - Keep unlisted encounters pending instead of silently adding official enrollment.
5. **Feedback and review**
   - Show pending save, saved result, or explicit failure; counters follow committed data.
   - Keep manual fallback accessible from scanning.
   - Separate active scanner layout from roster administration and detailed reporting.
   - Show "Not yet recorded" until finalization; define how pending disputes affect closure.
6. **Closure and recovery**
   - Review pending work and confirm closure before applying absence rules.
   - Export a versioned encrypted backup containing all required database and decryption metadata.
   - Validate backup authentication/schema before replacing data; preserve current data if restoration fails.
   - Restore onto a second supported device using the documented secret/recovery material.
   - Clearly explain local-only storage, backup age, and unrecoverable-secret consequences.

### Phase 2 acceptance gate

| Scenario | Required result |
| --- | --- |
| Same student decoded concurrently | One attendance record; consistent committed counters |
| Database write rejected / quota exhausted | No saved-success feedback; explicit recovery path |
| Reload during active session | Correct session and committed attendance restored |
| Wrong/expired/future/malformed QR | Bounded validation failure without scanner crash |
| Camera permission denied / unreadable display | Manual check-in remains usable |
| Invalid CSV / normalization collision | Import rejected or corrected before any destructive commit |
| Roster edited after attendance | Historical session roster remains stable |
| Session closes at late boundary | Defined policy applied consistently |
| Second tab attempts writes | Conflict handled without duplicate attendance |
| Website update becomes available | No forced activation during active collection |
| Backup corrupt / wrong secret | Restore rejected; existing data preserved |
| Valid backup moved to second device | Records and session history restored correctly |

Test committed-record recovery separately from abrupt-power-loss durability. The system must not promise recovery of writes that never completed or records lost through device destruction without a backup.

## 8. Later phases

### Phase 3 — Reports and administrative refinement

Add formatted Excel/CSV export, historical summaries, and evaluated teacher workflow improvements. Specify encoding, formula-injection defenses, download behavior, personal-data handling, and attendance-rate definitions. Reporting is derived from attendance records rather than raw scan-event counts.

### Phase 4 — Expanded field validation and documentation

Run diverse-browser and classroom evaluations. Measure complete attendance-taking time, first-read success, retries, manual exceptions, battery/thermal behavior, and teacher workload. Publish actual results and limitations. Complete deployment, privacy, backup, recovery, and user documentation.

Failure testing, privacy decisions, and initial browser verification occur during Phases 1–2 rather than being postponed to Phase 4.

## 9. Suggested source structure

```text
src/
  ui/
    student/
    teacher/
    shared/
  domain/
    identity.ts
    session.ts
    attendance.ts
    qrProtocol.ts
  application/
    importRoster.ts
    recordAttendance.ts
    correctAttendance.ts
    closeSession.ts
    restoreBackup.ts
  adapters/
    database/
    crypto/
    camera/
    offline/
    backup/
    clock/
```

This structure is guidance, not proof of clean architecture. Verify dependency direction and transaction ownership in implementation review.

## 10. Deployment and browser policy

Host the website on a stable HTTPS origin. Configure service-worker scope and asset paths for that host. Changing origins can strand existing browser data, so migration must be planned before a hosting/domain change.

Evaluate Content Security Policy, safe rendering of imported data, dependency provenance, and avoidance of unnecessary third-party scripts. The baseline has no classroom backend, but hosting and software updates remain operational dependencies.

Publish a browser matrix only after tests. Record browser/OS versions, normal-tab behavior, cold offline launch, storage/persistence, camera decoding, backup restoration, and accessibility results. Optional features must never prevent the core manual workflow.

## 11. Reference basis

- Privacy obligations: https://privacy.gov.ph/implementing-rules%20regulations-data-privacy-act-2012/
- Browser storage behavior: https://webkit.org/blog/14403/updates-to-storage-policy/
- Encryption design: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- CSV parser capabilities: https://www.papaparse.com/docs
- Accessibility criteria: https://www.w3.org/TR/WCAG22/
