"""The live world: GET /api/world, POST /api/alerts/trigger, GET /api/alerts, POST /api/alerts/{id}/resolve.

    from world import router as world_router, start as start_world
    app.include_router(world_router)

Stations are the MVP stops (same as ``frontend/src/lib/mockData.ts``). Trains come from the MBTA V3 API
(``/vehicles``, every 12 s) and the next-train minutes from ``/predictions`` (every 30 s), polled in the
background so requests never wait on the network. When the MBTA can't be reached, or ``WORLD_LIVE=0``,
the response falls back to the same mock trains the frontend uses. JSON is camelCase and matches
``WorldResponse`` / ``TriggerAlertResponse`` in ``frontend/src/types/tverse.ts``.

Env vars:
    MBTA_API_KEY      optional; raises the MBTA limit from ~20 to 1,000 requests a minute
    WORLD_LIVE=0      never call the MBTA (mock trains only)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

import ai_translator as ai
from ai_routes import StationId

log = logging.getLogger("world")

router = APIRouter(prefix="/api", tags=["world"])

MBTA_BASE = "https://api-v3.mbta.com"
MAP_ROUTES = ["Red", "Orange", "Blue", "Green-B", "Green-C", "Green-D", "Green-E"]
VEHICLE_POLL_S = 12
PREDICTION_POLL_S = 30
HTTP_TIMEOUT_S = 6
STALE_VEHICLE_S = 180
# Live trains older than this are replaced by the mock fleet (the MBTA went away).
LIVE_FRESH_S = 75
ALERT_TTL_S = 30 * 60

# ---------------------------------------------------------------------------
# Static data (mirrors frontend/src/lib/mockData.ts)
# ---------------------------------------------------------------------------


def _station(id_: str, name: str, line: str, lat: float, lng: float, nxt: int, crowd: str, title: str, walk: int, fact: str) -> dict[str, Any]:
    return {
        "id": id_, "name": name, "line": line, "lat": lat, "lng": lng, "nextArrivalMin": nxt, "crowdedness": crowd,
        "hasActiveAlert": False, "landmark": {"title": title, "fact": fact, "walkMin": walk},
    }


STATIONS: list[dict[str, Any]] = [
    _station("place-bucen", "BU Central", "Green", 42.350082, -71.106865, 3, "FEW_SEATS", "BU Beach", 3,
             "BU Beach has no sand and no ocean. It is a strip of grass next to Storrow Drive, and the waves you hear are the traffic."),
    _station("place-kencl", "Kenmore", "Green", 42.348949, -71.095169, 2, "PACKED", "Fenway Park", 7,
             "Fenway Park opened in 1912, which makes it the oldest ballpark in Major League Baseball. Its left-field wall, the Green Monster, is 37 feet tall."),
    _station("place-hymnl", "Hynes Convention Center", "Green", 42.347888, -71.087903, 4, "FEW_SEATS", "Newbury Street", 2,
             "The cross streets of Newbury Street run in alphabetical order: Arlington, Berkeley, Clarendon, Dartmouth, Exeter, Fairfield, Gloucester and Hereford."),
    _station("place-coecl", "Copley", "Green", 42.349974, -71.077447, 1, "FEW_SEATS", "Boston Public Library", 1,
             "The Boston Public Library was the first large free public library in the United States. Above its entrance are the words: Free to All."),
    _station("place-boyls", "Boylston", "Green", 42.35302, -71.06459, 5, "EMPTY", "America's First Subway", 0,
             "Boylston and Park Street opened on September 1, 1897, as part of the first subway in America. You are standing in it."),
    _station("place-pktrm", "Park Street", "Green", 42.3563946, -71.0624242, 2, "PACKED", "Boston Common", 1,
             "Boston Common, from 1634, is the oldest public park in the country. Cows grazed on it until 1830."),
    _station("place-harsq", "Harvard", "Red", 42.373362, -71.118956, 6, "FEW_SEATS", "Harvard Yard", 3,
             "The John Harvard statue is nicknamed the statue of three lies: the face is not his, he was not the founder, and Harvard was not founded in 1638."),
    _station("place-knncl", "Kendall/MIT", "Red", 42.3624908, -71.0861765, 3, "EMPTY", "MIT Great Dome", 8,
             "In 1994 MIT students put a full-size campus police car on top of the Great Dome. It is now on display in the Stata Center."),
    _station("place-chncl", "Chinatown", "Orange", 42.352547, -71.062752, 7, "FEW_SEATS", "Chinatown Gate", 3,
             "The Chinatown Gate on Beach Street was a gift from Taiwan in 1982. Its inscription, a line from Sun Yat-sen, means everything under heaven belongs to the people."),
    _station("place-aport", "Airport", "Blue", 42.374262, -71.030395, 6, "FEW_SEATS", "Logan Airport", 5,
             "Logan opened in 1923 as a small airfield on the East Boston mud flats, and much of it now sits on land filled in from Boston Harbor. Free Massport shuttles run from this station to every terminal."),
]
STATIONS_BY_ID = {s["id"]: s for s in STATIONS}

MOCK_VEHICLES: list[dict[str, Any]] = [
    {"id": "mock-g1", "route": "Green-B", "lng": -71.1003, "lat": 42.34922, "bearing": 80, "crowdedness": "FEW_SEATS"},
    {"id": "mock-g2", "route": "Green-C", "lng": -71.0905, "lat": 42.34805, "bearing": 95, "crowdedness": "PACKED"},
    {"id": "mock-g3", "route": "Green-D", "lng": -71.0805, "lat": 42.34905, "bearing": 70, "crowdedness": "EMPTY"},
    {"id": "mock-g4", "route": "Green-E", "lng": -71.0690, "lat": 42.35225, "bearing": 260, "crowdedness": "FEW_SEATS"},
    {"id": "mock-g5", "route": "Green-B", "lng": -71.0633, "lat": 42.35540, "bearing": 20, "crowdedness": "PACKED"},
    {"id": "mock-g6", "route": "Green-E", "lng": -71.0857, "lat": 42.34360, "bearing": 225, "crowdedness": "EMPTY"},
    {"id": "mock-r1", "route": "Red", "lng": -71.1110, "lat": 42.36985, "bearing": 125, "crowdedness": "FEW_SEATS"},
    {"id": "mock-r2", "route": "Red", "lng": -71.0790, "lat": 42.36130, "bearing": 110, "crowdedness": "PACKED"},
    {"id": "mock-r3", "route": "Red", "lng": -71.0600, "lat": 42.35400, "bearing": 170, "crowdedness": "EMPTY"},
    {"id": "mock-o1", "route": "Orange", "lng": -71.0605, "lat": 42.35750, "bearing": 0, "crowdedness": "FEW_SEATS"},
    {"id": "mock-o2", "route": "Orange", "lng": -71.0690, "lat": 42.34500, "bearing": 200, "crowdedness": "EMPTY"},
    {"id": "mock-b1", "route": "Blue", "lng": -71.0520, "lat": 42.35950, "bearing": 60, "crowdedness": "FEW_SEATS"},
]

_LINES_FILE = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "t-lines.json"
_EMPTY_LINES: dict[str, Any] = {"type": "FeatureCollection", "features": []}


def _load_lines() -> dict[str, Any]:
    """The bundled MBTA shapes (~16 KB). Empty when the frontend isn't next to us; the map then uses its own copy."""
    try:
        data = json.loads(_LINES_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("features"), list):
            return data
    except Exception:
        pass
    return _EMPTY_LINES


