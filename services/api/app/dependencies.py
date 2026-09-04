import hmac
from collections.abc import Callable, Generator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal
from .models import Athlete, AuthSession, CoachAthlete, User
from .security import hash_session_token


def get_db() -> Generator[Session, None, None]:
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()


DbSession = Annotated[Session, Depends(get_db)]


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    username: str
    role: str
    session_id: UUID


def get_current_user(request: Request, database: DbSession) -> CurrentUser:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if not raw_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")

    found = database.execute(
        select(AuthSession, User)
        .join(User, User.id == AuthSession.user_id)
        .where(AuthSession.token_hash == hash_session_token(raw_token))
    ).one_or_none()
    if found is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session")

    auth_session, user = found
    now = datetime.now(UTC)
    if auth_session.revoked_at is not None or auth_session.expires_at <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    if user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is unavailable")

    if auth_session.last_seen_at <= now - timedelta(minutes=5):
        auth_session.last_seen_at = now
        database.commit()

    return CurrentUser(user.id, user.username, user.role, auth_session.id)


AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]


def authorize_athlete_access(
    athlete_id: UUID, user: AuthenticatedUser, database: DbSession
) -> CurrentUser:
    if user.role == "admin":
        return user
    if user.role == "athlete":
        owns_profile = database.scalar(
            select(Athlete.id).where(Athlete.id == athlete_id, Athlete.user_id == user.id)
        )
        if owns_profile is not None:
            return user
    if user.role == "coach":
        assignment = database.scalar(
            select(CoachAthlete.athlete_id).where(
                CoachAthlete.athlete_id == athlete_id,
                CoachAthlete.coach_user_id == user.id,
            )
        )
        if assignment is not None:
            return user
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Athlete access denied")


AthleteAccess = Annotated[CurrentUser, Depends(authorize_athlete_access)]


def require_roles(*roles: str) -> Callable[[AuthenticatedUser], CurrentUser]:
    allowed = frozenset(roles)

    def check_role(user: AuthenticatedUser) -> CurrentUser:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return check_role


def verify_csrf(
    csrf_cookie: Annotated[str | None, Cookie(alias="run_cal_csrf")] = None,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    if not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF validation failed")
