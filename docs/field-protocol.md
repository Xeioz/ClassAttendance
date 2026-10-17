# Field validation protocol

Status: prepared, not executed. Synthetic test fixtures are not classroom evidence.

## Cohort and conditions

Recruit at least 45 consenting participants under institutional procedures. Use anonymous participant codes in benchmark data, never real student IDs or names. Record actual device/OS/browser versions. Include the available Android, iOS and desktop devices rather than asserting support for an untested OS range.

Test normal classroom lighting, projection/dim lighting, window glare, and available damaged/dim displays. Record the condition for each observation. Conduct separate comparable runs where necessary. Measure a manual-attendance baseline with comparable students, teacher and setup.

## Timing definitions

- `class_started_at`: one shared ISO timestamp, with timezone offset, when attendance taking begins, including setup/queue overhead you intend to compare.
- `started_at`: when a participant begins presenting their pass.
- `confirmed_at`: when the teacher receives saved confirmation. Do not record successful timing for failed writes.
- `decode_ms`: optional instrumented decoder duration. Leave blank when unavailable. Presentation-to-save time is not optical decode latency.
- `attempts`: actual presentations/retries, at least one for a completed check-in.
- `unexpected_duplicate_alerts`: duplicate notices caused by continuously holding one pass, excluding deliberate re-presentations.
- `wake_lock_supported`: `yes`, `no`, or `unsupported`. `wake_lock_held`: `yes`, `no`, or `not_tested`. Measure the actual six-minute waiting condition where supported. Do not infer brightness from wake lock.

The analyzer calculates total duration from the common start to the final saved confirmation. It reports throughput, presentation-to-save median/p95, first-read rate, retries, and available optional measurements. Separate runs require separate input files. Targets remain evaluation goals, not guaranteed results.

## Procedure

1. Prepare the website online, import the synthetic 45-student roster, create a test session, and save a backup.
2. Cold-open prepared teacher/student browsers with connectivity unavailable. Confirm required paths before timed trials.
3. Record each participant's device, condition and measured timestamps in a copy of the template. If measuring first read, count actual attempts consistently.
4. Hold one pass continuously for at least five seconds. Expect one accepted event and no repeated duplicate notices. Remove it from view and deliberately present it again to test neutral duplicate feedback.
5. Test manual check-in, excusal, dispute flag/resolution, close, reasoned reopen, Excel/CSV exports and backup restoration.
6. With synthetic data only, test force-close/restart after confirming committed records. Record actual losses and failure messages. Never describe uncompleted writes as guaranteed durable.
7. Analyze the completed file, compare with the measured manual baseline and document exceptions. Do not replace missing values with targets.

```sh
node --experimental-strip-types scripts/analyze-field-run.ts measured.csv docs/field-results/run-summary.json
```

Requires Node 22.18+ or Node 24. Keep actual observation files out of public Git by default. `docs/field-results/` is ignored. The supplied template intentionally has no measured times and must fail analysis until observations are entered.

## Browser matrix

For each actual browser/OS version, record: HTTPS load, root/subpath scope, initial caching, cold offline launch, camera permission and denial, native/fallback decoding, camera selection, torch capability, wake-lock release/reacquisition, manual dialog keyboard access, zoom/screen-reader checks, downloads and restoration. Mark every unexecuted cell `NOT TESTED`.

## Demo rehearsal

Use synthetic roster data and two prepared devices. Show a normal save, a deliberate duplicate, an identity-review dispute, a manual excusal, unresolved-closure protection, resolved closure, reasoned reopening and recovery. Have an exported backup and manual attendance procedure available if hardware fails. State which parts are demonstrated live and which are automated tests.
