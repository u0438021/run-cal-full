"""Firebase-compatible Cloud Run entry point for private FIT analytics."""

from __future__ import annotations

import gzip
import json
from datetime import date, datetime
from hashlib import sha256
from io import BytesIO
from math import isfinite
from os import environ
from pathlib import Path
from types import SimpleNamespace
from typing import Annotated, Any
from uuid import UUID

import firebase_admin
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import auth, firestore, storage

from .analytics.activity import FIELDS, power_duration, summarize
from .analytics.efficiency import efficiency
from .analytics.power import power_metrics
from .analytics.relationships import relationships
from .fit.parser import PARSER_VERSION, parse_running_fit
from .insights import (
    PROMPT_VERSION,
    build_evidence,
    evidence_fingerprint,
    generate_insight,
)

app = FastAPI(title="RUN|CAL Firebase Analytics", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[environ.get("WEB_ORIGIN", "https://run-cal-th.web.app")],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)
SERIES_FIELDS = (
    *FIELDS,
    "distance_m",
    "latitude_deg",
    "longitude_deg",
    "elevation_m",
    "grade_pct",
)
MAX_SERIES_JSON_BYTES = 15 * 1024 * 1024


def _firebase_clients():
    try:
        firebase_admin.get_app()
    except ValueError:
        bucket = environ.get("FIREBASE_STORAGE_BUCKET")
        firebase_admin.initialize_app(options={"storageBucket": bucket} if bucket else None)
    return firestore.client(), storage.bucket()


def _json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, float) and not isfinite(value):
        return None
    return value


