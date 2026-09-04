from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.dependencies import CurrentUser, require_roles
from app.security import hash_pin, hash_session_token, normalize_username, verify_pin


def test_username_normalization_is_unicode_aware_and_case_insensitive() -> None:
    assert normalize_username("  Runner.ONE  ") == "runner.one"


def test_pin_hash_is_argon2id_and_verifies_only_the_right_pin() -> None:
    stored = hash_pin("135790")

    assert stored.startswith("$argon2id$")
    assert verify_pin(stored, "135790")
    assert not verify_pin(stored, "135791")


def test_session_token_hash_is_stable_without_storing_raw_token() -> None:
    digest = hash_session_token("raw-session-token")

    assert digest == hash_session_token("raw-session-token")
    assert "raw-session-token" not in digest


def test_role_guard_allows_only_configured_roles() -> None:
    admin = CurrentUser(uuid4(), "admin", "admin", uuid4())
    athlete = CurrentUser(uuid4(), "athlete", "athlete", uuid4())
    admins_only = require_roles("admin")

    assert admins_only(admin) == admin
    with pytest.raises(HTTPException) as denied:
        admins_only(athlete)
    assert denied.value.status_code == 403
