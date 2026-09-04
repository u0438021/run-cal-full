# Implementation Plan

## Phase 0 — Foundation (2–3 days)

- Monorepo, environments, CI, migrations, structured logs, error contracts.
- Threat model, retention policy, data-quality conventions, test fixture policy.
- Exit: local stack boots; health and migration checks pass.

## Phase 1 — Identity and athletes (3–5 days)

- Username + six-digit PIN, Argon2id/pepper, sessions, lockout/rate limits, RBAC.
- Athlete profiles, effective-dated weight and zones, coach assignment, audit log.
- Gmail delivery and Check Username are verified in the current `run-cal-th` deployment; see [EMAIL_DELIVERY_STATUS.md](EMAIL_DELIVERY_STATUS.md).
- Exit: role/isolation tests and complete login/reset/logout flows.

## Phase 2 — Manual FIT ingestion (1–2 weeks)

- Stream upload, private storage, SHA-256 dedupe, import state machine.
- Decode file/session/record/lap/event/device and developer messages.
- Running-only gate, Stryd registry/aliases/provenance, normalized persistence.
- Golden fixtures and reprocessing by parser version.
- Exit: acceptance fixtures pass and data-quality report is visible.

## Phase 3 — Drive ingestion (4–6 days)

- OAuth read-only connection, encrypted token storage, athlete `folder_id` mapping.
- Incremental listing, version idempotency, retry/dead-letter behavior, manual sync UI.
- Exit: files route only to mapped athlete; update/duplicate/error cases pass.

## Phase 4 — Analytics V1 (2 weeks)

- Activity summaries, aligned series, trends and three relationship analyses.
- Zones, CP/W', W/kg, power-duration, form power ratio, drift and efficiency.
- Daily/weekly load, 7/42-day fitness-fatigue-form, 30-day scenarios/confidence.
- Golden numerical tests, metric versioning, data sufficiency labels.
- Exit: metrics reproduce test vectors within tolerances.

## Phase 5 — Dashboard (1–2 weeks)

- Overview, activity list/detail, synchronized map/charts, laps and pauses.
- Power and training-load views, projection scenarios, responsive states.
- Accessibility, timezone/unit handling, empty/error/low-quality states.
- Exit: complete athlete journey on mobile and desktop.

## Phase 6 — AI insights and hardening (1 week)

- Evidence pack builder, structured responses, validation, caching, opt-out.
- Security review, backups/restore test, observability, performance and privacy tests.
- Exit: insights cite evidence; prohibited/unsupported outputs fail closed.

## First backlog

- [x] Pin dependency lockfiles and CI checks.
- [x] Add Alembic migrations/models matching starter DDL.
- [x] Implement session middleware and authorization scopes.
- [x] Implement local/object storage interface and upload endpoint.
- [ ] Integrate a FIT SDK/decoder and create sanitized golden fixtures.
- [x] Complete metadata-driven developer-data registry and unit tests for Stryd aliases/power precedence.
- [x] Add sanitized Garmin/Stryd binary FIT fixtures for end-to-end parser regression tests.
- [ ] Persist activities atomically and expose import status.
- [ ] Implement metric contracts before chart components.
- [ ] Add Drive OAuth and folder mapper only after manual ingestion is stable.
- [ ] Add AI last, after deterministic evidence and analytics are trustworthy.

## Definition of done

Code is typed/linted/tested; migrations support rollback; API is authorized and documented; empty/error/loading states exist; calculations include version/coverage; logs contain no secrets or raw PINs; and operational runbooks cover retry, reprocess, backup, and restore.
