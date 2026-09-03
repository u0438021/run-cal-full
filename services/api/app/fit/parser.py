from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import fitdecode


def _field_map(frame: Any) -> dict[str, Any]:
    return {field.name: field.value for field in frame.fields}


def parse_running_fit(data: bytes, filename: Path) -> dict[str, Any]:
    """Decode the structural subset needed to validate the ingestion pipeline.

    The production implementation must add the metadata-driven developer field registry
    specified in docs/FIT_FIELD_MAPPING.md before it is considered Stryd-compatible.
    """
    messages: dict[str, list[dict[str, Any]]] = {
        "session": [], "lap": [], "event": [], "record": [],
        "device_info": [], "developer_data_id": [], "field_description": [],
    }
    try:
        with fitdecode.FitReader(io.BytesIO(data), check_crc=fitdecode.CrcCheck.WARN) as fit:
            for frame in fit:
                if isinstance(frame, fitdecode.FitDataMessage) and frame.name in messages:
                    messages[frame.name].append(_field_map(frame))
    except Exception as exc:
        raise ValueError(f"Invalid FIT file {filename.name}: {exc}") from exc

    sessions = messages["session"]
    sports = {str(item.get("sport", "")).lower() for item in sessions}
    if sessions and not any("running" in sport for sport in sports):
        raise ValueError("FIT activity is not a running activity")

    return {
        "file_name": filename.name,
        "sport": next(iter(sports), "unknown"),
        "counts": {name: len(items) for name, items in messages.items()},
        "developer_field_descriptions": messages["field_description"],
        "warning": "Preview decoder only; persistence and Stryd normalization are Phase 2 work.",
    }

