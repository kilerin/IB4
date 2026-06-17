# Telegram Mini App Deployment

## Runtime Shape
- Vercel keeps serving the existing Flask web UI.
- VPS serves `telegram-miniapp/` as static files and proxies `/api/` to `telegram_wsgi:app`.
- Both runtimes must use the same managed PostgreSQL `DATABASE_URL`.

## Required Environment
```env
DATABASE_URL=postgresql://...
SECRET_KEY=...
APP_PASSWORD=...
TRONGRID_API_KEY=...
BITOK_API_KEY_ID=...
BITOK_API_SECRET=...
TELEGRAM_BOT_TOKEN=...
JWT_SECRET=...
ALLOWED_TELEGRAM_IDS=123456789,987654321
```

Optional:
```env
TELEGRAM_AUTH_MAX_AGE_SECONDS=86400
JWT_EXPIRES_SECONDS=86400
TELEGRAM_API_WORKERS=3
TELEGRAM_API_TIMEOUT=180
```

## Local VPS-Style Run
```bash
docker compose -f docker-compose.telegram.yml up -d --build
```

The Mini App will be available on `http://<vps-host>:8080` before TLS termination.

## Production VPS Notes
- Telegram Mini Apps require HTTPS. Put this compose stack behind a TLS reverse proxy or terminate TLS on the host.
- In BotFather, set the Mini App URL to the HTTPS URL that serves `telegram-miniapp/index.html`.
- Do not expose PostgreSQL directly from this stack. Use a managed database or a private network endpoint.
- Run Alembic migrations against staging first, then production.
- For a fresh database:
  ```bash
  DATABASE_URL=postgresql://... alembic upgrade head
  ```
- For an existing database that already has IB4DECK tables from `db.create_all()`:
  ```bash
  DATABASE_URL=postgresql://... alembic stamp 20260617_0001
  DATABASE_URL=postgresql://... alembic upgrade head
  ```

## Auth Flow
1. Telegram opens the static Mini App.
2. `telegram-miniapp/app.js` sends `Telegram.WebApp.initData` to `/api/auth/telegram`.
3. Backend validates initData with `TELEGRAM_BOT_TOKEN`, checks `ALLOWED_TELEGRAM_IDS`, and returns a short-lived Bearer token.
4. Mini App calls the same `/api/*` contracts as the web UI using `Authorization: Bearer <token>`.