LINES_GEOJSON = _load_lines()

# ---------------------------------------------------------------------------
# MBTA V3 polling
# ---------------------------------------------------------------------------

_state: dict[str, Any] = {
    "vehicles": [], "vehicles_at": 0.0, "next_min": {}, "next_min_at": 0.0,
    "last_error": None, "task": None,
}


def _live_enabled() -> bool:
    return os.environ.get("WORLD_LIVE", "1") != "0"


def _mbta_get(path: str) -> dict[str, Any]:
    headers = {"Accept": "application/vnd.api+json", "User-Agent": "AboveGround/1.0"}
    key = (os.environ.get("MBTA_API_KEY") or os.environ.get("NEXT_PUBLIC_MBTA_API_KEY") or "").strip()
    if key:
        headers["x-api-key"] = key
    req = urllib.request.Request(f"{MBTA_BASE}{path}", headers=headers)
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as res:  # noqa: S310 - fixed https host
        return json.loads(res.read().decode("utf-8"))


def _iso(ts: Optional[str]) -> Optional[float]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


_OCCUPANCY = {
    "EMPTY": "EMPTY", "MANY_SEATS_AVAILABLE": "EMPTY", "FEW_SEATS_AVAILABLE": "FEW_SEATS",
    "STANDING_ROOM_ONLY": "PACKED", "CRUSHED_STANDING_ROOM_ONLY": "PACKED", "FULL": "PACKED",
}


