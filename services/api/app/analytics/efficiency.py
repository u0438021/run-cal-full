"""Within-activity efficiency and decoupling from paired moving samples."""

from collections.abc import Sequence
from itertools import pairwise

from ..models import ActivitySample
from .activity import valid

MIN_HALF_SECONDS = 600


def _weighted_mean(values: list[tuple[float, float]]) -> float | None:
    duration = sum(seconds for _, seconds in values)
    return sum(value * seconds for value, seconds in values) / duration if duration else None


def _split_halves(values: list[tuple[float, float]]) -> tuple[list, list]:
    midpoint = sum(seconds for _, seconds in values) / 2
    first: list[tuple[float, float]] = []
    second: list[tuple[float, float]] = []
    elapsed = 0.0
    for value, seconds in values:
        before = max(0.0, min(seconds, midpoint - elapsed))
        after = seconds - before
        if before:
            first.append((value, before))
        if after:
            second.append((value, after))
        elapsed += seconds
    return first, second


def _decoupling(values: list[tuple[float, float]], unit: str) -> dict:
    first, second = _split_halves(values)
    first_seconds = sum(seconds for _, seconds in first)
    second_seconds = sum(seconds for _, seconds in second)
    available = first_seconds >= MIN_HALF_SECONDS and second_seconds >= MIN_HALF_SECONDS
    first_mean = _weighted_mean(first) if available else None
    second_mean = _weighted_mean(second) if available else None
    drift = (
        (first_mean - second_mean) / first_mean * 100
        if first_mean is not None and first_mean > 0 and second_mean is not None
        else None
    )
    return {
        "available": available,
        "first_half": first_mean,
        "second_half": second_mean,
        "unit": unit,
        "drift_pct": drift,
        "paired_seconds": first_seconds + second_seconds,
        "reason": None if available else "need_20_paired_moving_minutes",
    }


def efficiency(samples: Sequence[ActivitySample]) -> dict:
    """Compare output per heartbeat across equal paired-time halves.

    Positive drift means output per heartbeat fell in the second half. This is
    descriptive and does not adjust for heat, hydration, grade, wind or fatigue.
    """
    rows = sorted(samples, key=lambda sample: (sample.recorded_at, sample.sequence))
    speed_hr: list[tuple[float, float]] = []
    power_hr: list[tuple[float, float]] = []
    observed = 0.0
    for left, right in pairwise(rows):
        seconds = (right.recorded_at - left.recorded_at).total_seconds()
        if not left.is_timer_running or not 0 < seconds <= 5:
            continue
        observed += seconds
        if not valid(left.heart_rate_bpm) or left.heart_rate_bpm <= 0:
            continue
        if valid(left.speed_mps) and left.speed_mps > 0:
            speed_hr.append((left.speed_mps / left.heart_rate_bpm, seconds))
        if valid(left.power_w) and left.power_w > 0:
            power_hr.append((left.power_w / left.heart_rate_bpm, seconds))
    return {
        "metric_version": "efficiency-v1",
        "window_start": rows[0].recorded_at if rows else None,
        "window_end": rows[-1].recorded_at if rows else None,
        "observed_timer_seconds": observed,
        "speed_per_heartbeat": _decoupling(speed_hr, "m/s/bpm"),
        "power_per_heartbeat": _decoupling(power_hr, "W/bpm"),
        "caveat": "Descriptive paired-time comparison; heat, hydration, grade and wind are not adjusted.",
    }
