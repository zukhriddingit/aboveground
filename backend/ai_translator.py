"""AI text for AboveGround: plain-English delay translations, Tourist Mode mini-stories, the T-Feed Line Pulse.

Provider: Gemini whenever a Gemini key is set (the MLH Gemini track); otherwise Claude (``ai_claude.py``) when
``ANTHROPIC_API_KEY`` is set; otherwise the templates. ``AI_PROVIDER=gemini|claude`` forces one of them.

Uses the official ``google-genai`` SDK (``from google import genai``). The API key comes from
``GEMINI_API_KEY`` (or ``GOOGLE_API_KEY``) in the environment and is never hard-coded. The model
defaults to a fast Flash-Lite model and can be overridden with ``GEMINI_MODEL``.

Demo rule: an AI call can never stall the app. Every call has a hard 4-second budget
(``asyncio.wait_for`` around the async client, plus the SDK's own HTTP timeout), and on no key,
timeout, any error or an empty answer we return rich deterministic templates instead. Each result
says where it came from: ``source`` is ``"gemini"``, ``"claude"`` or ``"fallback"``.

Env vars:
    GEMINI_API_KEY        Gemini Developer API key (GOOGLE_API_KEY also works)
    GEMINI_MODEL          default "gemini-3.5-flash-lite"
    GEMINI_TIMEOUT_S      default 4.0 (hard cap per call)
    GEMINI_THINKING_LEVEL optional, e.g. "MINIMAL" or "LOW" for thinking models
    ANTHROPIC_API_KEY     Claude, used when no Gemini key is set (see ai_claude.py; ANTHROPIC_MODEL overrides)
    AI_PROVIDER           optional: "gemini" or "claude" to force one when both keys are set
    AI_DISABLED=1         always use the fallback templates
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import Any, Optional

log = logging.getLogger("ai_translator")

import ai_claude  # noqa: E402  (interim provider: Claude when no Gemini key is set)

try:  # imported at startup so the first request doesn't pay for it; the app still runs without it
    from google import genai
    from google.genai import types as genai_types
except Exception:  # pragma: no cover - package missing or broken
    genai = None
    genai_types = None

DEFAULT_MODEL = "gemini-3.5-flash-lite"
CACHE_TTL_S = 600


def gemini_model() -> str:
    return (os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL).strip()


def _timeout_s() -> float:
    try:
        return max(0.5, min(4.0, float(os.environ.get("GEMINI_TIMEOUT_S", "4.0"))))
    except ValueError:
        return 4.0


def _api_key() -> Optional[str]:
    key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    return key or None


def gemini_configured() -> bool:
    return bool(_api_key()) and os.environ.get("AI_DISABLED") != "1"


def active_provider() -> Optional[str]:
    """"gemini", "claude" or None (templates only). Gemini wins when its key is set, unless AI_PROVIDER says otherwise."""
    if os.environ.get("AI_DISABLED") == "1":
        return None
    gemini = bool(_api_key()) and genai is not None
    claude = ai_claude.configured()
    forced = (os.environ.get("AI_PROVIDER") or "").strip().lower()
    if forced == "claude" and claude:
        return "claude"
    if forced == "gemini" and gemini:
        return "gemini"
    if gemini:
        return "gemini"
    if claude:
        return "claude"
    return None


def ai_configured() -> bool:
    return active_provider() is not None


def model_name() -> str:
    """The model that answers right now (the active provider's), or the Gemini default when none is configured."""
    return ai_claude.model_name() if active_provider() == "claude" else gemini_model()


# ---------------------------------------------------------------------------
# Deterministic fallbacks: the four real 2026 scenarios (docs/UPDATE_REPORT.md) + per-line generics
# ---------------------------------------------------------------------------

STATION_NAMES: dict[str, str] = {
    "place-bucen": "BU Central", "place-kencl": "Kenmore", "place-hymnl": "Hynes Convention Center",
    "place-coecl": "Copley", "place-boyls": "Boylston", "place-pktrm": "Park Street",
    "place-harsq": "Harvard", "place-knncl": "Kendall/MIT", "place-chmnl": "Charles/MGH",
    "place-dwnxg": "Downtown Crossing", "place-chncl": "Chinatown", "place-state": "State",
    "place-aqucl": "Aquarium", "place-gover": "Government Center", "place-aport": "Airport",
}

STATION_LINES: dict[str, str] = {
    "place-bucen": "Green", "place-kencl": "Green", "place-hymnl": "Green", "place-coecl": "Green",
    "place-boyls": "Green", "place-pktrm": "Green", "place-gover": "Green", "place-harsq": "Red",
    "place-knncl": "Red", "place-chmnl": "Red", "place-dwnxg": "Orange", "place-chncl": "Orange",
    "place-state": "Orange", "place-aqucl": "Blue", "place-aport": "Blue",
}

# disruption -> template. {station} and {fix} are filled in.
SCENARIOS: dict[str, dict[str, Any]] = {
    "SIGNAL_MODERNIZATION": {
        "repairKind": "SIGNAL_RELAY",
        "fix": 15,
        "title": "{station} Signal Upgrade Hold",
        "broke": (
            "Crews swapping the old track circuits for new signal relays near {station} have one relay that "
            "stopped confirming the track ahead is clear, so every train waits for a manual OK and creeps "
            "through at walking speed, which is why the wait is about {fix} minutes."
        ),
        "alt": "Walk 5 min up Tremont Street to Park Street instead of waiting.",
    },
    "OVERHEAD_WIRE_INSPECTION": {
        "repairKind": "CATENARY",
        "fix": 20,
        "title": "Blue Line Overhead Wire Check",
        "broke": (
            "Crews are checking the tension and contact points of the overhead power wire between Airport and "
            "Wonderland, so trains are held and share one track through the work zone, adding about {fix} minutes."
        ),
        "alt": "Heading to Logan? The free Massport shuttle at Airport station and the SL1 from South Station still reach every terminal.",
    },
    "SIGNAL_DELAY_DISABLED_TRAIN": {
        "repairKind": "SWITCH_CLEARANCE",
        "fix": 25,
        "title": "{station} Disabled Train Recovery",
        "broke": (
            "A disabled train is stuck near {station} and the signals can't route anyone around it until crews "
            "clear the switch and throw it to the other track by hand, so the recovery plus the bunched trains "
            "behind it adds about {fix} minutes."
        ),
        "alt": "Take the 1 bus down Mass Ave to Central and MIT while the line recovers.",
    },
    "TRACK_PROBLEM_SHUTTLE": {
        "repairKind": "RAIL_FASTENER",
        "fix": 40,
        "title": "{station} Track Fix · Shuttle Bridge",
        "broke": (
            "Inspectors found loose rail fasteners, the clips that hold the rail to the ties, near {station}, so "
            "trains can't cross that stretch until they're replaced and the gauge is re-checked, which takes "
            "about {fix} minutes with shuttle buses bridging the gap."
        ),
        "alt": "Take the Green Line from Boylston to Copley and walk 4 min to Back Bay; it's usually faster than the shuttle.",
    },
}

STATION_SCENARIO: dict[str, str] = {
    "place-boyls": "SIGNAL_MODERNIZATION",
    "place-aport": "OVERHEAD_WIRE_INSPECTION",
    "place-harsq": "SIGNAL_DELAY_DISABLED_TRAIN",
    "place-chncl": "TRACK_PROBLEM_SHUTTLE",
}

REPAIR_TO_SCENARIO: dict[str, str] = {
    "SIGNAL_RELAY": "SIGNAL_MODERNIZATION",
    "CATENARY": "OVERHEAD_WIRE_INSPECTION",
    "SWITCH_CLEARANCE": "SIGNAL_DELAY_DISABLED_TRAIN",
    "RAIL_FASTENER": "TRACK_PROBLEM_SHUTTLE",
}

# When the alert is about some other station: a sensible alternate per line.
LINE_ALTERNATES: dict[str, str] = {
    "Green": "If you're going downtown, check whether walking to the next trunk station beats waiting; Green Line trunk stops are 5-8 min apart.",
    "Red": "The 1 bus on Mass Ave parallels the Red Line between Harvard, Central and MIT.",
    "Orange": "Back Bay, Downtown Crossing and North Station also connect to the Green or Red Line; reroute there if the shuttle line is long.",
    "Blue": "For Logan, the SL1 from South Station reaches every terminal; for downtown, State and Government Center are a short walk apart.",
}


def _classify(raw: str) -> Optional[str]:
    t = raw.lower()
    if "overhead" in t or "wire" in t or "catenary" in t or "power" in t:
        return "OVERHEAD_WIRE_INSPECTION"
    if "disabled" in t or "switch" in t:
        return "SIGNAL_DELAY_DISABLED_TRAIN"
    if "shuttle" in t or "track" in t or "rail" in t:
        return "TRACK_PROBLEM_SHUTTLE"
    if "signal" in t:
        return "SIGNAL_MODERNIZATION"
    return None


def scenario_matches(
    raw_text: Optional[str], repair_kind: Optional[str] = None, disruption: Optional[str] = None,
) -> bool:
    """False for real alert text that is none of the four repair scenarios (police, medical, generic delays):
    our scenario ops notes would then be made up, so the AI prompt gets neutral context instead."""
    if (disruption in SCENARIOS) or (repair_kind in REPAIR_TO_SCENARIO) or not (raw_text or "").strip():
        return True
    return _classify(raw_text or "") is not None


def _minutes(raw: str) -> Optional[int]:
    m = re.search(r"(\d{1,3})\s*(?:-|to)?\s*(?:\d{1,3}\s*)?min", raw.lower())
    return int(m.group(1)) if m else None


def fallback_alert(
    station_id: str,
    station_name: Optional[str] = None,
    line: Optional[str] = None,
    raw_text: Optional[str] = None,
    fix_min: Optional[int] = None,
    repair_kind: Optional[str] = None,
    disruption: Optional[str] = None,
) -> dict[str, Any]:
    """Rich deterministic translation for any station/scenario."""
    name = station_name or STATION_NAMES.get(station_id, "this stop")
    line = line or STATION_LINES.get(station_id, "Green")
    # An explicit kind wins; then what the MBTA text actually says; then the station's demo scenario.
    key = (
        (disruption if disruption in SCENARIOS else None)
        or REPAIR_TO_SCENARIO.get(repair_kind or "")
        or _classify(raw_text or "")
        or STATION_SCENARIO.get(station_id)
        or "SIGNAL_MODERNIZATION"
    )
    sc = SCENARIOS[key]
    fix = fix_min or _minutes(raw_text or "") or sc["fix"]
    canonical = STATION_SCENARIO.get(station_id) == key
    alt = sc["alt"] if canonical else LINE_ALTERNATES.get(line, LINE_ALTERNATES["Green"])
    broke = sc["broke"].format(station=name, fix=fix)
    if not canonical and key == "OVERHEAD_WIRE_INSPECTION":
        broke = (
            f"Crews are checking the overhead power wire near {name}, so trains are held and single-tracked "
            f"through the work zone, adding about {fix} minutes."
        )
    return {
        "plainTitle": sc["title"].format(station=name),
        "plainExplanation": f"{broke} {alt}",
        "alternateMove": alt,
        "repairKind": sc["repairKind"],
        "disruption": key,
        "estimatedFixMin": fix,
    }


# Tourist Mode: a 2-sentence above-ground fact per stop.
NARRATIONS: dict[str, tuple[str, str]] = {
    "place-bucen": ("BU Beach", "BU Beach has no sand and no ocean: it's a strip of grass beside Storrow Drive, and the waves you hear are traffic. On a warm day half of Boston University is out there pretending otherwise, three minutes from this stop."),
    "place-kencl": ("Fenway Park", "Fenway Park opened in 1912, making it the oldest ballpark in Major League Baseball. Its left-field wall, the Green Monster, stands 37 feet tall, a seven-minute walk from Kenmore."),
    "place-hymnl": ("Newbury Street", "Newbury Street's cross streets run in alphabetical order, from Arlington to Hereford. It's two minutes from Hynes, so you can shop your way through the alphabet."),
    "place-coecl": ("Boston Public Library", "The Boston Public Library was the first large free public library in the United States. Carved above its Copley Square entrance are the words Free to All, one minute from this stop."),
    "place-boyls": ("America's First Subway", "Boylston and Park Street opened on September 1, 1897, as part of the first subway in America. The tunnel you're standing in is older than the Red Sox."),
    "place-pktrm": ("Boston Common", "Boston Common, set aside in 1634, is the oldest public park in the country. Cows grazed on it until 1830, and the Freedom Trail starts right outside this station."),
    "place-harsq": ("Harvard Yard", "The John Harvard statue is nicknamed the statue of three lies: the face isn't his, he wasn't the founder, and Harvard wasn't founded in 1638. It sits in Harvard Yard, three minutes from the Pit."),
    "place-knncl": ("MIT Great Dome", "In 1994 MIT students put a full-size campus police car on top of the Great Dome. The car is now on display in the Stata Center, an eight-minute walk from Kendall."),
    "place-chmnl": ("Longfellow Bridge", "The Longfellow Bridge outside is nicknamed the Salt and Pepper Bridge for the shape of its towers. Next door, Mass General's Ether Dome hosted the first public demonstration of surgical anesthesia in 1846."),
    "place-dwnxg": ("Old South Meeting House", "Downtown Crossing's car-free streets have been Boston's shopping crossroads since the 1800s. Two minutes away, the Old South Meeting House is where the crowd left for the Boston Tea Party in 1773."),
    "place-chncl": ("Chinatown Gate", "The Chinatown Gate on Beach Street was a gift from Taiwan in 1982. Its inscription, a line from Sun Yat-sen, says everything under heaven belongs to the people, three minutes from this stop."),
    "place-state": ("Old State House", "The Old State House sits right on top of this station, and the Declaration of Independence was read to Bostonians from its balcony in 1776. A ring of cobblestones out front marks the site of the 1770 Boston Massacre."),
    "place-aqucl": ("New England Aquarium", "Upstairs, the harbor seals outside the New England Aquarium often put on a free show by the front plaza. Long Wharf next door is where ferries leave for the Boston Harbor Islands."),
    "place-gover": ("City Hall Plaza", "City Hall Plaza above you replaced Scollay Square, Boston's rowdy old entertainment district, in the 1960s. Faneuil Hall, a market and meeting hall since 1742, is a two-minute walk east."),
    "place-aport": ("Logan Airport", "Logan opened in 1923 as a small airfield on the East Boston mud flats, and much of it now sits on land filled in from Boston Harbor. Free Massport shuttles run from this station to every terminal."),
}


def fallback_narration(
    station_id: str,
    station_name: Optional[str] = None,
    landmark_title: Optional[str] = None,
    landmark_fact: Optional[str] = None,
    walk_min: Optional[int] = None,
) -> dict[str, str]:
    if station_id in NARRATIONS:
        title, text = NARRATIONS[station_id]
        return {"title": landmark_title or title, "text": text}
    name = station_name or STATION_NAMES.get(station_id, "this stop")
    if landmark_fact:
        walk = f" It's about a {walk_min}-minute walk from {name}." if walk_min is not None else ""
        return {"title": landmark_title or name, "text": f"{landmark_fact}{walk}"}
    return {
        "title": name,
        "text": f"Step out at {name} and look up: this part of Boston was mostly marsh and harbor before the 1800s landfills. Much of the city you're walking on was built by hand, one cartload at a time.",
    }


# ---------------------------------------------------------------------------
# Gemini call with a hard timeout
# ---------------------------------------------------------------------------

_client: Any = None
_client_key: Optional[str] = None
_cache: dict[str, tuple[float, str]] = {}
CACHE_MAX = 256
_last_error_logged = 0.0


def _cache_put(key: str, text: str) -> None:
    """Remember an answer for CACHE_TTL_S; at most CACHE_MAX entries (expired ones go first, then the oldest)."""
    now = time.monotonic()
    _cache.pop(key, None)
    if len(_cache) >= CACHE_MAX:
        for k in [k for k, (exp, _) in _cache.items() if exp <= now]:
            del _cache[k]
    while len(_cache) >= CACHE_MAX:
        del _cache[next(iter(_cache))]  # dicts keep insertion order: the first key is the oldest
    _cache[key] = (now + CACHE_TTL_S, text)


def _get_client() -> Any:
    global _client, _client_key
    key = _api_key()
    if not key or genai is None or genai_types is None:
        return None
    if _client is None or _client_key != key:
        # Gemini rejects request deadlines under 10 s; our own 4 s cap is the asyncio.wait_for around the call.
        _client = genai.Client(api_key=key, http_options=genai_types.HttpOptions(timeout=10_000))
        _client_key = key
    return _client


def _clean(text: Optional[str], max_chars: int = 480) -> Optional[str]:
    if not text:
        return None
    t = re.sub(r"[*_#`>]+", "", text)
    t = re.sub(r"\s+", " ", t).strip().strip('"').strip()
    if len(t) < 20:
        return None
    if len(t) > max_chars:
        cut = t[:max_chars]
        end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
        t = cut[: end + 1] if end > 80 else cut.rstrip() + "…"
    return t


def _note_error(exc: BaseException, provider: Optional[str] = "gemini") -> None:
    global _last_error_logged
    if time.monotonic() - _last_error_logged > 30:  # don't spam the console during a demo
        _last_error_logged = time.monotonic()
        log.warning("%s call failed, using fallback (%s: %s)", (provider or "AI").capitalize(), type(exc).__name__, str(exc)[:200])


async def generate(prompt: str, system: str, *, max_tokens: int = 220, cache_key: Optional[str] = None) -> Optional[str]:
    """One AI call (Gemini, else Claude). Returns cleaned text, or None on no key / timeout / error / empty answer."""
    text, _ = await generate_text(prompt, system, max_tokens=max_tokens, cache_key=cache_key)
    return text


async def generate_text(
    prompt: str, system: str, *, max_tokens: int = 220, cache_key: Optional[str] = None,
) -> tuple[Optional[str], str]:
    """Like generate(), plus the source to report: the provider that answered, or "fallback"."""
    provider = active_provider()
    if provider is None:
        return None, "fallback"
    if cache_key:
        cache_key = f"{provider}|{model_name()}|{cache_key}"
        hit = _cache.get(cache_key)
        if hit and hit[0] > time.monotonic():
            return hit[1], provider
    started = time.monotonic()
    try:
        if provider == "claude":
            raw = await asyncio.wait_for(
                ai_claude.generate(prompt, system, max_tokens=max_tokens, timeout_s=_timeout_s()),
                timeout=max(0.1, _timeout_s() - (time.monotonic() - started)),
            )
            text = _clean(raw)
            if text and cache_key:
                _cache_put(cache_key, text)
            return text, (provider if text else "fallback")
        client = _get_client()
        if client is None:
            return None, "fallback"
        types = genai_types
        cfg: dict[str, Any] = {
            "system_instruction": system,
            "temperature": 0.6,
            "max_output_tokens": max_tokens,
        }
        level = (os.environ.get("GEMINI_THINKING_LEVEL") or "").strip().upper()
        if level:
            cfg["thinking_config"] = types.ThinkingConfig(thinking_level=level)
        resp = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=gemini_model(),
                contents=prompt,
                config=types.GenerateContentConfig(**cfg),
            ),
            # The budget covers client setup too, so the whole call never exceeds the cap.
            timeout=max(0.1, _timeout_s() - (time.monotonic() - started)),
        )
        text = _clean(getattr(resp, "text", None))
    except (asyncio.TimeoutError, TimeoutError) as exc:
        _note_error(exc, provider)
        return None, "fallback"
    except Exception as exc:  # bad key, quota, network, safety block, SDK change: never crash the demo
        _note_error(exc, provider)
        return None, "fallback"
    if text and cache_key:
        _cache_put(cache_key, text)
    return text, (provider if text else "fallback")


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

