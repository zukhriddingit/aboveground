"""Station Stories: GET /api/stories, POST /api/stories.

    from stories import router as stories_router
    app.include_router(stories_router)

Eight seeded stories (the same as ``MOCK_STORIES`` in ``frontend/src/lib/mockData.ts``), always fresh
at startup, plus what riders post. Rider stories live in memory and are mirrored to
``backend/stories_data.json`` (gitignored, atomic replace) so they survive a restart. JSON matches
``StationStory`` / ``NewStationStory`` in ``frontend/src/types/tverse.ts``.

Env vars:
    STORIES_DATA_FILE   where rider stories are kept (default backend/stories_data.json)
    STORIES_RESET=1     start without the saved rider stories
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from ai_routes import StationId

router = APIRouter(prefix="/api/stories", tags=["stories"])

StoryCategory = Literal["CHEAP_EATS", "EVENTS", "VIBES", "ALERTS"]
MAX_STORIES = 300
_DATA_FILE = Path(os.environ.get("STORIES_DATA_FILE") or Path(__file__).resolve().parent / "stories_data.json")


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class NewStationStory(_Camel):
    station_id: StationId
    category: StoryCategory
    author: str = Field(min_length=1, max_length=40)
    caption: str = Field(min_length=1, max_length=280)
    place_name: str = Field("", max_length=80)
    price_tag: Optional[str] = Field(None, max_length=16)
    walk_min: int = Field(3, ge=0, le=60)
    # Compressed JPEG data URLs are ~100-250 KB; text cards are SVG data URLs.
    image_url: str = Field(min_length=1, max_length=3_000_000)

    @field_validator("author")
    @classmethod
    def _author(cls, v: str) -> str:
        v = " ".join(v.strip().lstrip("@").split())[:32]
        if not v:
            raise ValueError("author is empty")
        return v

    @field_validator("caption")
    @classmethod
    def _caption(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("caption is empty")
        return v

    @field_validator("place_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("image_url")
    @classmethod
    def _image(cls, v: str) -> str:
        if not (v.startswith("data:image/") or v.startswith("https://") or v.startswith("http://")):
            raise ValueError("imageUrl must be a data:image/... URL or an http(s) URL")
        return v


class StationStory(NewStationStory):
    id: str
    created_at: str


def story_scene(
    top: str,
    bottom: str,
    glow: str,
    track: str,
    emojis: list[tuple[str, int, int, int]],
    seed: int,
    *,
    water: bool = False,
    sun: Optional[str] = None,
    stars: bool = False,
) -> str:
    """A 720x1280 generated SVG 'photo' for a seeded story, in the T-Feed scene style (community.py's _scene).
    Inline, so nothing can 404 offline. Integer-only maths, so storyScene() in frontend/src/lib/mockData.ts
    builds the byte-identical data URL."""
    state = (seed * 7919) % 2147483647 or 1

    def nxt() -> int:
        nonlocal state
        state = (state * 48271) % 2147483647
        return state

    def rint(lo: int, hi: int) -> int:
        return lo + nxt() % (hi - lo + 1)

    w, h, base = 720, 1280, 990
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">',
        f'<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>',
        f'<radialGradient id="g" cx=".5" cy=".4" r=".55"><stop offset="0" stop-color="{glow}" stop-opacity=".75"/><stop offset="1" stop-color="{glow}" stop-opacity="0"/></radialGradient></defs>',
        f'<rect width="{w}" height="{h}" fill="url(#s)"/>',
        '<circle cx="360" cy="520" r="430" fill="url(#g)"/>',
    ]
    if stars:
        for _ in range(18):
            out.append(f'<circle cx="{rint(20, 700)}" cy="{rint(60, 520)}" r="{rint(2, 4)}" fill="#ffffff" opacity="0.{rint(40, 90)}"/>')
    if sun:
        out.append(f'<circle cx="360" cy="{base - 230}" r="120" fill="{sun}"/>')
    x = -16
    while x < w:
        bw, bh = rint(60, 118), (rint(80, 250) if water else rint(140, 430))  # a river view: a low, distant skyline
        out.append(f'<rect x="{x}" y="{base - bh}" width="{bw}" height="{bh}" fill="#0a0f24" opacity=".94"/>')
        for wy in range(base - bh + 22, base - 18, 36):
            for wx in range(x + 10, x + bw - 14, 24):
                if nxt() % 100 < 30:
                    out.append(f'<rect x="{wx}" y="{wy}" width="8" height="12" fill="#ffd98a" opacity="0.{rint(45, 95)}"/>')
        x += bw + rint(4, 14)
    if water:
        out.append(f'<rect y="{base}" width="{w}" height="{h - base}" fill="#0b1636"/>')
        for i in range(10):
            half = 40 + rint(40, 200)
            out.append(
                f'<rect x="{360 - half}" y="{base + 26 + i * 28}" width="{2 * half}" height="5" rx="2.5" '
                f'fill="{sun or glow}" opacity="0.{55 - i * 5:02d}"/>'
            )
    else:
        out.append(f'<rect y="{base}" width="{w}" height="{h - base}" fill="#060a18"/>')
    ty = base + 8 if water else base + 48
    out.append(f'<rect y="{ty - 12}" width="{w}" height="24" fill="{track}" opacity=".28"/>')
    out.append(f'<rect y="{ty - 3}" width="{w}" height="6" fill="{track}"/>')
    for ch, cx, cy, size in emojis:
        out.append(
            f'<text x="{cx}" y="{cy}" font-size="{size}" text-anchor="middle" dominant-baseline="central" '
            f'font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">{ch}</text>'
        )
    out.append("</svg>")
    # Same escaping as JavaScript's encodeURIComponent.
    return "data:image/svg+xml;charset=utf-8," + quote("".join(out), safe="!~*'()")


_GREEN, _RED = "#38d283", "#ff5948"

# One scene per seeded story, matching its caption (same as STORY_SCENES in frontend/src/lib/mockData.ts).
STORY_SCENES: dict[str, str] = {
    # $7 pizza slice before the game, Kenmore
    "s1": story_scene("#3a1240", "#ff7a3d", "#ffb36b", _GREEN, [("🍕", 360, 560, 300), ("⚾", 560, 330, 110), ("🏟️", 170, 310, 110)], 11),
    # Sox fans on Lansdowne St at night
    "s2": story_scene("#0b1442", "#9b1c2e", _RED, _GREEN, [("🧢", 360, 560, 280), ("⚾", 190, 330, 110), ("📣", 560, 320, 110)], 12, stars=True),
    # Sunset over the Charles from the BU Bridge
    "s3": story_scene("#3d1a5c", "#ff8a4c", "#ffcf6b", _GREEN, [("🚣", 540, 1110, 90)], 13, water=True, sun="#ffd27a"),
    # Bates Hall reading room, Boston Public Library (the green lamps)
    "s4": story_scene("#0b2a24", "#1f5f4a", "#7ee0a8", _GREEN, [("📚", 360, 540, 280), ("💡", 190, 310, 110), ("🏛️", 550, 300, 110)], 14),
    # Ramen under $15 near Copley
    "s5": story_scene("#2a0f2e", "#c2410c", "#ffab31", _GREEN, [("🍜", 360, 560, 290), ("🥢", 560, 350, 120), ("♨️", 190, 340, 100)], 15),
    # Free outdoor show at the Parkman Bandstand on the Common
    "s6": story_scene("#120b3a", "#4c1d95", "#c084fc", _GREEN, [("🎸", 360, 540, 270), ("🎶", 190, 320, 110), ("🌳", 570, 330, 120)], 16, stars=True),
    # Chinatown dumplings, 8 for $6
    "s7": story_scene("#3a0d12", "#b4361c", "#ffab31", _GREEN, [("🥟", 360, 560, 290), ("🏮", 170, 280, 110), ("🏮", 550, 260, 110)], 17),
    # Street musician in the Harvard Pit
    "s8": story_scene("#1a0b2e", "#7f1d1d", _RED, _RED, [("🎷", 360, 540, 280), ("🎵", 190, 330, 110), ("🎶", 560, 300, 110)], 18),
}


def _seeds() -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    rows = [
        ("s1", "place-kencl", "CHEAP_EATS", "maya.bu", "$7 pizza slice the size of my face before the game", "Pizza by the Slice", "$7", 4, 12),
        ("s2", "place-kencl", "EVENTS", "jtan", "Sox fans spilling onto Lansdowne already", "Lansdowne St", None, 6, 25),
        ("s3", "place-bucen", "VIBES", "terriergirl", "Sunset over the Charles from the BU bridge", "BU Bridge", None, 5, 40),
        ("s4", "place-coecl", "VIBES", "readsalot", "Bates Hall reading room is silent and gorgeous", "Boston Public Library", None, 1, 18),
        ("s5", "place-coecl", "CHEAP_EATS", "noodlenerd", "Ramen under $15 that actually slaps", "Boylston St ramen", "$14", 3, 55),
        ("s6", "place-pktrm", "EVENTS", "commonfolk", "Free outdoor show at the Parkman Bandstand tonight", "Boston Common", None, 2, 8),
        ("s7", "place-boyls", "CHEAP_EATS", "dumplingdan", "Chinatown dumplings, 8 for $6", "Chinatown", "$6", 5, 30),
        ("s8", "place-harsq", "VIBES", "pitpal", "Street musician in the Pit is unreal right now", "The Pit", None, 1, 15),
    ]
    out = []
    for sid, station, cat, author, caption, place, price, walk, ago in rows:
        story = {
            "id": sid, "stationId": station, "category": cat, "author": author, "caption": caption,
            "placeName": place, "walkMin": walk, "imageUrl": STORY_SCENES[sid], "createdAt": _iso(now - timedelta(minutes=ago)),
        }
        if price:
            story["priceTag"] = price
        out.append(story)
    return out


_lock = threading.Lock()
_stories: list[dict[str, Any]] = []


def _load_rider_stories() -> list[dict[str, Any]]:
    if os.environ.get("STORIES_RESET") == "1":
        return []
    try:
        data = json.loads(_DATA_FILE.read_text(encoding="utf-8"))
        return [StationStory.model_validate(s).model_dump(by_alias=True, exclude_none=True) for s in data if isinstance(s, dict)]
    except Exception:
        return []


_save_lock = threading.Lock()


def _save(rider: Optional[list[dict[str, Any]]] = None) -> None:
    """Mirror the rider stories to disk. Concurrent POSTs each run this in a worker thread and share one .tmp
    file, so they take turns; with no argument the snapshot is taken inside the turn, so the last write wins."""
    with _save_lock:
        if rider is None:
            with _lock:
                rider = [s for s in _stories if s["id"] not in SEED_IDS]
        tmp = _DATA_FILE.with_suffix(".json.tmp")
        try:
            tmp.write_text(json.dumps(rider), encoding="utf-8")
            os.replace(tmp, _DATA_FILE)
        except OSError:
            pass  # read-only disk: stories just won't survive a restart


with _lock:
    _stories = _load_rider_stories() + _seeds()
SEED_IDS = {s["id"] for s in _seeds()}


@router.get("", response_model=list[StationStory], response_model_exclude_none=True)
def list_stories(station_id: Optional[StationId] = Query(None, alias="stationId")) -> list[dict[str, Any]]:
    """Newest first. `?stationId=` narrows it to one stop."""
    with _lock:
        out = [s for s in _stories if not station_id or s["stationId"] == station_id]
    return sorted(out, key=lambda s: s["createdAt"], reverse=True)


@router.post("", response_model=StationStory, response_model_exclude_none=True)
async def post_story(body: NewStationStory) -> dict[str, Any]:
    story = {
        **body.model_dump(by_alias=True, exclude_none=True),
        "id": f"story-{int(time.time())}-{uuid.uuid4().hex[:6]}",
        "createdAt": _iso(datetime.now(timezone.utc)),
    }
    if not story.get("placeName"):
        story["placeName"] = "Near the T"
    with _lock:
        _stories.insert(0, story)
        del _stories[MAX_STORIES:]
    await asyncio.to_thread(_save)
    return story
