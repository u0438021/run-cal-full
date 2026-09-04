"""Create the initial RUN|CAL schema."""

from pathlib import Path

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    schema_file = Path(__file__).resolve().parents[4] / "infra" / "sql" / "001_init.sql"
    op.execute(schema_file.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS audit_log;
        DROP TABLE IF EXISTS ai_insights;
        DROP TABLE IF EXISTS analytics_results;
        DROP TABLE IF EXISTS daily_metrics;
        DROP TABLE IF EXISTS import_jobs;
        DROP TABLE IF EXISTS activity_devices;
        DROP TABLE IF EXISTS activity_events;
        DROP TABLE IF EXISTS activity_laps;
        DROP TABLE IF EXISTS activity_samples;
        DROP TABLE IF EXISTS activities;
        DROP TABLE IF EXISTS athlete_folder_mappings;
        DROP TABLE IF EXISTS drive_connections;
        DROP TABLE IF EXISTS auth_sessions;
        DROP TABLE IF EXISTS athlete_settings_history;
        DROP TABLE IF EXISTS coach_athletes;
        DROP TABLE IF EXISTS athletes;
        DROP TABLE IF EXISTS users;
        """
    )