_ALERT_SYSTEM = (
    "You translate MBTA service alerts into plain English for riders standing on the platform. "
    "Write exactly 2 sentences, under 65 words total, no markdown, no emojis, no lists. "
    "Sentence 1: what physically broke or is being worked on, and why that makes the wait about the given number of minutes. "
    "Sentence 2: the single smartest alternate move. "
    "Stay factual: do not invent stations, routes, causes or numbers that are not in the input. "
    "Never mention slow zones or speed restrictions."
)

_NARRATE_SYSTEM = (
    "You are a warm Boston tour guide narrating out loud as a subway rider arrives at a stop. "
    "Write exactly 2 short sentences, under 50 words total, no markdown, no emojis: one surprising, "
    "well-documented fact about what is above ground near the station, then what to look for or how far to walk. "
    "Only use facts you are confident are true; prefer the reference fact given."
)

_VIBE_SYSTEM = (
    "Summarise how a Boston T line feels right now from rider posts and one-tap reports. "
    "Write one sentence, under 25 words, friendly and specific, no markdown, no hashtags, at most one emoji."
)


async def translate_alert(
    station_id: str,
    *,
    station_name: Optional[str] = None,
    line: Optional[str] = None,
    branch: Optional[str] = None,
    raw_text: Optional[str] = None,
    fix_min: Optional[int] = None,
    repair_kind: Optional[str] = None,
    disruption: Optional[str] = None,
) -> dict[str, Any]:
    """2 sentences: what physically broke + why the wait is X minutes, then the smartest alternate move."""
    fb = fallback_alert(station_id, station_name, line, raw_text, fix_min, repair_kind, disruption)
    name = station_name or STATION_NAMES.get(station_id, station_id)
    raw = raw_text or f"{line or STATION_LINES.get(station_id, '')} Line delays near {name}."
    if scenario_matches(raw_text, repair_kind, disruption):
        context = (
            f"What crews are doing (our ops notes): {fb['plainExplanation']}\n"
            f"Expected wait: about {fb['estimatedFixMin']} minutes.\n"
        )
    else:  # a real alert that isn't one of our repair scenarios: don't feed the model invented repair details
        context = (
            "What crews are doing: not stated; only describe what the alert text itself says, without guessing a cause.\n"
            + (f"Expected wait: about {fix_min} minutes.\n" if fix_min else "Expected wait: not stated; do not give a number unless the alert text has one.\n")
        )
    prompt = (
        f"MBTA alert text: {raw}\n"
        f"Station: {name} ({line or STATION_LINES.get(station_id, 'T')} Line{', ' + branch if branch and branch != line else ''})\n"
        f"{context}"
        f"Known good alternate move: {fb['alternateMove']}\n"
        "Rewrite this for a rider in exactly 2 sentences."
    )
    text, source = await generate_text(
        prompt, _ALERT_SYSTEM, max_tokens=220,
        cache_key=f"alert|{station_id}|{fb['disruption']}|{fb['estimatedFixMin']}|{raw}",
    )
    out = {**fb, "source": "fallback"}
    if text:
        out.update(plainExplanation=text, source=source, model=model_name())
    return out


