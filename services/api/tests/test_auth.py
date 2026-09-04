from uuid import uuid4

import pytest
from fastapi import HTTPException, Response

from app.models import AuthSession, User
from app.routers.auth import LoginRequest, login
from app.security import hash_pin


class FakeDatabase:
    def __init__(self, user: User | None):
        self.user = user
        self.added: list[object] = []
        self.commits = 0

    def scalar(self, _statement):
        return self.user

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1


def make_user(pin: str = "135790") -> User:
    return User(
        id=uuid4(),
        username="Runner",
        username_normalized="runner",
        pin_hash=hash_pin(pin),
        role="athlete",
        status="active",
        failed_login_count=0,
    )


def test_successful_login_creates_hashed_session_and_secure_cookie() -> None:
    database = FakeDatabase(make_user())
    response = Response()

    result = login(LoginRequest(username=" RUNNER ", pin="135790"), response, database)

    assert result.username == "Runner"
    assert result.role == "athlete"
    assert database.commits == 1
    assert len(database.added) == 1
    assert isinstance(database.added[0], AuthSession)
    assert "run_cal_session=" in response.headers["set-cookie"]
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "135790" not in response.headers["set-cookie"]


def test_failed_login_increments_attempt_counter() -> None:
    user = make_user()
    database = FakeDatabase(user)

    with pytest.raises(HTTPException) as denied:
        login(LoginRequest(username="runner", pin="000000"), Response(), database)

    assert denied.value.status_code == 401
    assert user.failed_login_count == 1
    assert database.commits == 1
    assert database.added == []


def test_unknown_username_returns_generic_authentication_error() -> None:
    database = FakeDatabase(None)

    with pytest.raises(HTTPException) as denied:
        login(LoginRequest(username="missing", pin="000000"), Response(), database)

    assert denied.value.status_code == 401
    assert denied.value.detail == "Invalid username or PIN"
