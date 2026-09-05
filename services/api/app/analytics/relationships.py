"""Descriptive paired bins, not causal or physiological inference."""

from collections.abc import Sequence
from itertools import pairwise
from math import floor

from ..models import ActivitySample
from .activity import valid


def relationships(samples: Sequence[ActivitySample]) -> dict:
    """25 W bins; at least 30 paired seconds in a bin before showing a mean.

    Uses simultaneous measurements, without HR lag correction or steady-state
    selection. Coverage includes every observed timer interval, even stationary
    intervals which are excluded from paired comparisons.
    """
    rows = sorted(samples, key=lambda s: (s.recorded_at, s.sequence))
    total = 0.0
    groups: dict[str, dict[int, list[tuple[float, float]]]] = {
        "speed_by_power": {},
        "hr_by_power": {},
    }
    for a, b in pairwise(rows):
        dt = (b.recorded_at - a.recorded_at).total_seconds()
        if not a.is_timer_running or not 0 < dt <= 5:
            continue
        total += dt
        if not valid(a.power_w) or a.power_w <= 0 or not valid(a.speed_mps) or a.speed_mps <= 0:
            continue
        bucket = floor(a.power_w / 25) * 25
        groups["speed_by_power"].setdefault(bucket, []).append((a.speed_mps, dt))
        if valid(a.heart_rate_bpm) and a.heart_rate_bpm > 0:
            groups["hr_by_power"].setdefault(bucket, []).append((a.heart_rate_bpm, dt))
    comparisons = {}
    for key, buckets in groups.items():
        bins = []
        covered = 0.0
        for lower, pairs in sorted(buckets.items()):
            seconds = sum(dt for _, dt in pairs)
            covered += seconds
            bins.append(
                {
                    "lower_power_w": lower,
                    "upper_power_w_exclusive": lower + 25,
                    "paired_seconds": seconds,
                    "mean": sum(v * dt for v, dt in pairs) / seconds if seconds >= 30 else None,
                }
            )
        available = any(b["mean"] is not None for b in bins)
        comparisons[key] = {
            "bins": bins,
            "unit": "m/s" if key == "speed_by_power" else "bpm",
            "coverage": covered / total if total else 0,
            "available": available,
            "reason": None if available else "need_30_paired_seconds_in_a_bin",
        }
    return {
        "metric_version": "relationships-v1",
        "window_start": rows[0].recorded_at if rows else None,
        "window_end": rows[-1].recorded_at if rows else None,
        "observed_timer_seconds": total,
        "comparisons": comparisons,
        "caveat": "Descriptive simultaneous pairs only; no HR-lag, terrain or steady-state adjustment. Not evidence of improved fitness.",
    }
