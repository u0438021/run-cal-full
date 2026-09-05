from collections.abc import Mapping
from datetime import date, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .fit.parser import parse_running_fit
from .models import (
    Activity,
    ActivityDevice,
    ActivityEvent,
    ActivityLap,
    ActivitySample,
    ImportJob,
)
from .storage import FitStorage


def _json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _sample_models(activity_id: UUID, samples: list[dict[str, Any]]) -> list[ActivitySample]:
    models: list[ActivitySample] = []
    for sequence, sample in enumerate(samples):
        recorded_at = sample.get("timestamp")
        if not isinstance(recorded_at, datetime):
            continue
        raw_fields = {
            "native": _json_safe(sample.get("raw_fields", {})),
            "developer": _json_safe(sample.get("raw_developer_fields", [])),
        }
        models.append(
            ActivitySample(
                activity_id=activity_id,
                recorded_at=recorded_at,
                sequence=sequence,
                distance_m=sample.get("distance_m"),
                speed_mps=sample.get("speed_mps"),
                heart_rate_bpm=sample.get("heart_rate_bpm"),
                latitude_deg=sample.get("latitude_deg"),
                longitude_deg=sample.get("longitude_deg"),
                elevation_m=sample.get("elevation_m"),
                grade_pct=sample.get("grade_pct"),
                cadence_spm=sample.get("cadence_spm"),
                native_power_w=sample.get("native_power_w"),
                stryd_power_w=sample.get("stryd_power_w"),
                power_w=sample.get("power_w"),
                power_source=sample.get("power_source"),
                form_power_w=sample.get("form_power_w"),
                air_power_w=sample.get("air_power_w"),
                leg_spring_stiffness_kn_m=sample.get("leg_spring_stiffness_kn_m"),
                ground_contact_time_ms=sample.get("ground_contact_time_ms"),
                vertical_oscillation_mm=sample.get("vertical_oscillation_mm"),
                stride_length_m=sample.get("stride_length_m"),
                raw_fields=raw_fields,
            )
        )
    return models


def _lap_models(activity_id: UUID, laps: list[dict[str, Any]]) -> list[ActivityLap]:
    return [
        ActivityLap(
            activity_id=activity_id,
            lap_index=index,
            started_at=lap.get("start_time"),
            ended_at=lap.get("timestamp"),
            distance_m=lap.get("total_distance"),
            timer_time_s=lap.get("total_timer_time"),
            avg_speed_mps=lap.get("enhanced_avg_speed") or lap.get("avg_speed"),
            avg_hr_bpm=lap.get("avg_heart_rate"),
            avg_power_w=lap.get("avg_power"),
            raw_fields=_json_safe(lap),
        )
        for index, lap in enumerate(laps)
    ]


def _event_models(activity_id: UUID, events: list[dict[str, Any]]) -> list[ActivityEvent]:
    models: list[ActivityEvent] = []
    for event in events:
        occurred_at = event.get("timestamp")
        if not isinstance(occurred_at, datetime):
            continue
        event_name = str(event.get("event") or "unknown")
        event_data = event.get("event_type")
        timer_running = (
            (
                True
                if event_data == "start"
                else False
                if event_data in {"stop", "stop_all", "stop_disable", "stop_disable_all"}
                else None
            )
            if event_name == "timer"
            else None
        )
        models.append(
            ActivityEvent(
                activity_id=activity_id,
                occurred_at=occurred_at,
                event_type=event_name,
                event_data=str(event_data) if event_data is not None else None,
                timer_running=timer_running,
                raw_fields=_json_safe(event),
            )
        )
    return models


def _device_models(activity_id: UUID, devices: list[dict[str, Any]]) -> list[ActivityDevice]:
    return [
        ActivityDevice(
            activity_id=activity_id,
            device_index=device.get("device_index"),
            manufacturer=str(device["manufacturer"])
            if device.get("manufacturer") is not None
            else None,
            product=str(device.get("garmin_product") or device.get("product"))
            if device.get("garmin_product") is not None or device.get("product") is not None
            else None,
            serial_number=str(device["serial_number"])
            if device.get("serial_number") is not None
            else None,
            software_version=str(device["software_version"])
            if device.get("software_version") is not None
            else None,
            sensor_type=str(device.get("antplus_device_type") or device.get("source_type"))
            if device.get("antplus_device_type") is not None
            or device.get("source_type") is not None
            else None,
            raw_fields=_json_safe(device),
        )
        for device in devices
    ]


