"""T-Feed: an Instagram-style community feed for MBTA riders, filtered by T line.

Riders post sightings, food spots, crowd checks, street vibes and delay vents, react
(heart / train / dunkin / fire) and reply in threads. Posts live in memory and every write
is mirrored to ``community_data.json`` next to this file by a background thread, so a
request never waits on the disk and the feed survives a restart.

Wire it into the main app with one line (Member 1)::

    from community import router as community_router
    app.include_router(community_router)

JSON keys are camelCase and match ``frontend/src/types/tverse.ts`` (CommunityPost,
CommunityReply, NewCommunityPost, NewCommunityReply, CommunityReactRequest/Response).

Env vars:
    COMMUNITY_DATA_FILE   where to mirror the feed (default: backend/community_data.json)
    COMMUNITY_RESET=1     ignore the file and start again from the 8 seeded posts
"""

from __future__ import annotations

import atexit
import copy
import json
import logging
import os
import random
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from pydantic.alias_generators import to_camel

log = logging.getLogger("community")

router = APIRouter(prefix="/api/community", tags=["community"])

DATA_FILE = Path(os.environ.get("COMMUNITY_DATA_FILE") or Path(__file__).with_name("community_data.json"))

# ---------------------------------------------------------------------------
# Types (mirror frontend/src/types/tverse.ts)
# ---------------------------------------------------------------------------

TransitLine = Literal["Green", "Red", "Orange", "Blue"]
PostVibe = Literal["ON_THE_T", "FOOD_SPOT", "CROWD_CHECK", "STREET_VIBES", "DELAY_VENT"]
ReactionKey = Literal["heart", "train", "dunkin", "fire"]
RiderBadge = Literal["BU", "MIT", "NEU", "Local", "Tourist"]
StationId = Literal[
    "place-bucen", "place-kencl", "place-hymnl", "place-coecl", "place-boyls", "place-pktrm",
    "place-harsq", "place-knncl", "place-chmnl", "place-dwnxg", "place-chncl", "place-state",
    "place-aqucl", "place-gover",
]

REACTION_KEYS: tuple[str, ...] = ("heart", "train", "dunkin", "fire")

STATION_NAMES: dict[str, str] = {
    "place-bucen": "BU Central",
    "place-kencl": "Kenmore",
    "place-hymnl": "Hynes Convention Center",
    "place-coecl": "Copley",
    "place-boyls": "Boylston",
    "place-pktrm": "Park Street",
    "place-harsq": "Harvard",
    "place-knncl": "Kendall/MIT",
    "place-chmnl": "Charles/MGH",
    "place-dwnxg": "Downtown Crossing",
    "place-chncl": "Chinatown",
    "place-state": "State",
    "place-aqucl": "Aquarium",
    "place-gover": "Government Center",
}