def _bearer(authorization: str | None = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    try:
        # Firebase Admin Auth needs the default app before token verification.
        # Cloud Run starts with no initialized app, so do this before asking
        # Firebase whether the token has been revoked.
        _firebase_clients()
        return auth.verify_id_token(
            authorization.removeprefix("Bearer ").strip(), check_revoked=True
        )
    except Exception as exc:
        raise HTTPException(401, "Invalid or expired session") from exc


def _activity_refs(database, uid: str, activity_id: str):
    workspace_id, athlete = _athlete_ref(database, uid)
    return (
        workspace_id,
        athlete.collection("activities").document(activity_id),
        athlete.collection("activities").document(activity_id).collection("fitFiles").document(activity_id),
        athlete.collection("monthly"),
    )


def _athlete_ref(database, uid: str):
    user = database.collection("users").document(uid).get()
    if not user.exists or user.to_dict().get("status") != "active":
        raise HTTPException(403, "Account is unavailable")
    workspace_id = user.to_dict().get("workspaceId")
    if not isinstance(workspace_id, str) or not workspace_id:
        raise HTTPException(403, "Workspace access is unavailable")
    workspace = database.collection("workspaces").document(workspace_id)
    member = workspace.collection("members").document(uid).get()
    if not member.exists or "athlete" not in (member.to_dict().get("roles") or []):
        raise HTTPException(403, "Athlete access is unavailable")
    athlete = workspace.collection("athletes").document(uid)
    return workspace_id, athlete


def _build_analytics(parsed: dict, weight_kg: float | None) -> tuple[dict, list[dict]]:
    timer_events = []
    for event in parsed.get("events", []):
        event_type = str(event.get("event_type") or "")
        running = (
            True
            if event_type == "start"
            else False
            if event_type in {"stop", "stop_all", "stop_disable", "stop_disable_all"}
            else None
        )
        if (
            event.get("event") == "timer"
            and isinstance(event.get("timestamp"), datetime)
            and running is not None
        ):
            timer_events.append((event["timestamp"], running))
    timer_events.sort()
    samples = []
    event_index = 0
    running = True
    valid_samples = [
        sample
        for sample in parsed.get("samples", [])
        if isinstance(sample.get("timestamp"), datetime)
    ]
    for sequence, raw in enumerate(sorted(valid_samples, key=lambda sample: sample["timestamp"])):
        timestamp = raw.get("timestamp")
        if not isinstance(timestamp, datetime):
            continue
        while event_index < len(timer_events) and timer_events[event_index][0] <= timestamp:
            running = timer_events[event_index][1]
            event_index += 1
        normalized = {field: raw.get(field) for field in SERIES_FIELDS}
        samples.append(
            SimpleNamespace(
                recorded_at=timestamp, sequence=sequence, is_timer_running=running, **normalized
            )
        )
    payload = {
        "metricVersion": "firebase-analytics-v1",
        "parserVersion": PARSER_VERSION,
        "activity": summarize(samples),
        "powerDuration": power_duration(samples),
        "power": power_metrics(samples, weight_kg),
        "relationships": relationships(samples),
        "efficiency": efficiency(samples),
        "dataQuality": parsed.get("data_quality", {}),
        "activityMeta": {
            "startedAt": parsed.get("activity", {}).get("started_at"),
            "distanceM": parsed.get("activity", {}).get("distance_m"),
        },
    }
    series = [
        {
            "time": sample.recorded_at,
            "running": sample.is_timer_running,
            **{field: getattr(sample, field, None) for field in SERIES_FIELDS},
        }
        for sample in samples
    ]
    return _json_safe(payload), _json_safe(series)


def _dashboard_bucket() -> dict[str, Any]:
    return {"runs": 0, "durationSeconds": 0.0, "distanceM": 0.0, "distanceKnown": False, "weighted": {}}


def _dashboard_result(bucket: dict[str, Any]) -> dict[str, Any]:
    duration = bucket["durationSeconds"]
    metrics = {}
    for key, value in bucket["weighted"].items():
        metrics[key] = value / duration if duration else None
    return {
        "runs": bucket["runs"],
        "durationSeconds": duration,
        "distanceM": bucket["distanceM"] if bucket["distanceKnown"] else None,
        "metrics": metrics,
    }


def _add_dashboard_activity(bucket: dict[str, Any], analytics: dict[str, Any]) -> None:
    activity = analytics.get("activity") or {}
    duration = float(activity.get("observed_timer_seconds") or 0)
    if duration <= 0:
        return
    bucket["runs"] += 1
    bucket["durationSeconds"] += duration
    distance = (analytics.get("activityMeta") or {}).get("distanceM")
    if isinstance(distance, (int, float)) and distance >= 0:
        bucket["distanceM"] += float(distance)
        bucket["distanceKnown"] = True
    for name in ("pace_s_km", "heart_rate_bpm", "power_w", "cadence_spm"):
        value = (activity.get("metrics") or {}).get(name, {}).get("value")
        if isinstance(value, (int, float)):
            bucket["weighted"][name] = bucket["weighted"].get(name, 0.0) + float(value) * duration


def _distance_from_series(bucket, object_key: str) -> float | None:
    """Recover distance for analytics created before activityMeta was introduced."""
    blob = bucket.blob(object_key)
    if not blob.exists():
        return None
    try:
        compressed = blob.download_as_bytes()
        with gzip.GzipFile(fileobj=BytesIO(compressed)) as stream:
            raw_json = stream.read(MAX_SERIES_JSON_BYTES + 1)
        if len(raw_json) > MAX_SERIES_JSON_BYTES:
            return None
        series = json.loads(raw_json)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(series, list):
        return None
    distances = [
        float(row["distance_m"])
        for row in series
        if isinstance(row, dict)
        and isinstance(row.get("distance_m"), (int, float))
        and float(row["distance_m"]) >= 0
    ]
    if len(distances) < 2:
        return None
    return max(distances) - min(distances)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "parser_version": PARSER_VERSION}


