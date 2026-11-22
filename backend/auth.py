"""Rider accounts: sign up, log in, log out, rename. Kept simple on purpose (a hackathon demo, not a bank).

    GET   /api/auth/suggest   -> {"username"}             a random, free, T-flavoured username ("QuietTrolley42")
    POST  /api/auth/signup    {username, password, data?} -> {"token", "account"}
    POST  /api/auth/login     {username, password}        -> {"token", "account"}
    POST  /api/auth/logout    (Bearer token)               -> {"ok": true}
    GET   /api/auth/me        (Bearer token)               -> {"account"}
    PATCH /api/auth/me        (Bearer token) {username?, data?} -> {"account"}

`account` is {"username", "createdAt", "data"}. `data` is the rider's saved state as the app sends it (display name,
XP and hats, avatar look): an opaque JSON object of at most 32 KB, so the app can add fields without a backend change.

Passwords are hashed with scrypt and a per-account salt; session tokens are random and only their SHA-256 is stored.
Usernames are 3-20 letters, digits, "_", "-" or ".", unique ignoring case. No email, no recovery, no rate limiting:
fine for a demo, not for production.

Storage: ACCOUNTS_DATA_FILE (default backend/accounts_data.json), written atomically like the other modules.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import random
import re
import secrets
import threading
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/auth", tags=["auth"])

_DATA_FILE = Path(os.environ.get("ACCOUNTS_DATA_FILE") or Path(__file__).resolve().parent / "accounts_data.json")
_lock = threading.Lock()
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,20}$")
MIN_PASSWORD = 4
MAX_DATA_BYTES = 32_000
SESSION_DAYS = 60

_ADJECTIVES = ["Quiet", "Swift", "Lucky", "Sunny", "Brave", "Clever", "Jolly", "Mellow", "Rapid", "Cozy",
               "Bright", "Steady", "Plucky", "Breezy", "Nimble", "Witty", "Snowy", "Golden"]
_NOUNS = ["Trolley", "Commuter", "Rider", "Conductor", "Pigeon", "Switch", "Signal", "Platform", "Headway",
          "Transfer", "Turnstile", "Charlie", "Ferry", "Duckboat", "Cannoli", "Swan", "Fenway", "Harbor"]

# {"accounts": {lower_username: {...}}, "sessions": {sha256(token): {"user": lower_username, "expires": epoch}}}
_state: dict[str, Any] = {"accounts": {}, "sessions": {}}


def _load() -> None:
    global _state
    try:
        raw = json.loads(_DATA_FILE.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and isinstance(raw.get("accounts"), dict) and isinstance(raw.get("sessions"), dict):
            _state = raw
    except (OSError, ValueError):
        pass


def _save() -> None:
    """Call with _lock held."""
    tmp = _DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(_state, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, _DATA_FILE)


_load()


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32).hex()


def _token_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _public(acct: dict[str, Any]) -> dict[str, Any]:
    return {"username": acct["username"], "createdAt": acct["createdAt"], "data": acct.get("data") or {}}


def _check_username(username: str) -> str:
    name = username.strip()
    if not USERNAME_RE.match(name):
        raise HTTPException(status_code=422, detail="Usernames are 3-20 letters, numbers, _ - or .")
    return name


def _check_data(data: Optional[dict[str, Any]]) -> dict[str, Any]:
    if data is None:
        return {}
    if len(json.dumps(data, ensure_ascii=False).encode("utf-8")) > MAX_DATA_BYTES:
        raise HTTPException(status_code=413, detail="Saved data is too large")
    return data


def _new_session(user_key: str) -> str:
    """Call with _lock held."""
    token = secrets.token_urlsafe(32)
    now = time.time()
    _state["sessions"] = {k: v for k, v in _state["sessions"].items() if v.get("expires", 0) > now}
    _state["sessions"][_token_key(token)] = {"user": user_key, "expires": now + SESSION_DAYS * 86400}
    return token


def _account_for(authorization: Optional[str]) -> tuple[str, dict[str, Any]]:
    """Call with _lock held. Returns (user_key, account) for a valid Bearer token, else 401."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    session = _state["sessions"].get(_token_key(token)) if token else None
    if not session or session.get("expires", 0) < time.time() or session.get("user") not in _state["accounts"]:
        raise HTTPException(status_code=401, detail="Please log in again")
    return session["user"], _state["accounts"][session["user"]]


class Credentials(BaseModel):
    username: str = Field(..., max_length=40)
    password: str = Field(..., max_length=200)


class SignupRequest(Credentials):
    data: Optional[dict[str, Any]] = None


class UpdateRequest(BaseModel):
    username: Optional[str] = Field(None, max_length=40)
    data: Optional[dict[str, Any]] = None


@router.get("/suggest")
def suggest() -> dict[str, str]:
    with _lock:
        for _ in range(50):
            name = f"{random.choice(_ADJECTIVES)}{random.choice(_NOUNS)}{random.randint(2, 99)}"
            if name.lower() not in _state["accounts"]:
                return {"username": name}
    return {"username": f"Rider{secrets.randbelow(10**6)}"}


@router.post("/signup")
def signup(body: SignupRequest) -> dict[str, Any]:
    name = _check_username(body.username)
    if len(body.password) < MIN_PASSWORD:
        raise HTTPException(status_code=422, detail=f"Use at least {MIN_PASSWORD} characters for the password")
    data = _check_data(body.data)
    salt = secrets.token_bytes(16)
    acct = {"username": name, "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "salt": salt.hex(), "hash": _hash_password(body.password, salt), "data": data}
    with _lock:
        if name.lower() in _state["accounts"]:
            raise HTTPException(status_code=409, detail="That username is taken")
        _state["accounts"][name.lower()] = acct
        token = _new_session(name.lower())
        _save()
        return {"token": token, "account": _public(acct)}


@router.post("/login")
def login(body: Credentials) -> dict[str, Any]:
    with _lock:
        acct = _state["accounts"].get(body.username.strip().lower())
    ok = bool(acct) and hmac.compare_digest(_hash_password(body.password, bytes.fromhex(acct["salt"])), acct["hash"])
    if not ok:
        raise HTTPException(status_code=401, detail="Wrong username or password")
    with _lock:
        token = _new_session(acct["username"].lower())
        _save()
        return {"token": token, "account": _public(acct)}


@router.post("/logout")
def logout(authorization: Optional[str] = Header(None)) -> dict[str, bool]:
    token = (authorization or "").removeprefix("Bearer ").strip()
    with _lock:
        if token and _state["sessions"].pop(_token_key(token), None) is not None:
            _save()
    return {"ok": True}


@router.get("/me")
def me(authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    with _lock:
        _, acct = _account_for(authorization)
        return {"account": _public(acct)}


@router.patch("/me")
def update_me(body: UpdateRequest, authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    data = _check_data(body.data) if body.data is not None else None
    with _lock:
        key, acct = _account_for(authorization)
        if body.username is not None:
            name = _check_username(body.username)
            if name.lower() != key:
                if name.lower() in _state["accounts"]:
                    raise HTTPException(status_code=409, detail="That username is taken")
                _state["accounts"][name.lower()] = acct
                del _state["accounts"][key]
                for s in _state["sessions"].values():
                    if s.get("user") == key:
                        s["user"] = name.lower()
            acct["username"] = name
        if data is not None:
            acct["data"] = data
        _save()
        return {"account": _public(acct)}
