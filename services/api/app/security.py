import hashlib
import hmac
import secrets
import unicodedata

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from argon2.low_level import Type

from .config import settings

_pin_hasher = PasswordHasher(type=Type.ID)


def normalize_username(username: str) -> str:
    return unicodedata.normalize("NFKC", username).strip().casefold()


def _peppered_pin(pin: str) -> str:
    return hmac.new(settings.pin_pepper.encode(), pin.encode(), hashlib.sha256).hexdigest()


def hash_pin(pin: str) -> str:
    return _pin_hasher.hash(_peppered_pin(pin))


def verify_pin(pin_hash: str, pin: str) -> bool:
    try:
        return _pin_hasher.verify(pin_hash, _peppered_pin(pin))
    except (InvalidHashError, VerificationError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hmac.new(settings.session_secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def new_csrf_token() -> str:
    return secrets.token_urlsafe(24)