class _Camel(BaseModel):
    """snake_case in Python, camelCase on the wire."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class Reactions(BaseModel):
    heart: int = 0
    train: int = 0
    dunkin: int = 0
    fire: int = 0


class CommunityReply(_Camel):
    id: str
    post_id: str
    author: str
    author_badge: Optional[RiderBadge] = None
    text: str
    reply_to_author: Optional[str] = None
    likes: int = 0
    liked_by_me: Optional[bool] = None
    created_at: str


class CommunityPost(_Camel):
    id: str
    line: TransitLine
    branch: Optional[str] = None
    station_id: StationId
    station_name: str
    vibe: PostVibe
    author: str
    author_badge: Optional[RiderBadge] = None
    avatar_color: str
    caption: str
    image_url: Optional[str] = None
    reactions: Reactions
    my_reactions: Optional[list[ReactionKey]] = None
    replies: list[CommunityReply]
    created_at: str


def _clean_handle(value: str) -> str:
    return "".join(value.strip().lstrip("@").split())[:32]


class NewCommunityPost(_Camel):
    line: TransitLine
    branch: Optional[str] = Field(None, max_length=16)
    station_id: StationId
    station_name: Optional[str] = Field(None, max_length=60)
    vibe: PostVibe
    author: str = Field(min_length=1, max_length=40)
    author_badge: Optional[RiderBadge] = None
    avatar_color: str = Field("#38d283", pattern=r"^#[0-9a-fA-F]{3,8}$")
    caption: str = Field(min_length=1, max_length=500)
    # Compressed JPEG data URLs are ~100-250 KB; cap at ~3 MB.
    image_url: Optional[str] = Field(None, max_length=3_000_000)

    @field_validator("author")
    @classmethod
    def _author(cls, v: str) -> str:
        v = _clean_handle(v)
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

    @field_validator("image_url")
    @classmethod
    def _image(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        if not (v.startswith("data:image/") or v.startswith("https://") or v.startswith("http://")):
            raise ValueError("imageUrl must be a data:image/... URL or an http(s) URL")
        return v


class NewCommunityReply(_Camel):
    author: str = Field(min_length=1, max_length=40)
    author_badge: Optional[RiderBadge] = None
    text: str = Field(min_length=1, max_length=300)
    reply_to_author: Optional[str] = Field(None, max_length=40)

    @field_validator("author")
    @classmethod
    def _author(cls, v: str) -> str:
        v = _clean_handle(v)
        if not v:
            raise ValueError("author is empty")
        return v

    @field_validator("text")
    @classmethod
    def _text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("text is empty")
        return v

    @field_validator("reply_to_author")
    @classmethod
    def _reply_to(cls, v: Optional[str]) -> Optional[str]:
        return _clean_handle(v) or None if v else None


class CommunityReactRequest(_Camel):
    reaction: ReactionKey
    action: Literal["add", "remove"] = "add"


class CommunityReactResponse(_Camel):
    post_id: str
    reactions: Reactions


class CommunityReplyLikeRequest(_Camel):
    action: Optional[Literal["add", "remove"]] = None


# ---------------------------------------------------------------------------
# Store: in-memory list of camelCase dicts + a background mirror to disk
# ---------------------------------------------------------------------------

_lock = threading.RLock()
_posts: list[dict[str, Any]] = []
# Replies "liked" through the body-less toggle. The backend has no accounts, so this only
# decides the direction of an anonymous toggle; the frontend always sends an explicit action.
_toggled_likes: set[str] = set()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse(iso: str) -> datetime:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return datetime.fromtimestamp(0, timezone.utc)


class _Mirror:
    """Writes the feed to disk on its own thread. Requests only flip a dirty flag."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._cv = threading.Condition()
        self._dirty = False
        threading.Thread(target=self._run, name="community-mirror", daemon=True).start()
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
            data = json.dumps({"version": 1, "posts": _posts}, ensure_ascii=False)
        try:
            tmp = self.path.with_name(self.path.name + ".tmp")
            tmp.write_text(data, encoding="utf-8")
            os.replace(tmp, self.path)
        except OSError as exc:  # never take the API down over a disk hiccup
            log.warning("T-Feed: could not write %s: %s", self.path, exc)


def _load() -> list[dict[str, Any]] | None:
    if os.environ.get("COMMUNITY_RESET") == "1" or not DATA_FILE.exists():
        return None
    try:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        items = raw.get("posts") if isinstance(raw, dict) else raw
        if not isinstance(items, list):
            return None
    except (OSError, ValueError) as exc:
        log.warning("T-Feed: %s is unreadable (%s), reseeding", DATA_FILE, exc)
        return None
    posts: list[dict[str, Any]] = []
    for item in items:
        try:
            posts.append(_dump(CommunityPost.model_validate(item)))
        except ValidationError:
            continue  # drop anything that no longer matches the contract
    return posts


def _dump(model: BaseModel) -> dict[str, Any]:
    return model.model_dump(by_alias=True, exclude_none=True)


