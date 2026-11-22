# Upgrade P0/P1 backend

Two self-contained routers sit next to `community.py` (T-Feed). `main.py` mounts them with world, stories and the
alert trigger; the lines it uses are:

```python
from community import router as community_router   # T-Feed (already documented in COMMUNITY.md)
from reports import router as reports_router       # Quick-Check 1-tap reports
from ai_routes import router as ai_router          # Gemini translator + narrator
app.include_router(community_router)
app.include_router(reports_router)
app.include_router(ai_router)
```

(Running uvicorn from the repo root as `backend.main:app`? Use `from backend.reports import ...` etc.; `ai_routes`
does `import ai_translator`, so either run from `backend/` or add `backend/` to `sys.path`.)

Merge `requirements-dev.txt` into your `requirements.txt` (adds `google-genai`).

For your `POST /api/alerts/trigger`, you can reuse the translator so the alert text is Gemini when it's fast and a
template when it isn't:

```python
import ai_translator
t = await ai_translator.translate_alert(station_id, raw_text=raw_mbta_text)   # never raises, <= 4 s
alert = {..., "plainTitle": t["plainTitle"], "plainExplanation": t["plainExplanation"],
         "estimatedFixMin": t["estimatedFixMin"], "repairKind": t["repairKind"], "disruption": t["disruption"],
         "alternateMove": t["alternateMove"]}
```

`frontend/src/lib/mockData.ts` `MOCK_ALERTS` has the four 2026 scenarios (Boylston signal modernization, Blue Line
Airport–Wonderland wire inspection, Harvard disabled train, Chinatown track problem + shuttle bridge); seed your
alert list from the same ids (`mock-alert-boyls`, `mock-alert-aport`, `mock-alert-harsq`, `mock-alert-chncl`).
`place-aport` (Airport) and `place-chncl` (Chinatown) are now `Station`s in `MOCK_STATIONS`, so `/api/world` should
include them too.

## Routes (camelCase JSON, matches `frontend/src/types/tverse.ts`)

| Route | Body | Returns |
| --- | --- | --- |
| `POST /api/reports` | `NewQuickReport` `{ stationId, kind, line?, branch?, clientId, createdAt? }` | `QuickReportResponse` `{ report, signals }` |
| `GET /api/reports/summary?stationId=` | | `QuickReportSummary` `{ stations: StationSignals[], generatedAt }` (every stop with reports in the last 20 min when `stationId` is omitted) |
| `GET /api/reports?stationId=&limit=` | | `QuickReport[]`, newest first (debugging) |
| `POST /api/ai/translate-alert` | `TranslateAlertRequest` `{ stationId, rawMbtaText?, line?, branch?, estimatedFixMin?, repairKind?, disruption? }` | `{ plainTitle, plainExplanation, alternateMove, source: "gemini"\|"fallback", model? }` |
| `POST /api/ai/narrate` | `NarrateStationRequest` `{ stationId, stationName?, line?, landmarkTitle?, landmarkFact?, walkMin? }` | `{ title, text, source, model? }` |
| `GET /api/ai/line-vibe?line=Green` | | `{ line, text, source, model? }` (P2: last 5 T-Feed posts + 20 min of reports) |
| `GET /api/ai/status` | | `{ geminiConfigured, model, timeoutS }` (never the key) |

`kind` is one of `PREDICTION_OK, STALE_ETA, SEATS_OPEN, PACKED, PASS_UP, ELEVATOR_OUT, SPILL, NO_AC, SHUTTLE_CONFUSION`.

## Quick-Check rules (`reports.py`)

- Counts cover the last **20 min**. `staleEta` is `true` when a stop has **≥ 2 `STALE_ETA` reports in 15 min** and
  the `PREDICTION_OK` reports newer than the oldest of them don't outnumber them (a newer "On time" majority clears it).
  `frontend/src/components/quickcheck/signals.ts` implements the same rule for offline merging.
- The same `clientId` + stop + kind within 60 s is one report (double taps and offline-queue retries are idempotent).
- Offline-queued reports send their tap time as `createdAt`; it's kept if it's within the last 2 h, else "now".
- In memory, mirrored by a background thread to `backend/reports_data.json` (gitignored, atomic replace, flushed at exit),
  so reports survive a restart. Older than 24 h is dropped. `REPORTS_RESET=1` starts empty, `REPORTS_DATA_FILE` moves the file.

## Gemini (`ai_translator.py`)

- Official SDK: `from google import genai`, async client (`client.aio.models.generate_content`).
- Key: `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) from the environment. Never commit it; `.env` is gitignored.
- Model: `GEMINI_MODEL`, default `gemini-3.5-flash-lite` (Google's fastest stable Flash-Lite as of Nov 2026; `gemini-2.5-flash`
  is deprecated and re-routes on Dec 1, 2026). Optional `GEMINI_THINKING_LEVEL=MINIMAL|LOW` for thinking models.
- Hard **4 s** cap per call (`asyncio.wait_for` + the SDK's HTTP timeout, budget includes client setup). No key, timeout,
  error, safety block or empty answer → deterministic templates (the four 2026 scenarios, per-line alternates, a 2-sentence
  above-ground fact for all 15 stops). Gemini answers are cached for 10 min per prompt. `AI_DISABLED=1` forces templates.

## Run it

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000     # GEMINI_API_KEY from the env or backend/.env, optional
.venv/bin/python verify_live.py                     # checks every route, live Gemini and the 4 s fallback
```

`dev_app.py` and `community_dev_app.py` now just re-export `main:app`, so old commands keep working.
