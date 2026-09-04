from __future__ import annotations

import io
import re
from collections.abc import Iterable, Mapping
from datetime import datetime
from pathlib import Path
from typing import Any

import fitdecode  # type: ignore[import-untyped]

PARSER_VERSION = "0.2.0"
SEMICIRCLES_TO_DEGREES = 180.0 / (2**31)

_DEVELOPER_ALIASES = {
    "power": "stryd_power_w",
    "strydpower": "stryd_power_w",
    "runningpower": "stryd_power_w",
    "formpower": "form_power_w",
    "airpower": "air_power_w",
    "legspringstiffness": "leg_spring_stiffness_kn_m",
    "lss": "leg_spring_stiffness_kn_m",
    "groundcontacttime": "ground_contact_time_ms",
    "groundtime": "ground_contact_time_ms",
    "gct": "ground_contact_time_ms",
    "verticaloscillation": "vertical_oscillation_mm",
    "stridelength": "stride_length_m",
}

_COMPATIBLE_UNITS = {
    "stryd_power_w": {"w", "watt", "watts"},
    "form_power_w": {"w", "watt", "watts"},
    "air_power_w": {"w", "watt", "watts"},
    "leg_spring_stiffness_kn_m": {"knm", "knpermeter", "nm", "newtonpermeter"},
    "ground_contact_time_ms": {"ms", "millisecond", "milliseconds"},
    "vertical_oscillation_mm": {
        "mm", "millimeter", "millimeters", "cm", "centimeter", "centimeters"
    },
    "stride_length_m": {"m", "meter", "meters"},
}


def _field_map(frame: Any) -> dict[str, Any]:
    return {
        field.name: field.value
        for field in frame.fields
        if not getattr(field.field_def, "is_dev", False)
    }


def _developer_field_map(frame: Any) -> dict[tuple[int, int], Any]:
    values: dict[tuple[int, int], Any] = {}
    for field in frame.fields:
        definition = field.field_def
        if definition is None or not getattr(definition, "is_dev", False):
            continue
        values[(int(definition.dev_data_index), int(definition.def_num))] = field.value
    return values


def _canonical_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def _first(fields: Mapping[str, Any], *names: str) -> Any:
    return next((fields[name] for name in names if fields.get(name) is not None), None)


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coordinate(value: Any) -> float | None:
    number = _number(value)
    if number is None:
        return None
    return number * SEMICIRCLES_TO_DEGREES if abs(number) > 180 else number


def _is_stryd_identity(identity: Mapping[str, Any]) -> bool:
    manufacturer = identity.get("manufacturer_id")
    return manufacturer == 95 or _canonical_name(str(manufacturer or "")) == "stryd"


def _canonical_developer_field(name: str, units: Any) -> str | None:
    canonical_name = _canonical_name(name)
    canonical_units = _canonical_name(str(units or ""))
    canonical = _DEVELOPER_ALIASES.get(canonical_name)
    if canonical is None and canonical_units:
        canonical = _DEVELOPER_ALIASES.get(canonical_name.removesuffix(canonical_units))
    if canonical is None or canonical_units not in _COMPATIBLE_UNITS[canonical]:
        return None
    return canonical


def build_developer_registry(
    descriptions: Iterable[Mapping[str, Any]],
    developer_ids: Iterable[Mapping[str, Any]] = (),
) -> dict[tuple[int, int], dict[str, Any]]:
    """Resolve developer fields from FIT metadata, never fixed field numbers."""
    identities = {
        int(item["developer_data_index"]): dict(item)
        for item in developer_ids
        if item.get("developer_data_index") is not None
    }
    registry: dict[tuple[int, int], dict[str, Any]] = {}
    for item in descriptions:
        developer_index = item.get("developer_data_index")
        field_number = item.get("field_definition_number")
        if developer_index is None or field_number is None:
            continue
        developer_index = int(developer_index)
        field_number = int(field_number)
        name = str(item.get("field_name") or "")
        identity = identities.get(developer_index, {})
        verified_source = "stryd" if _is_stryd_identity(identity) else None
        canonical = (
            _canonical_developer_field(name, item.get("units"))
            if verified_source == "stryd"
            else None
        )
        registry[(developer_index, field_number)] = {
            "canonical_field": canonical,
            "field_name": name,
            "units": item.get("units"),
            "scale": item.get("scale"),
            "offset": item.get("offset"),
            "native_mesg_num": item.get("native_mesg_num"),
            "native_field_num": item.get("native_field_num"),
            "developer_data_index": developer_index,
            "field_definition_number": field_number,
            "developer_id": identity.get("developer_id"),
            "application_id": identity.get("application_id"),
            "manufacturer_id": identity.get("manufacturer_id"),
            "verified_source": verified_source,
        }
    return registry


def _developer_values(
    values: Mapping[tuple[int, int], Any],
    registry: Mapping[tuple[int, int], Mapping[str, Any]],
) -> tuple[dict[str, float], list[dict[str, Any]]]:
    normalized: dict[str, float] = {}
    raw: list[dict[str, Any]] = []
    for key, value in values.items():
        metadata = dict(registry.get(key, {}))
        raw.append({
            "developer_data_index": key[0],
            "field_definition_number": key[1],
            "value": value,
            **metadata,
        })
        canonical = metadata.get("canonical_field")
        number = _number(value)
        if not canonical or number is None:
            continue
        units = _canonical_name(str(metadata.get("units") or ""))
        if canonical == "leg_spring_stiffness_kn_m" and units in {
            "nm", "newtonpermeter"
        }:
            number /= 1000.0
        elif canonical == "vertical_oscillation_mm" and units in {
            "cm", "centimeter", "centimeters"
        }:
            number *= 10.0
        normalized[str(canonical)] = number
    return normalized, raw


