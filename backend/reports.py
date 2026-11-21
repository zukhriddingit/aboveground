"""Quick-Check: 1-tap "Waze for the T" rider reports.

Riders tap one chip (On time / Ghost-Stale, Seats open / Packed / Pass-up, Elevator out, Spill,
No AC-heat, Shuttle confusion) and the app turns the last ~20 minutes of taps into per-station
signals. Two or more "Ghost / Stale" taps in 15 minutes flip ``staleEta`` so the frontend can show
an amber "Unverified · Stale ETA" badge on that stop.

Reports live in memory and every write is mirrored to ``reports_data.json`` next to this file by a
background thread (same pattern as ``community.py``), so they survive a restart.

Wire it into the main app with one line (Member 1)::

    from reports import router as reports_router
    app.include_router(reports_router)

JSON keys are camelCase and match ``frontend/src/types/tverse.ts`` (NewQuickReport, QuickReport,
StationSignals, QuickReportResponse, QuickReportSummary).

Env vars:
    REPORTS_DATA_FILE   where to mirror reports (default: backend/reports_data.json)
    REPORTS_RESET=1     ignore the file and start empty
"""

from __future__ import annotations

import atexit
import copy
import json
import logging
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Literal, Optional

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from pydantic.alias_generators import to_camel

log = logging.getLogger("reports")

router = APIRouter(prefix="/api/reports", tags=["reports"])

DATA_FILE = Path(os.environ.get("REPORTS_DATA_FILE") or Path(__file__).with_name("reports_data.json"))

# ---------------------------------------------------------------------------
# Types (mirror frontend/src/types/tverse.ts)
# ---------------------------------------------------------------------------

QuickCheckKind = Literal[
    "PREDICTION_OK", "STALE_ETA", "SEATS_OPEN", "PACKED", "PASS_UP",
    "ELEVATOR_OUT", "SPILL", "NO_AC", "SHUTTLE_CONFUSION",
]
KINDS: tuple[str, ...] = (
    "PREDICTION_OK", "STALE_ETA", "SEATS_OPEN", "PACKED", "PASS_UP",
    "ELEVATOR_OUT", "SPILL", "NO_AC", "SHUTTLE_CONFUSION",
)
TLine = Literal["Green", "Red", "Orange", "Blue"]
StationId = Literal[
    "place-bucen", "place-kencl", "place-hymnl", "place-coecl", "place-boyls", "place-pktrm",
    "place-harsq", "place-knncl", "place-chmnl", "place-dwnxg", "place-chncl", "place-state",
    "place-aqucl", "place-gover", "place-aport",
]

