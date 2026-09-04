from fastapi.testclient import TestClient

from app.main import app
from app.routers import imports

client = TestClient(app)
ATHLETE_ID = "00000000-0000-0000-0000-000000000001"


def test_fit_validation_error_is_returned_as_unprocessable(monkeypatch) -> None:
    def reject_fit(*_args, **_kwargs) -> dict:
        raise ValueError("FIT activity is not a running activity")

    monkeypatch.setattr(imports, "parse_running_fit", reject_fit)

    response = client.post(
        f"/v1/athletes/{ATHLETE_ID}/fit-files",
        files={"file": ("ride.fit", b"not-a-real-fit", "application/octet-stream")},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "FIT activity is not a running activity"}


def test_non_fit_extension_is_rejected() -> None:
    response = client.post(
        f"/v1/athletes/{ATHLETE_ID}/fit-files",
        files={"file": ("activity.csv", b"data", "text/csv")},
    )

    assert response.status_code == 415