@app.get("/v1/dashboard/summary")
def dashboard_summary(claims: Annotated[dict, Depends(_bearer)]) -> dict:
    uid = claims.get("uid") or claims.get("sub")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(401, "Invalid session")
    database, bucket = _firebase_clients()
    workspace, athlete = _athlete_ref(database, uid)
    all_time = _dashboard_bucket()
    months: dict[str, dict[str, Any]] = {}
    weeks: dict[str, dict[str, Any]] = {}
    for activity_doc in (
        athlete.collection("activities")
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .limit(100)
        .stream()
    ):
        activity_data = activity_doc.to_dict()
        if activity_data.get("importStatus") != "analyzed":
            continue
        current = activity_doc.reference.collection("analytics").document("current").get()
        if not current.exists:
            continue
        analytics = current.to_dict()
        meta = analytics.get("activityMeta") or {}
        distance = meta.get("distanceM")
        if not isinstance(distance, (int, float)):
            key = analytics.get("seriesObjectKey")
            expected_prefix = f"analytics/{workspace}/{uid}/{activity_doc.id}/"
            if isinstance(key, str) and key.startswith(expected_prefix):
                recovered = _distance_from_series(bucket, key)
                if recovered is not None:
                    meta = {**meta, "distanceM": recovered}
                    analytics["activityMeta"] = meta
                    current.reference.set({"activityMeta": meta}, merge=True)
        started = (analytics.get("activityMeta") or {}).get("startedAt") or (analytics.get("activity") or {}).get("window_start")
        try:
            started_at = datetime.fromisoformat(started.replace("Z", "+00:00")) if isinstance(started, str) else None
        except ValueError:
            started_at = None
        if started_at is None:
            continue
        month = started_at.strftime("%Y-%m")
        iso_year, iso_week, _weekday = started_at.isocalendar()
        week = f"{iso_year}-W{iso_week:02d}"
        _add_dashboard_activity(all_time, analytics)
        _add_dashboard_activity(months.setdefault(month, _dashboard_bucket()), analytics)
        _add_dashboard_activity(weeks.setdefault(week, _dashboard_bucket()), analytics)
    return {
        "allTime": _dashboard_result(all_time),
        "months": [{"period": period, **_dashboard_result(bucket)} for period, bucket in sorted(months.items(), reverse=True)[:12]],
        "weeks": [{"period": period, **_dashboard_result(bucket)} for period, bucket in sorted(weeks.items(), reverse=True)[:8]],
    }


@app.get("/v1/profile")
def get_profile(claims: Annotated[dict, Depends(_bearer)]) -> dict:
    uid = claims.get("uid") or claims.get("sub")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(401, "Invalid session")
    database, _bucket = _firebase_clients()
    _workspace, athlete = _athlete_ref(database, uid)
    data = athlete.get().to_dict() or {}
    return {
        key: data.get(key)
        for key in ("weightKg", "targetPaceSecondsPerKm", "maxHeartRate")
    }