def _refresh_stale_seeds(posts: list[dict[str, Any]]) -> bool:
    """Demo freshness: if the seeded posts are from yesterday, slide them (and their seeded
    replies) forward so the newest is a few minutes old again. Rider posts are untouched."""
    seeds = [p for p in posts if p["id"].startswith("seed-")]
    if not seeds:
        return False
    newest = max(_parse(p["createdAt"]) for p in seeds)
    if _now() - newest < timedelta(hours=6):
        return False
    shift = (_now() - timedelta(minutes=6)) - newest
    for p in seeds:
        p["createdAt"] = _iso(_parse(p["createdAt"]) + shift)
        for r in p["replies"]:
            if r["id"].startswith("seed-"):
                r["createdAt"] = _iso(_parse(r["createdAt"]) + shift)
    return True


def _find_post(post_id: str) -> dict[str, Any]:
    for p in _posts:
        if p["id"] == post_id:
            return p
    raise HTTPException(status_code=404, detail=f"post {post_id} not found")


def _score(p: dict[str, Any]) -> int:
    return sum(int(p["reactions"].get(k, 0)) for k in REACTION_KEYS) + len(p["replies"])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

_out = {"response_model_exclude_none": True}


@router.get("/posts", response_model=list[CommunityPost], **_out)
def list_posts(
    line: Literal["ALL", "Green", "Red", "Orange", "Blue"] = "ALL",
    station_id: Optional[StationId] = Query(None, alias="stationId"),
    vibe: Optional[PostVibe] = None,
    sort: Literal["latest", "trending"] = "latest",
    limit: int = Query(200, ge=1, le=500),
) -> list[dict[str, Any]]:
    with _lock:
        posts = [
            p for p in _posts
            if (line == "ALL" or p["line"] == line)
            and (station_id is None or p["stationId"] == station_id)
            and (vibe is None or p["vibe"] == vibe)
        ]
        posts.sort(key=lambda p: _parse(p["createdAt"]), reverse=True)
        if sort == "trending":
            posts.sort(key=_score, reverse=True)  # stable: ties stay newest-first
        return copy.deepcopy(posts[:limit])  # a snapshot, so later writes can't race the encoder


@router.get("/posts/{post_id}", response_model=CommunityPost, **_out)
def get_post(post_id: str) -> dict[str, Any]:
    with _lock:
        return copy.deepcopy(_find_post(post_id))


@router.post("/posts", response_model=CommunityPost, **_out)
def create_post(body: NewCommunityPost) -> dict[str, Any]:
    post = CommunityPost(
        id=f"p-{uuid.uuid4().hex[:12]}",
        line=body.line,
        branch=body.branch or None,
        station_id=body.station_id,
        station_name=(body.station_name or "").strip() or STATION_NAMES[body.station_id],
        vibe=body.vibe,
        author=body.author,
        author_badge=body.author_badge,
        avatar_color=body.avatar_color,
        caption=body.caption,
        image_url=body.image_url,
        reactions=Reactions(),
        replies=[],
        created_at=_iso(_now()),
    )
    data = _dump(post)
    with _lock:
        _posts.insert(0, data)
        result = copy.deepcopy(data)
    _mirror.mark_dirty()
    return result


@router.post("/posts/{post_id}/react", response_model=CommunityReactResponse)
def react(post_id: str, body: CommunityReactRequest) -> dict[str, Any]:
    with _lock:
        post = _find_post(post_id)
        counts = post["reactions"]
        delta = 1 if body.action == "add" else -1
        counts[body.reaction] = max(0, int(counts.get(body.reaction, 0)) + delta)
        result = {"postId": post_id, "reactions": dict(counts)}
    _mirror.mark_dirty()
    return result


