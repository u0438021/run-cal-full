# Analytics implementation status — 2026-09-05

Verification: 34 API tests passed; Ruff passed; Next.js production build and type
validation passed. Local browser inspection reached the Thai login form. Full
authenticated UI verification remains blocked by the unprovisioned backend/database.
Changes in this work session are saved locally and not committed or deployed.

## Firebase-compatible recommendation requested by the user

Retain Firebase Hosting and existing account/recovery flows; run the Python FIT
parser and analytics on Cloud Run. Use Firestore for scoped activity/import summaries
and Cloud Storage for private FIT and time-series objects. This is a recommendation,
not an implemented migration: SQLAlchemy persistence and session validation need an
adapter/redesign before the new API can share the existing Firebase deployment.
Inspect the deployed authentication contract before choosing token/session bridging.
Do not assume existing login uses Firebase Authentication ID tokens.

Official integration: https://firebase.google.com/docs/hosting/cloud-run

## Implemented locally

- Opt-in AI insight core and Firebase endpoint (`running-insight-v1`). It sends
  aggregate evidence only, uses Responses API Structured Outputs with `store:false`,
  validates every cited evidence ID, blocks medical claims, hashes the safety
  identifier, caches identical evidence, and stores the model/prompt/evidence audit.
  It remains disabled until an OpenAI model and Secret Manager API key are configured.

- Within-run efficiency and cardiac decoupling (`efficiency-v1`) compares speed/HR
  and power/HR across equal paired-time halves. Each half requires ten minutes.
  Positive drift means output per heartbeat fell; it does not establish a cause
  and does not adjust for heat, hydration, grade or wind. Included in the local API.

- Descriptive relationship bins (`relationships-v1`): speed and HR grouped by
  25 W power intervals, weighted by observed time. Requires 30 paired seconds per
  displayed bin. Pauses/gaps and nonmoving samples are excluded. No HR lag,
  terrain or steady-state adjustment yet; results must not imply improved fitness.
  Included in the local activity-detail API and dashboard as comparison tables,
  with paired coverage and insufficient-data states. Not deployed to Firebase.

- Power analytics core (`power-v1`): time-weighted W/kg from explicitly supplied
  activity-date weight, configured zone durations with inclusive lower/exclusive
  upper cutoffs, and separate unknown-power time. No default zones or assumed
  mass. Integration must select effective-dated settings before calling this core.
  This module is not yet connected to the live API/UI or Firebase.

- Storage-independent daily fitness/fatigue/form calculations and 30-day rest,
  maintain and user-supplied load scenarios. Missing days stay unknown; only
  explicit zero counts as rest. Projection requires 28 complete days and a valid
  historical state. These functions are not yet connected to API/UI or Firestore.

- Authenticated athlete selector, login/logout, manual multi-file upload and processing.
- Scoped, paginated activity list and activity detail API.
- Time-weighted pace, HR, power, cadence and available running dynamics.
- Paired form-power ratio, uninterrupted one-second power-duration efforts.
- Timestamp-aligned charts, lap table, Thai loading/error/empty states.
- FIT timer stop/start events persisted into sample running state.
- Running cadence includes fractional cadence and converts cycles to steps; parser 0.3.0.
- Same-origin Next.js API proxy keeps the session and CSRF cookies on the web origin.
- Upload CSRF validation and regression coverage for authorization and numerical behavior.

## Metric contract: activity-v1

`GET /v1/activities/{id}` returns an analytics envelope with `metric_version`,
`window_start`, `window_end`, `observed_timer_seconds`, and `metrics`.
Every metric contains `value` (number or null), `unit`, `coverage` (0–1), and
`confidence` (`high`, `low`, or `unavailable`). Confidence describes data coverage,
not physiological certainty. Values below 50% coverage are unavailable; at least
90% is high coverage. Coverage is relative to observed valid timer intervals,
not total elapsed time in the source file.

For each adjacent timestamp pair, the left sample supplies the value for the
interval. Intervals longer than five seconds, nonpositive intervals and paused
intervals are excluded. The final sample has no inferred duration. Means are
weighted by interval length. Pace is 1000 divided by mean speed, in seconds/km.
Form-power ratio uses only paired samples with positive running power.
Nonfinite/negative measurements are excluded. No missing measurement becomes zero.

Power-duration uses contiguous samples exactly one second apart; every sample
represents one one-second power reading. It reports null if the required duration
is unavailable. It does not estimate critical power from nonmaximal runs.
Charts use a bounded series; full-resolution data supplies all calculations.

## Not completed / release gates

- PostgreSQL is not available on this machine and no project `.env` exists.
  Unit tests use database doubles; an actual database end-to-end test is still required.
- The live Firebase website and this Next.js/FastAPI/PostgreSQL application are
  separate systems. Existing Firebase sessions/accounts are not migrated automatically.
  Choose the deployment architecture before changing the live site.
- Effective-dated settings UI, zones, W/kg, CP fitting, drift, relationship analyses,
  historical loads/projections and synchronized map are still backlog work.
- Google Drive OAuth/folder mapping and scheduled sync are not implemented.
  Credentials, callback URL and token encryption configuration are not supplied.
- AI provider integration, evidence persistence/validation and opt-out UI remain
  unimplemented. No generated AI claim is shown in the dashboard.
- Backup/restore, production rate limiting and deployment hardening remain release gates.
- Previously imported parser 0.2.0 activities need a controlled reprocessing path
  before relying on cadence or persisted pause state. Upload deduplication alone
  does not reprocess old activities.

## Start after provisioning PostgreSQL

Follow README local setup, apply Alembic migrations to an empty database, and
provision an authorized user/athlete through a controlled administrative workflow.
The repository does not yet contain a user-provisioning UI for this architecture.
Run the API on port 8000 and the Next.js app on port 3000.
`API_ORIGIN` may configure a different backend at web build/start time.
Open the Next.js URL; do not use Firebase credentials unless explicitly migrated.

No real FIT file, account credential, token, or GPS trace is included in this change.