def _crowdedness(occupancy: Optional[str], vehicle_id: str) -> str:
    if occupancy in _OCCUPANCY:
        return _OCCUPANCY[occupancy]
    # Most trains don't report occupancy: a stable pick per train so the pills don't flicker.
    return ("EMPTY", "FEW_SEATS", "FEW_SEATS", "PACKED")[sum(map(ord, vehicle_id)) % 4]


def _fetch_vehicles() -> list[dict[str, Any]]:
    doc = _mbta_get(
        f"/vehicles?filter[route]={','.join(MAP_ROUTES)}"
        "&fields[vehicle]=latitude,longitude,bearing,occupancy_status,updated_at"
    )
    now = time.time()
    out: list[dict[str, Any]] = []
    for r in doc.get("data", []):
        a = r.get("attributes") or {}
        route = (((r.get("relationships") or {}).get("route") or {}).get("data") or {}).get("id")
        lat, lng = a.get("latitude"), a.get("longitude")
        if not route or not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            continue
        updated = _iso(a.get("updated_at"))
        if updated is not None and now - updated > STALE_VEHICLE_S:
            continue
        out.append({
            "id": r["id"], "route": route, "lng": lng, "lat": lat,
            "bearing": a.get("bearing") if isinstance(a.get("bearing"), (int, float)) else 0,
            "crowdedness": _crowdedness(a.get("occupancy_status"), r["id"]),
        })
    return out


def _fetch_next_minutes() -> dict[str, int]:
    ids = ",".join(STATIONS_BY_ID)
    doc = _mbta_get(
        f"/predictions?filter[stop]={ids}&include=stop"
        "&fields[prediction]=arrival_time,departure_time,schedule_relationship&fields[stop]=name"
    )
    parent: dict[str, str] = {}
    for s in doc.get("included", []):
        p = (((s.get("relationships") or {}).get("parent_station") or {}).get("data") or {}).get("id")
        parent[s["id"]] = p or s["id"]
    now = time.time()
    best: dict[str, float] = {}
    for p in doc.get("data", []):
        a = p.get("attributes") or {}
        if a.get("schedule_relationship") in ("SKIPPED", "CANCELLED"):
            continue
        at = _iso(a.get("departure_time")) or _iso(a.get("arrival_time"))
        if at is None or at < now - 30:
            continue
        stop = (((p.get("relationships") or {}).get("stop") or {}).get("data") or {}).get("id", "")
        sid = parent.get(stop, stop)
        if sid in STATIONS_BY_ID:
            best[sid] = min(best.get(sid, at), at)
    return {sid: max(0, round((at - now) / 60)) for sid, at in best.items()}


async def _poll_forever() -> None:
    next_vehicles = next_predictions = 0.0
    while True:
        now = time.monotonic()
        try:
            if now >= next_vehicles:
                next_vehicles = now + VEHICLE_POLL_S
                vehicles = await asyncio.to_thread(_fetch_vehicles)
                if vehicles:
                    _state.update(vehicles=vehicles, vehicles_at=time.time(), last_error=None)
            if now >= next_predictions:
                next_predictions = now + PREDICTION_POLL_S
                minutes = await asyncio.to_thread(_fetch_next_minutes)
                _state.update(next_min=minutes, next_min_at=time.time())
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            if _state["last_error"] is None:
                log.warning("MBTA V3 unreachable, serving mock trains (%s)", exc)
            _state["last_error"] = f"{type(exc).__name__}: {exc}"[:200]
            # Back off a little more after a failure (and after a 429).
            next_vehicles = max(next_vehicles, time.monotonic() + 20)
        await asyncio.sleep(1)


