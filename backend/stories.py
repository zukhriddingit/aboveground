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

    @field_validator("caption", "place_name")
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


def _seeds() -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    photo = lambda seed: f"https://picsum.photos/seed/{seed}/720/1280"  # noqa: E731
    rows = [
        ("s1", "place-kencl", "CHEAP_EATS", "maya.bu", "$7 pizza slice the size of my face before the game", "Pizza by the Slice", "$7", 4, "kenmore-slice", 12),
        ("s2", "place-kencl", "EVENTS", "jtan", "Sox fans spilling onto Lansdowne already", "Lansdowne St", None, 6, "lansdowne", 25),
        ("s3", "place-bucen", "VIBES", "terriergirl", "Sunset over the Charles from the BU bridge", "BU Bridge", None, 5, "charles-sunset", 40),
        ("s4", "place-coecl", "VIBES", "readsalot", "Bates Hall reading room is silent and gorgeous", "Boston Public Library", None, 1, "bates-hall", 18),
        ("s5", "place-coecl", "CHEAP_EATS", "noodlenerd", "Ramen under $15 that actually slaps", "Boylston St ramen", "$14", 3, "copley-ramen", 55),
        ("s6", "place-pktrm", "EVENTS", "commonfolk", "Free outdoor show at the Parkman Bandstand tonight", "Boston Common", None, 2, "common-show", 8),
        ("s7", "place-boyls", "CHEAP_EATS", "dumplingdan", "Chinatown dumplings, 8 for $6", "Chinatown", "$6", 5, "chinatown-dumplings", 30),
        ("s8", "place-harsq", "VIBES", "pitpal", "Street musician in the Pit is unreal right now", "The Pit", None, 1, "harvard-pit", 15),
    ]
    out = []
    for sid, station, cat, author, caption, place, price, walk, seed, ago in rows:
        story = {
            "id": sid, "stationId": station, "category": cat, "author": author, "caption": caption,
            "placeName": place, "walkMin": walk, "imageUrl": photo(seed), "createdAt": _iso(now - timedelta(minutes=ago)),
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


def _save(rider: list[dict[str, Any]]) -> None:
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
        rider = [s for s in _stories if s["id"] not in SEED_IDS]
    await asyncio.to_thread(_save, rider)
    return story
