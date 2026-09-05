from datetime import UTC, datetime, timedelta

import pytest

from app.analytics.relationships import relationships
from app.models import ActivitySample


def sample(t, power=200, speed=3, hr=150, running=True):
    return ActivitySample(
        recorded_at=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=t),
        sequence=t,
        power_w=power,
        speed_mps=speed,
        heart_rate_bpm=hr,
        is_timer_running=running,
    )


def test_time_weighted_bin_and_exact_cutoff():
    rows = [sample(t, speed=2 if t < 10 else 4) for t in range(0, 31, 5)]
    result = relationships(rows)["comparisons"]
    speed = result["speed_by_power"]["bins"][0]
    assert speed["lower_power_w"] == 200
    assert speed["upper_power_w_exclusive"] == 225
    assert speed["mean"] == pytest.approx(100 / 30)
    assert result["hr_by_power"]["bins"][0]["mean"] == 150


def test_missing_hr_does_not_remove_speed_and_short_bins_are_unavailable():
    result = relationships([sample(i, hr=None) for i in range(31)])["comparisons"]
    assert result["speed_by_power"]["available"]
    assert not result["hr_by_power"]["available"]
    short = relationships([sample(i) for i in range(30)])["comparisons"]
    assert short["speed_by_power"]["bins"][0]["mean"] is None


def test_gaps_pauses_and_stationary_samples_do_not_become_pairs():
    result = relationships([sample(0, running=False), sample(1, speed=0), sample(2), sample(20)])
    assert result["observed_timer_seconds"] == 1
    assert result["comparisons"]["speed_by_power"]["coverage"] == 0
    assert not relationships([])["comparisons"]["hr_by_power"]["available"]
