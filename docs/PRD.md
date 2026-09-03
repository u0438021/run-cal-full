# Product Requirements Document

## Product summary

Running Data Analytics is a private coaching and athlete analytics platform. Coaches or administrators create athlete accounts, athletes sign in with a username and six-digit PIN, and running FIT files arrive by manual upload or an athlete-specific Google Drive folder. The system converts vendor-specific FIT records into one running model, presents explainable training analytics, projects the next 30 days, and creates grounded AI observations.

## MVP goals

1. Make onboarding and daily access fast with SoftGate-style username + PIN login.
2. Reliably ingest running FIT files, including Stryd Developer Data fields.
3. Preserve provenance and make imports idempotent and reprocessable.
4. Give athletes and coaches useful trends, zones, load, and projections.
5. Make every AI insight traceable to computed metrics and dates.

## Non-goals for MVP

- Sports other than running, live tracking, workout execution, social feeds, billing, public leaderboards, medical diagnosis, automatic training-plan prescription, and direct Garmin/COROS API sync.
- Perfect physiological prediction. The projection is a transparent scenario estimate.

## Users and permissions

| Role | Can do |
|---|---|
| Admin | Manage all users, athletes, imports, integrations, and audit logs |
| Coach | View assigned athletes, import data, edit athlete settings, view analytics |
| Athlete | View own dashboard, upload own FIT files, manage own PIN |

An athlete profile belongs to one user account in MVP. The data model permits future coach-to-many-athlete assignment.

## Core journeys

### Login

1. Enter normalized username and exactly six numeric digits.
2. Server verifies an Argon2id hash combined with a server-side pepper.
3. On success, issue a short-lived secure HTTP-only session and rotate it on privilege changes.
4. After five failed attempts, progressively delay/temporarily lock the username and record an audit event. Never reveal whether a username exists.

PIN login is appropriate for a controlled SoftGate deployment, but it is weaker than a password/passkey. Production requires TLS, rate limiting, lockout, device/session visibility, admin reset, and optional passkey/MFA for admins.

### Manual FIT upload

1. User selects one or more `.fit` files (configurable maximum, default 50 MB each).
2. API streams each file to private object storage, hashes bytes with SHA-256, and creates an import job.
3. Duplicate hashes for the same athlete are skipped; changed parsers can reprocess the original.
4. Worker validates CRC where available, decodes, rejects non-running sports, normalizes records, calculates summaries and analytics, and exposes warnings.

### Google Drive import

1. Admin connects a least-privilege Google account and maps `athlete_id -> folder_id`.
2. Scheduled/manual sync lists FIT files in each mapped folder using a saved cursor or modified-time watermark.
3. Each Drive file ID + version/hash is idempotent. Failed items retry with backoff.
4. Deleting a source file does not silently delete an activity; it marks source availability.

### Dashboard

- Overview: last run, weekly volume/load, fitness-fatigue-form, 30-day projection, data quality.
- Trends: pace, HR, power, elevation/grade, cadence, efficiency.
- Relationships: pace vs power, HR vs power, power vs grade.
- Power: zones, critical power, W/kg, power-duration curve, form power ratio.
- Activity detail: map, charts aligned by timestamp, laps, pauses/events, devices, warnings.
- AI insights: concise observations, evidence, confidence, and suggested questions/actions.

## Analytics V1

| Metric | Definition/approach | Minimum data |
|---|---|---|
| Pace/HR/power trends | Weekly volume-weighted and rolling summaries | valid moving samples |
| Pace vs power | Binned/robust regression, excluding pauses and bad GPS | pace + power |
| HR vs power | Steady-state bins and lag-aware comparison | HR + power |
| Power vs grade | Grade bins with speed/data-quality filters | GPS/elevation + power |
| HR/power zones | Athlete-configured zones; derived defaults clearly labeled | HR max/LTHR; CP |
| Critical power | 2-parameter model `P(t)=W'/t+CP`, robust fit to best efforts | multiple maximal efforts |
| W/kg | watts divided by effective-dated athlete mass | power + mass |
| Power-duration curve | Best rolling mean for standard durations | native/Stryd power series |
| Form power ratio | `form_power / running_power * 100` | Stryd form + running power |
| Cardiac drift | Compare first/second-half HR-to-speed or HR-to-power efficiency in steady segments | HR + speed/power |
| Running efficiency | speed per watt and speed per HR; contextualized by grade | clean aligned series |
| Weekly volume/load | distance, duration, elevation, power/HR TRIMP-like load | activities + zones |
| Fitness-fatigue-form | EWMA chronic (42d), acute (7d), form = fitness-fatigue | daily load |
| 30-day projection | Recursively decay EWMA and apply planned/baseline load scenarios | 28+ days recommended |

All formulas carry a `metric_version`, input window, coverage, and confidence. No metric is displayed when minimum quality is not met.

## AI insights

The model receives only structured aggregates, anomaly flags, athlete preferences, and a compact activity evidence set—not unrestricted raw location traces. Its response must follow a schema: headline, observation, evidence references, confidence, caveat, and optional action. The API rejects unsupported claims and forbidden medical language. Store prompt/model/version and referenced metric IDs for audit; allow AI to be disabled per athlete.

## Acceptance criteria

- An authorized athlete can log in, upload a valid running FIT, and see it once even after repeated upload.
- A mapped Drive folder imports new/updated FIT files to the correct athlete and never crosses athlete boundaries.
- Known Stryd fixtures resolve developer field definitions and populate power, form power, air power, LSS, GCT, and vertical oscillation when present.
- Activity detail aligns samples and laps, excludes paused time from moving analytics, and shows import/data-quality warnings.
- Analytics match golden fixtures within documented tolerances and show unavailable/low confidence instead of invented values.
- Every AI statement links to stored analytics evidence and includes confidence/caveat.
- Role authorization, audit logging, rate limits, and tenant/athlete isolation pass automated tests.

## Success measures

- >98% valid running FIT imports complete without manual repair.
- Zero cross-athlete data leaks or duplicate activities.
- P95 manual-upload acknowledgement <2 seconds; processing of a typical 2-hour file <30 seconds.
- >90% of activities with Stryd fields correctly identify power provenance.
- Weekly active athletes and insight usefulness feedback are tracked after launch.

