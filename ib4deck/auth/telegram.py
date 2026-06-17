import base64
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


class AuthError(ValueError):
    """Raised when Telegram initData or Mini App JWT authentication fails."""


def _base64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _base64url_decode(data):
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def validate_init_data(init_data, bot_token, max_age_seconds=86400, now=None):
    """Validate Telegram Mini App initData and return parsed fields."""
    if not init_data:
        raise AuthError("Telegram initData is required")
    if not bot_token:
        raise AuthError("TELEGRAM_BOT_TOKEN is not configured")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=False))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise AuthError("Telegram initData hash is missing")

    data_check_string = "\n".join(f"{key}={pairs[key]}" for key in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise AuthError("Telegram initData hash is invalid")

    try:
        auth_date = int(pairs.get("auth_date", "0"))
    except ValueError as exc:
        raise AuthError("Telegram initData auth_date is invalid") from exc

    now_ts = int(now if now is not None else time.time())
    if auth_date <= 0 or now_ts - auth_date > max_age_seconds:
        raise AuthError("Telegram initData is expired")
    if auth_date - now_ts > 60:
        raise AuthError("Telegram initData auth_date is in the future")

    if "user" in pairs:
        try:
            pairs["user"] = json.loads(pairs["user"])
        except json.JSONDecodeError as exc:
            raise AuthError("Telegram user payload is invalid") from exc

    return pairs


def parse_allowed_telegram_ids(value):
    if not value:
        return set()

    allowed = set()
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            allowed.add(int(item))
        except ValueError as exc:
            raise AuthError(f"Invalid Telegram user id in allowlist: {item}") from exc
    return allowed


def issue_jwt(user, secret, expires_in_seconds=86400, now=None):
    if not secret:
        raise AuthError("JWT_SECRET is not configured")

    now_ts = int(now if now is not None else time.time())
    payload = {
        "sub": str(user["id"]),
        "telegram_user": user,
        "iat": now_ts,
        "exp": now_ts + int(expires_in_seconds),
    }
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = ".".join(
        [
            _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8")),
            _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
        ]
    )
    signature = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_base64url_encode(signature)}"


def verify_jwt(token, secret, now=None):
    if not token:
        raise AuthError("Bearer token is required")
    if not secret:
        raise AuthError("JWT_SECRET is not configured")

    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError as exc:
        raise AuthError("Bearer token format is invalid") from exc

    signing_input = f"{header_b64}.{payload_b64}"
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    try:
        received_signature = _base64url_decode(signature_b64)
    except (ValueError, TypeError) as exc:
        raise AuthError("Bearer token signature is invalid") from exc

    if not hmac.compare_digest(expected_signature, received_signature):
        raise AuthError("Bearer token signature is invalid")

    try:
        header = json.loads(_base64url_decode(header_b64))
        payload = json.loads(_base64url_decode(payload_b64))
    except (ValueError, json.JSONDecodeError) as exc:
        raise AuthError("Bearer token payload is invalid") from exc

    if header.get("alg") != "HS256":
        raise AuthError("Bearer token algorithm is unsupported")

    now_ts = int(now if now is not None else time.time())
    if int(payload.get("exp", 0)) <= now_ts:
        raise AuthError("Bearer token is expired")

    return payload