def build_activity_graph(job: ImportJob, parsed: dict[str, Any]) -> tuple[Activity, list[Any]]:
    summary = parsed["activity"]
    started_at = summary.get("started_at")
    if not isinstance(started_at, datetime):
        raise TypeError("FIT activity has no valid start timestamp")
    samples = parsed.get("samples", [])
    has_stryd = any(sample.get("stryd_power_w") is not None for sample in samples)
    has_native = any(sample.get("native_power_w") is not None for sample in samples)
    activity = Activity(
        id=uuid4(),
        athlete_id=job.athlete_id,
        source_hash=job.source_reference,
        source_kind=job.source_kind,
        source_file_name=job.source_file_name,
        source_object_key=job.source_object_key,
        parser_version=parsed["parser_version"],
        sport=str(summary["sport"]),
        subsport=str(summary["subsport"]) if summary.get("subsport") is not None else None,
        started_at=started_at,
        elapsed_time_s=summary.get("elapsed_time_s"),
        timer_time_s=summary.get("timer_time_s"),
        distance_m=summary.get("distance_m"),
        elevation_gain_m=summary.get("elevation_gain_m"),
        elevation_loss_m=summary.get("elevation_loss_m"),
        calories=summary.get("calories"),
        avg_speed_mps=summary.get("avg_speed_mps"),
        max_speed_mps=summary.get("max_speed_mps"),
        avg_hr_bpm=summary.get("avg_hr_bpm"),
        max_hr_bpm=summary.get("max_hr_bpm"),
        avg_power_w=summary.get("avg_power_w"),
        max_power_w=summary.get("max_power_w"),
        power_source="stryd_developer" if has_stryd else "native_fit" if has_native else None,
        data_quality=_json_safe(parsed.get("data_quality", {})),
        raw_summary=_json_safe(summary.get("raw_summary", {})),
    )
    children: list[Any] = []
    children.extend(_sample_models(activity.id, samples))
    children.extend(_lap_models(activity.id, parsed.get("laps", [])))
    children.extend(_event_models(activity.id, parsed.get("events", [])))
    children.extend(_device_models(activity.id, parsed.get("devices", [])))
    timer_events = sorted(
        (e for e in children if isinstance(e, ActivityEvent) and e.timer_running is not None),
        key=lambda e: e.occurred_at,
    )
    event_index = 0
    running = True
    for sample in sorted(
        (s for s in children if isinstance(s, ActivitySample)),
        key=lambda s: (s.recorded_at, s.sequence),
    ):
        while (
            event_index < len(timer_events)
            and timer_events[event_index].occurred_at <= sample.recorded_at
        ):
            running = timer_events[event_index].timer_running
            event_index += 1
        sample.is_timer_running = running
    return activity, children


def process_import_job(database: Session, storage: FitStorage, job_id: UUID) -> ImportJob:
    job = database.scalar(select(ImportJob).where(ImportJob.id == job_id).with_for_update())
    if job is None:
        raise LookupError("Import job not found")
    if job.status == "succeeded":
        return job
    if job.status not in {"queued", "failed"}:
        raise RuntimeError(f"Import job cannot run from status {job.status}")

    job.status = "processing"
    job.attempts += 1
    job.error_code = None
    job.error_detail = None
    database.commit()

    try:
        source = storage.path_for(job.source_object_key)
        parsed = parse_running_fit(source.read_bytes(), Path(job.source_file_name))
        activity, children = build_activity_graph(job, parsed)
        database.add(activity)
        database.flush()
        for child in children:
            child.activity_id = activity.id
        database.add_all(children)
        job.activity_id = activity.id
        job.status = "succeeded"
        quality = parsed.get("data_quality", {})
        job.warnings = [] if quality.get("timestamps_ordered", True) else ["timestamps_not_ordered"]
        database.commit()
        return job
    except Exception as exc:
        database.rollback()
        failed_job = database.get(ImportJob, job_id)
        if failed_job is not None:
            failed_job.status = "failed"
            invalid_fit = isinstance(exc, (TypeError, ValueError))
            failed_job.error_code = "invalid_fit" if invalid_fit else "processing_error"
            failed_job.error_detail = str(exc)[:500] if invalid_fit else "Import processing failed"
            database.commit()
        raise
