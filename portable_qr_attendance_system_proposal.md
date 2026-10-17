# PROJECT PROPOSAL: PORTABLE QR WEB-BASED STUDENT ATTENDANCE SYSTEM

**Version:** 3.0 — Revised web-system scope and Phase 1–2 baseline  
**Status:** Proposed; implementation and field validation required  
**Target environment:** Philippine higher-education classrooms with intermittent connectivity  
**Users:** Teachers and students  
**Delivery:** HTTPS website accessed through a supported web browser  
**Scope clarification:** This is a web-based system. It is not a mobile application, native application, or app-store product. Installation and Add to Home Screen are not required.

## 1. Purpose and problem

The system records classroom attendance using QR codes displayed on a student's browser and read by a teacher's browser-connected camera. It replaces handwritten attendance transcription and supports roster-based attendance review.

Manual roll call can interrupt instruction and produce transcription errors. Network-dependent attendance websites can become unavailable in classrooms with weak connectivity. This proposal addresses those problems through local browser processing and an offline-capable website.

Time savings, scanning throughput, browser compatibility, and recovery reliability are evaluation targets, not established results.

## 2. Proposed web-based solution

- Teachers open the website, unlock their local records, import a validated class roster, and create an attendance session.
- Students open the website in a browser, confirm their student ID, enter the session challenge, and display a QR code.
- Teachers scan the QR, verify the student presenting it, and receive confirmation only after attendance is saved successfully.
- Manual check-in supports students who cannot display a QR code.
- Teachers review unresolved entries, close the session, and create an encrypted backup.

The website can be used on desktops, laptops, tablets, and phones with compatible browsers. Teacher scanning requires a usable camera. A phone browser may be convenient for scanning, but no mobile app is developed or installed. Students without suitable devices use the manual attendance procedure.

### 2.1 Offline conditions and limits

The initial website visit and any updates require internet access. Offline operation requires successful caching of the required website resources in that same browser and origin. A service worker provides offline website caching; this does not require installation as an app.

Before class, a readiness check must verify cached resources, browser storage, required camera capability, and access to the local roster. Clearing website data, changing browsers or devices, or changing the website origin can remove access to previously cached resources and local records.

No inter-device network connection is required for QR scanning. Offline readiness must be demonstrated through cold browser launches without connectivity. It must not be inferred solely from a service-worker registration or a loaded page.

## 3. Objectives and boundaries

### 3.1 Objectives

1. Record attendance against the correct roster and session.
2. Operate offline after verified preparation.
3. Avoid duplicate attendance records through transactional validation.
4. Provide a complete manual fallback and correction workflow.
5. Protect stored records and provide tested backup and restoration.
6. Evaluate classroom time, first-read success, accessibility, and teacher workload against a measured manual baseline.

### 3.2 Included in the Phase 1–2 baseline

- Browser-accessed teacher and student interfaces.
- Offline website caching and readiness checks.
- Student QR generation with a versioned payload.
- Teacher-supervised identity verification.
- Encrypted local teacher records.
- CSV import with preview, field mapping, validation, and collision detection.
- Session creation, resumption, closure, and configurable lateness rules.
- Camera scanning, manual check-in, duplicate handling, and reasoned corrections.
- Local attendance review and encrypted backup/restore.

### 3.3 Excluded or deferred

- Native mobile applications, app-store distribution, and mandatory website installation.
- Biometric verification or automated proof of physical presence.
- Claims of fraud-proof attendance or screenshot prevention.
- Student device enrollment and cryptographic device authentication in the initial baseline.
- Cloud accounts, centralized synchronization, and simultaneous attendance collection across teacher devices.
- Formatted Excel reports and expanded reporting until a later phase.

## 4. Roles and authority

### Teacher

The teacher controls records stored in their browser after unlocking the local encrypted data. They import rosters, manage sessions, scan or manually record attendance, verify identity, correct records with reasons, and back up data.

The local unlock is a data-protection mechanism, not a centrally verified school account or institutional permission system. Changing a visible role selector does not grant access to decrypted teacher records.

### Student

The student enters an institutional student ID and the current session challenge, then displays a QR code. Remembering the ID is optional and includes a clear forget/change action for shared devices. No student password or mobile app is required.

The student page must say that displaying a QR does not itself mean attendance has been recorded. The teacher's saved-record confirmation is authoritative.

## 5. End-to-end classroom workflow

