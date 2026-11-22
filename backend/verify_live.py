#!/usr/bin/env python3
"""Check that the backend answers every route the frontend uses, and that Gemini is live (or falls back fast).

    cd backend
    .venv/bin/python verify_live.py                              # starts its own servers, then stops them
    .venv/bin/python verify_live.py --url http://127.0.0.1:8000  # check a server you already run (read-only)
    .venv/bin/python verify_live.py --url ... --write            # ...including the POST checks

With its own servers it runs four passes (rider data goes to a temp folder, never your data files):
  1. Your environment + backend/.env: health, world, stories (GET + POST), T-Feed posts (GET + POST with a
     spaced name), Quick-Check summary, alert trigger + resolve, and Gemini. When GEMINI_API_KEY (or
     GOOGLE_API_KEY) is set, the server must report Gemini as configured and the AI routes should answer
     with source "gemini".
  2. No key at all: every AI route answers with source "fallback" in under 4.5 s.
  3. A bad key: Gemini rejects it and every AI route still falls back in under 4.5 s.
  4. Gemini that never answers (a non-routable endpoint): the 4 s cap kicks in and the routes fall back.
Exit code 0 when every check passes. A key that is set but can't reach Gemini is a warning, not a failure.
Standard library only; it never prints a key.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional

HERE = Path(__file__).resolve().parent
AI_BUDGET_S = 4.5
results: list[tuple[str, str, str]] = []


def report(level: str, name: str, detail: str) -> None:
    results.append((level, name, detail))
    print(f"{level:<5} {name:<34} {detail}", flush=True)


def call(base: str, method: str, path: str, body: Any = None, timeout: float = 15) -> tuple[int, Any, float]:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers={"Content-Type": "application/json"})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return res.status, json.loads(raw or b"null"), time.monotonic() - started
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read() or b"null")
        except ValueError:
            payload = None
        return exc.code, payload, time.monotonic() - started
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return 0, str(exc), time.monotonic() - started


def _key_set(*names: str) -> bool:
    """Is one of these keys set in the environment or a .env file? (Never read out loud.)"""
    if any((os.environ.get(n) or "").strip() for n in names):
        return True
    for path in (HERE / ".env", HERE.parent / ".env"):
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                key, _, value = line.strip().removeprefix("export ").partition("=")
                if key.strip() in names and value.strip().strip("'\""):
                    return True
        except OSError:
            continue
    return False


def env_file_key() -> bool:
    """Is a Gemini key set in the environment or a .env file?"""
    return _key_set("GEMINI_API_KEY", "GOOGLE_API_KEY")


def expected_provider() -> str:
    """Which AI should answer with your env: Gemini wins when its key is set, then Claude, else the templates."""
    forced = (os.environ.get("AI_PROVIDER") or "").strip().lower()
    gemini, claude = env_file_key(), _key_set("ANTHROPIC_API_KEY")
    if forced == "claude" and claude:
        return "claude"
    return "gemini" if gemini else "claude" if claude else "fallback"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Server:
    def __init__(self, label: str, env: dict[str, str]):
        self.label = label
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(self.port), "--log-level", "warning"],
            cwd=HERE, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )

    def wait(self, timeout: float = 25) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                return False
            status, _, _ = call(self.base, "GET", "/api/health", timeout=2)
            if status == 200:
                return True
            time.sleep(0.3)
        return False

    def stop(self) -> None:
        self.proc.terminate()
        try:
            self.proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def check_core(base: str, write: bool) -> None:
    status, health, _ = call(base, "GET", "/api/health")
    if status != 200 or not isinstance(health, dict):
        report("FAIL", "GET /api/health", f"HTTP {status}")
        return
    report("PASS", "GET /api/health", f"trains from {health.get('trains')}, gemini configured: {health.get('gemini')}")

    status, world, t = call(base, "GET", "/api/world")
    if status == 200 and isinstance(world, dict):
        stations, vehicles = world.get("stations") or [], world.get("vehicles") or []
        lines = (world.get("linesGeoJson") or {}).get("features") or []
        ok = len(stations) >= 8 and vehicles and all({"id", "name", "line", "lat", "lng"} <= set(s) for s in stations)
        report("PASS" if ok else "FAIL", "GET /api/world", f"{len(stations)} stations, {len(vehicles)} trains, {len(lines)} line shapes ({t * 1000:.0f} ms)")
    else:
        report("FAIL", "GET /api/world", f"HTTP {status}")

    status, stories, t = call(base, "GET", "/api/stories")
    ok = status == 200 and isinstance(stories, list) and len(stories) > 0
    report("PASS" if ok else "FAIL", "GET /api/stories", f"{len(stories) if isinstance(stories, list) else 0} stories ({t * 1000:.0f} ms)")

    status, posts, t = call(base, "GET", "/api/community/posts")
    ok = status == 200 and isinstance(posts, list) and len(posts) > 0
    report("PASS" if ok else "FAIL", "GET /api/community/posts", f"{len(posts) if isinstance(posts, list) else 0} posts ({t * 1000:.0f} ms)")

    status, summary, _ = call(base, "GET", "/api/reports/summary")
    ok = status == 200 and isinstance(summary, dict) and "stations" in summary
    report("PASS" if ok else "FAIL", "GET /api/reports/summary", f"{len(summary.get('stations', [])) if ok else 0} stops with reports")

    if not write:
        return

    story = {
        "stationId": "place-kencl", "category": "VIBES", "author": "Verify Bot", "caption": "verify_live.py was here",
        "placeName": "Kenmore Square", "walkMin": 2, "imageUrl": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>",
    }
    status, saved, _ = call(base, "POST", "/api/stories", story)
    ok = status == 200 and isinstance(saved, dict) and saved.get("id") and saved.get("author") == "Verify Bot"
    _, again, _ = call(base, "GET", "/api/stories?stationId=place-kencl")
    listed = ok and isinstance(again, list) and any(s.get("id") == saved.get("id") for s in again)
    report("PASS" if listed else "FAIL", "POST /api/stories", f"saved {saved.get('id') if isinstance(saved, dict) else saved}, listed: {listed}")

    post = {
        "line": "Green", "stationId": "place-kencl", "stationName": "Kenmore", "vibe": "ON_THE_T",
        "author": "Anonymous Rider", "avatarColor": "#71717a", "caption": "verify_live.py checking in",
    }
    status, saved, _ = call(base, "POST", "/api/community/posts", post)
    ok = status == 200 and isinstance(saved, dict) and saved.get("author") == "Anonymous Rider"
    report("PASS" if ok else "FAIL", "POST /api/community/posts", f"author kept as {saved.get('author')!r}" if isinstance(saved, dict) else f"HTTP {status}")

    status, trig, t = call(base, "POST", "/api/alerts/trigger", {"stationId": "place-kencl"})
    alert = trig.get("alert") if isinstance(trig, dict) else None
    ok = status == 200 and isinstance(alert, dict) and alert.get("stationId") == "place-kencl" and alert.get("miniGameType") in ("WIRE_MATCH", "TRACK_WELD")
    report("PASS" if ok and t < AI_BUDGET_S + 1 else "FAIL", "POST /api/alerts/trigger", f"{alert.get('plainTitle') if alert else trig} · {trig.get('source') if isinstance(trig, dict) else '?'} ({t:.2f} s)")
    if ok:
        _, world, _ = call(base, "GET", "/api/world")
        flagged = any(s["id"] == "place-kencl" and s["hasActiveAlert"] for s in world["stations"])
        status, _, _ = call(base, "POST", f"/api/alerts/{alert['id']}/resolve")
        _, world, _ = call(base, "GET", "/api/world")
        cleared = not any(s["id"] == "place-kencl" and s["hasActiveAlert"] for s in world["stations"])
        report("PASS" if flagged and status == 200 and cleared else "FAIL", "alert in /api/world, then resolve", f"flagged: {flagged}, resolve HTTP {status}, cleared: {cleared}")


def check_ai(base: str, expect: str, label: str) -> None:
    """expect: "gemini" / "claude" (that provider's key is set), "fallback" (no or bad key)."""
    status, st, _ = call(base, "GET", "/api/ai/status")
    if status != 200 or not isinstance(st, dict):
        report("FAIL", f"[{label}] GET /api/ai/status", f"HTTP {status}")
        return
    provider = st.get("provider")
    if expect in ("gemini", "claude"):
        ok = provider == expect
        report("PASS" if ok else "FAIL", f"[{label}] key picked up", f"provider={provider}, model {st.get('model')}")
    else:
        report("PASS", f"[{label}] /api/ai/status", f"provider={provider}, model {st.get('model')}, cap {st.get('timeoutS')} s")

    probes = [
        ("POST /api/ai/translate-alert", "POST", "/api/ai/translate-alert", {"stationId": "place-boyls", "rawMbtaText": "Green Line: Delays of about 15 minutes due to a signal problem at Boylston."}),
        ("GET /api/ai/line-vibe", "GET", "/api/ai/line-vibe?line=Green", None),
        ("POST /api/ai/narrate", "POST", "/api/ai/narrate", {"stationId": "place-coecl", "stationName": "Copley", "line": "Green"}),
    ]
    for name, method, path, body in probes:
        status, res, t = call(base, method, path, body, timeout=10)
        source = res.get("source") if isinstance(res, dict) else None
        text = ""
        if isinstance(res, dict):
            text = str(res.get("plainExplanation") or res.get("text") or "")[:70]
        if status != 200 or source not in ("gemini", "claude", "fallback"):
            report("FAIL", f"[{label}] {name}", f"HTTP {status} {res}")
        elif t > AI_BUDGET_S:
            report("FAIL", f"[{label}] {name}", f"took {t:.2f} s (over the {AI_BUDGET_S} s budget)")
        elif expect in ("gemini", "claude") and source != expect:
            report("WARN", f"[{label}] {name}", f"key set but answered from templates in {t:.2f} s (check the key, quota or network)")
        elif expect == "fallback" and source != "fallback":
            report("FAIL", f"[{label}] {name}", f"expected the fallback, got {source}")
        else:
            report("PASS", f"[{label}] {name}", f"{source} in {t:.2f} s · {text}…")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--url", help="check an already running backend instead of starting one")
    ap.add_argument("--write", action="store_true", help="with --url: also POST a story, a post and an alert")
    args = ap.parse_args()
    expect_env = expected_provider()
    print(f"Gemini key in the environment or .env: {'yes' if env_file_key() else 'no'} · AI that should answer: {expect_env}\n")

    if args.url:
        base = args.url.rstrip("/")
        check_core(base, args.write)
        check_ai(base, expect_env, "running server")
    else:
        tmp = tempfile.mkdtemp(prefix="aboveground-verify-")
        data = {
            "COMMUNITY_DATA_FILE": f"{tmp}/community.json", "REPORTS_DATA_FILE": f"{tmp}/reports.json",
            "STORIES_DATA_FILE": f"{tmp}/stories.json",
        }
        passes = [
            ("your env", {**os.environ, **data}, expect_env, True),
            ("no key", {**os.environ, **data, "GEMINI_API_KEY": "", "GOOGLE_API_KEY": "", "ANTHROPIC_API_KEY": "", "WORLD_LIVE": "0"}, "fallback", False),
            ("bad key", {**os.environ, **data, "GEMINI_API_KEY": "verify-live-invalid-key", "GOOGLE_API_KEY": "", "ANTHROPIC_API_KEY": "", "WORLD_LIVE": "0"}, "fallback", False),
            (
                "Gemini hangs",
                {**os.environ, **data, "GEMINI_API_KEY": "verify-live-slow", "GOOGLE_API_KEY": "", "ANTHROPIC_API_KEY": "", "WORLD_LIVE": "0",
                 "GOOGLE_GEMINI_BASE_URL": "http://10.255.255.1/"},
                "fallback",
                False,
            ),
            ("Claude bad key", {**os.environ, **data, "GEMINI_API_KEY": "", "GOOGLE_API_KEY": "", "ANTHROPIC_API_KEY": "verify-live-invalid-key", "WORLD_LIVE": "0"}, "fallback", False),
            (
                "Claude hangs",
                {**os.environ, **data, "GEMINI_API_KEY": "", "GOOGLE_API_KEY": "", "ANTHROPIC_API_KEY": "verify-live-slow", "WORLD_LIVE": "0",
                 "ANTHROPIC_BASE_URL": "http://10.255.255.1/"},
                "fallback",
                False,
            ),
        ]
        for label, env, expect, core in passes:
            print(f"--- {label} ---")
            server = Server(label, env)
            try:
                if not server.wait():
                    err = server.proc.stderr.read().decode()[-600:] if server.proc.poll() is not None and server.proc.stderr else ""
                    report("FAIL", f"[{label}] start uvicorn main:app", err or "no answer on /api/health")
                    continue
                report("PASS", f"[{label}] uvicorn main:app", server.base)
                if core:
                    time.sleep(3)  # let the MBTA poller land its first trains
                    check_core(server.base, True)
                check_ai(server.base, expect, label)
            finally:
                server.stop()
            print()

    fails = sum(1 for lvl, _, _ in results if lvl == "FAIL")
    warns = sum(1 for lvl, _, _ in results if lvl == "WARN")
    print(f"{len(results) - fails - warns} passed, {warns} warnings, {fails} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