def start() -> None:
    """Start the background MBTA poller (idempotent). main.py calls it at startup."""
    if not _live_enabled():
        return
    task = _state.get("task")
    if task is None or task.done():
        _state["task"] = asyncio.get_running_loop().create_task(_poll_forever())


async def stop() -> None:
    task = _state.get("task")
    if task is not None:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
        _state["task"] = None


def vehicle_source() -> str:
    """"mbta" when the live trains are fresh, else "mock"."""
    return "mbta" if _state["vehicles"] and time.time() - _state["vehicles_at"] < LIVE_FRESH_S else "mock"


def status() -> dict[str, Any]:
    return {
        "live": _live_enabled(),
        "vehicleSource": vehicle_source(),
        "vehicles": len(_state["vehicles"]) if vehicle_source() == "mbta" else len(MOCK_VEHICLES),
        "predictionsFor": len(_state["next_min"]),
        "lastError": _state["last_error"],
    }


# ---------------------------------------------------------------------------
# Simulated delays (POST /api/alerts/trigger), mirroring frontend/src/components/game/alertTranslator.ts
# so the backend picks the same problem, title and mini-game the page would pick offline.
# ---------------------------------------------------------------------------

_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("EMERGENCY", ("medical", "police", "fire department", "emergency", "unattended", "injur")),
    ("PLANNED_WORK", ("upgrade", "shuttle", "construction", "maintenance", "accessib", "renovat", "not stopping", "closed", "track work", "scheduled")),
    ("SIGNAL", ("signal", "track circuit", "relay")),
    ("FROZEN", ("frozen", "freez", " ice ", "snow")),
    ("SWITCH", ("switch",)),
    ("POWER", ("power", "overhead wire", "third rail", "electrical")),
    ("DISABLED_TRAIN", ("disabled", "mechanical", "stalled")),
    ("TRACK", ("track", "rail", "screech")),
]


def classify(text: str) -> str:
    t = f" {text.lower()} "
    for category, needles in _RULES:
        if any(n in t for n in needles):
            return category
    return "DELAY"


# category -> (title, explanation, minutes, legacy miniGameType)
_TEMPLATES: dict[str, tuple[str, str, int, str]] = {
    "SIGNAL": ("{s} Signal Relay Glitch", "A signal relay near {n} stopped reporting, so the system can't confirm the track ahead is clear and every train has to creep forward on manual caution. Crews are swapping the relay and re-testing the circuit, which is why it takes about 15 minutes instead of 2.", 15, "WIRE_MATCH"),
    "TRACK": ("{s} Track Defect", "Crews spotted a worn rail section near {n}, so trains are crawling over it at walking speed to stay safe. A welding crew needs a gap between trains to patch it, which is why it takes a while.", 20, "TRACK_WELD"),
    "SWITCH": ("{s} Switch Stuck", "A track switch near {n} got stuck between positions, so trains can't change tracks and have to wait while crews crank it by hand. Once it's locked and tested, the line can run normally again.", 15, "TRACK_WELD"),
    "FROZEN": ("{s} Frozen Switch", "Ice froze a track switch near {n} in place, so trains can't change tracks until it moves again. Crews are melting it with switch heaters and a torch, which takes a few careful minutes.", 15, "TRACK_WELD"),
    "POWER": ("{s} Power Feed Dropout", "The power feed that keeps trains moving near {n} dropped out, so trains are coasting carefully or waiting in place. Crews have to safely isolate the section, fix the feed and re-energize it before anyone moves.", 18, "WIRE_MATCH"),
    "DISABLED_TRAIN": ("Stalled Train near {s}", "A train broke down near {n}, and everyone behind it is stuck until it's restarted or pushed clear. Think of it as a very heavy, very slow game of Tetris.", 12, "TRACK_WELD"),
    "PLANNED_WORK": ("{s} Planned Upgrade", "This is scheduled work, not a breakdown: crews are rebuilding part of {n} or the tracks nearby so it runs better afterward. Check the official alert for shuttle buses or detours before you head out.", 0, "TRACK_WELD"),
    "EMERGENCY": ("Emergency Response at {s}", "Crews are responding to an emergency near {n}, and trains are holding so responders can work safely. Service resumes as soon as they give the all-clear.", 10, "WIRE_MATCH"),
    "DELAY": ("{s} Delays", "Trains near {n} are running slower than scheduled, usually because one problem upstream bunches everyone up behind it. Give yourself a few extra minutes while crews space trains back out.", 10, "WIRE_MATCH"),
}