1. **Prepare:** Teacher checks website readiness, unlocks records, verifies the roster, and confirms backup status. Students prepare the website before entering a dead zone.
2. **Start:** Teacher selects the class and creates a uniquely identified session with a start time, institutional timezone, challenge, and grace period. The session snapshots enrollment membership.
3. **Display:** Student confirms their ID and enters the advertised session challenge. The page displays a high-contrast QR and clear presentation instructions.
4. **Verify:** Teacher scans the QR and verifies the person presenting it using the institution's agreed identity procedure.
5. **Save:** The system validates the session and enrollment, commits attendance transactionally, then confirms success. A write failure explicitly says attendance was not saved.
6. **Handle exceptions:** Teacher uses manual search for unavailable devices or unreadable QR codes. Unlisted encounters remain pending review and do not automatically modify enrollment.
7. **Review:** During collection, the dashboard shows recorded attendance and "Not yet recorded," rather than treating every unscanned student as definitively absent.
8. **Close:** Teacher reviews pending items and closes the session. Remaining eligible enrollments are classified according to the defined absence policy.
9. **Protect:** Teacher creates an encrypted backup and follows the institution's storage and retention policy.

## 6. Identity, QR, and threat model

### 6.1 Initial security model

This is a teacher-supervised attendance recording system. A QR containing a self-entered student ID is a lookup and transmission mechanism, not proof of identity.

A shared room challenge can be forwarded. A timestamp can be constructed by another person. Rotating QR displays do not prevent screenshot forwarding or live relay. Teacher verification remains necessary. Device lending, impersonation, challenge sharing, and relay remain documented risks.

### 6.2 QR contract

The protocol must define payload version, student ID rules, an explicit session selector/challenge, timestamp units, length limits, accepted character sets, expiry/skew policy, and rejection reasons. The teacher resolves the challenge to the active, uniquely identified local session. A challenge is not an authentication secret, and ambiguous session matches are rejected.

QR rotation, if retained for freshness feedback, is not described as an anti-proxy guarantee. Malformed, oversized, unsupported-version, wrong-session, expired, or unreasonably future-dated payloads must be handled without crashing the scanner. Student timestamps do not determine attendance punctuality.

Cryptographic device authentication is deferred until verified key enrollment, signatures, revocation, replacement, and downgrade prevention are fully specified. Even signed passes would not independently prove physical presence.

## 7. Data architecture and integrity

The implementation separates domain rules, application operations, browser adapters, and interface components. React components do not own attendance correctness rules.

Core entities are students, course offerings, enrollments, attendance sessions, scan events, attendance records, and correction events. One student may have multiple enrollments. A session captures relevant roster membership so subsequent roster edits do not rewrite historical attendance.

Exactly one current attendance record exists per session enrollment. Scan events and corrections are separate records. Duplicate prevention is enforced inside database transactions, not solely through camera debounce. Dispute review is separate from attendance status.

Attendance timestamps use the teacher device as the local authority, with an explicit institutional timezone and clock-change policy. The institution defines handling of students already waiting in line at the late cutoff. Offline device time is not a trusted external clock.

An append-only application workflow supports traceability but is not independently tamper-proof against someone controlling the browser, application code, or device. No stronger audit assurance is claimed.

## 8. Privacy, encryption, and recovery

Student identifiers, names, enrollment associations, attendance, and notes require a documented protection policy. Encryption alone does not establish compliance with Republic Act No. 10173.

Before operational use, the institution must establish the applicable processing basis, responsible parties, student notices, access rules, retention/deletion schedule, incident response, and approved handling of personal teacher devices and exported records.

### 8.1 Technical controls

- Protect a randomly generated data key using a strong teacher passphrase and a versioned, benchmarked password-based key derivation scheme. A six-digit PIN is not the sole encryption secret.
- Use authenticated encryption with a fresh unique AES-GCM IV per encryption under a key and defined authenticated record context.
- Define the encrypted envelope, key version, permitted plaintext indexes, and migration procedure. Do not persist decrypted UI objects accidentally.
- Define explicit lock and inactivity behavior. Minimize plaintext lifetime without promising guaranteed JavaScript memory erasure.
- Avoid personal data in debug logs, URLs, caches, or analytics. Apply appropriate web security and dependency controls.
- Document that malicious same-origin code can access records while unlocked; at-rest encryption does not solve that threat.

### 8.2 Storage and backup limits

IndexedDB is finite browser storage. Request persistence where supported, inspect the result, and handle denials, unavailable APIs, quota errors, and failed writes. Persistence is not a backup and does not prevent user deletion or device loss.

Provide encrypted backup and restoration in Phase 2. Define backup versioning, authentication, passphrase requirements, restore validation, and safe replacement behavior. Test restoration on another supported device. Explain the consequences of losing both the passphrase/recovery material and usable backups.

