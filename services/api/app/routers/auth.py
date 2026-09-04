import re
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select

from ..config import settings
from ..dependencies import AuthenticatedUser, DbSession, verify_csrf
from ..models import AuthSession, User
from ..security import (
    hash_session_token,
    new_csrf_token,
    new_session_token,
    normalize_username,
    verify_pin,
)

router = APIRouter()
_DUMMY_PIN_HASH = "$argon2id$v=19$m=65536,t=3,p=4$AEd7xqkU/zu90RxkNslCtA$BmwIPVBWPpUa89xJJ4nTxMT6Z9gNx62KBgaYVeKdbFA"


class LoginRequest(BaseModel):
    username: str
    pin: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
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


class SessionUser(BaseModel):
    id: str
    username: str
    role: str


def _session_user(user: User) -> SessionUser:
    return SessionUser(id=str(user.id), username=user.username, role=user.role)


@router.post("/login", response_model=SessionUser)
def login(payload: LoginRequest, response: Response, database: DbSession) -> SessionUser:
    now = datetime.now(UTC)
    user = database.scalar(
        select(User).where(User.username_normalized == normalize_username(payload.username))
    )
    if user is None:
        verify_pin(_DUMMY_PIN_HASH, payload.pin)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or PIN")
    if user.status == "disabled":
        verify_pin(user.pin_hash, payload.pin)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or PIN")
    if user.locked_until is not None and user.locked_until > now:
        raise HTTPException(status.HTTP_423_LOCKED, "Account temporarily locked")

    if not verify_pin(user.pin_hash, payload.pin):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.login_max_attempts:
            user.locked_until = now + timedelta(minutes=settings.login_lock_minutes)
        database.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or PIN")

    user.failed_login_count = 0
    user.locked_until = None
    raw_token = new_session_token()
    csrf_token = new_csrf_token()
    database.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_session_token(raw_token),
            expires_at=now + timedelta(hours=settings.session_ttl_hours),
            last_seen_at=now,
        )
    )
    database.commit()
    response.set_cookie(
        settings.session_cookie_name,
        raw_token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        "run_cal_csrf",
        csrf_token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=False,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return _session_user(user)


@router.get("/me", response_model=SessionUser)
def me(user: AuthenticatedUser) -> SessionUser:
    return SessionUser(id=str(user.id), username=user.username, role=user.role)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    user: AuthenticatedUser,
    database: DbSession,
    _csrf: Annotated[None, Depends(verify_csrf)],
) -> None:
    auth_session = database.get(AuthSession, user.session_id)
    if auth_session is not None and auth_session.revoked_at is None:
        auth_session.revoked_at = datetime.now(UTC)
        database.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.delete_cookie("run_cal_csrf", path="/")
