"""Versioned, time-weighted metrics. Gaps and pauses are never interpolated."""

from itertools import pairwise
from math import isfinite

VERSION = "activity-v1"
FIELDS = {
    "speed_mps": "m/s",
    "heart_rate_bpm": "bpm",
    "power_w": "W",
    "cadence_spm": "spm",
    "form_power_w": "W",
    "air_power_w": "W",
    "ground_contact_time_ms": "ms",
    "vertical_oscillation_mm": "mm",
    "stride_length_m": "m",
    "leg_spring_stiffness_kn_m": "kN/m",
}


def valid(value):
    return value is not None and isfinite(float(value)) and float(value) >= 0


def summarize(samples):
    rows = sorted(samples, key=lambda s: (s.recorded_at, s.sequence))
    intervals = []
    for a, b in pairwise(rows):
        seconds = (b.recorded_at - a.recorded_at).total_seconds()
        if 0 < seconds <= 5 and a.is_timer_running:
            intervals.append((a, seconds))
    duration = sum(dt for _, dt in intervals)
    metrics = {}
    for field, unit in FIELDS.items():
        values = [(float(getattr(s, field)), dt) for s, dt in intervals if valid(getattr(s, field))]
        covered = sum(dt for _, dt in values)
        coverage = covered / duration if duration else 0
        metrics[field] = {
            "value": sum(v * dt for v, dt in values) / covered
            if covered and coverage >= 0.5
            else None,
            "unit": unit,
            "coverage": coverage,
            "confidence": "high"
            if coverage >= 0.9
            else "low"
            if coverage >= 0.5
            else "unavailable",
        }
    speed = metrics["speed_mps"]
    metrics["pace_s_km"] = {
        **speed,
        "unit": "s/km",
        "value": 1000 / speed["value"] if speed["value"] else None,
    }
    pairs = [
        (s.form_power_w / s.power_w * 100, dt)
        for s, dt in intervals
        if valid(s.form_power_w) and valid(s.power_w) and s.power_w > 0
    ]
    covered = sum(dt for _, dt in pairs)
    coverage = covered / duration if duration else 0
    metrics["form_power_ratio"] = {
        "value": sum(v * dt for v, dt in pairs) / covered if coverage >= 0.5 else None,
        "unit": "%",
        "coverage": coverage,
        "confidence": "high" if coverage >= 0.9 else "low" if coverage >= 0.5 else "unavailable",
    }
    return {
        "metric_version": VERSION,
        "observed_timer_seconds": duration,
        "window_start": rows[0].recorded_at if rows else None,
        "window_end": rows[-1].recorded_at if rows else None,
        "metrics": metrics,
    }


def power_duration(samples, durations=(5, 30, 60, 300, 1200)):
    """Best mean over uninterrupted one-second samples; no gap filling."""
    rows = sorted(samples, key=lambda s: (s.recorded_at, s.sequence))
    runs, run = [], []
    previous = None
    for row in rows:
        if previous and (row.recorded_at - previous.recorded_at).total_seconds() != 1:
            runs.append(run)
            run = []
        if row.is_timer_running and valid(row.power_w):
            run.append(float(row.power_w))
        else:
            runs.append(run)
            run = []
        previous = row
    runs.append(run)
    results = []
    for seconds in durations:
        best = None
        for values in runs:
            total = sum(values[:seconds])
            if len(values) >= seconds:
                best = max(best or 0, total / seconds)
            for index in range(seconds, len(values)):
                total += values[index] - values[index - seconds]
                best = max(best or 0, total / seconds)
        results.append({"seconds": seconds, "watts": best})
    return results
