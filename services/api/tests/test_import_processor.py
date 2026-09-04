from pathlib import Path
from uuid import uuid4

import pytest

from app.import_processor import process_import_job
from app.models import Activity, ActivitySample, ImportJob

FIXTURES = Path(__file__).parent / "fixtures"


class StubStorage:
    def __init__(self, path: Path):
        self.path = path

    def path_for(self, _key: str) -> Path:
        return self.path


class FakeDatabase:
    def __init__(self, job: ImportJob):
        self.job = job
        self.added: list[object] = []
        self.commits = 0
        self.rollbacks = 0

    def scalar(self, _statement):
        return self.job

    def add(self, item: object) -> None:
        self.added.append(item)

    def add_all(self, items: list[object]) -> None:
        self.added.extend(items)

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1
        self.added.clear()

    def get(self, _model, _identifier):
        return self.job


def make_job() -> ImportJob:
    return ImportJob(
        id=uuid4(),
        athlete_id=uuid4(),
        source_kind="manual",
        source_reference="a" * 64,
        source_file_name="synthetic.fit",
        source_object_key="athlete/hash.fit",
        status="queued",
        attempts=0,
        parser_version="0.2.0",
        warnings=[],
    )


def test_processor_persists_activity_graph_and_completes_job() -> None:
    job = make_job()
    database = FakeDatabase(job)
    storage = StubStorage(FIXTURES / "synthetic_stryd_running.fit")

    result = process_import_job(database, storage, job.id)

    activities = [item for item in database.added if isinstance(item, Activity)]
    samples = [item for item in database.added if isinstance(item, ActivitySample)]
    assert result.status == "succeeded"
    assert result.activity_id == activities[0].id
    assert activities[0].power_source == "stryd_developer"
    assert len(samples) == 3
    assert all(sample.activity_id == activities[0].id for sample in samples)
    assert database.commits == 2
    assert database.rollbacks == 0


def test_processor_rolls_back_graph_and_marks_invalid_fit_failed(tmp_path) -> None:
    bad_fit = tmp_path / "invalid.fit"
    bad_fit.write_bytes(b"not-fit")
    job = make_job()
    database = FakeDatabase(job)

    with pytest.raises(ValueError):
        process_import_job(database, StubStorage(bad_fit), job.id)

    assert database.added == []
    assert database.rollbacks == 1
    assert database.commits == 2
    assert job.status == "failed"
    assert job.error_code == "invalid_fit"
