# T-Feed backend (`community.py`) — note for Member 1

`community.py` is a self-contained FastAPI router for T-Feed, the community feed. It does not touch your
code. **To turn it on in `main.py`, add one line** (after `app = FastAPI(...)` and your CORS middleware):

```python
from community import router as community_router
app.include_router(community_router)
```

(If you run uvicorn from the repo root as `backend.main:app`, use `from backend.community import router as community_router`.)

Needs nothing beyond FastAPI + Pydantic v2 (`requirements-community.txt` lists them; merge into yours).

## Routes (JSON keys are camelCase and match `frontend/src/types/tverse.ts`)

| Route | Body | Returns |
| --- | --- | --- |
| `GET /api/community/posts?line=ALL\|Green\|Red\|Orange\|Blue&stationId=&vibe=&sort=latest\|trending` | | `CommunityPost[]` (trending = reactions + replies) |
| `GET /api/community/posts/{postId}` | | `CommunityPost` |
| `POST /api/community/posts` | `NewCommunityPost` | `CommunityPost` (server fills `id`, `createdAt`, zeroed `reactions`, `replies: []`) |
| `POST /api/community/posts/{postId}/react` | `{ reaction: "heart"\|"train"\|"dunkin"\|"fire", action: "add"\|"remove" }` | `{ postId, reactions }` |
| `POST /api/community/posts/{postId}/replies` | `{ author, authorBadge?, text, replyToAuthor? }` | `CommunityReply` |
| `POST /api/community/posts/{postId}/replies/{replyId}/like` | `{ action?: "add"\|"remove" }` (no body = toggle) | `CommunityReply` |

Bad input → 422, unknown post/reply → 404. Images arrive as base64 JPEG data URLs (~20–250 KB).

## Storage

Posts live in memory. Every write flips a dirty flag and a background thread mirrors the feed to
`backend/community_data.json` (atomic replace, flushed at exit), so requests never wait on the disk and the feed
survives a restart. The file is gitignored. On first run it is seeded with 8 Boston posts across all four lines.
If the seeded posts are more than 6 h old at startup, they are slid forward so the demo feed looks fresh
(rider posts are never touched). `COMMUNITY_RESET=1` starts over from the seeds; `COMMUNITY_DATA_FILE` moves the file.

## Run it alone (before `main.py` exists)

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-community.txt
.venv/bin/uvicorn community_dev_app:app --reload --port 8000
```

`community_dev_app.py` is a tiny CORS-enabled app that only mounts this router. Delete it once `main.py` includes the router.
