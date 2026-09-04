from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select

from ..dependencies import AthleteAccess, DbSession
from ..fit.parser import PARSER_VERSION
from ..models import Activity, ImportJob
from ..storage import FitStorageDependency

router = APIRouter()
ACTIVE_IMPORT_STATES = ("queued", "processing", "succeeded")


@router.post("/athletes/{athlete_id}/fit-files", status_code=status.HTTP_202_ACCEPTED)
async def upload_fit(
    athlete_id: UUID,
    response: Response,
    file: Annotated[UploadFile, File(...)],
    _access: AthleteAccess,
    database: DbSession,
    storage: FitStorageDependency,
) -> dict:
    """Stream a private FIT upload to storage and enqueue one idempotent import job."""
    filename = file.filename or "upload.fit"
    if not filename.lower().endswith(".fit"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only .fit files are accepted")

    stored = await storage.save(athlete_id, file)
    activity = database.scalar(
        select(Activity).where(
            Activity.athlete_id == athlete_id,
            Activity.source_hash == stored.sha256,
        )
    )
    if activity is not None:
        response.status_code = status.HTTP_200_OK
        return {
            "athlete_id": str(athlete_id),
            "status": "duplicate",
            "activity_id": str(activity.id),
            "source_hash": stored.sha256,
        }

    existing_job = database.scalar(
        select(ImportJob).where(
            ImportJob.athlete_id == athlete_id,
            ImportJob.source_kind == "manual",
            ImportJob.source_reference == stored.sha256,
            ImportJob.parser_version == PARSER_VERSION,
            ImportJob.status.in_(ACTIVE_IMPORT_STATES),
        )
    )
    if existing_job is not None:
        response.status_code = status.HTTP_200_OK
        return {
            "athlete_id": str(athlete_id),
            "status": existing_job.status,
            "import_job_id": str(existing_job.id),
            "source_hash": stored.sha256,
        }

    import_job = ImportJob(
        athlete_id=athlete_id,
        source_kind="manual",
        source_reference=stored.sha256,
        status="queued",
        attempts=0,
        parser_version=PARSER_VERSION,
        warnings=[],
    )
    database.add(import_job)
    database.flush()
    database.commit()
    return {
        "athlete_id": str(athlete_id),
        "status": "queued",
        "import_job_id": str(import_job.id),
        "source_hash": stored.sha256,
        "size_bytes": stored.size_bytes,
    }
