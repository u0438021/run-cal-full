from pathlib import Path

from app.fit.parser import parse_running_fit

FIXTURES = Path(__file__).parent / "fixtures"


def parse_fixture(name: str) -> dict:
    path = FIXTURES / name
    return parse_running_fit(path.read_bytes(), path)


def test_synthetic_garmin_binary_uses_native_power_without_real_location() -> None:
    result = parse_fixture("synthetic_garmin_running.fit")

    assert result["activity"]["sport"] == "running"
    assert len(result["samples"]) == 3
    assert result["samples"][0]["power_w"] == 240
    assert result["samples"][0]["power_source"] == "native_fit"
    assert result["data_quality"]["coverage"]["latitude_deg"] == 0.0


def test_synthetic_stryd_binary_resolves_developer_fields_by_metadata() -> None:
    result = parse_fixture("synthetic_stryd_running.fit")
    first = result["samples"][0]

    assert first["native_power_w"] == 240
    assert first["stryd_power_w"] == 250
    assert first["power_w"] == 250
    assert first["power_source"] == "stryd_developer"
    assert first["form_power_w"] == 55
    assert first["air_power_w"] == 4
    assert first["leg_spring_stiffness_kn_m"] == 95
    assert result["data_quality"]["coverage"]["stryd_power_w"] == 1.0
