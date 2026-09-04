import io
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile

from app import storage
from app.storage import LocalFitStorage


@pytest.mark.anyio
async def test_local_storage_streams_to_hash_addressed_private_path(tmp_path) -> None:
    athlete_id = uuid4()
    backend = LocalFitStorage(tmp_path)

    first = await backend.save(athlete_id, UploadFile(io.BytesIO(b"same-fit"), filename="run.fit"))
    second = await backend.save(athlete_id, UploadFile(io.BytesIO(b"same-fit"), filename="copy.fit"))

    assert first.path.read_bytes() == b"same-fit"
    assert first.path.parent == tmp_path / str(athlete_id)
    assert not first.already_existed
    assert second.already_existed
    assert second.path == first.path


@pytest.mark.anyio
async def test_local_storage_removes_temporary_file_when_size_limit_is_exceeded(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr(storage, "MAX_FIT_BYTES", 3)
    backend = LocalFitStorage(tmp_path)

    with pytest.raises(HTTPException) as too_large:
        await backend.save(uuid4(), UploadFile(io.BytesIO(b"four"), filename="large.fit"))

    assert too_large.value.status_code == 413
    assert list(tmp_path.rglob("*.tmp")) == []
