# Attendance report schema 2

Every download includes the entire selected session. Searching the on-screen roster does not filter the file. The export controls state the course, section, number of enrolled students, audit-event count and whether the session is active or closed. The download uses one coherent database snapshot; the completion message reports that snapshot's count and state.

## XLSX compatibility

Schema 2 uses ExcelJS 4.4.0 to persist formatting. It has four worksheets:

| Worksheet   | Layout and purpose                                                             |
| ----------- | ------------------------------------------------------------------------------ |
| Summary     | Session identity, timezone, state, scope, counts and percentage calculations   |
| Attendance  | Header row 1; data begins at row 2; frozen header plus ID/name columns         |
| Audit trail | Header row 1; data begins at row 2; frozen header and all session audit events |
| Report info | Schema version, scope, ID mappings, field definitions and handling guidance    |

This is an explicit XLSX layout change from schema 1, whose Attendance header was at row 18. Consumers that use fixed row positions must update before adopting schema 2. Summary values moved from Attendance to Summary, preserving their row positions within that sheet. Use the schema number in `Summary!B17` or the named headers when importing.

The first eight Attendance value columns retain their order: displayed ID, name, section, status, recorded/corrected UTC, last-changed UTC, source and reason. Column A is now labeled **Student ID (display)**; appended column I is **Student ID (canonical)**.

The first eleven Audit trail value columns retain their order. Column D is explicitly **Student ID (canonical)**; appended column L is **Student ID (display)**. Join Attendance I to Audit trail D within the selected session. Unlisted scan events can legitimately have no corresponding roster row; their displayed ID falls back to the recorded ID rather than inventing a student.

IDs are text, including leading zeros and long identifiers. Timestamps remain ISO UTC text rather than Excel date serials. Summary counts and rates remain numeric; rates are formatted `0.0%`. Untrusted formula-like strings are stored as text. The exporter creates no formulas. Names and reasons wrap; explicit row heights and column widths are saved. Header filters span the complete tables, and merged cells are confined to the Summary title.

The attendance denominator remains all enrolled students, including excused students. Existing behavior blanks Recorded / corrected for ABSENT entries; changing the meaning for a corrected absence requires a product decision. Active reports remain explicitly marked **IN PROGRESS - NOT FINAL**.

## CSV compatibility

The existing 16-column CSV order is unchanged. The time column uses the prototypev2 heading **Recorded / corrected (UTC)** in place of main’s earlier **First recorded (UTC)**; consumers matching headers must accept the updated name. Historical samples in `docs/samples/` retain their original bytes and earlier heading. CSV uses UTF-8 BOM, commas, CRLF and quoting. Formula-like values receive the existing apostrophe safety prefix. Empty direct-helper exports now contain the same headers; normal session creation still requires a nonempty roster. Spreadsheet auto-import can infer numeric types from CSV, so use XLSX or import identifier columns as text when leading zeros matter.

## Repeatable verification

```sh
pnpm test
pnpm qa:exports
python -m pip install -r scripts/qa-requirements.txt
python scripts/verify-qa-exports.py
```

The generator calls the application's actual XLSX byte builder at 0, 1, 45 and 10,000 synthetic rows. SheetJS verifies attendance/audit values and types, ExcelJS reopens stored formatting, and openpyxl independently checks every attendance and audit cell, summary counts/rates, freezes, wrapping, heights, filters and number formats. CSV is independently parsed and fully compared. CI runs these checks and retains synthetic files and JSON validation reports for 14 days.

The tests include Unicode, long IDs/names/reasons, line breaks, formula-like text, every attendance status, unrecorded rows and epoch-zero timestamps. Timings describe serialization only; they do not assert an unagreed performance target. Programmatic reopening is not a desktop Excel/LibreOffice rendering or repair-prompt test. Those visual checks remain required for the supported spreadsheet application.
