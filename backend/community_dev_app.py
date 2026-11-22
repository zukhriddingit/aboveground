"""Kept so `uvicorn community_dev_app:app` still works: it is the full backend in main.py now.

    cd backend && .venv/bin/uvicorn main:app --reload --port 8000
"""

from main import app  # noqa: F401
