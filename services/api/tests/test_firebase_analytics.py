from pathlib import Path

from fastapi.testclient import TestClient

from app.firebase_main import _bearer, _build_analytics, app
from app.fit.parser import parse_running_fit

FIXTURES = Path(__file__).parent / "fixtures"
client = TestClient(app)


def test_firebase_payload_uses_real_parser_and_contains_no_location_trace():
    fixture = FIXTURES / "synthetic_stryd_running.fit"
    parsed = parse_running_fit(fixture.read_bytes(), fixture)
    analytics, series = _build_analytics(parsed, 50)
    assert analytics["metricVersion"] == "firebase-analytics-v1"
    assert analytics["power"]["weight_kg"] == 50
    assert series
    assert "latitude_deg" not in analytics
    assert "longitude_deg" not in analytics
    assert "latitude_deg" in series[0]
    assert "longitude_deg" in series[0]
    assert "raw_fields" not in series[0]


def test_health_does_not_require_cloud_credentials():
    assert client.get("/health").json()["status"] == "ok"


def test_analytics_requires_a_firebase_session():
    response = client.get("/v1/activities/00000000-0000-0000-0000-000000000001/analytics")
    assert response.status_code == 401


def test_invalid_activity_id_is_rejected_before_cloud_access():
    app.dependency_overrides[_bearer] = lambda: {"uid": "athlete"}
    try:
        response = client.get("/v1/activities/not-a-uuid/analytics")
        assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()
