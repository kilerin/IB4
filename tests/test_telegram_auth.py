import hashlib
import hmac
import json
import time
import unittest
from urllib.parse import quote, urlencode
from unittest.mock import patch

from app import app
from ib4deck.auth.telegram import (
    AuthError,
    issue_jwt,
    validate_init_data,
    verify_jwt,
)


BOT_TOKEN = "123456:test-token"
JWT_SECRET = "test-jwt-secret"


def make_init_data(user=None, auth_date=None, bot_token=BOT_TOKEN):
    if user is None:
        user = {"id": 42, "first_name": "Nikolai", "username": "nikolai"}
    if auth_date is None:
        auth_date = int(time.time())

    pairs = {
        "auth_date": str(auth_date),
        "query_id": "AAEAAAE",
        "user": json.dumps(user, separators=(",", ":")),
    }
    data_check_string = "\n".join(f"{key}={pairs[key]}" for key in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    pairs["hash"] = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return urlencode(pairs, quote_via=quote)


class TelegramAuthTests(unittest.TestCase):
    def test_validates_telegram_init_data(self):
        parsed = validate_init_data(make_init_data(auth_date=1000), BOT_TOKEN, now=1001)

        self.assertEqual(parsed["user"]["id"], 42)

    def test_rejects_tampered_init_data(self):
        init_data = make_init_data(auth_date=1000).replace("Nikolai", "Attacker")

        with self.assertRaises(AuthError):
            validate_init_data(init_data, BOT_TOKEN, now=1001)

    def test_rejects_expired_init_data(self):
        with self.assertRaises(AuthError):
            validate_init_data(make_init_data(auth_date=1000), BOT_TOKEN, now=90000)

    def test_issues_and_verifies_jwt(self):
        token = issue_jwt({"id": 42, "username": "nikolai"}, JWT_SECRET, now=1000)
        payload = verify_jwt(token, JWT_SECRET, now=1001)

        self.assertEqual(payload["sub"], "42")
        self.assertEqual(payload["telegram_user"]["username"], "nikolai")

    def test_telegram_auth_endpoint_enforces_allowlist(self):
        app.config["TESTING"] = True
        env = {
            "TELEGRAM_BOT_TOKEN": BOT_TOKEN,
            "JWT_SECRET": JWT_SECRET,
            "ALLOWED_TELEGRAM_IDS": "7",
        }
        with patch.dict("os.environ", env, clear=False), app.test_client() as client:
            response = client.post("/api/auth/telegram", json={"initData": make_init_data()})

        self.assertEqual(response.status_code, 403)

    def test_telegram_auth_endpoint_requires_allowlist(self):
        app.config["TESTING"] = True
        env = {
            "TELEGRAM_BOT_TOKEN": BOT_TOKEN,
            "JWT_SECRET": JWT_SECRET,
        }
        with patch.dict("os.environ", env, clear=True), app.test_client() as client:
            response = client.post("/api/auth/telegram", json={"initData": make_init_data()})

        self.assertEqual(response.status_code, 401)

    def test_bearer_token_authenticates_api_guard(self):
        app.config["TESTING"] = True
        token = issue_jwt({"id": 42, "username": "nikolai"}, JWT_SECRET)

        with patch.dict("os.environ", {"JWT_SECRET": JWT_SECRET, "ALLOWED_TELEGRAM_IDS": "42"}, clear=False), app.test_client() as client:
            response = client.get("/api/wallets", headers={"Authorization": f"Bearer {token}"})

        self.assertNotEqual(response.status_code, 401)

    def test_bearer_token_rechecks_allowlist(self):
        app.config["TESTING"] = True
        token = issue_jwt({"id": 42, "username": "nikolai"}, JWT_SECRET)

        with patch.dict("os.environ", {"JWT_SECRET": JWT_SECRET, "ALLOWED_TELEGRAM_IDS": "7"}, clear=False), app.test_client() as client:
            response = client.get("/api/wallets", headers={"Authorization": f"Bearer {token}"})

        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
