from datetime import UTC, datetime, timedelta

import pytest

from app.analytics.efficiency import efficiency
from app.models import ActivitySample

START = datetime(2026, 1, 1, tzinfo=UTC)


def samples(seconds=1201):
    return [
        ActivitySample(
            recorded_at=START + timedelta(seconds=index),
            sequence=index,
            speed_mps=4 if index < 600 else 3.6,
            power_w=300 if index < 600 else 270,
            heart_rate_bpm=150,
            is_timer_running=True,
        )
        for index in range(seconds)
    ]


def test_positive_drift_when_output_per_heartbeat_falls():
    result = efficiency(samples())
    assert result["speed_per_heartbeat"]["available"]
    assert result["speed_per_heartbeat"]["drift_pct"] == pytest.approx(10)
    assert result["power_per_heartbeat"]["drift_pct"] == pytest.approx(10)


def test_equal_paired_time_split_can_divide_long_interval():
    rows = samples(2)
    rows[1].recorded_at = START + timedelta(seconds=1200)
    # Gaps over five seconds are intentionally excluded.
    assert not efficiency(rows)["power_per_heartbeat"]["available"]


def test_missing_power_does_not_remove_speed_efficiency():
    rows = samples()
    for row in rows:
        row.power_w = None
    result = efficiency(rows)
    assert result["speed_per_heartbeat"]["available"]
    assert not result["power_per_heartbeat"]["available"]


def test_short_paused_and_stationary_data_are_unavailable():
    rows = samples(1200)
    rows[100].is_timer_running = False
    rows[200].speed_mps = 0
    result = efficiency(rows)
    assert not result["speed_per_heartbeat"]["available"]
    assert result["speed_per_heartbeat"]["drift_pct"] is None
    assert not efficiency([])["power_per_heartbeat"]["available"]