async def narrate_station(
    station_id: str,
    *,
    station_name: Optional[str] = None,
    line: Optional[str] = None,
    landmark_title: Optional[str] = None,
    landmark_fact: Optional[str] = None,
    walk_min: Optional[int] = None,
) -> dict[str, Any]:
    """A 2-sentence above-ground fact for Tourist Mode."""
    fb = fallback_narration(station_id, station_name, landmark_title, landmark_fact, walk_min)
    name = station_name or STATION_NAMES.get(station_id, station_id)
    prompt = (
        f"Station: {name} ({line or STATION_LINES.get(station_id, 'T')} Line), Boston MBTA.\n"
        f"Landmark: {fb['title']}" + (f", {walk_min} min walk" if walk_min is not None else "") + "\n"
        f"Reference fact: {landmark_fact or fb['text']}\n"
        "Narrate it in exactly 2 sentences."
    )
    text, source = await generate_text(prompt, _NARRATE_SYSTEM, max_tokens=160, cache_key=f"narrate|{station_id}|{fb['title']}")
    out: dict[str, Any] = {**fb, "source": "fallback"}
    if text:
        out.update(text=text, source=source, model=model_name())
    return out


_KIND_LABELS = {
    "PREDICTION_OK": "predictions on time", "STALE_ETA": "ghost/stale predictions", "SEATS_OPEN": "seats open",
    "PACKED": "packed trains", "PASS_UP": "pass-ups", "ELEVATOR_OUT": "elevator out", "SPILL": "spills",
    "NO_AC": "no AC/heat", "SHUTTLE_CONFUSION": "shuttle confusion",
}


