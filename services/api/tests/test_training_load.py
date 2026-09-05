from datetime import date, timedelta
from math import exp

import pytest

from app.analytics.training_load import (
    ewma,
    next_training_state,
    project_training,
    training_history,
)


def test_zero_load_decays_fatigue_faster_than_fitness() -> None:
    state = next_training_state(50.0, 50.0, 0.0)
    assert state.fitness > state.fatigue
    assert state.form > 0


def test_constant_load_matches_closed_form():
    start = date(2026, 1, 1)
    loads = {start + timedelta(days=i): 50 for i in range(42)}
    history = training_history(loads, start, start + timedelta(days=41))
    last = history["days"][-1]
    assert last["fitness"] == pytest.approx(50 * (1 - exp(-1)))
    assert last["fatigue"] == pytest.approx(50 * (1 - exp(-6)))
    assert history["coverage"] == 1


def test_unknown_day_is_not_assumed_rest():
    start = date(2026, 1, 1)
    history = training_history(
        {start: 0, start + timedelta(days=2): 50}, start, start + timedelta(days=2), 50, 50
    )
    assert history["days"][0]["fitness"] == pytest.approx(50 * exp(-1 / 42))
    assert history["days"][1]["fitness"] is None
    assert history["days"][2]["fitness"] is None
    assert history["coverage"] == pytest.approx(2 / 3)
    assert history["confidence"] == "unavailable"


def test_projection_uses_future_dates_and_separate_scenarios():
    start = date(2026, 1, 1)
    history = training_history(
        {start + timedelta(days=i): 50 for i in range(28)},
        start,
        start + timedelta(days=27),
        50,
        50,
    )
    result = project_training(history, [50] * 30)
    assert result["available"]
    scenarios = result["scenarios"]
    assert len(scenarios["rest"]) == 30
    assert scenarios["rest"][0]["date"] == "2026-01-29"
    assert scenarios["rest"][-1]["fitness"] == pytest.approx(50 * exp(-30 / 42))
    assert scenarios["maintain"][-1]["fitness"] == pytest.approx(50)
    assert scenarios["planned"] == scenarios["maintain"]
    assert history["days"][-1]["date"] == "2026-01-28"
    with pytest.raises(ValueError):
        project_training(history, [50])


def test_short_history_has_no_projection():
    start = date(2026, 1, 1)
    assert not project_training(training_history({start: 0}, start, start))["available"]


@pytest.mark.parametrize("load", [-1, float("nan"), float("inf")])
def test_invalid_load_is_rejected(load):
    with pytest.raises(ValueError):
        next_training_state(0, 0, load)


def test_invalid_time_constant_is_rejected():
    with pytest.raises(ValueError):
        ewma(0, 0, 0)
