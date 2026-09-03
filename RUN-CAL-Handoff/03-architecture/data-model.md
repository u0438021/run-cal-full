# Conceptual Data Model

## Identity and tenancy

- `users(id, username_normalized, pin_hash, status, created_at)`
- `workspaces(id, name, status, created_at)`
- `workspace_memberships(id, workspace_id, user_id, role, status, joined_at, ended_at)`
- `athletes(id, user_id?, display_id, profile_fields..., created_at)`
- `workspace_athletes(id, workspace_id, athlete_id, status, joined_at, ended_at, data_residency_policy)`
- `coach_assignments(id, workspace_id, coach_user_id, athlete_id, effective_from, effective_to)`

## Time-varying athlete context

- `weight_history(id, workspace_id, athlete_id, kg, effective_from, source, quality)`
- `training_context_history(id, workspace_id, athlete_id, objective, phase, effective_from, effective_to)`
- `threshold_tests(id, workspace_id, athlete_id, type, value, unit, tested_at, effective_from, source, quality, protocol_version, environment_json, evidence_uri)`
- `cp_history(id, workspace_id, athlete_id, watts, effective_from, source, quality, protocol_version)`
- `zone_models(id, workspace_id, athlete_id, metric_type, model_name, protocol_version, effective_from, effective_to)`
- `zone_bands(id, zone_model_id, zone_no, lower_bound, upper_bound, label)`

Selection rule: choose the latest approved record with `effective_from <= activity.started_at` and not beyond `effective_to`; never rewrite historical meaning with current settings.

## Activities and FIT

- `fit_files(id, workspace_id, athlete_id, object_key, sha256, byte_size, source_type, source_external_id, original_filename, received_at, immutable)`
- `import_jobs(id, fit_file_id, parser_version, status, validation_json, warning_json, started_at, completed_at)`
- `activities(id, workspace_id, athlete_id, fit_file_id, started_at, sport, type, title, summary_json, data_availability_json)`
- `activity_records(activity_id, timestamp, lat, lon, pace, hr, power, cadence, elevation, stryd_json, raw_fields_json)`
- `activity_laps(...)`, `activity_comments(...)`, `session_rpe(...)`

Unique/idempotency constraints should include athlete + file SHA-256 and, for Drive, connection + external file ID + version/hash. A duplicate heuristic may additionally compare start time/duration/distance/device.

## Recovery, planning and collaboration

- `recovery_checkins` with five 1–5 components, optional note/sleep/resting HR/source.
- `races`, `training_plans`, `planned_sessions`, `session_activity_links`.
- `training_logs` and hydration/fueling entries.
- `conversations`, `conversation_participants`, `messages(reference_type, reference_id)`.
- `notifications`.

## Analytics and AI

- `metric_definitions(name, formula_version, source_reference, status)`
- `activity_metric_results`, `weekly_snapshots`, `ai_reviews`
- `ai_review_evidence(ai_review_id, entity_type, entity_id, metric_name, period)`
- `ai_proposals`, `proposal_decisions(actor, action, before_json, after_json, decided_at)`
- `audit_events(workspace_id, actor_id, action, object_type, object_id, metadata_json, occurred_at)`

## Invariants

All tenant queries require `workspace_id`. Athlete content also requires `athlete_id`. Derived W/kg stores/references both selected CP and weight record IDs. Zone results store selected zone-model ID. Formula/protocol/parser versions are immutable references.

