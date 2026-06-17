# Code Review Notes

## Fixed In This Pass
- Removed Dashboard and Transit Payments routes, API endpoints, templates, and page scripts.
- Removed hardcoded TronGrid and BitOK secrets from application code. Production now requires `SECRET_KEY`, `APP_PASSWORD`, `TRONGRID_API_KEY`, `BITOK_API_KEY_ID`, and `BITOK_API_SECRET`.
- Enabled `HttpOnly`, `SameSite=Strict`, and production-only `Secure` session cookies.
- Replaced plaintext password equality with `hmac.compare_digest`.
- Bound Docker Postgres to localhost and removed weak production secret fallbacks.
- Added indexes to high-traffic transaction fields for new databases.
- Moved the `hide_small` transaction filter into SQL and removed full address book scans from `get_counterparty_name`.
- Escaped user-controlled AML table values in `static/js/aml_check.js`.

## Remaining High-Priority Work
- Rotate TronGrid and BitOK credentials because previous keys were present in source history.
- Add real CSRF protection for POST, PUT, and DELETE endpoints.
- Move long-running balance, transaction, and AML refresh work to a background job with progress polling.
- Add database migrations so existing PostgreSQL/SQLite databases receive new indexes and future schema changes safely.
- Add pagination to `/api/transactions` and reduce verbose logging in hot paths.
