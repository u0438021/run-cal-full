from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, BYTEA, JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def uuid_pk():
    return mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)


def created_at_column():
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


def json_object_column():
    return mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin','coach','athlete')", name="users_role_ck"),
        CheckConstraint("status IN ('active','locked','disabled')", name="users_status_ck"),
    )
    id: Mapped[UUID] = uuid_pk()
    username: Mapped[str] = mapped_column(Text, nullable=False)
    username_normalized: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    pin_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="active")
    failed_login_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class Athlete(Base):
    __tablename__ = "athletes"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), unique=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    timezone: Mapped[str] = mapped_column(Text, nullable=False, server_default="UTC")
    unit_system: Mapped[str] = mapped_column(Text, nullable=False, server_default="metric")
    ai_insights_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = created_at_column()


class CoachAthlete(Base):
    __tablename__ = "coach_athletes"
    coach_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    athlete_id: Mapped[UUID] = mapped_column(ForeignKey("athletes.id", ondelete="CASCADE"), primary_key=True)


class AthleteSettingsHistory(Base):
    __tablename__ = "athlete_settings_history"
    __table_args__ = (UniqueConstraint("athlete_id", "effective_from"),)
    id: Mapped[UUID] = uuid_pk()
    athlete_id: Mapped[UUID] = mapped_column(ForeignKey("athletes.id"), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    max_hr: Mapped[int | None] = mapped_column(SmallInteger)
    threshold_hr: Mapped[int | None] = mapped_column(SmallInteger)
    critical_power_w: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    zones: Mapped[dict[str, Any]] = json_object_column()


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[UUID] = uuid_pk()
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class DriveConnection(Base):
    __tablename__ = "drive_connections"
    id: Mapped[UUID] = uuid_pk()
    owner_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    encrypted_refresh_token: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    account_label: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()


class AthleteFolderMapping(Base):
    __tablename__ = "athlete_folder_mappings"
    __table_args__ = (UniqueConstraint("connection_id", "folder_id"), UniqueConstraint("athlete_id", "connection_id"))
    id: Mapped[UUID] = uuid_pk()
    athlete_id: Mapped[UUID] = mapped_column(ForeignKey("athletes.id"), nullable=False)
    connection_id: Mapped[UUID] = mapped_column(ForeignKey("drive_connections.id"), nullable=False)
    folder_id: Mapped[str] = mapped_column(Text, nullable=False)
    sync_cursor: Mapped[str | None] = mapped_column(Text)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


class Activity(Base):
    __tablename__ = "activities"
    __table_args__ = (
        CheckConstraint("source_kind IN ('manual','google_drive')", name="activities_source_kind_ck"),
        UniqueConstraint("athlete_id", "source_hash"),
        Index("activities_drive_version_uq", "athlete_id", "drive_file_id", "drive_version", unique=True, postgresql_where=text("drive_file_id IS NOT NULL")),
    )
    id: Mapped[UUID] = uuid_pk()
    athlete_id: Mapped[UUID] = mapped_column(ForeignKey("athletes.id"), nullable=False)
    source_hash: Mapped[str] = mapped_column(Text, nullable=False)
    source_kind: Mapped[str] = mapped_column(Text, nullable=False)
    source_file_name: Mapped[str] = mapped_column(Text, nullable=False)
    source_object_key: Mapped[str] = mapped_column(Text, nullable=False)
    drive_file_id: Mapped[str | None] = mapped_column(Text)
    drive_version: Mapped[str | None] = mapped_column(Text)
    parser_version: Mapped[str] = mapped_column(Text, nullable=False)
    sport: Mapped[str] = mapped_column(Text, nullable=False)
    subsport: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    local_utc_offset_minutes: Mapped[int | None] = mapped_column(SmallInteger)
    elapsed_time_s: Mapped[Decimal | None] = mapped_column(Numeric)
    timer_time_s: Mapped[Decimal | None] = mapped_column(Numeric)
    moving_time_s: Mapped[Decimal | None] = mapped_column(Numeric)
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric)
    elevation_gain_m: Mapped[Decimal | None] = mapped_column(Numeric)
    elevation_loss_m: Mapped[Decimal | None] = mapped_column(Numeric)
    calories: Mapped[int | None] = mapped_column(Integer)
    avg_speed_mps: Mapped[Decimal | None] = mapped_column(Numeric)
    max_speed_mps: Mapped[Decimal | None] = mapped_column(Numeric)
    avg_hr_bpm: Mapped[Decimal | None] = mapped_column(Numeric)
    max_hr_bpm: Mapped[int | None] = mapped_column(SmallInteger)
    avg_power_w: Mapped[Decimal | None] = mapped_column(Numeric)
    max_power_w: Mapped[Decimal | None] = mapped_column(Numeric)
    power_source: Mapped[str | None] = mapped_column(Text)
    data_quality: Mapped[dict[str, Any]] = json_object_column()
    raw_summary: Mapped[dict[str, Any]] = json_object_column()
    created_at: Mapped[datetime] = created_at_column()


