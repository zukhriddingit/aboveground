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
                value = value.strip()
                if value[:1] not in ("'", '"'):
                    value = "" if value.startswith("#") else value.split(" #")[0].split("\t#")[0]
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
    if ok:
        seeds = [s for s in stories if s.get("id") in {f"s{i}" for i in range(1, 9)}]
        inline = len(seeds) == 8 and all(str(s.get("imageUrl", "")).startswith("data:image/svg+xml") for s in seeds)
        report("PASS" if inline else "FAIL", "seeded stories use inline art", f"{sum(str(s.get('imageUrl', '')).startswith('data:') for s in seeds)}/8 inline SVG scenes")

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

    status, saved, _ = call(base, "POST", "/api/community/posts", {**post, "line": "Blue", "stationId": "place-aport", "stationName": None})
    ok = status == 200 and isinstance(saved, dict) and saved.get("stationName") == "Airport"
    report("PASS" if ok else "FAIL", "POST T-Feed post at Airport", f"HTTP {status}, stationName {saved.get('stationName') if isinstance(saved, dict) else saved}")

    status, res, _ = call(base, "POST", "/api/stories", {**story, "caption": "   \t  "})
    report("PASS" if status == 422 else "FAIL", "POST story, blank caption -> 422", f"HTTP {status}")

    live = {"stationId": "place-pktrm", "rawMbtaText": "Red Line: Delays due to police activity at Park Street.", "estimatedFixMin": 0}
    status, res, t = call(base, "POST", "/api/ai/translate-alert", live, timeout=10)
    ok = status == 200 and isinstance(res, dict) and res.get("source") in ("gemini", "claude", "fallback")
    report("PASS" if ok else "FAIL", "translate-alert estimatedFixMin 0", f"HTTP {status}, {res.get('source') if isinstance(res, dict) else res} in {t:.2f} s")

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


