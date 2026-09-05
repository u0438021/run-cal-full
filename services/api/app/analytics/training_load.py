from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from math import exp, isfinite


@dataclass(frozen=True)
class TrainingState:
    fitness: float
    fatigue: float
    form: float


def ewma(previous: float, daily_load: float, time_constant_days: float) -> float:
    """Discrete exponentially weighted training load."""
    if not all(isfinite(v) and v >= 0 for v in (previous, daily_load)):
        raise ValueError("State and load must be finite and nonnegative")
    if not isfinite(time_constant_days) or time_constant_days <= 0:
        raise ValueError("Time constant must be positive and finite")
    alpha = 1.0 - exp(-1.0 / time_constant_days)
    return previous + alpha * (daily_load - previous)


def next_training_state(
    previous_fitness: float, previous_fatigue: float, load: float
) -> TrainingState:
    fitness = ewma(previous_fitness, load, 42.0)
    fatigue = ewma(previous_fatigue, load, 7.0)
    return TrainingState(fitness=fitness, fatigue=fatigue, form=fitness - fatigue)


def training_history(
    loads: Mapping[date, float | None],
    start: date,
    end: date,
    initial_fitness: float = 0,
    initial_fatigue: float = 0,
) -> dict:
    """A missing day is unknown, not rest. Explicit zero represents known rest.

    Unknown load invalidates all later states: an EWMA cannot be reconstructed
    without that load. Callers may start a new window with a declared seed.
    """
    if end < start or (end - start).days > 3650:
        raise ValueError("History window must contain 1–3651 days")
    ewma(initial_fitness, 0, 42)
    ewma(initial_fatigue, 0, 7)
    fitness, fatigue = initial_fitness, initial_fatigue
    rows = []
    known = 0
    available = True
    day = start
    while day <= end:
        load = loads.get(day)
        if load is not None:
            if not isfinite(load) or load < 0:
                raise ValueError("Daily load must be finite and nonnegative")
            known += 1
        else:
            available = False
        if available:
            state = next_training_state(fitness, fatigue, load)
            fitness, fatigue = state.fitness, state.fatigue
        rows.append(
            {
                "date": day.isoformat(),
                "load": load,
                "fitness": fitness if available else None,
                "fatigue": fatigue if available else None,
                "form": fitness - fatigue if available else None,
            }
        )
        day += timedelta(days=1)
    return {
        "metric_version": "training-load-v1",
        "days": rows,
        "coverage": known / len(rows),
        "confidence": "unavailable" if not available else "low" if len(rows) < 42 else "moderate",
        "initial_fitness": initial_fitness,
        "initial_fatigue": initial_fatigue,
        "assumption": "Declared initial state; all loads must use the same method.",
    }


def project_training(history: dict, planned_loads: Sequence[float] | None = None) -> dict:
    """30-day scenarios, not a training prescription or physiological forecast."""
    rows = history.get("days", [])
    baseline = rows[-28:]
    if len(baseline) < 28 or any(row["load"] is None for row in baseline):
        return {
            "metric_version": "training-load-v1",
            "available": False,
            "reason": "At least 28 complete days are required",
            "scenarios": {},
        }
    last = rows[-1]
    if last["fitness"] is None or last["fatigue"] is None:
        return {
            "metric_version": "training-load-v1",
            "available": False,
            "reason": "Historical state is unavailable",
            "scenarios": {},
        }
    mean_load = sum(row["load"] for row in baseline) / 28
    schedules = {"rest": [0.0] * 30, "maintain": [mean_load] * 30}
    if planned_loads is not None:
        if len(planned_loads) != 30:
            raise ValueError("Plan must contain exactly 30 daily loads")
        schedules["planned"] = list(planned_loads)
    first = date.fromisoformat(last["date"]) + timedelta(days=1)
    scenarios = {}
    for name, schedule in schedules.items():
        scenarios[name] = training_history(
            {first + timedelta(days=i): load for i, load in enumerate(schedule)},
            first,
            first + timedelta(days=29),
            last["fitness"],
            last["fatigue"],
        )["days"]
    return {
        "metric_version": "training-load-v1",
        "available": True,
        "confidence": "low",
        "baseline_daily_load": mean_load,
        "scenarios": scenarios,
        "assumption": "Rest uses zero; maintain repeats the last 28-day average; planned uses supplied loads.",
    }
