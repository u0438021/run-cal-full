# Database Schema

The executable starter DDL is in `infra/sql/001_init.sql`. UUIDs are externally safe identifiers; UTC `timestamptz` is used throughout. High-volume samples are separated from activity metadata and indexed by activity/time. Partition or convert the samples table to a Timescale hypertable as volume grows.

SQLAlchemy models are defined in `services/api/app/models.py`. Alembic uses the starter DDL as the authoritative initial migration, so local setup and migrations cannot silently drift apart.

From `services/api`, run `uv run alembic upgrade head` to apply migrations or `uv run alembic downgrade base` to roll back the initial schema.

## Main relationships

```mermaid
erDiagram
  USERS ||--o| ATHLETES : owns
  USERS ||--o{ SESSIONS : has
  ATHLETES ||--o{ ATHLETE_FOLDER_MAPPINGS : imports
  ATHLETES ||--o{ ACTIVITIES : performs
  ACTIVITIES ||--o{ ACTIVITY_LAPS : contains
  ACTIVITIES ||--o{ ACTIVITY_EVENTS : contains
  ACTIVITIES ||--o{ ACTIVITY_SAMPLES : records
  ACTIVITIES ||--o{ ACTIVITY_DEVICES : uses
  ACTIVITIES ||--o{ IMPORT_JOBS : originates
  ATHLETES ||--o{ DAILY_METRICS : aggregates
  ATHLETES ||--o{ ANALYTICS_RESULTS : calculates
  ATHLETES ||--o{ AI_INSIGHTS : receives
```

## Design decisions

- `source_hash` plus athlete identity prevents duplicate uploads. Drive identity also uses provider file ID + version.
- `raw_fields jsonb` retains unmapped values; canonical columns enable fast analytics.
- Power columns coexist: `native_power_w`, `stryd_power_w`, selected `power_w`, and `power_source`.
- Athlete mass and zone settings are effective-dated so historical W/kg remains reproducible.
- Analytics are immutable versioned results keyed by metric, period, and algorithm version.
- Import warnings and field coverage are data, not log-only details.
- Manual uploads are stored under a private athlete-scoped, SHA-256-addressed object key. Active import jobs have a partial unique index so retries cannot queue duplicate work for the same parser version.
- Import processing commits the activity and all samples, laps, events, and devices in one transaction. A failed child write rolls the graph back before the job is marked failed in a separate transaction.
