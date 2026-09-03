from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from ..fit.parser import parse_running_fit

router = APIRouter()


@router.post("/athletes/{athlete_id}/fit-files", status_code=status.HTTP_202_ACCEPTED)
async def upload_fit(athlete_id: UUID, file: UploadFile = File(...)) -> dict:
    """Development preview; production streams to storage and enqueues a job."""
    if not (file.filename or "").lower().endswith(".fit"):
        raise HTTPException(415, "Only .fit files are accepted")
    data = await file.read(50 * 1024 * 1024 + 1)
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(413, "FIT file exceeds 50 MB")
    result = parse_running_fit(data, Path(file.filename or "upload.fit"))
    return {"athlete_id": str(athlete_id), "status": "decoded_preview", "result": result}

