from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.analytics.activity import power_duration, summarize
from app.dependencies import CurrentUser
from app.fit.parser import normalize_record
from app.import_processor import build_activity_graph
from app.models import Activity, ActivitySample, ImportJob
from app.routers.activities import activity_detail

START = datetime(2026, 1, 1, tzinfo=UTC)


def test_running_cadence_includes_both_feet_and_fractional_part():
    assert normalize_record({"cadence": 85, "fractional_cadence": 0.5})["cadence_spm"] == 171
    assert normalize_record({})["cadence_spm"] is None


def sample(second, power=200, running=True, **kwargs):
    return ActivitySample(
        recorded_at=START + timedelta(seconds=second),
        sequence=second,
        power_w=power,
        is_timer_running=running,
        **kwargs,
    )


def test_weighted_mean_and_paired_ratio():
    result = summarize(
        [
            sample(0, 100, speed_mps=2, form_power_w=25),
            sample(1, 300, speed_mps=4, form_power_w=60),
            sample(4),
        ]
    )
    assert result["metrics"]["power_w"]["value"] == 250
    assert result["metrics"]["pace_s_km"]["value"] == pytest.approx(1000 / 3.5)
    assert result["metrics"]["form_power_ratio"]["value"] == pytest.approx(21.25)


def test_pauses_gaps_missing_and_nonfinite_are_not_fabricated():
    result = summarize(
        [
            sample(0, None),
            sample(1, float("nan")),
            sample(2, 900, False),
            sample(3, 1000),
            sample(20),
        ]
    )
    assert result["observed_timer_seconds"] == 2
    assert result["metrics"]["power_w"]["value"] is None
    assert result["metrics"]["power_w"]["coverage"] == 0
    assert summarize([])["metrics"]["pace_s_km"]["value"] is None


def test_power_curve_requires_continuous_samples():
    rows = [sample(i, 100 + i * 10) for i in range(10)]
    assert power_duration(rows, (5, 30)) == [
        {"seconds": 5, "watts": 170},
        {"seconds": 30, "watts": None},
    ]
    rows[4].is_timer_running = False
    rows[7].recorded_at += timedelta(seconds=30)
    assert power_duration(rows, (5,))[0]["watts"] is None


def test_persisted_samples_follow_timer_events_only():
    job = ImportJob(
        athlete_id=uuid4(),
        source_reference="a" * 64,
        source_kind="manual",
        source_file_name="synthetic.fit",
        source_object_key="test.fit",
    )
    parsed = {
        "parser_version": "test",
        "activity": {"sport": "running", "started_at": START},
        "samples": [{"timestamp": START + timedelta(seconds=i)} for i in range(4)],
        "events": [
            {"timestamp": START + timedelta(seconds=1), "event": "timer", "event_type": "stop_all"},
            {"timestamp": START + timedelta(seconds=2), "event": "lap", "event_type": "start"},
            {"timestamp": START + timedelta(seconds=3), "event": "timer", "event_type": "start"},
        ],
    }
    _, children = build_activity_graph(job, parsed)
    assert [s.is_timer_running for s in children if isinstance(s, ActivitySample)] == [
        True,
        False,
        False,
        True,
    ]


def test_activity_detail_denies_other_athlete_before_loading_samples():
    class Database:
        def get(self, *_args):
            return Activity(id=uuid4(), athlete_id=uuid4())

        def scalar(self, _statement):
            return None

        def scalars(self, _statement):
            pytest.fail("Must not load another athlete's samples")

    with pytest.raises(HTTPException) as error:
        activity_detail(uuid4(), CurrentUser(uuid4(), "runner", "athlete", uuid4()), Database())
    assert error.value.status_code == 403


def test_detail_exposes_full_resolution_relationships_without_raw_data():
    class Database:
        def __init__(self):
            self.results = [[sample(i, speed_mps=3, heart_rate_bpm=150) for i in range(31)], []]

        def get(self, *_args):
            return Activity(id=uuid4(), athlete_id=uuid4(), started_at=START)

        def scalars(self, _statement):
            values = self.results.pop(0)

            class Result:
                def all(self):
                    return values

            return Result()

    result = activity_detail(uuid4(), CurrentUser(uuid4(), "admin", "admin", uuid4()), Database())
    comparison = result["relationships"]["comparisons"]["hr_by_power"]
    assert comparison["available"] is True
    assert comparison["bins"][0]["mean"] == 150
    assert "raw_fields" not in result["series"][0]
