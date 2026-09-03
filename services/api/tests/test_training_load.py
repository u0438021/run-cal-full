from app.analytics.training_load import next_training_state


def test_zero_load_decays_fatigue_faster_than_fitness() -> None:
    state = next_training_state(50.0, 50.0, 0.0)
    assert state.fitness > state.fatigue
    assert state.form > 0

