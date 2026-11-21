"""Stand-alone app for testing T-Feed before Member 1's main.py exists.

    cd backend
    python3 -m venv .venv && .venv/bin/pip install -r requirements-community.txt
    .venv/bin/uvicorn community_dev_app:app --reload --port 8000

Then the frontend's /community-dev page (and curl) hit http://localhost:8000/api/community/*.
In the real backend this file is not needed: main.py does `app.include_router(community_router)`.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from community import router as community_router

app = FastAPI(title="AboveGround T-Feed (dev)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(community_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"ok": "T-Feed dev app", "docs": "/docs", "posts": "/api/community/posts"}