_FLAVOR: dict[tuple[str, str], tuple[str, str]] = {
    ("place-boyls", "SIGNAL"): ("Boylston Track Circuit Glitch", "The wiring that tells dispatch where each trolley is thinks a phantom train is parked at Boylston, so real trolleys have to wait their turn like it's 1897 again. Crews are tracing the bad circuit and re-splicing the wires, which takes about 15 minutes to do safely."),
    ("place-kencl", "SIGNAL"): ("Kenmore Signal Relay Meltdown", "Kenmore is where the B, C and D branches merge, and the relay that decides who goes first just stopped making decisions. Until crews swap it, a human is waving trolleys through one at a time like a very stressed crossing guard."),
}

_DEMO_RAW: dict[str, str] = {
    "place-boyls": "Green Line: Delays of about 15 minutes between Boylston and Park Street due to signal modernization work.",
    "place-kencl": "Green Line B, C and D branches: Delays of up to 15 minutes due to a signal problem at Kenmore.",
    "place-pktrm": "Green Line: Expect delays due to a disabled train at Park Street.",
    "place-coecl": "Green Line: Delays of about 10 minutes due to a switch problem near Copley.",
    "place-hymnl": "Green Line B, C and D branches: Delays due to a power problem near Hynes Convention Center.",
    "place-bucen": "Green Line B Branch: Delays of about 10 minutes due to a track problem near BU Central.",
    "place-harsq": "Red Line: Delays of about 25 minutes due to a signal problem and a disabled train near Harvard.",
    "place-knncl": "Red Line: Delays of about 10 minutes due to a power problem near Kendall/MIT.",
    "place-aport": "Blue Line: Delays of about 20 minutes between Airport and Wonderland due to an overhead wire inspection.",
    "place-chncl": "Orange Line: Shuttle buses replacing service between Downtown Crossing and Back Bay due to a track problem near Chinatown.",
}

_PROBLEMS: list[tuple[str, str]] = [
    ("SIGNAL", "{l}: Delays of about 15 minutes due to a signal problem at {n}."),
    ("TRACK", "{l}: Delays of about 20 minutes due to a track problem near {n}."),
    ("SWITCH", "{l}: Delays of about 15 minutes due to a switch problem near {n}."),
    ("POWER", "{l}: Delays due to a power problem near {n}."),
    ("DISABLED_TRAIN", "{l}: Expect delays due to a disabled train at {n}."),
    ("FROZEN", "{l}: Delays of about 15 minutes due to a frozen switch near {n}."),
]

_SHORT = {"place-hymnl": "Hynes", "place-pktrm": "Park St"}

_trigger_count: dict[str, int] = {}
_alerts: dict[str, tuple[dict[str, Any], float]] = {}


def _raw_for(station_id: str, name: str, line: str, n: int) -> str:
    first = _DEMO_RAW.get(station_id)
    if n == 0:
        return first or _PROBLEMS[0][1].format(l=f"{line} Line", n=name)
    base = 0
    if first:
        cat = classify(first)
        base = next((i for i, (c, _) in enumerate(_PROBLEMS) if c == cat), 0)
    return _PROBLEMS[(base + n) % len(_PROBLEMS)][1].format(l=f"{line} Line", n=name)


