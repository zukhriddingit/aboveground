"""AboveGround backend: one FastAPI app with every route the frontend calls, CORS open to all origins.

    cd backend
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/uvicorn main:app --reload --port 8000        # or, from the repo root: uvicorn backend.main:app

Routers (JSON is camelCase and matches frontend/src/types/tverse.ts):
    world.py        GET /api/world, GET /api/alerts, POST /api/alerts/trigger, POST /api/alerts/{id}/resolve
    stories.py      GET/POST /api/stories
    community.py    T-Feed /api/community/*
    reports.py      Quick-Check /api/reports, /api/reports/summary
    ai_routes.py    Gemini /api/ai/translate-alert, /api/ai/narrate, /api/ai/line-vibe, /api/ai/status

Secrets come from the environment or a `.env` file in backend/ or the repo root (gitignored), e.g.
GEMINI_API_KEY and MBTA_API_KEY. Both are optional: without them every AI answer falls back to
templates within 4 s and trains come from the MBTA's keyless tier (or the mock fleet when offline).
"""

from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
# The routers import each other by module name, so make `uvicorn backend.main:app` work from the repo root too.
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))


def _env_value(raw: str) -> str:
    """The value part of KEY=VALUE: quotes removed (a quoted value keeps a literal `#`), and an unquoted
    value loses a trailing ` # comment`, so `WORLD_LIVE=0 # mock trains` reads as "0"."""
    value = raw.strip()
    if value[:1] in ("'", '"'):
        end = value.find(value[0], 1)
        if end > 0:  # "quoted # value"  # optional comment after the closing quote
            return value[1:end]
    if value.startswith("#"):
        return ""  # KEY=   # only a comment
    for i, ch in enumerate(value):
        if ch == "#" and value[i - 1] in " \t":
            return value[:i].rstrip()
    return value


def load_env_files(*paths: Path) -> list[str]:
    """Minimal .env reader (KEY=VALUE, `export`, quotes and ` # comments` allowed). Never overrides the real environment.
    Returns the names it set (never the values)."""
    loaded: list[str] = []
    for path in paths:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.removeprefix("export ").split("=", 1)
            key, value = key.strip(), _env_value(value)
            if key and key not in os.environ:
                os.environ[key] = value
                loaded.append(key)
    return loaded


ENV_LOADED = load_env_files(HERE / ".env", HERE.parent / ".env")

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

import ai_translator  # noqa: E402
import world  # noqa: E402
from ai_routes import router as ai_router  # noqa: E402
from auth import router as auth_router  # noqa: E402
from community import router as community_router  # noqa: E402
from reports import router as reports_router  # noqa: E402
from stories import router as stories_router  # noqa: E402


@asynccontextmanager
async def lifespan(_: FastAPI):
    world.start()
    yield
    await world.stop()


app = FastAPI(title="AboveGround backend", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
for router in (world.router, stories_router, community_router, reports_router, ai_router, auth_router):
    app.include_router(router)


def api_routes() -> list[str]:
    """"GET /api/world" etc., from the OpenAPI schema (works however this FastAPI version stores routers)."""
    paths = app.openapi().get("paths", {})
    return sorted(f"{method.upper()} {path}" for path, ops in paths.items() if path.startswith("/api/") for method in ops)


@app.get("/")
def root() -> dict[str, Any]:
    routes = api_routes()
    return {
        "ok": "AboveGround backend",
        "docs": "/docs",
        "routes": routes,
        "gemini": ai_translator.gemini_configured(),
        "ai": ai_translator.active_provider(),
        "model": ai_translator.model_name(),
        "world": world.status(),
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "gemini": ai_translator.gemini_configured(),
        "ai": ai_translator.active_provider(),
        "trains": world.vehicle_source(),
        # Names only, so it's safe to show: which settings came from a .env file.
        "envFromFile": sorted(k for k in ENV_LOADED if k.isupper()),
    }