class ActivitySample(Base):
    __tablename__ = "activity_samples"
    __table_args__ = (Index("activity_samples_activity_time_idx", "activity_id", "recorded_at"),)
    activity_id: Mapped[UUID] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), primary_key=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True)
    distance_m: Mapped[float | None] = mapped_column(Float)
    speed_mps: Mapped[float | None] = mapped_column(Float)
    heart_rate_bpm: Mapped[int | None] = mapped_column(SmallInteger)
    latitude_deg: Mapped[float | None] = mapped_column(Float)
    longitude_deg: Mapped[float | None] = mapped_column(Float)
    elevation_m: Mapped[float | None] = mapped_column(Float)
    grade_pct: Mapped[float | None] = mapped_column(Float)
    cadence_spm: Mapped[float | None] = mapped_column(Float)
    native_power_w: Mapped[float | None] = mapped_column(Float)
    stryd_power_w: Mapped[float | None] = mapped_column(Float)
    power_w: Mapped[float | None] = mapped_column(Float)
    power_source: Mapped[str | None] = mapped_column(Text)
    form_power_w: Mapped[float | None] = mapped_column(Float)
    air_power_w: Mapped[float | None] = mapped_column(Float)
    leg_spring_stiffness_kn_m: Mapped[float | None] = mapped_column(Float)
    ground_contact_time_ms: Mapped[float | None] = mapped_column(Float)
    vertical_oscillation_mm: Mapped[float | None] = mapped_column(Float)
    stride_length_m: Mapped[float | None] = mapped_column(Float)
    is_timer_running: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    raw_fields: Mapped[dict[str, Any]] = json_object_column()


class ActivityLap(Base):
    __tablename__ = "activity_laps"
    __table_args__ = (UniqueConstraint("activity_id", "lap_index"),)
    id: Mapped[UUID] = uuid_pk()
    activity_id: Mapped[UUID] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), nullable=False)
    lap_index: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric)
    timer_time_s: Mapped[Decimal | None] = mapped_column(Numeric)
    avg_speed_mps: Mapped[Decimal | None] = mapped_column(Numeric)
    avg_hr_bpm: Mapped[Decimal | None] = mapped_column(Numeric)
    avg_power_w: Mapped[Decimal | None] = mapped_column(Numeric)
    raw_fields: Mapped[dict[str, Any]] = json_object_column()


class ActivityEvent(Base):
    __tablename__ = "activity_events"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    activity_id: Mapped[UUID] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    event_data: Mapped[str | None] = mapped_column(Text)
    timer_running: Mapped[bool | None] = mapped_column(Boolean)
    raw_fields: Mapped[dict[str, Any]] = json_object_column()


class ActivityDevice(Base):
    __tablename__ = "activity_devices"
    id: Mapped[UUID] = uuid_pk()
    activity_id: Mapped[UUID] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), nullable=False)
    device_index: Mapped[int | None] = mapped_column(Integer)
    manufacturer: Mapped[str | None] = mapped_column(Text)
    product: Mapped[str | None] = mapped_column(Text)
    serial_number: Mapped[str | None] = mapped_column(Text)
    software_version: Mapped[str | None] = mapped_column(Text)
    sensor_type: Mapped[str | None] = mapped_column(Text)
    raw_fields: Mapped[dict[str, Any]] = json_object_column()


class ImportJob(Base):
    __tablename__ = "import_jobs"
    __table_args__ = (
        Index(
            "import_jobs_active_source_uq",
            "athlete_id",
            "source_kind",
            "source_reference",
            "parser_version",
            unique=True,
            postgresql_where=text("status IN ('queued','processing','succeeded')"),
        ),
    )
    id: Mapped[UUID] = uuid_pk()
    athlete_id: Mapped[UUID] = mapped_column(ForeignKey("athletes.id"), nullable=False)
    activity_id: Mapped[UUID | None] = mapped_column(ForeignKey("activities.id"))
    source_kind: Mapped[str] = mapped_column(Text, nullable=False)
    source_reference: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    parser_version: Mapped[str] = mapped_column(Text, nullable=False)
    warnings: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    error_code: Mapped[str | None] = mapped_column(Text)
    error_detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class DailyMetric(Base):
    __tablename__ = "daily_metrics"
    athlete_id: Mapped[UUID] = mapped_column(ForeignKey("athletes.id"), primary_key=True)
    metric_date: Mapped[date] = mapped_column(Date, primary_key=True)
    metric_version: Mapped[str] = mapped_column(Text, primary_key=True)
    distance_m: Mapped[Decimal] = mapped_column(Numeric, nullable=False, server_default="0")
    duration_s: Mapped[Decimal] = mapped_column(Numeric, nullable=False, server_default="0")
    elevation_gain_m: Mapped[Decimal] = mapped_column(Numeric, nullable=False, server_default="0")
    load: Mapped[Decimal | None] = mapped_column(Numeric)
    fitness: Mapped[Decimal | None] = mapped_column(Numeric)
    fatigue: Mapped[Decimal | None] = mapped_column(Numeric)
    form: Mapped[Decimal | None] = mapped_column(Numeric)
    coverage: Mapped[dict[str, Any]] = json_object_column()


class AnalyticsResult(Base):
    __tablename__ = "analytics_results"
    __table_args__ = (Index("analytics_lookup_idx", "athlete_id", "metric_key", text("period_end DESC")),)
    id: Mapped[UUID] = uuid_pk()
    athlete_id: Mapped[UUID] = mapped_column(ForeignKey("athletes.id"), nullable=False)
    activity_id: Mapped[UUID | None] = mapped_column(ForeignKey("activities.id"))
    metric_key: Mapped[str] = mapped_column(Text, nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    metric_version: Mapped[str] = mapped_column(Text, nullable=False)
    value: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    coverage: Mapped[Decimal | None] = mapped_column(Numeric)
    confidence: Mapped[str | None] = mapped_column(Text)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class AIInsight(Base):
    __tablename__ = "ai_insights"
    id: Mapped[UUID] = uuid_pk()
    athlete_id: Mapped[UUID] = mapped_column(ForeignKey("athletes.id"), nullable=False)
    insight_type: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_version: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_metric_ids: Mapped[list[UUID]] = mapped_column(ARRAY(PGUUID(as_uuid=True)), nullable=False, server_default=text("'{}'::uuid[]"))
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = created_at_column()
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
