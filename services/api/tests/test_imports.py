from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.dependencies import CurrentUser, authorize_athlete_access, get_db, verify_csrf
from app.main import app
from app.models import Activity, ImportJob
from app.storage import StoredObject, get_fit_storage

client = TestClient(app)
ATHLETE_ID = "00000000-0000-0000-0000-000000000001"


class FakeStorage:
    async def save(self, athlete_id: UUID, _upload) -> StoredObject:
        return StoredObject(
            key=f"{athlete_id}/{'a' * 64}.fit",
            sha256="a" * 64,
            size_bytes=128,
            path=Path("private.fit"),
            already_existed=False,
        )


class FakeDatabase:
    def __init__(self, scalar_results: list[object | None] | None = None):
        self.scalar_results = list(scalar_results or [])
        self.added: list[object] = []
        self.commits = 0

    def scalar(self, _statement):
        return self.scalar_results.pop(0) if self.scalar_results else None

    def add(self, item: object) -> None:
        self.added.append(item)

    def flush(self) -> None:
        for item in self.added:
            if isinstance(item, ImportJob) and item.id is None:
                item.id = uuid4()

    def commit(self) -> None:
        self.commits += 1


def allow_test_athlete() -> CurrentUser:
    return CurrentUser(uuid4(), "test-admin", "admin", uuid4())


@pytest.fixture(autouse=True)
def dependency_overrides():
    database = FakeDatabase()
    app.dependency_overrides[authorize_athlete_access] = allow_test_athlete
    app.dependency_overrides[get_db] = lambda: database
    app.dependency_overrides[get_fit_storage] = FakeStorage
    app.dependency_overrides[verify_csrf] = lambda: None
    yield database
    app.dependency_overrides.clear()


def test_valid_fit_is_stored_and_queued(dependency_overrides: FakeDatabase) -> None:
    response = client.post(
        f"/v1/athletes/{ATHLETE_ID}/fit-files",
        files={"file": ("run.fit", b"fit-bytes", "application/octet-stream")},
    )

    assert response.status_code == 202
    assert response.json()["status"] == "queued"
    assert response.json()["source_hash"] == "a" * 64
    assert len(dependency_overrides.added) == 1
    assert dependency_overrides.commits == 1


def test_existing_activity_returns_duplicate(dependency_overrides: FakeDatabase) -> None:
    activity = Activity(id=uuid4())
    dependency_overrides.scalar_results = [activity]

    response = client.post(
        f"/v1/athletes/{ATHLETE_ID}/fit-files",
        files={"file": ("run.fit", b"same-fit", "application/octet-stream")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "athlete_id": ATHLETE_ID,
        "status": "duplicate",
        "activity_id": str(activity.id),
        "source_hash": "a" * 64,
    }
    assert dependency_overrides.added == []


def test_non_fit_extension_is_rejected() -> None:
    response = client.post(
        f"/v1/athletes/{ATHLETE_ID}/fit-files",
        files={"file": ("activity.csv", b"data", "text/csv")},
    )

    assert response.status_code == 415


def test_upload_requires_csrf():
    del app.dependency_overrides[verify_csrf]
    response = client.post(
        f"/v1/athletes/{ATHLETE_ID}/fit-files",
        files={"file": ("run.fit", b"fit-bytes", "application/octet-stream")},
    )
    assert response.status_code == 403