## 9. Web interface and accessibility

The design must adapt to browser windows rather than assume a phone-only layout. Specify layouts for narrow screens, desktops, browser zoom, enlarged text, portrait, and landscape. Avoid unnecessary orientation restrictions.

### Student interface

- Clear ID confirmation and session challenge entry.
- QR with preserved quiet zone, readable instructions, and an editable ID.
- Accessible status text and optional reduced-motion freshness indicator.
- Optional screen wake lock where supported, with release/reacquisition handling. No promise of forced screen brightness.

### Teacher interface

- Separate roster administration from the active scanner task.
- Prominent active class/session, last saved result, pending state, and manual fallback.
- Neutral "Already recorded" feedback for deliberate rescans; silent suppression of repeated camera frames.
- Explicit storage failure feedback and protection against closing with unresolved saves.
- Capability-based camera selection and torch controls; usable fallback when permission or hardware is unavailable.

Define typography, spacing, color, focus, and component tokens. Use CSS pixels for browser target dimensions; aim for 48-by-48 CSS-pixel primary controls. Verify WCAG 2.2 AA behavior, including contrast, keyboard access, focus management, text enlargement, and screen-reader announcements. Sound and vibration are optional supplements.

## 10. Technology baseline

| Concern | Proposed approach |
| --- | --- |
| Website interface | React, TypeScript, Vite; pin supported dependency versions |
| Styling | Bundled Tailwind CSS and explicit design tokens |
| Offline website | Service worker through vite-plugin-pwa/Workbox; verified precache and controlled updates |
| Browser records | IndexedDB through Dexie with transactional constraints |
| Encryption | WebCrypto with specified key lifecycle and encrypted envelopes |
| CSV | PapaParse with explicit encoding handling and validation |
| QR rendering | Bundled qrcode library |
| QR decoding | Capability-tested native detector plus one selected, fully cached fallback |
| Later reports | Evaluated spreadsheet library and safe CSV generation |

Specific browser versions become supported only after acceptance testing. Do not label a browser "tested" before recording results. Camera, storage, wake lock, and installation behavior are separate capabilities.

## 11. Revised implementation phases

### Phase 1 — Web foundation and student pass

Deliver the browser interface, design tokens, versioned QR contract, student ID validation, optional ID memory, offline resource verification, and capability handling. Prove cold offline launch after initial preparation. No installation is required.

### Phase 2 — Complete local attendance workflow

Deliver encrypted teacher records, validated roster import, session creation/resumption, camera and manual attendance, transactional deduplication, corrections, closure, and encrypted backup/restore. Validate recovery and failure behavior before classroom use.

### Phase 3 — Reporting and operational improvements

Add formatted Excel/CSV reports, historical views, and improvements justified by Phase 2 evaluation. Define safe export handling and spreadsheet formula protections.

### Phase 4 — Expanded field validation and documentation

Expand device coverage and classroom trials, publish measured outcomes, and complete user/support documentation. Foundational failure testing starts in Phases 1–2 rather than waiting for this phase.

## 12. Phase 1–2 acceptance gates

1. Cold offline browser launch works after verified caching, including decoder resources.
2. Missing cache, unavailable storage, camera denial, and unsupported features produce usable fallback paths.
3. Malformed QR input and invalid roster imports cannot corrupt attendance or enrollment.
4. Concurrent repeated scans create one attendance record; feedback follows successful transaction completion.
5. Reloading resumes the correct session and preserves committed records; failed writes never appear successful.
6. Manual check-in and corrections follow the same session and audit rules as scanning.
7. Session closure, lateness boundaries, pending students, and historical roster changes behave as specified.
8. An encrypted backup restores on a second supported device; wrong secrets and corrupt files fail safely.
9. Website updates do not activate unexpectedly during attendance collection; schema migration is tested.
10. Keyboard, screen-reader, zoom, layout, and contrast checks pass on the supported browser matrix.

## 13. Evaluation and evidence

Measure total attendance-taking time, first-read success, retries, exceptions, manual entries, save latency, and teacher workload. Compare with a measured manual process using comparable class conditions. The initial 3–5 seconds per student is a hypothesis to evaluate, not a guarantee.

## 14. Reference basis

- National Privacy Commission, Data Privacy Act implementing rules: https://privacy.gov.ph/implementing-rules%20regulations-data-privacy-act-2012/
- WebKit, browser storage policy: https://webkit.org/blog/14403/updates-to-storage-policy/
- OWASP, cryptographic storage guidance: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- W3C, WCAG 2.2: https://www.w3.org/TR/WCAG22/
- PapaParse documentation: https://www.papaparse.com/docs
