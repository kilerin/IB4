"""VPS WSGI entrypoint for the Telegram Mini App API.

Nginx should serve `telegram-miniapp/` as static files and proxy `/api/` plus
`/health` to this app. The API contracts are shared with the Vercel web app.
"""

from app import app

application = app
