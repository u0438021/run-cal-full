from app.fit.parser import build_developer_registry, normalize_record

STRYD_ID = {"developer_data_index": 0, "manufacturer_id": "stryd"}


def test_stryd_power_wins_over_native_power() -> None:
    registry = build_developer_registry([{
        "developer_data_index": 0, "field_definition_number": 1,
        "field_name": "Running Power", "units": "watts",
    }], [STRYD_ID])
    sample = normalize_record({"power": 270}, registry, {(0, 1): 281})
    assert sample["native_power_w"] == 270
    assert sample["stryd_power_w"] == 281
    assert sample["power_w"] == 281
    assert sample["power_source"] == "stryd_developer"


def test_native_power_is_used_when_stryd_is_missing() -> None:
    sample = normalize_record({"power": 255})
    assert sample["power_w"] == 255
    assert sample["power_source"] == "native_fit"


def test_coordinates_and_dynamic_units_are_normalized() -> None:
    registry = build_developer_registry([
        {"developer_data_index": 0, "field_definition_number": 2,
         "field_name": "Leg Spring Stiffness", "units": "N/m"},
        {"developer_data_index": 0, "field_definition_number": 3,
         "field_name": "Vertical Oscillation", "units": "cm"},
    ], [STRYD_ID])
    sample = normalize_record({
        "position_lat": 2**30, "position_long": -(2**30),
    }, registry, {(0, 2): 10500, (0, 3): 8.2})
    assert sample["latitude_deg"] == 90.0
    assert sample["longitude_deg"] == -90.0
    assert sample["leg_spring_stiffness_kn_m"] == 10.5
    assert sample["vertical_oscillation_mm"] == 82.0


def test_unverified_developer_power_never_overrides_native_power() -> None:
    registry = build_developer_registry([{
        "developer_data_index": 4, "field_definition_number": 7,
        "field_name": "Running Power", "units": "watts",
    }], [{"developer_data_index": 4, "manufacturer_id": "garmin"}])

    sample = normalize_record({"power": 250}, registry, {(4, 7): 999})

    assert sample["stryd_power_w"] is None
    assert sample["power_w"] == 250
    assert sample["power_source"] == "native_fit"
    assert sample["raw_developer_fields"][0]["value"] == 999


def test_incompatible_units_are_retained_but_not_normalized() -> None:
    registry = build_developer_registry([{
        "developer_data_index": 0, "field_definition_number": 8,
        "field_name": "Running Power", "units": "bpm",
    }], [STRYD_ID])

    sample = normalize_record({}, registry, {(0, 8): 180})

    assert sample["stryd_power_w"] is None
    assert sample["raw_developer_fields"][0]["units"] == "bpm"
