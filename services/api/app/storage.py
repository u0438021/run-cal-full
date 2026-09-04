import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Protocol
from uuid import UUID

from fastapi import Depends, HTTPException, UploadFile, status

from .config import settings

MAX_FIT_BYTES = 50 * 1024 * 1024
CHUNK_BYTES = 1024 * 1024


@dataclass(frozen=True)
class StoredObject:
    key: str
    sha256: str
    size_bytes: int
    path: Path
    already_existed: bool


class FitStorage(Protocol):
    async def save(self, athlete_id: UUID, upload: UploadFile) -> StoredObject: ...

    def path_for(self, key: str) -> Path: ...


class LocalFitStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def path_for(self, key: str) -> Path:
        candidate = (self.root / key).resolve()
        if candidate != self.root and self.root not in candidate.parents:
            raise ValueError("Object key escapes private storage root")
        return candidate

    async def save(self, athlete_id: UUID, upload: UploadFile) -> StoredObject:
        athlete_directory = self.root / str(athlete_id)
        athlete_directory.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        total = 0
        temporary_path: Path | None = None

        try:
            with tempfile.NamedTemporaryFile(
                mode="wb", prefix="upload-", suffix=".tmp", dir=athlete_directory, delete=False
            ) as temporary:
                temporary_path = Path(temporary.name)
                while chunk := await upload.read(CHUNK_BYTES):
                    total += len(chunk)
                    if total > MAX_FIT_BYTES:
                        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "FIT file exceeds 50 MB")
                    digest.update(chunk)
                    temporary.write(chunk)

            source_hash = digest.hexdigest()
            key = f"{athlete_id}/{source_hash}.fit"
            destination = self.path_for(key)
            already_existed = destination.exists()
            if already_existed:
                temporary_path.unlink(missing_ok=True)
            else:
                os.replace(temporary_path, destination)
            return StoredObject(key, source_hash, total, destination, already_existed)
        except Exception:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            raise
        finally:
            await upload.close()


def get_fit_storage() -> FitStorage:
    return LocalFitStorage(Path(settings.fit_storage_path))


FitStorageDependency = Annotated[FitStorage, Depends(get_fit_storage)]