@router.post("/posts/{post_id}/replies", response_model=CommunityReply, **_out)
def create_reply(post_id: str, body: NewCommunityReply) -> dict[str, Any]:
    reply = _dump(
        CommunityReply(
            id=f"r-{uuid.uuid4().hex[:12]}",
            post_id=post_id,
            author=body.author,
            author_badge=body.author_badge,
            text=body.text,
            reply_to_author=body.reply_to_author,
            likes=0,
            created_at=_iso(_now()),
        )
    )
    with _lock:
        _find_post(post_id)["replies"].append(reply)
    _mirror.mark_dirty()
    return dict(reply)


@router.post("/posts/{post_id}/replies/{reply_id}/like", response_model=CommunityReply, **_out)
def like_reply(
    post_id: str,
    reply_id: str,
    body: Optional[CommunityReplyLikeRequest] = Body(None),
) -> dict[str, Any]:
    with _lock:
        post = _find_post(post_id)
        reply = next((r for r in post["replies"] if r["id"] == reply_id), None)
        if reply is None:
            raise HTTPException(status_code=404, detail=f"reply {reply_id} not found")
        action = body.action if body and body.action else ("remove" if reply_id in _toggled_likes else "add")
        if action == "add":
            reply["likes"] = int(reply.get("likes", 0)) + 1
            _toggled_likes.add(reply_id)
        else:
            reply["likes"] = max(0, int(reply.get("likes", 0)) - 1)
            _toggled_likes.discard(reply_id)
        result = {**reply, "likedByMe": action == "add"}
    _mirror.mark_dirty()
    return result


# ---------------------------------------------------------------------------
# Seed: 8 funny, realistic Boston posts across all four lines
# ---------------------------------------------------------------------------


def _scene(
    top: str,
    bottom: str,
    glow: str,
    track: str,
    emojis: list[tuple[str, int, int, int]],
    seed: int,
    *,
    water: bool = False,
    sun: Optional[str] = None,
) -> str:
    """A small generated SVG 'photo' (no remote images, nothing can 404 on demo day)."""
    rnd = random.Random(seed)
    w, h, base = 900, 1125, 860
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">',
        "<defs>",
        f'<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/>'
        f'<stop offset="1" stop-color="{bottom}"/></linearGradient>',
        f'<radialGradient id="g" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="{glow}" stop-opacity=".75"/>'
        f'<stop offset="1" stop-color="{glow}" stop-opacity="0"/></radialGradient>',
        "</defs>",
        f'<rect width="{w}" height="{h}" fill="url(#s)"/>',
        f'<circle cx="450" cy="470" r="440" fill="url(#g)"/>',
    ]
    if sun:
        out.append(f'<circle cx="450" cy="{base - 90}" r="130" fill="{sun}"/>')
    x = -20
    while x < w:
        bw, bh = rnd.randint(70, 140), rnd.randint(110, 360)
        out.append(f'<rect x="{x}" y="{base - bh}" width="{bw}" height="{bh}" fill="#0a0f24" opacity=".94"/>')
        for wy in range(base - bh + 20, base - 16, 34):
            for wx in range(x + 12, x + bw - 16, 26):
                if rnd.random() < 0.3:
                    out.append(
                        f'<rect x="{wx}" y="{wy}" width="9" height="13" fill="#ffd98a" opacity="{rnd.uniform(.45, .95):.2f}"/>'
                    )
        x += bw + rnd.randint(4, 16)
    if water:
        out.append(f'<rect y="{base}" width="{w}" height="{h - base}" fill="#0b1636"/>')
        for i in range(9):
            y = base + 24 + i * 26
            half = 40 + rnd.randint(40, 220)
            out.append(
                f'<rect x="{450 - half}" y="{y}" width="{2 * half}" height="5" rx="2.5" fill="{sun or glow}" opacity="{0.55 - i * 0.05:.2f}"/>'
            )
    else:
        out.append(f'<rect y="{base}" width="{w}" height="{h - base}" fill="#060a18"/>')
    ty = base + 44 if not water else base + 8
    out.append(f'<rect y="{ty - 12}" width="{w}" height="24" fill="{track}" opacity=".28"/>')
    out.append(f'<rect y="{ty - 3}" width="{w}" height="6" fill="{track}"/>')
    for ch, cx, cy, size in emojis:
        out.append(
            f'<text x="{cx}" y="{cy}" font-size="{size}" text-anchor="middle" dominant-baseline="central" '
            f'font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">{ch}</text>'
        )
    out.append("</svg>")
    return "data:image/svg+xml;charset=utf-8," + quote("".join(out))