def normalize_record(
    fields: Mapping[str, Any],
    registry: Mapping[tuple[int, int], Mapping[str, Any]] | None = None,
    developer_values: Mapping[tuple[int, int], Any] | None = None,
) -> dict[str, Any]:
    developer, raw_developer = _developer_values(developer_values or {}, registry or {})
    native_power = _number(fields.get("power"))
    stryd_power = developer.get("stryd_power_w")
    return {
        "timestamp": fields.get("timestamp"),
        "distance_m": _number(fields.get("distance")),
        "speed_mps": _number(_first(fields, "enhanced_speed", "speed")),
        "heart_rate_bpm": _number(fields.get("heart_rate")),
        "latitude_deg": _coordinate(fields.get("position_lat")),
        "longitude_deg": _coordinate(fields.get("position_long")),
        "elevation_m": _number(_first(fields, "enhanced_altitude", "altitude")),
        "grade_pct": _number(fields.get("grade")),
        "cadence_spm": _number(fields.get("cadence")),
        "native_power_w": native_power,
        "stryd_power_w": stryd_power,
        "power_w": stryd_power if stryd_power is not None else native_power,
        "power_source": (
            "stryd_developer" if stryd_power is not None
            else "native_fit" if native_power is not None
            else None
        ),
        "form_power_w": developer.get("form_power_w"),
        "air_power_w": developer.get("air_power_w"),
        "leg_spring_stiffness_kn_m": developer.get("leg_spring_stiffness_kn_m"),
        "ground_contact_time_ms": developer.get("ground_contact_time_ms"),
        "vertical_oscillation_mm": developer.get("vertical_oscillation_mm"),
        "stride_length_m": developer.get("stride_length_m"),
        "raw_fields": dict(fields),
        "raw_developer_fields": raw_developer,
    }


def _coverage(samples: list[dict[str, Any]], field: str) -> float:
    if not samples:
        return 0.0
    return round(sum(item.get(field) is not None for item in samples) / len(samples), 4)


def parse_running_fit(data: bytes, filename: Path) -> dict[str, Any]:
    messages: dict[str, list[dict[str, Any]]] = {
        "session": [], "lap": [], "event": [], "record": [],
        "device_info": [], "developer_data_id": [], "field_description": [],
    }
    record_frames: list[Any] = []
    try:
        with fitdecode.FitReader(io.BytesIO(data), check_crc=fitdecode.CrcCheck.WARN) as fit:
            for frame in fit:
                if isinstance(frame, fitdecode.FitDataMessage) and frame.name in messages:
                    messages[frame.name].append(_field_map(frame))
                    if frame.name == "record":
                        record_frames.append(frame)
    except Exception as exc:
        raise ValueError(f"Invalid FIT file {filename.name}: {exc}") from exc

    sessions = messages["session"]
    sports = {str(item.get("sport", "")).casefold() for item in sessions}
    if not sessions:
        raise ValueError("FIT file has no session message")
    if not any("running" in sport for sport in sports):
        raise ValueError("FIT activity is not a running activity")

    session = sessions[0]
    registry = build_developer_registry(
        messages["field_description"], messages["developer_data_id"]
    )
    samples = [
        normalize_record(fields, registry, _developer_field_map(frame))
        for fields, frame in zip(messages["record"], record_frames, strict=True)
    ]
    timestamps = [
        item["timestamp"] for item in samples if isinstance(item["timestamp"], datetime)
    ]
    return {
        "parser_version": PARSER_VERSION,
        "file_name": filename.name,
        "activity": {
            "sport": session.get("sport"),
            "subsport": _first(session, "sub_sport", "subsport"),
            "started_at": _first(session, "start_time", "timestamp"),
            "elapsed_time_s": session.get("total_elapsed_time"),
            "timer_time_s": session.get("total_timer_time"),
            "distance_m": session.get("total_distance"),
            "elevation_gain_m": session.get("total_ascent"),
            "elevation_loss_m": session.get("total_descent"),
            "calories": session.get("total_calories"),
            "avg_speed_mps": _first(session, "enhanced_avg_speed", "avg_speed"),
            "max_speed_mps": _first(session, "enhanced_max_speed", "max_speed"),
            "avg_hr_bpm": session.get("avg_heart_rate"),
            "max_hr_bpm": session.get("max_heart_rate"),
            "avg_power_w": session.get("avg_power"),
            "max_power_w": session.get("max_power"),
            "raw_summary": session,
        },
        "samples": samples,
        "laps": messages["lap"],
        "events": messages["event"],
        "devices": messages["device_info"],
        "developer_fields": list(registry.values()),
        "data_quality": {
            "sample_count": len(samples),
            "timestamps_ordered": timestamps == sorted(timestamps),
            "coverage": {
                field: _coverage(samples, field)
                for field in (
                    "heart_rate_bpm", "latitude_deg", "speed_mps", "power_w",
                    "stryd_power_w",
                )
            },
        },
    }
