from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from ..dependencies import AthleteAccess
from ..fit.parser import parse_running_fit

router = APIRouter()


@router.post("/athletes/{athlete_id}/fit-files", status_code=status.HTTP_202_ACCEPTED)
async def upload_fit(
    athlete_id: UUID,
    file: Annotated[UploadFile, File(...)],
    _access: AthleteAccess,
) -> dict:
    """Development preview; production streams to storage and enqueues a job."""
    if not (file.filename or "").lower().endswith(".fit"):
        raise HTTPException(415, "Only .fit files are accepted")
    data = await file.read(50 * 1024 * 1024 + 1)
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(413, "FIT file exceeds 50 MB")
    try:
        result = parse_running_fit(data, Path(file.filename or "upload.fit"))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"athlete_id": str(athlete_id), "status": "decoded_preview", "result": result}
