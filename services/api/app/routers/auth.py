import re

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, field_validator

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    pin: str

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        value = value.strip()
        if not 3 <= len(value) <= 64:
            raise ValueError("username must be 3–64 characters")
        return value

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        if not re.fullmatch(r"\d{6}", value):
            raise ValueError("PIN must contain exactly six digits")
        return value


@router.post("/login", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def login(payload: LoginRequest) -> None:
    """Contract stub: implement Argon2id verification, throttling, and secure cookie issue."""
    del payload
    raise HTTPException(status_code=501, detail="Authentication persistence not implemented")

