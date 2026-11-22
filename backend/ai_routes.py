"""AI routes: Gemini plain-English delay translator, Tourist narrator, line vibe.

    from ai_routes import router as ai_router
    app.include_router(ai_router)

Every route always answers (well under 4.5 s): Gemini text when it arrives within 4 s,
otherwise the deterministic templates in ai_translator.py. ``source`` says which.
JSON matches TranslateAlertRequest/Response, NarrateStationRequest/Response and
LineVibeResponse in ``frontend/src/types/tverse.ts``.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

import ai_translator as ai

router = APIRouter(prefix="/api/ai", tags=["ai"])

TLine = Literal["Green", "Red", "Orange", "Blue"]
AiSource = Literal["gemini", "claude", "fallback"]
StationId = Literal[
    "place-bucen", "place-kencl", "place-hymnl", "place-coecl", "place-boyls", "place-pktrm",
    "place-harsq", "place-knncl", "place-chmnl", "place-dwnxg", "place-chncl", "place-state",
    "place-aqucl", "place-gover", "place-aport",
]
RepairKind = Literal["SIGNAL_RELAY", "CATENARY", "SWITCH_CLEARANCE", "RAIL_FASTENER"]
DisruptionKind = Literal[
    "SIGNAL_MODERNIZATION", "OVERHEAD_WIRE_INSPECTION", "SIGNAL_DELAY_DISABLED_TRAIN", "TRACK_PROBLEM_SHUTTLE",
]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class TranslateAlertRequest(_Camel):
    alert_id: Optional[str] = Field(None, max_length=80)
    station_id: StationId
    station_name: Optional[str] = Field(None, max_length=60)
    line: Optional[TLine] = None
    branch: Optional[str] = Field(None, max_length=24)
    raw_mbta_text: Optional[str] = Field(None, max_length=1200)
    estimated_fix_min: Optional[int] = Field(None, ge=1, le=600)
    repair_kind: Optional[RepairKind] = None
    disruption: Optional[DisruptionKind] = None


class TranslateAlertResponse(_Camel):
    plain_title: str
    plain_explanation: str
    alternate_move: str
    source: AiSource
    model: Optional[str] = None


class NarrateStationRequest(_Camel):
    station_id: StationId
    station_name: Optional[str] = Field(None, max_length=60)
    line: Optional[TLine] = None
    landmark_title: Optional[str] = Field(None, max_length=80)
    landmark_fact: Optional[str] = Field(None, max_length=600)
    walk_min: Optional[int] = Field(None, ge=0, le=120)


class NarrateStationResponse(_Camel):
    title: str
    text: str
    source: AiSource
    model: Optional[str] = None


class LineVibeResponse(_Camel):
    line: TLine
    text: str
    source: AiSource
    model: Optional[str] = None


_out = {"response_model_exclude_none": True}


@router.post("/translate-alert", response_model=TranslateAlertResponse, **_out)
async def translate_alert(body: TranslateAlertRequest) -> dict[str, Any]:
    return await ai.translate_alert(
        body.station_id,
        station_name=body.station_name,
        line=body.line,
        branch=body.branch,
        raw_text=body.raw_mbta_text,
        fix_min=body.estimated_fix_min,
        repair_kind=body.repair_kind,
        disruption=body.disruption,
    )


@router.post("/narrate", response_model=NarrateStationResponse, **_out)
async def narrate(body: NarrateStationRequest) -> dict[str, Any]:
    return await ai.narrate_station(
        body.station_id,
        station_name=body.station_name,
        line=body.line,
        landmark_title=body.landmark_title,
        landmark_fact=body.landmark_fact,
        walk_min=body.walk_min,
    )


@router.get("/line-vibe", response_model=LineVibeResponse, **_out)
async def line_vibe(line: TLine = Query("Green")) -> dict[str, Any]:
    """P2: one-line vibe from the last 5 T-Feed posts + last 20 min of Quick-Check taps on a line."""
    captions: list[str] = []
    counts: dict[str, int] = {}
    try:  # both routers are optional; the vibe still answers without them
        import community

        with community._lock:
            posts = sorted(
                (p for p in community._posts if p.get("line") == line),
                key=lambda p: p.get("createdAt", ""), reverse=True,
            )[:5]
            captions = [str(p.get("caption", "")) for p in posts]
    except Exception:
        pass
    try:
        import reports

        for r in reports.recent_reports():
            if r.get("line") == line or ai.STATION_LINES.get(r.get("stationId", "")) == line:
                counts[r["kind"]] = counts.get(r["kind"], 0) + 1
    except Exception:
        pass
    return await ai.line_vibe_summary(line, captions, counts)


@router.get("/status")
def status() -> dict[str, Any]:
    """Is a key configured, and which model would be used (never returns the key)."""
    return {
        "geminiConfigured": ai.gemini_configured(),
        # Which AI answers right now: "gemini", "claude" (interim, no Gemini key) or None (templates).
        "provider": ai.active_provider(),
        "model": ai.model_name(),
        "timeoutS": ai._timeout_s(),
    }
