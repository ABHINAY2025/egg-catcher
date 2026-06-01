# egg-catcher

Pixel-art egg-catcher arcade. Laptop = main screen with a QR pop-up; phone = controller. MongoDB-backed global leaderboard.

## Run locally

```bash
npm install
npm run dev
```

`http://localhost:5173/` on the laptop. Phone scans the QR (same wifi).

`.env` (already gitignored) needs:

```
MONGO_URI=mongodb+srv://...
MONGO_DB=news
MONGO_COLLECTION=egg_catcher_scores
```

## Deploy to Fly.io

One-time:

```bash
flyctl auth login
flyctl launch --no-deploy           # accept fly.toml, pick an app name
flyctl secrets set MONGO_URI="mongodb+srv://abhinayabhi226_db_user:Od1IwrzfJbXybXap@cluster0.ctylbok.mongodb.net/news?retryWrites=true&w=majority"
flyctl deploy
```

Subsequent deploys:

```bash
flyctl deploy
```

## How it works

- Single Express server: serves the built Vite frontend AND the API.
- Game rooms are in-memory; SSE relays controller events laptop ⇄ phone.
- `/api/score`, `/api/leaderboard` write to MongoDB collection `egg_catcher_scores`.
- In production the controller URL is `https://<your-app>.fly.dev/controller?room=XXXXXX`. In dev it's `http://<LAN-IP>:5173/controller?room=XXXXXX`.
