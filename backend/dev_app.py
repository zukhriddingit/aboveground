"""One local app for the upgrade work: T-Feed + Quick-Check reports + Gemini AI routes, CORS open.

    cd backend
    python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
    GEMINI_API_KEY=... .venv/bin/uvicorn dev_app:app --reload --port 8000   # key optional

The frontend proxies /api/* to :8000 (next.config.ts), so /ops-dev and /community-dev hit it.
In the real backend this file is not needed: Member 1's main.py adds the three include_router
lines from UPGRADE.md.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import ai_translator
from ai_routes import router as ai_router
from community import router as community_router
from reports import router as reports_router

app = FastAPI(title="AboveGround dev (T-Feed + Quick-Check + AI)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(community_router)
app.include_router(reports_router)
app.include_router(ai_router)


@app.get("/")
def root() -> dict[str, object]:
    return {
        "ok": "AboveGround dev app",
        "docs": "/docs",
        "routes": [
            "/api/community/posts",
            "/api/reports",
            "/api/reports/summary",
            "/api/ai/translate-alert",
            "/api/ai/narrate",
            "/api/ai/line-vibe",
        ],
        "gemini": ai_translator.gemini_configured(),
        "model": ai_translator.model_name(),
    }


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}