_KIND_ONE = {
    "PREDICTION_OK": "on-time prediction", "STALE_ETA": "ghost/stale prediction", "SEATS_OPEN": "seats-open report",
    "PACKED": "packed train", "PASS_UP": "pass-up", "ELEVATOR_OUT": "elevator outage", "SPILL": "spill",
    "NO_AC": "no AC/heat report", "SHUTTLE_CONFUSION": "shuttle confusion report",
}


def fallback_line_vibe(line: str, captions: list[str], kind_counts: dict[str, int]) -> str:
    top = sorted(((n, k) for k, n in kind_counts.items() if n), reverse=True)[:2]
    if top:
        bits = " and ".join(f"{n} {(_KIND_LABELS if n != 1 else _KIND_ONE).get(k, k.lower())}" for n, k in top)
        return f"{line} Line riders are reporting {bits} in the last 20 minutes."
    if captions:
        latest = captions[0].strip()
        latest = latest if len(latest) <= 90 else latest[:87].rstrip() + "…"
        n = len(captions)
        return f"{n} recent {line} Line {'post' if n == 1 else 'posts'}; latest: “{latest}”"
    return f"Quiet on the {line} Line right now: no rider reports in the last 20 minutes."


async def line_vibe_summary(line: str, captions: list[str], kind_counts: dict[str, int]) -> dict[str, Any]:
    """P2: one line summarising the last few T-Feed posts + Quick-Check taps for a line."""
    fb = fallback_line_vibe(line, captions, kind_counts)
    if not captions and not any(kind_counts.values()):
        return {"line": line, "text": fb, "source": "fallback"}
    counts = ", ".join(f"{_KIND_LABELS.get(k, k)}: {n}" for k, n in kind_counts.items() if n) or "none"
    posts = "\n".join(f"- {c[:200]}" for c in captions[:5]) or "- (no posts)"
    prompt = f"Line: {line}\nLast T-Feed posts:\n{posts}\nOne-tap reports (last 20 min): {counts}\nOne sentence."
    text, source = await generate_text(prompt, _VIBE_SYSTEM, max_tokens=80, cache_key=f"vibe|{line}|{counts}|{posts}")
    if text:
        return {"line": line, "text": text, "source": source, "model": model_name()}
    return {"line": line, "text": fb, "source": "fallback"}
