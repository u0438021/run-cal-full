from dataclasses import dataclass


@dataclass(frozen=True)
class TrainingState:
    fitness: float
    fatigue: float
    form: float


def ewma(previous: float, daily_load: float, time_constant_days: float) -> float:
    """Discrete exponentially weighted training load."""
    alpha = 1.0 - pow(2.718281828459045, -1.0 / time_constant_days)
    return previous + alpha * (daily_load - previous)


def next_training_state(previous_fitness: float, previous_fatigue: float, load: float) -> TrainingState:
    fitness = ewma(previous_fitness, load, 42.0)
    fatigue = ewma(previous_fatigue, load, 7.0)
    return TrainingState(fitness=fitness, fatigue=fatigue, form=fitness - fatigue)

