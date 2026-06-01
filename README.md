---
title: Egg Catcher
emoji: 🥚
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 8080
pinned: false
short_description: Pixel-art arcade — phone is the controller
---

# egg-catcher

Pixel-art egg-catcher arcade. Laptop = main screen with a QR pop-up; phone = controller. MongoDB-backed global leaderboard.

The frontmatter above is for [Hugging Face Spaces](https://huggingface.co/docs/hub/spaces-config-reference) — it's ignored on GitHub.

## Run locally

```bash
npm install
npm run dev
```

`http://localhost:5173/` on the laptop. Phone scans the QR (same wifi).

`.env` (gitignored) needs:

```
MONGO_URI=mongodb+srv://...
MONGO_DB=news
MONGO_COLLECTION=egg_catcher_scores
```

## Deploy — backend on HF Space, frontend on Vercel

### 1. Backend on Hugging Face

1. Go to https://huggingface.co/new-space
2. **Owner**: your account · **Space name**: e.g. `egg-catcher-api` · **License**: MIT · **Space SDK**: pick **Docker** → **Blank**
3. Hardware: **CPU basic — free**
4. Create. Then in the Space, **Settings** → **Variables and secrets** → add a *Secret* named `MONGO_URI` with your full Mongo connection string
5. **Settings** → **Repository** → **Connect to a GitHub repository** → pick `ABHINAY2025/egg-catcher`. Every push to `main` will rebuild the Space
6. The Space will build and come up at `https://<username>-<spacename>.hf.space`

### 2. Frontend on Vercel

1. Go to https://vercel.com/new
2. Import `ABHINAY2025/egg-catcher`
3. **Framework Preset**: Vite (auto-detected)
4. **Environment Variables**: add `VITE_API_BASE` = `https://<your-hf-space-url>` (no trailing slash, e.g. `https://abhinay-egg-catcher-api.hf.space`)
5. Deploy. Your game lives at `https://<project>.vercel.app`

### Why split?

- Vercel gives CDN-fast static delivery + instant SPA routing.
- HF Space stays warm with no card required and supports long-lived SSE for the phone-controller pairing.
- Frontend and backend are decoupled — swap either independently.

## How it works

- Single Express server: serves `/api/*` and (in monolithic deploy) the built Vite frontend.
- Game rooms are in-memory; SSE relays controller events laptop ⇄ phone.
- `/api/score`, `/api/leaderboard` write to MongoDB collection `egg_catcher_scores`.
- Controller URL in prod = `${window.location.origin}/controller?room=XXXXXX` (the frontend's URL, not the API).
