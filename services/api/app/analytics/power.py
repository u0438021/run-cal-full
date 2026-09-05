"""Explicit athlete settings only; no inferred weight or default power zones."""

from bisect import bisect_right
from collections.abc import Sequence
from itertools import pairwise
from math import isfinite

from ..models import ActivitySample
from .activity import summarize, valid


def power_metrics(
    samples: Sequence[ActivitySample],
    weight_kg: float | None = None,
    zone_boundaries_w: Sequence[float] | None = None,
) -> dict:
    """Settings must be those effective at the activity's start timestamp.

    Boundaries are strictly increasing internal cutoffs: [200, 300] defines
    [0,200), [200,300), [300,infinity). Fractions use observed timer seconds,
    including unknown-power intervals in the denominator.
    """
    if weight_kg is not None and (not isfinite(weight_kg) or weight_kg <= 0):
        raise ValueError("Weight must be positive and finite")
    boundaries = None if zone_boundaries_w is None else list(zone_boundaries_w)
    if boundaries is not None:
        if not boundaries or len(boundaries) > 19:
            raise ValueError("Provide 1–19 internal zone boundaries")
        if any(not isfinite(v) or v <= 0 for v in boundaries):
            raise ValueError("Zone boundaries must be positive and finite")
        if any(a >= b for a, b in pairwise(boundaries)):
            raise ValueError("Zone boundaries must be strictly increasing")
    summary = summarize(samples)
    power = summary["metrics"]["power_w"]
    watts_per_kg = {
        **power,
        "unit": "W/kg",
        "value": power["value"] / weight_kg
        if power["value"] is not None and weight_kg is not None
        else None,
        "reason": "weight_not_configured"
        if weight_kg is None
        else "insufficient_power"
        if power["value"] is None
        else None,
    }
    if watts_per_kg["value"] is None:
        watts_per_kg["confidence"] = "unavailable"
    zones = None
    unknown_seconds = 0.0
    if boundaries is not None:
        durations = [0.0] * (len(boundaries) + 1)
        rows = sorted(samples, key=lambda s: (s.recorded_at, s.sequence))
        for a, b in pairwise(rows):
            dt = (b.recorded_at - a.recorded_at).total_seconds()
            if not a.is_timer_running or not 0 < dt <= 5:
                continue
            if valid(a.power_w):
                durations[bisect_right(boundaries, a.power_w)] += dt
            else:
                unknown_seconds += dt
        total = summary["observed_timer_seconds"]
        zones = [
            {
                "zone": i + 1,
                "lower_w": 0 if i == 0 else boundaries[i - 1],
                "upper_w_exclusive": boundaries[i] if i < len(boundaries) else None,
                "seconds": duration,
                "fraction": duration / total if total else None,
            }
            for i, duration in enumerate(durations)
        ]
    return {
        "metric_version": "power-v1",
        "window_start": summary["window_start"],
        "window_end": summary["window_end"],
        "weight_kg": weight_kg,
        "watts_per_kg": watts_per_kg,
        "zones": zones,
        "zone_reason": "zones_not_configured" if boundaries is None else None,
        "unknown_power_seconds": unknown_seconds if boundaries is not None else None,
        "observed_timer_seconds": summary["observed_timer_seconds"],
        "power_coverage": power["coverage"],
    }