def _seed_posts() -> list[dict[str, Any]]:
    now = _now()

    def ago(minutes: float) -> str:
        return _iso(now - timedelta(minutes=minutes))

    def post(n, line, station, vibe, author, badge, color, caption, minutes, reactions, replies,
             image=None, branch=None):
        pid = f"seed-{n}"
        return {
            "id": pid,
            "line": line,
            **({"branch": branch} if branch else {}),
            "stationId": station,
            "stationName": STATION_NAMES[station],
            "vibe": vibe,
            "author": author,
            "authorBadge": badge,
            "avatarColor": color,
            "caption": caption,
            **({"imageUrl": image} if image else {}),
            "reactions": dict(zip(REACTION_KEYS, reactions)),
            "replies": [
                {
                    "id": f"{pid}-r{i + 1}",
                    "postId": pid,
                    "author": a,
                    "authorBadge": b,
                    "text": t,
                    **({"replyToAuthor": to} if to else {}),
                    "likes": likes,
                    "createdAt": ago(m),
                }
                for i, (a, b, t, to, likes, m) in enumerate(replies)
            ],
            "createdAt": ago(minutes),
        }

    return [
        post(1, "Green", "place-bucen", "ON_THE_T", "terrier_tess", "BU", "#ef4444",
             "A golden retriever just boarded the Green-B at BU Central wearing a tiny BU scarf. "
             "Better posture than everyone in this car and he's not even holding the rail 🐕",
             6, (87, 14, 9, 33),
             [("packard_pete", "Local", "he got off at Packard's Corner like he had a 9am", None, 12, 5),
              ("commave_cat", "BU", "the B line is so slow he could've walked faster and he KNOWS it", None, 8, 4),
              ("terrier_tess", "BU", "honestly he was more prepared for that 9am than me", "packard_pete", 5, 2)],
             image=_scene("#2a1b5e", "#e0607e", "#ffb36b", "#38d283",
                          [("🐕", 450, 560, 300), ("🧣", 520, 660, 110), ("🚋", 760, 820, 120)], 1),
             branch="Green-B"),
        post(2, "Green", "place-pktrm", "CROWD_CHECK", "parkst_survivor", "Local", "#f59e0b",
             "PSA: inbound Green at Park St is a sardine can rn. Let the first one go, "
             "there's an E right behind it with actual seats 🫠",
             14, (31, 46, 3, 12),
             [("northeastern_nat", "NEU", "can confirm, I am currently someone's armrest", None, 15, 12),
              ("tourist_tom", "Tourist", "is it always like this?? I thought it was a parade", None, 9, 10),
              ("parkst_survivor", "Local", "every weekday at 5:15. the parade is us", "tourist_tom", 21, 8)]),
        post(3, "Red", "place-harsq", "STREET_VIBES", "pit_regular", "Local", "#a855f7",
             "Violin busker in the Harvard Pit just went from Vivaldi's Summer straight into Mr. Brightside. "
             "Let two Alewife trains go on purpose 🎻",
             23, (64, 7, 11, 52),
             [("visiting_vik", "Tourist", "visiting from Chicago and this is the most Boston thing I've seen. besides the Dunkin' line", None, 6, 20),
              ("mit_marcus", "MIT", "she played the Tetris theme last week, absolute legend", None, 11, 17)],
             image=_scene("#0b1442", "#3b1c6e", "#c084fc", "#ff5948",
                          [("🎻", 450, 540, 280), ("🎶", 250, 330, 120), ("🎵", 680, 300, 100)], 3)),
        post(4, "Orange", "place-chncl", "FOOD_SPOT", "dumplingdan", "NEU", "#f97316",
             "$8 for 12 pork & chive dumplings at 11:40pm. Take the Essex St exit, hang a left, "
             "follow the steam 🥟",
             38, (72, 5, 2, 61),
             [("nightowl_nina", "BU", "bookmarking this for finals week. and every week", None, 14, 33),
              ("late_train_luis", "Local", "the chili oil there should be regulated", None, 19, 30),
              ("dumplingdan", "NEU", "it is regulated. by me. get the extra spicy", "late_train_luis", 7, 26)],
             image=_scene("#3a0d12", "#b4361c", "#ffab31", "#ffab31",
                          [("🥟", 450, 560, 290), ("🏮", 190, 260, 120), ("🏮", 710, 230, 120), ("♨️", 450, 330, 110)], 4)),
        post(5, "Red", "place-chmnl", "ON_THE_T", "kendall_commuter", "MIT", "#06b6d4",
             "Sunset over the Charles from the Red Line on the Longfellow Bridge. "
             "The whole car went quiet and pulled out their phones at the same time 🌇",
             52, (140, 22, 6, 48),
             [("salt_n_pepper_sam", "Local", "the 30 seconds on that bridge are the best part of the Red Line. the other 40 minutes, not so much", None, 26, 47),
              ("tourist_tom", "Tourist", "wait you all get this every day??", None, 10, 41)],
             image=_scene("#3d1a5c", "#ff8a4c", "#ffcf6b", "#ff5948",
                          [("🚇", 700, 868, 90)], 5, water=True, sun="#ffd27a")),
        post(6, "Blue", "place-aqucl", "STREET_VIBES", "harbor_hana", "Tourist", "#3b82f6",
             "Free harbor seal show outside the New England Aquarium, 2 min from the Blue Line. "
             "One of them is definitely judging my outfit 🦭",
             75, (95, 8, 4, 27),
             [("eastie_eddie", "Local", "the seals have seen things. they've seen the Blue Line at rush hour", None, 9, 70),
              ("aqua_ari", "NEU", "the one on the left does that to everyone, don't take it personally", None, 13, 64)],
             image=_scene("#06294a", "#0e7490", "#67e8f9", "#428dff",
                          [("🦭", 450, 580, 300), ("🌊", 220, 720, 120), ("🐟", 720, 380, 90)], 6, water=True)),
        post(7, "Orange", "place-dwnxg", "DELAY_VENT", "orange_oliver", "Local", "#ED8B00",
             "The countdown sign at Downtown Crossing said '2 min' for 11 minutes straight. "
             "Honestly I respect its confidence 🙃",
             110, (28, 39, 15, 18),
             [("nu_nadia", "NEU", "the Orange Line runs on vibes and hope", None, 17, 101),
              ("dtx_danielle", "Local", "it said ARRIVING for me once and I aged a full year", None, 11, 95)]),
        post(8, "Green", "place-kencl", "CROWD_CHECK", "fenway_frank", "Local", "#22c55e",
             "Sox game just let out and Kenmore is a sea of red, platform is FULL. "
             "Walk to Hynes if you value your ribs ⚾",
             160, (44, 51, 12, 20),
             [("bu_brianna", "BU", "walked to Hynes, ribs intact, thank you for your service", None, 8, 150),
              ("sox_steve", "Local", "worth it. we won 🧹", None, 12, 146)]),
    ]


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

_mirror = _Mirror(DATA_FILE)

_loaded = _load()
if _loaded is None:
    _posts.extend(_seed_posts())
    _mirror.mark_dirty()
else:
    _posts.extend(_loaded)
    if _refresh_stale_seeds(_posts):
        _mirror.mark_dirty()