@app.post("/v1/profile")
def save_profile(profile: dict[str, Any], claims: Annotated[dict, Depends(_bearer)]) -> dict:
    uid = claims.get("uid") or claims.get("sub")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(401, "Invalid session")
    normalized: dict[str, float | None] = {}
    limits = {
        "weightKg": (25, 300),
        "targetPaceSecondsPerKm": (120, 1800),
        "maxHeartRate": (100, 260),
    }
    for key, (minimum, maximum) in limits.items():
        value = profile.get(key)
        if value in (None, ""):
            normalized[key] = None
        elif isinstance(value, (int, float)) and minimum <= float(value) <= maximum:
            normalized[key] = float(value)
        else:
            raise HTTPException(400, f"{key} is invalid")
    database, _bucket = _firebase_clients()
    _workspace, athlete = _athlete_ref(database, uid)
    athlete.set({**normalized, "profileUpdatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    return normalized


@app.post("/v1/activities/{activity_id}/analyze")
def analyze_activity(activity_id: str, claims: Annotated[dict, Depends(_bearer)]) -> dict:
    try:
        UUID(activity_id)
    except ValueError as exc:
        raise HTTPException(400, "Invalid activity ID") from exc
    uid = claims.get("uid") or claims.get("sub")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(401, "Invalid session")
    database, bucket = _firebase_clients()
    workspace_id, activity_ref, file_ref, monthly = _activity_refs(database, uid, activity_id)
    activity, fit_file = activity_ref.get(), file_ref.get()
    if not activity.exists or activity.to_dict().get("deletedAt") is not None:
        raise HTTPException(404, "Activity not found")
    if not fit_file.exists:
        raise HTTPException(404, "Private FIT source not found")
    fit_data = fit_file.to_dict()
    analytics_ref = activity_ref.collection("analytics").document("current")
    current = analytics_ref.get()
    if current.exists:
        current_data = current.to_dict()
        if current_data.get("parserVersion") == PARSER_VERSION and current_data.get(
            "sourceSha256"
        ) == fit_data.get("sha256"):
            return {
                "activityId": activity_id,
                "status": "analyzed",
                "analyticsVersion": current_data.get("metricVersion"),
                "summary": current_data.get("activity"),
                "cached": True,
            }
    object_key = fit_data.get("objectKey")
    expected_prefix = f"fit-staging/{workspace_id}/{uid}/"
    if not isinstance(object_key, str) or not object_key.startswith(expected_prefix):
        raise HTTPException(403, "FIT source is outside the athlete scope")
    blob = bucket.blob(object_key)
    if not blob.exists():
        raise HTTPException(404, "Private FIT source not found")
    if blob.size is not None and blob.size > 25 * 1024 * 1024:
        raise HTTPException(413, "FIT source exceeds 25 MB")
    source_bytes = blob.download_as_bytes()
    if len(source_bytes) > 25 * 1024 * 1024:
        raise HTTPException(413, "FIT source exceeds 25 MB")
    if fit_data.get("sha256") != sha256(source_bytes).hexdigest():
        raise HTTPException(409, "FIT source integrity check failed")
    try:
        parsed = parse_running_fit(source_bytes, Path(fit_data.get("originalName", "run.fit")))
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc
    activity_month = parsed["activity"]["started_at"].date().isoformat()[:7]
    settings = list(
        monthly.where("month", "<=", activity_month)
        .order_by("month", direction=firestore.Query.DESCENDING)
        .limit(1)
        .stream()
    )
    weight = settings[0].to_dict().get("weightKg") if settings else None
    weight = float(weight) if isinstance(weight, (int, float)) else None
    analytics, series = _build_analytics(parsed, weight)
    series_key = f"analytics/{workspace_id}/{uid}/{activity_id}/series-{PARSER_VERSION}.json.gz"
    series_blob = bucket.blob(series_key)
    series_blob.cache_control = "private, no-store"
    series_blob.upload_from_string(
        gzip.compress(json.dumps(series, separators=(",", ":")).encode()),
        content_type="application/json",
        timeout=120,
    )
    analytics.update(
        {
            "sourceSha256": fit_data.get("sha256"),
            "seriesObjectKey": series_key,
            "calculatedAt": firestore.SERVER_TIMESTAMP,
        }
    )
    batch = database.batch()
    batch.set(analytics_ref, analytics)
    batch.update(
        activity_ref,
        {
            "importStatus": "analyzed",
            "analyticsVersion": "firebase-analytics-v1",
            "analyticsUpdatedAt": firestore.SERVER_TIMESTAMP,
        },
    )
    batch.commit()
    return {
        "activityId": activity_id,
        "status": "analyzed",
        "analyticsVersion": "firebase-analytics-v1",
        "summary": analytics["activity"],
        "cached": False,
    }


@app.post("/v1/activities/{activity_id}/delete")
def delete_activity(activity_id: str, claims: Annotated[dict, Depends(_bearer)]) -> dict:
    """Hide an activity from the athlete's history without destroying its source file."""
    try:
        UUID(activity_id)
    except ValueError as exc:
        raise HTTPException(400, "Invalid activity ID") from exc
    uid = claims.get("uid") or claims.get("sub")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(401, "Invalid session")
    database, _bucket = _firebase_clients()
    _workspace, activity_ref, _file_ref, _monthly = _activity_refs(database, uid, activity_id)
    activity = activity_ref.get()
    if not activity.exists or activity.to_dict().get("deletedAt") is not None:
        raise HTTPException(404, "Activity not found")
    activity_ref.update({"deletedAt": firestore.SERVER_TIMESTAMP, "importStatus": "deleted"})
    return {"activityId": activity_id, "status": "deleted"}


@app.get("/v1/activities/{activity_id}/analytics")
def get_activity_analytics(activity_id: str, claims: Annotated[dict, Depends(_bearer)]) -> dict:
    try:
        UUID(activity_id)
    except ValueError as exc:
        raise HTTPException(400, "Invalid activity ID") from exc
    uid = claims.get("uid") or claims.get("sub")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(401, "Invalid session")
    database, _bucket = _firebase_clients()
    _workspace, activity_ref, _file_ref, _monthly = _activity_refs(database, uid, activity_id)
    activity = activity_ref.get()
    if not activity.exists or activity.to_dict().get("deletedAt") is not None:
        raise HTTPException(404, "Activity not found")
    current = activity_ref.collection("analytics").document("current").get()
    if not current.exists:
        raise HTTPException(404, "Analytics have not been calculated")
    payload = current.to_dict()
    payload.pop("seriesObjectKey", None)
    payload.pop("sourceSha256", None)
    return _json_safe(payload)


@app.get("/v1/activities/{activity_id}/series")
def get_activity_series(activity_id: str, claims: Annotated[dict, Depends(_bearer)]) -> dict:
    try:
        UUID(activity_id)
    except ValueError as exc:
        raise HTTPException(400, "Invalid activity ID") from exc
    uid = claims.get("uid") or claims.get("sub")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(401, "Invalid session")
    database, bucket = _firebase_clients()
    workspace, activity_ref, _file_ref, _monthly = _activity_refs(database, uid, activity_id)
    activity = activity_ref.get()
    if not activity.exists or activity.to_dict().get("deletedAt") is not None:
        raise HTTPException(404, "Activity not found")
    current = activity_ref.collection("analytics").document("current").get()
    if not current.exists:
        raise HTTPException(404, "Analytics have not been calculated")
    key = current.to_dict().get("seriesObjectKey")
    expected_prefix = f"analytics/{workspace}/{uid}/{activity_id}/"
    if not isinstance(key, str) or not key.startswith(expected_prefix):
        raise HTTPException(403, "Analytics series is outside the athlete scope")
    blob = bucket.blob(key)
    if not blob.exists():
        raise HTTPException(404, "Analytics series not found")
    compressed = blob.download_as_bytes()
    try:
        with gzip.GzipFile(fileobj=BytesIO(compressed)) as stream:
            raw_json = stream.read(MAX_SERIES_JSON_BYTES + 1)
        if len(raw_json) > MAX_SERIES_JSON_BYTES:
            raise HTTPException(413, "Analytics series is too large")
        series = json.loads(raw_json)
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(500, "Analytics series is invalid") from exc
    if not isinstance(series, list):
        raise HTTPException(500, "Analytics series is invalid")
    stride = max(1, (len(series) + 1999) // 2000)
    return {"activityId": activity_id, "seriesStride": stride, "series": series[::stride]}


@app.post("/v1/activities/{activity_id}/insights")
def create_activity_insight(activity_id: str, claims: Annotated[dict, Depends(_bearer)]) -> dict:
    try:
        UUID(activity_id)
    except ValueError as exc:
        raise HTTPException(400, "Invalid activity ID") from exc
    uid = claims.get("uid") or claims.get("sub")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(401, "Invalid session")
    database, _bucket = _firebase_clients()
    _workspace, activity_ref, _file_ref, _monthly = _activity_refs(database, uid, activity_id)
    activity = activity_ref.get()
    if not activity.exists or activity.to_dict().get("deletedAt") is not None:
        raise HTTPException(404, "Activity not found")
    athlete_ref = activity_ref.parent.parent
    profile = athlete_ref.get()
    if not profile.exists or profile.to_dict().get("aiInsightsEnabled") is not True:
        raise HTTPException(412, "AI insights require athlete opt-in")
    current = activity_ref.collection("analytics").document("current").get()
    if not current.exists:
        raise HTTPException(412, "Calculate analytics before requesting an insight")
    evidence = build_evidence(current.to_dict())
    if not evidence["items"]:
        raise HTTPException(422, "There is not enough analytics evidence")
    model = environ.get("OPENAI_MODEL", "").strip()
    api_key = environ.get("OPENAI_API_KEY", "").strip()
    if not model or not api_key:
        raise HTTPException(503, "AI insights are not configured")
    fingerprint = evidence_fingerprint(evidence)
    insight_ref = activity_ref.collection("insights").document("current")
    existing = insight_ref.get()
    if existing.exists:
        saved = existing.to_dict()
        if (
            saved.get("evidenceFingerprint") == fingerprint
            and saved.get("promptVersion") == PROMPT_VERSION
            and saved.get("model") == model
        ):
            return {
                "activityId": activity_id,
                "content": saved.get("content"),
                "cached": True,
            }
    try:
        content, response_id = generate_insight(
            evidence,
            api_key,
            model,
            safety_identifier=sha256(uid.encode()).hexdigest(),
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (RuntimeError, TypeError, httpx.HTTPError) as exc:
        raise HTTPException(502, "AI insight generation failed") from exc
    insight_ref.set(
        {
            "content": content,
            "model": model,
            "promptVersion": PROMPT_VERSION,
            "evidenceFingerprint": fingerprint,
            "evidenceIds": [reference["id"] for reference in content["evidence"]],
            "providerResponseId": response_id,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
    )
    return {"activityId": activity_id, "content": content, "cached": False}
