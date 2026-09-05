from datetime import UTC, datetime, timedelta

import pytest

from app.analytics.power import power_metrics
from app.models import ActivitySample


def rows(values):
    return [
        ActivitySample(
            recorded_at=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=i),
            sequence=i,
            power_w=p,
            is_timer_running=True,
        )
        for i, p in enumerate(values)
    ]


def test_boundaries_zero_and_unknown_power_are_distinct():
    result = power_metrics(rows([0, 199, 200, 300, None, 400]), 50, [200, 300])
    assert [z["seconds"] for z in result["zones"]] == [2, 1, 1]
    assert result["unknown_power_seconds"] == 1
    assert sum(z["fraction"] for z in result["zones"]) == pytest.approx(0.8)
    assert result["watts_per_kg"]["value"] == pytest.approx(699 / 4 / 50)


def test_pauses_and_gaps_are_excluded():
    samples = rows([200, 900, 300, 1000, 400])
    samples[1].is_timer_running = False
    samples[-1].recorded_at += timedelta(seconds=10)
    result = power_metrics(samples, 50, [250])
    assert result["observed_timer_seconds"] == 2
    assert [z["seconds"] for z in result["zones"]] == [1, 1]
    assert result["watts_per_kg"]["value"] == 5


def test_missing_settings_and_empty_samples_remain_unavailable():
    result = power_metrics(rows([200, 200]))
    assert result["watts_per_kg"]["value"] is None
    assert result["watts_per_kg"]["confidence"] == "unavailable"
    assert result["zones"] is None
    result = power_metrics([], 50, [200])
    assert result["watts_per_kg"]["value"] is None
    assert all(z["fraction"] is None for z in result["zones"])


@pytest.mark.parametrize("boundaries", [[], [200, 200], [300, 200], [-1], [float("nan")]])
def test_invalid_boundaries_rejected(boundaries):
    with pytest.raises(ValueError):
        power_metrics([], 50, boundaries)


@pytest.mark.parametrize("weight", [0, -1, float("inf"), float("nan")])
def test_invalid_weight_rejected(weight):
    with pytest.raises(ValueError):
        power_metrics([], weight)
