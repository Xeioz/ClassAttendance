# Attendance Desk modernization

Started October 24, 2026 against `e93c6ff`. Scope: improve the existing static, encrypted, offline application while preserving stored records and report/backup contracts.

## Progress checklist

- [x] Inspect reference, source, domain rules, database and existing tests.
- [x] Establish baseline: 168 tests pass using Vite's runner config loader.
- [x] Record assessment, architecture, roles and workflow decisions.
- [x] Implement and regression-test verified reliability/security defects.
- [x] Implement role loading, form simplification and bounded table rendering.
- [x] Audit interactive controls and validate success/failure paths within recorded limits.
- [x] Run complete tests (190 pass), export QA, compilation and root/subpath production builds.
- [x] Verify production browser workflows at root and repository subpath.
- [x] Complete security, deployment/rollback and final evidence reports.
- [ ] External: upgrade/audit development dependencies using registry access.
- [ ] External: run Python verifier with openpyxl, complete physical-device/policy/hosted release checks.

## Documents

1. [System assessment](01-system-assessment.md)
2. [Proposed architecture](02-proposed-architecture.md)
3. [User roles and permissions](03-user-roles-and-permissions.md)
4. [Workflow analysis](04-workflow-analysis.md)
5. [UI/UX improvements and control audit](05-ui-ux-improvements.md)
6. [Security assessment](06-security-assessment.md)
7. [Implementation roadmap](07-implementation-roadmap.md)
8. [Testing and validation](08-testing-and-validation.md)
9. [Deployment and rollback](09-deployment-and-rollback.md)
10. [Final implementation report](10-final-implementation-report.md)

Evidence must distinguish static inspection, automated tests, browser automation and physical-device checks. No live deployment, production-record modification or authentication infrastructure is part of this change.
