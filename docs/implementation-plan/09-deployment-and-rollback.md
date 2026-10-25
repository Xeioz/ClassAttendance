# 09 — Deployment and rollback

## Compatibility

Application package version is 0.3.0. Database name remains `attendance-desk-v1`, schema remains 2. Cipher/vault metadata, backup envelope, attendance status, report schema 2 and CSV column contracts are unchanged. No data migration, record deletion or re-encryption is performed by this modernization.

Root and `/ClassAttendance/` builds must both pass with final assets, lazy teacher/decoder/export chunks, manifest, service-worker scope and offline checklist aligned. The CSP is emitted into production HTML, works without custom hosting headers, and is cached with that HTML.

## Safe release procedure

1. Resolve the development-dependency advisory/lockfile blocker in a registry-enabled environment and rerun validation.
2. Retain the existing release artifact and record its revision and hosting base path.
3. Close local active sessions. Download an encrypted backup, verify the file and test recovery separately.
4. Build and preview 0.3.0 at the intended path; verify HTTPS, CSP, camera/manual workflows, reports and recovery.
5. Complete physical-device, privacy and hosting checks. These local changes do not publish a live site.
6. Publish static `dist` through the established manual workflow. Keep the browser origin stable.
7. Apply the website update only after closing attendance; verify an offline reload and existing records afterward.

## Rollback

If application behavior regresses, republish the retained prior complete static artifact at the same origin/path, including its index, hashed assets and worker. Close active sessions first and use the prompted update flow. Keep hashed assets available during rollout so existing tabs can finish loading their referenced modules. Do not clear IndexedDB or unregister/delete caches as a routine rollback step.

Because storage contracts did not change, this work adds no downgrade migration. Still test the prior artifact against a copy of the backup before relying on rollback. Code rollback does not undo attendance corrections or other legitimate intervening writes. Restore a backup only for an explicit recovery need with the existing full-replacement acknowledgment; it replaces all local records and can discard newer work.

## Readiness boundary

Local test/build/browser evidence supports a reviewable release candidate. Actual hosted HTTPS deployment, institution approval, physical scanning/torch, low-storage/power-loss checks, screen readers and second-device restoration remain external gates. Do not serve the Vite development server as production hosting.
