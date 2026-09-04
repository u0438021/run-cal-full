CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  username_normalized text NOT NULL UNIQUE,
  pin_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','coach','athlete')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','disabled')),
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE athletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id),
  display_name text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  unit_system text NOT NULL DEFAULT 'metric',
  ai_insights_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coach_athletes (
  coach_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  athlete_id uuid REFERENCES athletes(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_user_id, athlete_id)
);

CREATE TABLE athlete_settings_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), athlete_id uuid NOT NULL REFERENCES athletes(id),
  effective_from timestamptz NOT NULL, weight_kg numeric(6,2), max_hr smallint,
  threshold_hr smallint, critical_power_w numeric(8,2), zones jsonb NOT NULL DEFAULT '{}',
  UNIQUE (athlete_id, effective_from)
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE drive_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES users(id),
  encrypted_refresh_token bytea NOT NULL, account_label text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE athlete_folder_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), athlete_id uuid NOT NULL REFERENCES athletes(id),
  connection_id uuid NOT NULL REFERENCES drive_connections(id), folder_id text NOT NULL,
  sync_cursor text, last_synced_at timestamptz, enabled boolean NOT NULL DEFAULT true,
  UNIQUE (connection_id, folder_id), UNIQUE (athlete_id, connection_id)
);

CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), athlete_id uuid NOT NULL REFERENCES athletes(id),
  source_hash text NOT NULL, source_kind text NOT NULL CHECK (source_kind IN ('manual','google_drive')),
  source_file_name text NOT NULL, source_object_key text NOT NULL, drive_file_id text, drive_version text,
  parser_version text NOT NULL, sport text NOT NULL, subsport text,
  started_at timestamptz NOT NULL, local_utc_offset_minutes smallint,
  elapsed_time_s numeric, timer_time_s numeric, moving_time_s numeric, distance_m numeric,
  elevation_gain_m numeric, elevation_loss_m numeric, calories integer,
  avg_speed_mps numeric, max_speed_mps numeric, avg_hr_bpm numeric, max_hr_bpm smallint,
  avg_power_w numeric, max_power_w numeric, power_source text,
  data_quality jsonb NOT NULL DEFAULT '{}', raw_summary jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, source_hash)
);
CREATE UNIQUE INDEX activities_drive_version_uq ON activities(athlete_id, drive_file_id, drive_version)
  WHERE drive_file_id IS NOT NULL;

CREATE TABLE activity_samples (
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL, sequence integer NOT NULL,
  distance_m double precision, speed_mps double precision, heart_rate_bpm smallint,
  latitude_deg double precision, longitude_deg double precision, elevation_m double precision,
  grade_pct double precision, cadence_spm double precision,
  native_power_w double precision, stryd_power_w double precision, power_w double precision,
  power_source text, form_power_w double precision, air_power_w double precision,
  leg_spring_stiffness_kn_m double precision, ground_contact_time_ms double precision,
  vertical_oscillation_mm double precision, stride_length_m double precision,
  is_timer_running boolean NOT NULL DEFAULT true, raw_fields jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (activity_id, recorded_at, sequence)
);
CREATE INDEX activity_samples_activity_time_idx ON activity_samples(activity_id, recorded_at);

CREATE TABLE activity_laps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  lap_index integer NOT NULL, started_at timestamptz, ended_at timestamptz,
  distance_m numeric, timer_time_s numeric, avg_speed_mps numeric, avg_hr_bpm numeric, avg_power_w numeric,
  raw_fields jsonb NOT NULL DEFAULT '{}', UNIQUE(activity_id, lap_index)
);

CREATE TABLE activity_events (
  id bigserial PRIMARY KEY, activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL, event_type text NOT NULL, event_data text, timer_running boolean,
  raw_fields jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE activity_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  device_index integer, manufacturer text, product text, serial_number text, software_version text,
  sensor_type text, raw_fields jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), athlete_id uuid NOT NULL REFERENCES athletes(id),
  activity_id uuid REFERENCES activities(id), source_kind text NOT NULL, source_reference text NOT NULL,
  status text NOT NULL, attempts integer NOT NULL DEFAULT 0, parser_version text NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]', error_code text, error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX import_jobs_active_source_uq
  ON import_jobs(athlete_id, source_kind, source_reference, parser_version)
  WHERE status IN ('queued','processing','succeeded');

CREATE TABLE daily_metrics (
  athlete_id uuid NOT NULL REFERENCES athletes(id), metric_date date NOT NULL,
  distance_m numeric NOT NULL DEFAULT 0, duration_s numeric NOT NULL DEFAULT 0,
  elevation_gain_m numeric NOT NULL DEFAULT 0, load numeric, fitness numeric, fatigue numeric, form numeric,
  metric_version text NOT NULL, coverage jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (athlete_id, metric_date, metric_version)
);

CREATE TABLE analytics_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), athlete_id uuid NOT NULL REFERENCES athletes(id),
  activity_id uuid REFERENCES activities(id), metric_key text NOT NULL, period_start date, period_end date,
  metric_version text NOT NULL, value jsonb NOT NULL, coverage numeric, confidence text,
  calculated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_lookup_idx ON analytics_results(athlete_id, metric_key, period_end DESC);

CREATE TABLE ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), athlete_id uuid NOT NULL REFERENCES athletes(id),
  insight_type text NOT NULL, model text NOT NULL, prompt_version text NOT NULL,
  evidence_metric_ids uuid[] NOT NULL DEFAULT '{}', content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY, actor_user_id uuid REFERENCES users(id), action text NOT NULL,
  entity_type text NOT NULL, entity_id text, metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
