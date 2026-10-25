# Import-first teacher setup

The first task after unlocking an empty teacher workspace is **Import master list**. The sidebar also exposes this as the primary action for returning teachers. **Add class manually** remains available.

## Workflow

1. Choose a CSV, XLSX or XLS file. Reading occurs locally; no file is uploaded to a server.
2. Select an Excel worksheet when multiple usable sheets exist. Only the chosen sheet is imported; repeat for other sheets deliberately.
3. Review column matching. Recognized headings are suggested; ambiguous or absent headings are left unmapped. A source column cannot be mapped twice. The first non-empty row must contain headings.
4. Review proposed class groups. Missing required data is blank and highlighted. Edit class details and student rows without re-uploading. Issue links jump to the affected class/row; student rows use 25-row pages.
5. Apply shared course, section, term or institution values only to blanks if appropriate. Imported values are never overwritten by this action. Optional session defaults are editable separately.
6. Resolve every required-field issue, duplicate enrollment and identity-name conflict, then select **Confirm and save master list**. No database writes occur during reading, mapping or review.

## Required and optional data

| Field | Required before saving | Recognized heading examples |
| --- | --- | --- |
| Student ID | Yes | id, student id, student number, student no, id number |
| Student name | Yes | name, student name, full name, official name |
| Section | Yes | section, class section, block |
| Course code | Yes | course, course code, subject code |
| Term | Yes | term, semester, academic term |
| Subject | No | subject, subject name, course name |
| Institution | No | institution, school, school name |
| Room | No | room, classroom |

Header matching ignores case, spaces and punctuation. Duplicate recognized headings require explicit mapping. A basic `id,name,section` roster is supported: teachers supply course and term in the preview. Complete CSV templates add those columns and optional subject/institution/room. Both templates download from the import screen. Existing three-column CA samples remain usable.

The importer does not infer that an entire section is enrolled in every course. Teachers review each proposed class explicitly. A student may appear in different classes; a duplicate canonical ID in the same class is a blocking issue. Conflicting names for one section/ID identity must be corrected rather than silently replacing shared identity details. Rows or classes may be deliberately removed from the unsaved preview.

## Persistence and compatibility

Course + normalized section + term identify a class. Matching ignores course/term case. Existing classes retain defaults; enrollment is merged without removing omitted members. Historical session roster snapshots, attendance and audit events are unchanged. Classes, encrypted students and enrollment links commit in a single IndexedDB transaction, with current vault, active-session, class-change and identity-name checks before writing. Failures roll back the entire import; the UI retains draft corrections for retry and refreshes conflict information.

Imports remain blocked during active attendance. Web Locks coordinate cooperating teacher tabs where supported; database transactions and optimistic guards remain the integrity boundary. Existing encryption, database schema, v1/v2 backup support and QR contracts are unchanged. The bundled SheetJS chunk is included in the production precache so Excel reading can work offline after preparation.

Drafts stay in memory in the unlocked page. They are not persisted to localStorage or included in backups. Leaving, reloading or locking the view discards an unsaved preview. Successful imports persist as ordinary encrypted class/student records covered by existing v2 backups.

## Limits and verification

- Maximum file size: 5 MB; maximum selected-sheet data rows: 10,000; maximum columns: 100; workbook worksheets: 20; proposed class groups: 1,000.
- CSV reads UTF-8 with BOM support and Windows-1252 fallback. Inspect accented names before confirming.
- Excel uses displayed cell text to preserve formatted leading zeros. Formulas are not executed. IDs already truncated or rounded in the source workbook cannot be reconstructed.
- Fourteen additional automated tests cover parser behavior, missing fields, Excel worksheets/ID formatting, atomic rollback, repeated imports, shared identities, conflicts, active-session restrictions and the editable import-first UI. Combined suite: 58 tests in 12 files.
- TypeScript and production root/repository-subpath builds are checked. Automated UI tests use jsdom and a mocked file reader; parser tests separately use real CSV and Excel bytes. No physical-browser Excel/offline import claim is inferred from those tests.