WINDOW_MIN = 20          # counts cover the last 20 minutes
STALE_WINDOW_MIN = 15    # staleEta looks at the last 15 minutes
STALE_MIN_REPORTS = 2
DEDUPE_SEC = 60          # same browser + stop + kind within a minute = one report
KEEP_HOURS = 24          # older reports are dropped
MAX_REPORTS = 20_000
MAX_BACKDATE = timedelta(hours=2)  # offline-queued reports may carry their tap time


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class NewQuickReport(_Camel):
    station_id: StationId
    kind: QuickCheckKind
    line: Optional[TLine] = None
    branch: Optional[str] = Field(None, max_length=24)
    client_id: str = Field(min_length=1, max_length=64)
    created_at: Optional[str] = None

    @field_validator("client_id")
    @classmethod
    def _client(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("clientId is empty")
        return v


class QuickReport(_Camel):
    id: str
    station_id: StationId
    kind: QuickCheckKind
    line: Optional[TLine] = None
    branch: Optional[str] = None
    client_id: str
    created_at: str


class StationSignals(_Camel):
    station_id: StationId
    counts: dict[str, int]
    total: int
    window_min: int
    stale_eta: bool
    last_report_at: Optional[str] = None


class QuickReportResponse(_Camel):
    report: QuickReport
    signals: StationSignals


class QuickReportSummary(_Camel):
    stations: list[StationSignals]
    generated_at: str


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Signals (the frontend's quickcheck/signals.ts implements the same rules)
# ---------------------------------------------------------------------------


def compute_signals(station_id: str, reports: Iterable[dict[str, Any]], now: Optional[datetime] = None) -> dict[str, Any]:
    """Counts per kind over the last WINDOW_MIN minutes, plus the staleEta flag.

    staleEta: >= 2 STALE_ETA reports in the last 15 min, and the PREDICTION_OK reports newer than
    the oldest of those STALE_ETA reports do not outnumber them (a newer "On time" majority clears it).
    """
    now = now or _now()
    since = now - timedelta(minutes=WINDOW_MIN)
    stale_since = now - timedelta(minutes=STALE_WINDOW_MIN)
    counts = {k: 0 for k in KINDS}
    last: Optional[datetime] = None
    stale_times: list[datetime] = []
    ok_times: list[datetime] = []
    for r in reports:
        if r["stationId"] != station_id:
            continue
        t = _parse(r["createdAt"])
        if t is None or t < since or t > now + timedelta(minutes=1):
            continue
        counts[r["kind"]] = counts.get(r["kind"], 0) + 1
        last = t if last is None or t > last else last
        if t >= stale_since:
            if r["kind"] == "STALE_ETA":
                stale_times.append(t)
            elif r["kind"] == "PREDICTION_OK":
                ok_times.append(t)
    stale = False
    if len(stale_times) >= STALE_MIN_REPORTS:
        first_stale = min(stale_times)
        ok_newer = sum(1 for t in ok_times if t > first_stale)
        stale = ok_newer <= len(stale_times)
    return {
        "stationId": station_id,
        "counts": counts,
        "total": sum(counts.values()),
        "windowMin": WINDOW_MIN,
        "staleEta": stale,
        "lastReportAt": _iso(last) if last else None,
    }


# ---------------------------------------------------------------------------
# Store: in-memory list of camelCase dicts + a background mirror to disk
# ---------------------------------------------------------------------------

_lock = threading.RLock()
_reports: list[dict[str, Any]] = []


class _Mirror:
    """Writes reports to disk on its own thread. Requests only flip a dirty flag."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._cv = threading.Condition()
        self._dirty = False
        threading.Thread(target=self._run, name="reports-mirror", daemon=True).start()
        atexit.register(self.flush)

    def mark_dirty(self) -> None:
        with self._cv:
            self._dirty = True
            self._cv.notify()

    def _run(self) -> None:
        while True:
            with self._cv:
                while not self._dirty:
                    self._cv.wait()
                self._dirty = False
            self._write()

    def flush(self) -> None:
        with self._cv:
            dirty, self._dirty = self._dirty, False
        if dirty:
            self._write()

    def _write(self) -> None:
        with _lock:
            data = json.dumps({"version": 1, "reports": _reports}, ensure_ascii=False)
        try:
            tmp = self.path.with_name(self.path.name + ".tmp")
            tmp.write_text(data, encoding="utf-8")
            os.replace(tmp, self.path)
        except OSError as exc:  # never take the API down over a disk hiccup
            log.warning("Quick-Check: could not write %s: %s", self.path, exc)


def _dump(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(by_alias=True, exclude_none=True)


def _prune(now: datetime) -> None:
    cutoff = now - timedelta(hours=KEEP_HOURS)
    keep = [r for r in _reports if (_parse(r["createdAt"]) or cutoff) > cutoff]
    del _reports[:]
    _reports.extend(keep[-MAX_REPORTS:])


def _load() -> list[dict[str, Any]]:
    if os.environ.get("REPORTS_RESET") == "1" or not DATA_FILE.exists():
        return []
    try:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        items = raw.get("reports") if isinstance(raw, dict) else raw
        if not isinstance(items, list):
            return []
    except (OSError, ValueError) as exc:
        log.warning("Quick-Check: %s is unreadable (%s), starting empty", DATA_FILE, exc)
        return []
    out: list[dict[str, Any]] = []
    for item in items:
        try:
            out.append(_dump(QuickReport.model_validate(item)))
        except ValidationError:
            continue
    return out


def _tap_time(body: NewQuickReport, now: datetime) -> datetime:
    """Offline-queued reports keep their tap time if it is recent; anything else is 'now'."""
    t = _parse(body.created_at)
    if t is None or t > now or now - t > MAX_BACKDATE:
        return now
    return t


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

# Routes return JSONResponse so the stored camelCase dicts go out as-is: optional fields are
# omitted (TS `line?`), while StationSignals.lastReportAt stays an explicit null.
_out: dict[str, Any] = {}


@router.post("", response_model=QuickReportResponse, **_out)
def create_report(body: NewQuickReport) -> Any:
    now = _now()
    at = _tap_time(body, now)
    with _lock:
        # Idempotent: a retry from the offline queue (or a double tap) returns the saved report.
        dup = next(
            (
                r for r in reversed(_reports)
                if r["clientId"] == body.client_id
                and r["stationId"] == body.station_id
                and r["kind"] == body.kind
                and abs(((_parse(r["createdAt"]) or now) - at).total_seconds()) < DEDUPE_SEC
            ),
            None,
        )
        if dup is None:
            report = _dump(
                QuickReport(
                    id=f"q-{uuid.uuid4().hex[:12]}",
                    station_id=body.station_id,
                    kind=body.kind,
                    line=body.line,
                    branch=(body.branch or "").strip() or None,
                    client_id=body.client_id,
                    created_at=_iso(at),
                )
            )
            _reports.append(report)
            if len(_reports) > MAX_REPORTS:
                _prune(now)
        else:
            report = dup
        result = {
            "report": copy.deepcopy(report),
            "signals": compute_signals(body.station_id, _reports, now),
        }
    if dup is None:
        _mirror.mark_dirty()
    return JSONResponse(result)


@router.get("/summary", response_model=QuickReportSummary, **_out)
def summary(station_id: Optional[StationId] = Query(None, alias="stationId")) -> Any:
    now = _now()
    since = now - timedelta(minutes=WINDOW_MIN)
    with _lock:
        if station_id:
            ids = [station_id]
        else:
            ids = sorted({r["stationId"] for r in _reports if (_parse(r["createdAt"]) or since) > since})
        stations = [compute_signals(sid, _reports, now) for sid in ids]
    return JSONResponse({"stations": stations, "generatedAt": _iso(now)})


@router.get("", response_model=list[QuickReport], **_out)
def list_reports(
    station_id: Optional[StationId] = Query(None, alias="stationId"),
    limit: int = Query(50, ge=1, le=500),
) -> Any:
    """Newest first. Handy for debugging and for the line-vibe summary."""
    with _lock:
        rows = [r for r in _reports if station_id is None or r["stationId"] == station_id]
        return JSONResponse(copy.deepcopy(rows[-limit:][::-1]))


def recent_reports(minutes: int = WINDOW_MIN) -> list[dict[str, Any]]:
    """Snapshot of the last `minutes` of reports (used by ai_routes' line-vibe summary)."""
    since = _now() - timedelta(minutes=minutes)
    with _lock:
        return [copy.deepcopy(r) for r in _reports if (_parse(r["createdAt"]) or since) > since]


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

_mirror = _Mirror(DATA_FILE)
_reports.extend(_load())
_prune(_now())