async def build_alert(station_id: str) -> tuple[dict[str, Any], str]:
    """A TranslatedAlert for a simulated delay, and who wrote its explanation ("gemini" or "fallback").
    The four 2026 scenarios come first, then a rotation of problems; Gemini only if it answers within 4 s."""
    st = STATIONS_BY_ID.get(station_id) or {"id": station_id, "name": ai.STATION_NAMES.get(station_id, station_id), "line": ai.STATION_LINES.get(station_id, "Green")}
    name, line = st["name"], st["line"]
    n = _trigger_count.get(station_id, 0)
    _trigger_count[station_id] = n + 1
    raw = _raw_for(station_id, name, line, n)
    category = classify(raw)
    alert_id = f"alert-{station_id}-{int(time.time() * 1000):x}"
    base: dict[str, Any] = {"id": alert_id, "stationId": station_id, "rawMbtaText": raw, "line": line, "branch": line}

    scenario = ai.STATION_SCENARIO.get(station_id)
    if n == 0 and scenario:
        t = await ai.translate_alert(station_id, station_name=name, line=line, raw_text=raw, disruption=scenario)
        return {
            **base, "plainTitle": t["plainTitle"], "plainExplanation": t["plainExplanation"],
            "estimatedFixMin": t["estimatedFixMin"], "miniGameType": _TEMPLATES[category][3],
            "repairKind": t["repairKind"], "disruption": t["disruption"], "alternateMove": t["alternateMove"],
        }, t["source"]

    title_t, explain_t, fix, game = _TEMPLATES[category]
    short = _SHORT.get(station_id, name)
    title, explain = _FLAVOR.get((station_id, category), (title_t.format(s=short), explain_t.format(n=name)))
    alt = ai.LINE_ALTERNATES.get(line, ai.LINE_ALTERNATES["Green"])
    text = await ai.generate(
        f"MBTA alert text: {raw}\nStation: {name} ({line} Line)\nWhat crews are doing (our ops notes): {explain}\n"
        f"Expected wait: about {fix or 10} minutes.\nKnown good alternate move: {alt}\nRewrite this for a rider in exactly 2 sentences.",
        ai._ALERT_SYSTEM,
        max_tokens=220,
        cache_key=f"trigger|{ai.model_name()}|{station_id}|{category}|{raw}",
    )
    return {
        **base, "plainTitle": title, "plainExplanation": text or explain, "estimatedFixMin": fix,
        "miniGameType": game, "alternateMove": alt,
    }, "gemini" if text else "fallback"


def active_alerts() -> list[dict[str, Any]]:
    now = time.time()
    for aid in [k for k, (_, at) in _alerts.items() if now - at > ALERT_TTL_S]:
        _alerts.pop(aid, None)
    return [a for a, _ in sorted(_alerts.values(), key=lambda x: x[1])]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class TriggerAlertRequest(_Camel):
    station_id: Optional[StationId] = None


@router.get("/world")
def get_world() -> dict[str, Any]:
    alerts = active_alerts()
    alerted = {a["stationId"] for a in alerts}
    minutes: dict[str, int] = _state["next_min"] if time.time() - _state["next_min_at"] < PREDICTION_POLL_S * 3 else {}
    stations = [{**s, "nextArrivalMin": minutes.get(s["id"], s["nextArrivalMin"]), "hasActiveAlert": s["id"] in alerted} for s in STATIONS]
    vehicles = _state["vehicles"] if vehicle_source() == "mbta" else MOCK_VEHICLES
    return {"stations": stations, "vehicles": vehicles, "alerts": alerts, "linesGeoJson": LINES_GEOJSON}


@router.get("/alerts")
def list_alerts() -> list[dict[str, Any]]:
    return active_alerts()


@router.post("/alerts/trigger")
async def trigger_alert(body: Optional[TriggerAlertRequest] = None) -> dict[str, Any]:
    station_id = (body.station_id if body else None) or "place-boyls"
    alert, source = await build_alert(station_id)
    _alerts[alert["id"]] = (alert, time.time())
    # `source` is extra to TriggerAlertResponse (which only promises `alert`): who wrote the explanation.
    return {"alert": alert, "source": source}


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str) -> dict[str, Any]:
    if _alerts.pop(alert_id, None) is None:
        raise HTTPException(status_code=404, detail="No active alert with that id")
    return {"id": alert_id, "resolved": True, "resolvedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