def check_units() -> None:
    """In-process checks of the parsing/classification rules (no server, no network, no AI call)."""
    if str(HERE) not in sys.path:
        sys.path.insert(0, str(HERE))
    # The routers load their data files on import: point them at a temp folder, never your data files.
    tmp = tempfile.mkdtemp(prefix="aboveground-units-")
    for var, name in (("COMMUNITY_DATA_FILE", "community"), ("REPORTS_DATA_FILE", "reports"), ("STORIES_DATA_FILE", "stories")):
        os.environ[var] = f"{tmp}/{name}.json"
    import asyncio

    import ai_translator as ai
    import world
    from main import load_env_files
    from pydantic import ValidationError
    from stories import NewStationStory

    # .env values with inline comments; quoted values keep a literal '#'.
    names = {"VERIFY_ENV_LIVE": "0", "VERIFY_ENV_AI_OFF": "1", "VERIFY_ENV_PROVIDER": "claude", "VERIFY_ENV_QUOTED": "a # b", "VERIFY_ENV_HASH": "x#y"}
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / ".env"
        path.write_text(
            "VERIFY_ENV_LIVE=0 # mock trains only\nexport VERIFY_ENV_AI_OFF=1   # templates\nVERIFY_ENV_PROVIDER=claude # interim\n"
            'VERIFY_ENV_QUOTED="a # b"  # kept\nVERIFY_ENV_HASH=x#y\n',
            encoding="utf-8",
        )
        for n in names:
            os.environ.pop(n, None)
        load_env_files(path)
        got = {n: os.environ.pop(n, None) for n in names}
    report("PASS" if got == names else "FAIL", "unit: .env inline comments", "all parsed" if got == names else f"got {got}")

    # _RULES precedence: Harvard's disabled train beats "signal"; Chinatown's track problem beats "shuttle".
    cases = {
        world._DEMO_RAW["place-harsq"]: ("DISABLED_TRAIN", "TRACK_WELD"),
        world._DEMO_RAW["place-chncl"]: ("TRACK", "TRACK_WELD"),
        world._DEMO_RAW["place-boyls"]: ("SIGNAL", "WIRE_MATCH"),
        "Orange Line: Shuttle buses replace service for scheduled maintenance.": ("PLANNED_WORK", "TRACK_WELD"),
        "Red Line: Delays due to police activity and a disabled train.": ("EMERGENCY", "WIRE_MATCH"),
    }
    bad = [(raw, world.classify(raw)) for raw, (cat, game) in cases.items()
           if world.classify(raw) != cat or world._TEMPLATES[world.classify(raw)][3] != game]
    report("PASS" if not bad else "FAIL", "unit: _RULES precedence", f"{len(cases)} cases" if not bad else f"{bad}")

    # The MBTA text is classified before the station's demo scenario.
    wire_at_boylston = ai.fallback_alert("place-boyls", raw_text="Delays due to an overhead wire problem near Boylston.")
    demo_at_boylston = ai.fallback_alert("place-boyls", raw_text="Delays due to police activity at Boylston.")
    explicit = ai.fallback_alert("place-boyls", raw_text="overhead wire", disruption="TRACK_PROBLEM_SHUTTLE")
    ok = (wire_at_boylston["disruption"] == "OVERHEAD_WIRE_INSPECTION" and demo_at_boylston["disruption"] == "SIGNAL_MODERNIZATION"
          and explicit["disruption"] == "TRACK_PROBLEM_SHUTTLE")
    report("PASS" if ok else "FAIL", "unit: _classify before station", f"{wire_at_boylston['disruption']}, {demo_at_boylston['disruption']}, {explicit['disruption']}")

    # A live alert outside the 4 scenarios: the AI prompt gets neutral context, never our signal-relay ops notes.
    prompts: list[str] = []
    real_generate = ai.generate_text

    async def capture(prompt: str, system: str, **_: Any) -> tuple[Optional[str], str]:
        prompts.append(prompt)
        return None, "fallback"

    ai.generate_text = capture  # type: ignore[assignment]
    try:
        asyncio.run(ai.translate_alert("place-boyls", raw_text="Green Line: Delays due to a medical emergency at Boylston.", fix_min=0))
        asyncio.run(ai.translate_alert("place-boyls", raw_text="Green Line: Delays due to a signal problem at Boylston."))
    finally:
        ai.generate_text = real_generate  # type: ignore[assignment]
    neutral = "relay" not in prompts[0] and "ops notes" not in prompts[0]
    scenario = "ops notes" in prompts[1]
    report("PASS" if neutral and scenario else "FAIL", "unit: neutral prompt for live alerts", f"neutral: {neutral}, scenario notes kept: {scenario}")

    # The AI cache never grows past CACHE_MAX.
    saved_cache = dict(ai._cache)
    try:
        for i in range(ai.CACHE_MAX + 60):
            ai._cache_put(f"verify|{i}", "x" * 30)
        size, newest = len(ai._cache), f"verify|{ai.CACHE_MAX + 59}" in ai._cache
    finally:
        ai._cache.clear()
        ai._cache.update(saved_cache)
    report("PASS" if size <= ai.CACHE_MAX and newest else "FAIL", "unit: AI cache cap", f"{size} entries (cap {ai.CACHE_MAX})")

    # Line vibe: a Red Line tap at Park Street (a Green/Red transfer) counts for Red only.
    import ai_routes
    import reports

    seen: dict[str, dict[str, int]] = {}
    real_recent, real_summary = reports.recent_reports, ai.line_vibe_summary

    async def vibe_capture(line: str, captions: list[str], counts: dict[str, int]) -> dict[str, Any]:
        seen[line] = counts
        return {"line": line, "text": "-", "source": "fallback"}

    reports.recent_reports = lambda *a, **k: [  # type: ignore[assignment]
        {"line": "Red", "stationId": "place-pktrm", "kind": "PACKED"}, {"stationId": "place-pktrm", "kind": "STALE_ETA"},
    ]
    ai.line_vibe_summary = vibe_capture  # type: ignore[assignment]
    try:
        for line in ("Green", "Red"):
            asyncio.run(ai_routes.line_vibe(line))  # type: ignore[arg-type]
    finally:
        reports.recent_reports, ai.line_vibe_summary = real_recent, real_summary  # type: ignore[assignment]
    ok = seen.get("Green") == {"STALE_ETA": 1} and seen.get("Red") == {"PACKED": 1}
    report("PASS" if ok else "FAIL", "unit: line vibe at transfer stops", f"Green {seen.get('Green')}, Red {seen.get('Red')}")

    try:
        NewStationStory.model_validate({"stationId": "place-kencl", "category": "VIBES", "author": "a", "caption": "  ", "imageUrl": "https://x"})
        report("FAIL", "unit: blank story caption", "accepted")
    except ValidationError:
        report("PASS", "unit: blank story caption", "rejected")


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

    print("--- unit checks ---")
    check_units()
    print()

    fails = sum(1 for lvl, _, _ in results if lvl == "FAIL")
    warns = sum(1 for lvl, _, _ in results if lvl == "WARN")
    print(f"{len(results) - fails - warns} passed, {warns} warnings, {fails} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
