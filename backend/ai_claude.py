"""Claude text for AboveGround's AI routes: the interim provider while no Gemini key is set.

Uses the official ``anthropic`` SDK. The key comes from ``ANTHROPIC_API_KEY`` in the environment or
``backend/.env`` and is never hard-coded. ``ai_translator`` picks Gemini first whenever ``GEMINI_API_KEY``
is set, so adding a Gemini key later switches the app back with no code change.

The job is short grounded rewriting (one or two sentences from facts we pass in), and an answer only counts if
it lands inside the shared 4-second cap, so the default is the fastest model, Claude Haiku 5.5, at effort "low"; ``ai_translator`` wraps every call in that cap and falls back to its templates on any error,
timeout, refusal or empty answer.

Env vars:
    ANTHROPIC_API_KEY   Claude API key
    ANTHROPIC_MODEL     default "claude-haiku-5-5" (e.g. "claude-sonnet-5-5" or "claude-opus-5-5" to override)
"""

from __future__ import annotations

import os
from typing import Any, Optional

try:  # imported at startup so the first request doesn't pay for it; the app still runs without it
    import anthropic
except Exception:  # pragma: no cover - package missing or broken
    anthropic = None

DEFAULT_MODEL = "claude-haiku-5-5"

# Models that accept the server-side refusal fallback ("default" routing picks the fallback model by category).
_FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"}
_FALLBACK_BETA = "server-side-fallback-2026-07-01"

_client: Any = None
_client_key: Optional[str] = None


def api_key() -> Optional[str]:
    key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    return key or None


def configured() -> bool:
    return anthropic is not None and bool(api_key())


def model_name() -> str:
    return (os.environ.get("ANTHROPIC_MODEL") or DEFAULT_MODEL).strip()


def _get_client(timeout_s: float) -> Any:
    global _client, _client_key
    key = api_key()
    if anthropic is None or not key:
        return None
    if _client is None or _client_key != key:
        # No SDK retries: the caller's 4 s cap decides, and a retry could never finish inside it.
        _client = anthropic.AsyncAnthropic(api_key=key, timeout=timeout_s, max_retries=0)
        _client_key = key
    return _client


async def generate(prompt: str, system: str, *, max_tokens: int, timeout_s: float) -> Optional[str]:
    """One Claude call. Returns the answer's text, or None (no key, refusal, empty answer).

    API errors propagate as the SDK's typed exceptions; ``ai_translator.generate`` catches them, logs once and
    serves the template instead.
    """
    client = _get_client(timeout_s)
    if client is None:
        return None
    model = model_name()
    extra: dict[str, Any] = {}
    if model in _FALLBACK_MODELS:
        extra = {"betas": [_FALLBACK_BETA], "fallbacks": "default"}
    resp = await client.beta.messages.create(
        model=model,
        # Thinking is adaptive on current models and counts toward max_tokens, so leave room above the answer.
        max_tokens=max(1024, max_tokens * 8),
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": "low"},
        **extra,
    )
    if resp.stop_reason == "refusal":
        return None
    text = "".join(block.text for block in resp.content if block.type == "text").strip()
    return text or None
